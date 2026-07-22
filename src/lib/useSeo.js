/**
 * 런타임 head 동기화 — SPA 라우팅 중에도 head 가 지금 보는 페이지를 가리키게 한다.
 *
 * 프리렌더가 만든 정적 HTML 은 **처음 들어온 그 주소 하나만** 맞다.
 * 방문자가 화면 안에서 메뉴를 눌러 이동하면 문서는 그대로 있고 본문만 바뀌므로,
 * 아무것도 하지 않으면 제목·canonical·JSON-LD 가 첫 페이지 것으로 남는다.
 * 크롤러는 대개 정적 HTML 만 보지만, 공유 미리보기(카카오톡·슬랙)와 브라우저 탭 제목,
 * 그리고 실제로 렌더링을 수행하는 크롤러는 이 갱신 결과를 본다.
 *
 * ─────────────────────────────────────────────
 * 가장 중요한 계약: **프리렌더와 똑같은 함수를 쓴다.**
 *
 * 값을 여기서 다시 조립하지 않고 `seo.js` 의 resolveMeta / buildJsonLd 를 그대로 부른다.
 * 두 경로가 각자 계산하면 언젠가 반드시 어긋나고, 그때는 크롤러가 본 HTML 과
 * 사람이 보는 화면의 메타가 달라진다(cloaking 으로 오인될 수 있는 상태다).
 * 그래서 이 파일에는 "무엇을 쓸지" 를 정하는 코드가 한 줄도 없다.
 * 하는 일은 오직 **계산된 값을 DOM 에 밀어 넣는 것** 뿐이다.
 * ─────────────────────────────────────────────
 *
 * 그리고 태그를 새로 만들어 붙이지 않고 **있는 것을 고친다.**
 * 프리렌더가 이미 넣어 둔 <meta>/<link>/<script> 옆에 같은 것을 하나 더 붙이면
 * 문서에 canonical 이 둘이 되고, 그런 문서는 구글이 canonical 을 통째로 무시한다.
 */

import { useEffect, useRef, useState } from "react";
import { buildJsonLd, normalizeRoute, resolveMeta } from "./seo.js";
import { loadSeoPages, loadSeoSettings } from "./seoStore.js";

/* 배포 base("/apgujeong-main/"). 옵셔널 체이닝을 쓰는 이유 —
   이 모듈이 혹시라도 vite 를 거치지 않고 평가되면 import.meta.env 는 undefined 다.
   그때 죽는 대신 로컬과 같은 "/" 로 동작하게 둔다 */
const BASE = import.meta.env?.BASE_URL ?? "/";

/**
 * 지금 문서의 origin.
 *
 * 설정(SITE.siteUrl / seo_settings.site_url)이 비어 있는 동안은 프리렌더가 canonical 을
 * 아예 안 내보낸다(틀린 canonical 이 없는 canonical 보다 나쁘기 때문). 런타임은 사정이 다르다 —
 * 지금 이 문서가 실제로 서비스되고 있는 주소를 확실히 알고 있으므로, 그 값을 쓰는 것은
 * 추측이 아니라 사실이다. 설정값이 채워지면 그쪽이 이긴다(resolveMeta 의 우선순위).
 */
function currentOrigin() {
  if (typeof window === "undefined") return "";
  return String(window.location.origin || "").replace(/\/+$/, "");
}

/* ============================================================
 * DB override 겹치기 — 문서 한 번 열 때 딱 한 번만 읽는다
 * ============================================================ */

/**
 * 프리렌더는 빌드 시점의 DB 값으로 head 를 만든다. 런타임이 정적 원본만 본다면,
 * 운영자가 관리자 화면에서 제목을 고친 뒤에는 **처음 들어온 페이지와 눌러서 간 페이지의
 * 제목 규칙이 달라진다.** 그래서 같은 표를 한 번 읽어 겹친다.
 *
 * 규칙 두 가지:
 *   - 문서당 한 번만 읽는다(모듈 수준 캐시). 라우팅할 때마다 요청하지 않는다.
 *   - `source: "static"` 이면 겹치지 않는다. 그 값은 이미 seo.js 가 쓰고 있는 것과
 *     같은 원본이라 덮어써 봐야 달라지는 것이 없고, 실패해도 조용히 정적 값으로 남는다.
 * @type {Promise<{settings: Record<string, any>|null, pages: Map<string, Record<string, any>>|null}>|null}
 */
let overlayPromise = null;
let overlay = { settings: null, pages: null };

function ensureOverlay() {
  if (overlayPromise) return overlayPromise;
  overlayPromise = Promise.all([loadSeoSettings(), loadSeoPages()])
    .then(([s, p]) => {
      overlay = {
        settings: s?.source === "db" ? s.row : null,
        pages: p?.source === "db" ? new Map(p.rows.map((r) => [r.route, r])) : null,
      };
      return overlay;
    })
    .catch(() => {
      /* SEO 표가 없거나(마이그레이션 전) 네트워크가 막혀도 화면은 멀쩡해야 한다.
         정적 원본으로 이미 올바른 head 가 붙어 있으므로 여기서는 아무 말도 하지 않는다 */
      return overlay;
    });
  return overlayPromise;
}

/* ============================================================
 * DOM 조작 — 전부 "있으면 고치고 없으면 만든다 + 되돌리기를 쌓는다"
 * ============================================================ */

/**
 * 되돌리기 목록에 쌓아 두는 이유: 언마운트 때 원래대로 돌려놓아야
 * 다음 페이지가 자기 값을 얹기 전 상태가 깨끗하다. 특히 우리가 만든 태그는
 * 지워야 하고(안 지우면 라우팅할수록 쌓인다), 프리렌더가 만든 태그는
 * 지우면 안 되고 값만 되돌려야 한다.
 */
function setAttrTag(selector, makeEl, attr, value, undos) {
  const el = document.head.querySelector(selector);

  if (!value) {
    /* 값이 없으면 지운다. 이전 페이지의 값이 남아 있는 것이 없는 것보다 나쁘다.
       노드는 그대로 들고 있다가 언마운트 때 제자리에 되돌린다 */
    if (el) {
      const next = el.nextSibling;
      el.remove();
      undos.push(() => document.head.insertBefore(el, next));
    }
    return;
  }

  if (el) {
    const prev = el.getAttribute(attr);
    el.setAttribute(attr, value);
    undos.push(() => {
      if (prev === null) el.removeAttribute(attr);
      else el.setAttribute(attr, prev);
    });
    return;
  }

  const created = makeEl();
  created.setAttribute(attr, value);
  /* 우리가 만든 것임을 표시해 둔다. 디버깅할 때 프리렌더 산출물과 구분된다 */
  created.setAttribute("data-seo-runtime", "");
  document.head.appendChild(created);
  undos.push(() => created.remove());
}

function metaByName(name, value, undos) {
  setAttrTag(
    `meta[name="${name}"]`,
    () => {
      const el = document.createElement("meta");
      el.setAttribute("name", name);
      return el;
    },
    "content",
    value,
    undos,
  );
}

function metaByProperty(property, value, undos) {
  setAttrTag(
    `meta[property="${property}"]`,
    () => {
      const el = document.createElement("meta");
      el.setAttribute("property", property);
      return el;
    },
    "content",
    value,
    undos,
  );
}

function linkByRel(rel, href, undos) {
  setAttrTag(
    `link[rel="${rel}"]`,
    () => {
      const el = document.createElement("link");
      el.setAttribute("rel", rel);
      return el;
    },
    "href",
    href,
    undos,
  );
}

/** JSON-LD 는 문서에 하나만 둔다. 블록마다 script 를 나누면 엔티티가 흩어진다 */
function syncJsonLd(graph, undos) {
  const selector = 'script[type="application/ld+json"]';
  const el = document.head.querySelector(selector);
  const text = graph ? JSON.stringify(graph) : "";

  if (!text) {
    if (el) {
      const next = el.nextSibling;
      el.remove();
      undos.push(() => document.head.insertBefore(el, next));
    }
    return;
  }

  if (el) {
    const prev = el.textContent;
    el.textContent = text;
    undos.push(() => {
      el.textContent = prev;
    });
    return;
  }

  const created = document.createElement("script");
  created.setAttribute("type", "application/ld+json");
  created.setAttribute("data-seo-runtime", "");
  created.textContent = text;
  document.head.appendChild(created);
  undos.push(() => created.remove());
}

/* ============================================================
 * 훅
 * ============================================================ */

/**
 * 이 라우트의 메타를 계산해 head 에 반영한다.
 *
 * SSR(프리렌더) 중에는 useEffect 가 돌지 않으므로 이 훅은 **아무 일도 하지 않는다.**
 * 그때의 head 는 프리렌더 스크립트가 같은 함수로 직접 만든다 — 그래서 두 경로가 같다.
 *
 * @param {string} routePath - 라우터의 pathname("/menu", "/notice/12"). base 는 이미 빠진 값
 * @param {object} [ctx]     - resolveMeta / buildJsonLd 에 그대로 넘기는 맥락
 * @param {Record<string, any>} [ctx.notice]     - 공지 상세의 글(제목·요약·발행일이 메타를 이긴다)
 * @param {Record<string, any>[]} [ctx.notices]  - /notice 목록의 공개 글들(ItemList 용)
 * @param {Record<string, any>} [ctx.dbPage]     - seo_pages 한 행(런타임에서 DB 를 읽는다면)
 * @param {Record<string, any>} [ctx.dbSettings] - seo_settings 한 행
 * @returns {void}
 */
export default function useSeo(routePath, ctx = {}) {
  /* ctx 는 렌더마다 새 객체로 오는 경우가 대부분이라 그대로 의존성에 넣으면
     매 렌더 head 를 다시 쓴다. 값이 실제로 바뀌었는지는 아래 key 로 판단하고,
     최신 ctx 자체는 ref 로 읽는다 */
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const route = normalizeRoute(routePath);
  /* 메타에 실제로 영향을 주는 것만 추린 서명. 공지 글이 바뀌면 갱신되어야 한다 */
  const ctxKey = JSON.stringify({
    n: ctx.notice ? [ctx.notice.id, ctx.notice.title, ctx.notice.seo_title] : null,
    l: Array.isArray(ctx.notices) ? ctx.notices.map((x) => x?.id) : null,
    p: ctx.dbPage?.updated_at ?? null,
    s: ctx.dbSettings?.updated_at ?? null,
  });

  /* DB override 가 도착하면 head 를 한 번 더 쓴다. 값이 정적 원본과 같으면
     결과가 같아서 눈에 띄는 변화가 없고, 다르면 그때 제자리를 찾는다 */
  const [overlayReady, setOverlayReady] = useState(false);
  useEffect(() => {
    let alive = true;
    ensureOverlay().then(() => {
      if (alive) setOverlayReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const base = BASE;
    const origin = currentOrigin();
    const given = ctxRef.current ?? {};
    const full = {
      ...given,
      /* 화면이 직접 넘긴 값이 언제나 이긴다 — 관리자 미리보기처럼 아직 저장하지 않은
         초안을 그대로 보여 줘야 하는 경우가 있다 */
      dbSettings: given.dbSettings ?? overlay.settings ?? null,
      dbPage: given.dbPage ?? overlay.pages?.get(route) ?? null,
      origin,
      base,
    };

    const meta = resolveMeta(route, full);
    const graph = buildJsonLd(route, { ...full, meta });

    /** 언마운트 때 역순으로 실행할 되돌리기들 */
    const undos = [];

    if (meta.title) {
      const prevTitle = document.title;
      document.title = meta.title;
      undos.push(() => {
        document.title = prevTitle;
      });
    }

    metaByName("description", meta.description, undos);
    metaByName("keywords", meta.keywords.join(", "), undos);
    metaByName("robots", meta.robots, undos);

    /* Open Graph — 카카오톡·페이스북·슬랙 미리보기가 읽는다 */
    metaByProperty("og:type", meta.ogType, undos);
    metaByProperty("og:site_name", meta.siteName, undos);
    metaByProperty("og:title", meta.title, undos);
    metaByProperty("og:description", meta.description, undos);
    metaByProperty("og:url", meta.canonical, undos);
    metaByProperty("og:image", meta.ogImage, undos);
    metaByProperty("og:locale", meta.locale, undos);

    /* 트위터 카드는 name= 이다(og 와 달리 property= 가 아니다) */
    metaByName("twitter:card", meta.ogImage ? "summary_large_image" : "summary", undos);
    metaByName("twitter:title", meta.title, undos);
    metaByName("twitter:description", meta.description, undos);
    metaByName("twitter:image", meta.ogImage, undos);

    linkByRel("canonical", meta.canonical, undos);

    syncJsonLd(graph, undos);

    return () => {
      /* 쌓은 순서의 역순으로 되돌린다 — 같은 노드를 여러 번 건드린 경우에도 원상복구된다 */
      for (let i = undos.length - 1; i >= 0; i -= 1) undos[i]();
    };
  }, [route, ctxKey, overlayReady]);
}
