/**
 * 빌드 시점 프리렌더 — `vite build` 가 끝난 뒤에 돈다.
 *
 * 왜 필요한가:
 *   이 사이트는 클라이언트 전용 SPA 라 dist/index.html 의 <body> 는 사실상
 *   <div id="root"></div> 하나다. 사람이 브라우저로 들어오면 JS 가 채워 주지만,
 *   **JS 를 실행하지 않는 수집기** — GPTBot·ClaudeBot·PerplexityBot 같은 AI 크롤러,
 *   카카오톡/슬랙의 링크 미리보기, 네이버 검색봇 — 에게는 빈 껍데기만 보인다.
 *   런타임에 head 를 갈아 끼우는 방식으로는 이 문제를 못 고친다. 그래서
 *   라우트마다 실제 React 트리를 문자열로 그려서 HTML 파일로 떨궈 둔다.
 *
 * 무엇을 만드는가:
 *   dist/index.html            ← "/" 프리렌더 결과
 *   dist/menu/index.html       ← "/menu" …  (GitHub Pages 는 폴더의 index.html 을 그대로 준다)
 *   dist/notice/7/index.html   ← 공개 공지 한 건마다
 *   dist/404.html              ← **프리렌더하지 않은 SPA 껍데기.** 아래 [404] 주석 참고
 *   dist/.prerender-manifest.json ← scripts/seo-assets.mjs 가 읽어 갈 라우트/날짜 목록
 *
 * 조용히 실패하지 않는다:
 *   렌더가 깨졌는데 빈 껍데기를 그대로 써 버리면 아무도 눈치채지 못한 채
 *   전 페이지가 색인에서 사라진다. 그래서 이 스크립트는 의심스러우면 무조건
 *   throw 하고 빌드를 세운다 — 렌더 예외, 본문이 너무 짧을 때,
 *   ErrorBoundary 안내문이 결과에 섞였을 때, JSON-LD 검증에 걸렸을 때.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
/* 빌드 시점 읽기는 화면 쪽 공개 경로와 같은 PostgREST 통로를 쓴다.
   @supabase/supabase-js 를 여기서 부르면 realtime-js 가 딸려 오는데, 그게
   Node 22 미만에서 native WebSocket 을 못 찾아 빌드를 통째로 죽인다.
   프리렌더가 필요한 건 anon select 뿐이라 SDK 를 쓸 이유가 없다 —
   SDK 는 세션·Storage 가 필요한 관리자 화면 전용이다. */
import { isSupabaseReady, restSelect } from "../src/lib/rest.js";

/* 토픽 클러스터는 DB 가 아니라 여기(코드)에 고정돼 있다. 내부링크를 만드는
   seo.js 의 internalLinksFor 도 같은 상수를 직접 읽으므로, 프리렌더는 그 개수를
   로그에 찍기만 하면 된다 — 읽어 넘길 값이 따로 없다 */
import { CLUSTERS, PRERENDER_ROUTES, SITE } from "../src/lib/seoData.js";
import { buildJsonLd, resolveMeta, validateJsonLd } from "../src/lib/seo.js";

/* ============================================================
 * 0. 경로·환경
 * ============================================================ */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIST = path.join(ROOT, "dist");
const MANIFEST = path.join(DIST, ".prerender-manifest.json");

/**
 * 배포 base. vite.config.js 의 `base: process.env.BASE_PATH || "/"` 와 **같은 값을 읽는다.**
 * 두 곳이 어긋나면 링크는 /menu 로, 자산은 /apgujeong-main/… 로 나가 한쪽이 죽는다.
 */
const BASE = normalizeBase(process.env.BASE_PATH || "/");

/**
 * canonical·og:url·JSON-LD @id 의 기준 origin.
 *
 * 없으면 seo.js 가 canonical 을 통째로 생략하고 buildJsonLd 는 null 을 돌려준다.
 * 틀린 canonical 은 없는 canonical 보다 나쁘고, 상대 @id 로는 노드를 이을 수 없기 때문이다.
 * 즉 **origin 을 안 넘기면 프리렌더는 돌지만 구조화 데이터가 한 줄도 안 나간다.**
 * 우선순위: 환경변수 → DB(seo_settings.site_url) → seoData.js 의 SITE.siteUrl.
 */
const ENV_ORIGIN = trimSlash(process.env.SITE_ORIGIN || process.env.VITE_SITE_ORIGIN || "");

/** ErrorBoundary 가 그리는 안내문. 결과 HTML 에 이게 있으면 렌더가 실패한 것이다 */
const ERROR_BOUNDARY_MARK = "페이지를 불러오는 중 문제가 발생했습니다";

/** 본문 텍스트가 이보다 짧으면 껍데기를 뽑은 것으로 본다(헤더+푸터만 해도 이보다 길다) */
const MIN_TEXT_LENGTH = 200;

/**
 * RevealText 는 서버에서 줄 단위로 내보낸다(src/Reveal.jsx). 한 글자마다 <span> 을
 * 두르면 단순 추출기가 "압/구/정/곱/창" 처럼 조각난 문자열을 가져간다.
 * 태그 사이에 이어진 한글 덩어리가 하나도 없으면 그 분기가 사라졌다는 뜻이다.
 */
const CONTIGUOUS_KO = />[^<]*[가-힣][^<]{5,}</;

/**
 * 목록 씨앗에서 본문을 뗀다. 목록 조회는 애초에 body 를 안 가져오므로(listColumns)
 * 대개 이미 비어 있고, 이건 그게 언제까지나 유지되도록 하는 안전망이다.
 */
const stripBody = ({ bodyRaw, body, ...rest }) => ({ ...rest, bodyRaw: "", body: [] });

/* ============================================================
 * 1. 작은 도구들
 * ============================================================ */

function normalizeBase(value) {
  let b = String(value || "/").trim();
  if (!b.startsWith("/")) b = "/" + b;
  if (!b.endsWith("/")) b += "/";
  return b;
}

function trimSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

/** base 를 앞에 붙인 실제 요청 경로. StaticRouter 의 location 은 base 를 포함해야 한다 */
function withBase(route) {
  return (BASE + String(route).replace(/^\//, "")).replace(/\/{2,}/g, "/") || "/";
}

/** 속성값용 이스케이프. 설명문에 따옴표가 들어가는 일이 실제로 있다 */
function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 태그를 걷어낸 순수 텍스트 길이 — 렌더가 껍데기인지 판별하는 용도 */
function textLength(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

/** "2026.04.22" / "2026-04-22T…" → "2026-04-22". 못 읽으면 "" */
function toIsoDate(value) {
  if (!value) return "";
  const s = String(value).trim().replace(/\./g, "-").replace(/-$/, "");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function log(line) {
  process.stdout.write(line + "\n");
}

/* ============================================================
 * 2. 데이터 — Supabase 가 없으면 정적 원본으로 되돌아간다
 *
 * 이 계약은 공지사항이 이미 쓰고 있는 것과 같다(src/lib/notices.js).
 * DB 가 없다고 빌드가 실패하면 안 된다 — 초기 배포와 포크 클론이 그 상태다.
 * ============================================================ */

/**
 * 읽을 곳이 있으면 표식을, 없으면 null 을 준다.
 *
 * 예전에는 여기서 SDK 클라이언트를 만들었다. 지금은 rest.js 가 모듈 최상단에서
 * 환경변수를 이미 읽어 두므로 만들 객체가 없다. 아래 함수들이 `if (!client)` 로
 * 분기하던 모양은 그대로 두려고 표식만 돌려준다.
 *
 * 프리렌더는 로그아웃(anon) 상태로 읽는다. select 정책이 anon 에 열려 있지 않으면
 * 에러가 아니라 **빈 배열**이 온다 — 그래서 아래에서 건수를 반드시 찍는다.
 */
function makeClient() {
  return isSupabaseReady ? { ready: true } : null;
}

/**
 * seo_settings / seo_pages.
 * 표가 아직 없으면(마이그레이션 전) 조용히 정적 원본으로 되돌아간다.
 */
async function loadSeoData(client) {
  const out = { settings: null, pages: new Map(), source: "static" };
  if (!client) return out;

  try {
    out.settings = await restSelect("seo_settings", { eq: { id: 1 }, maybeSingle: true });
  } catch (error) {
    log(`  ⓘ seo_settings 를 읽지 못했다(${error.message}). seoData.js 로 진행한다.`);
    return out;
  }

  /* 표가 아직 없으면 그 항목만 비우고 계속 간다 — 하나 없다고 전체를 정적으로
     되돌리면, 설정만 넣어 둔 중간 상태에서 그 설정까지 버리게 된다 */
  try {
    for (const row of await restSelect("seo_pages")) out.pages.set(row.route, row);
  } catch {
    /* 무시 — seoData.js 의 정적 라우트로 채워진다 */
  }

  out.source = "supabase";
  return out;
}

/**
 * 공지 목록.
 *
 * DB 가 있으면 공개 글을 그대로, 없으면 예비 데이터(src/pages/noticeData.js)를 쓴다.
 * 예비 데이터는 asset() 을 import 하고 asset.js 는 최상단에서 import.meta.env 를 읽으므로
 * **순수 Node 에서는 import 할 수 없다.** vite 의 SSR 로더를 거쳐야 한다.
 *
 * SEO 칸(seo_title 등)은 docs/seo-setup.md 의 마이그레이션을 돌려야 생긴다.
 * 안 돌린 프로젝트에서 그 칸을 select 에 적으면 PostgREST 가 42703 으로 조회를
 * 통째로 거절한다 — 그러면 공지 프리렌더가 전부 사라진다. 한 번 거절당하면
 * 기본 칸만으로 다시 묻는다(notices.js 의 is_featured 처리와 같은 방식).
 */
async function loadNotices(client, vite) {
  const BASE_COLS = "id, title, author, published_at, views, is_public, image_path, body";
  const SEO_COLS = `${BASE_COLS}, seo_title, seo_description, og_path, faq, keywords`;

  if (client) {
    const ask = (columns) =>
      restSelect("notices", {
        columns,
        eq: { is_public: true },
        order: [
          ["published_at", "desc"],
          ["id", "desc"],
        ],
        limit: 500,
      });

    try {
      let rows;
      try {
        rows = await ask(SEO_COLS);
      } catch (error) {
        if (error?.code !== "42703") throw error;
        log("  ⓘ notices 에 SEO 칸이 없다(docs/seo-setup.md 4번 미실행). 기본 칸만으로 진행한다.");
        rows = await ask(BASE_COLS);
      }
      return { rows: rows.map(normalizeNotice), source: "supabase" };
    } catch (error) {
      log(`  ⓘ notices 를 읽지 못했다(${error.message}). 예비 데이터로 진행한다.`);
    }
  }

  /* 예비 데이터. 자리표시자 문구라 실제 글이 아니지만, 라우트 구조와 head 조립이
     실제로 도는지 확인하는 값은 한다. 진짜 글은 DB 를 붙이면 자동으로 갈린다 */
  const mod = await vite.ssrLoadModule("/src/pages/noticeData.js");
  return { rows: (mod.NOTICES ?? []).map(normalizeNotice), source: "fallback" };
}

/** DB 행과 예비 데이터의 모양을 seo.js 가 기대하는 한 가지로 맞춘다 */
function normalizeNotice(row) {
  const published = toIsoDate(row.published_at ?? row.date);
  return {
    ...row,
    id: String(row.id),
    /* seo.js 는 published_at → date 순으로 본다. 예비 데이터의 "2026.04.22" 를
       그대로 datePublished 로 내보내면 형식이 틀리므로 ISO 로 바꿔서 넣는다 */
    published_at: published || undefined,
    is_public: row.is_public ?? true,
    faq: Array.isArray(row.faq) ? row.faq : [],
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
  };
}

/* ============================================================
 * 3. 렌더 엔트리
 *
 * main.jsx 는 절대 import 하지 않는다. 그 파일은 최상단에서
 * createRoot(document.getElementById("root")) 를 실행하는 부수효과 모듈이라
 * Node 에서 import 하는 순간 TypeError 로 죽는다.
 * ============================================================ */

/**
 * 라우트 트리를 문자열로 만드는 함수를 얻는다.
 *
 *  (1) src/entry-server.jsx 가 있으면 그 render(url) 을 쓴다.
 *      계약: url 은 **base 가 포함된 전체 경로**이고, 엔트리는 basename 을 직접 건다.
 *  (2) 없으면 src/routes.jsx 의 default export(순수 <AppRoutes/>)를 StaticRouter 로 감싼다.
 *
 * 둘 다 없으면 여기서 멈춘다. main.jsx 를 쪼개는 일은 이 스크립트의 담당이 아니다.
 */
async function resolveRenderer(vite) {
  const entry = ["src/entry-server.jsx", "src/entry-server.js"].find((p) =>
    fs.existsSync(path.join(ROOT, p)),
  );
  if (entry) {
    const mod = await vite.ssrLoadModule("/" + entry);
    if (typeof mod.render !== "function") {
      throw new Error(`${entry} 에 render(url) 이 없다. export function render(url) 를 내보내야 한다.`);
    }
    return { kind: entry, render: (url) => mod.render(url) };
  }

  const routes = ["src/routes.jsx", "src/routes.js"].find((p) => fs.existsSync(path.join(ROOT, p)));
  if (!routes) {
    throw new Error(
      "SSR 진입점이 없다. src/entry-server.jsx (render(url) 을 내보내는 파일) 또는 " +
        "src/routes.jsx (라우터 없이 <Routes> 만 담은 순수 컴포넌트) 중 하나가 필요하다.\n" +
        "main.jsx 는 최상단에서 createRoot(document.getElementById(\"root\")) 를 실행하는 " +
        "부수효과 모듈이라 Node 에서 부를 수 없다.",
    );
  }

  const mod = await vite.ssrLoadModule("/" + routes);
  const AppRoutes = mod.default;
  if (typeof AppRoutes !== "function") {
    throw new Error(`${routes} 의 default export 가 컴포넌트가 아니다.`);
  }
  /* ErrorBoundary 로 감싸지 않는다. 감싸면 렌더 예외를 삼키고 "문제가 발생했습니다"
     화면을 정상 결과인 척 내보낸다 — 이 스크립트가 가장 피해야 할 실패 방식이다 */
  return {
    kind: routes,
    render: (url) =>
      renderToString(
        createElement(StaticRouter, { location: url, basename: BASE }, createElement(AppRoutes)),
      ),
  };
}

/* ============================================================
 * 4. head 조립
 * ============================================================ */

/**
 * <title> 부터 JSON-LD 까지, 프리렌더가 index.html 의 마커 사이에 끼워 넣을 전부.
 * **값이 없으면 태그를 아예 만들지 않는다** — 빈 canonical, 빈 og:image 는
 * 없는 것만 못하다(seo.js 의 생략 규칙과 같은 원칙).
 */
function buildHead(meta, jsonLd) {
  const tags = [];
  const push = (line) => tags.push("    " + line);

  push(`<title>${escapeAttr(meta.title)}</title>`);
  if (meta.description) push(`<meta name="description" content="${escapeAttr(meta.description)}" />`);
  if (meta.keywords?.length) push(`<meta name="keywords" content="${escapeAttr(meta.keywords.join(", "))}" />`);
  if (meta.robots) push(`<meta name="robots" content="${escapeAttr(meta.robots)}" />`);
  if (meta.canonical) push(`<link rel="canonical" href="${escapeAttr(meta.canonical)}" />`);

  /* Open Graph — 카카오톡·슬랙·페이스북 미리보기가 읽는다 */
  push(`<meta property="og:type" content="${escapeAttr(meta.ogType)}" />`);
  push(`<meta property="og:site_name" content="${escapeAttr(meta.siteName)}" />`);
  push(`<meta property="og:title" content="${escapeAttr(meta.title)}" />`);
  if (meta.description) push(`<meta property="og:description" content="${escapeAttr(meta.description)}" />`);
  if (meta.canonical) push(`<meta property="og:url" content="${escapeAttr(meta.canonical)}" />`);
  if (meta.ogImage) push(`<meta property="og:image" content="${escapeAttr(meta.ogImage)}" />`);
  push(`<meta property="og:locale" content="${escapeAttr(meta.locale)}" />`);

  /* 트위터 카드. 이미지가 없으면 summary_large_image 를 선언해 봐야 큰 카드가 안 나온다 */
  push(`<meta name="twitter:card" content="${meta.ogImage ? "summary_large_image" : "summary"}" />`);
  push(`<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`);
  if (meta.description) push(`<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`);
  if (meta.ogImage) push(`<meta name="twitter:image" content="${escapeAttr(meta.ogImage)}" />`);

  if (jsonLd) {
    /* JSON 안의 "<" 를 escape 한다. 본문에 </script> 문자열이 들어가면 head 가 깨진다 */
    const json = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
    push(`<script type="application/ld+json">${json}</script>`);
  }

  return tags.join("\n");
}

/* 마커. 시작 마커에는 어느 라우트인지 적어 두므로 뒤에 무엇이 붙어도 잡히게 둔다 */
const HEAD_RE = /<!--\s*prerender:head:start[^>]*-->[\s\S]*?<!--\s*prerender:head:end\s*-->/;
const ROOT_RE = /<div id="root">\s*<\/div>/;

/** 아직 아무것도 주입되지 않은 껍데기인가 */
function isPristineShell(html) {
  return HEAD_RE.test(html) && ROOT_RE.test(html);
}

/**
 * 프리렌더의 원본이 될 껍데기를 고른다.
 *
 * 첫 실행에서는 dist/index.html 이 껍데기다. 그런데 이 스크립트는 그 파일을
 * 홈 결과물로 덮어쓰기 때문에, `vite build` 없이 프리렌더만 다시 돌리면
 * 이미 채워진 HTML 을 원본으로 삼게 된다. 그때는 방금 만들어 둔
 * dist/404.html(항상 껍데기다)을 쓰면 재실행이 몇 번이든 같은 결과를 낸다.
 */
function readShell() {
  const candidates = [path.join(DIST, "index.html"), path.join(DIST, "404.html")];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, "utf8");
    if (isPristineShell(html)) return { html, from: path.basename(file) };
  }
  throw new Error(
    "프리렌더에 쓸 껍데기 HTML 이 없다. dist/index.html 과 dist/404.html 이 둘 다 " +
      "이미 채워져 있거나 마커가 사라졌다. `npm run build` 로 dist 를 새로 만들어야 한다.",
  );
}

/** 껍데기 HTML 의 마커를 실제 내용으로 갈아 끼운다. 마커가 없으면 즉시 실패한다 */
function inject(shell, { head, markup, route, state }) {
  if (!HEAD_RE.test(shell)) {
    throw new Error(
      "index.html 에서 <!-- prerender:head:start --> ~ <!-- prerender:head:end --> 마커를 찾지 못했다. " +
        "마커를 지우면 프리렌더가 head 를 갈아 끼울 자리를 잃는다.",
    );
  }
  if (!ROOT_RE.test(shell)) {
    throw new Error('index.html 에서 <div id="root"></div> 를 찾지 못했다.');
  }

  /* 프리렌더가 첫 렌더에 쓴 공지를 브라우저에도 그대로 넘긴다. 이게 없으면
     hydrate 첫 렌더가 빈 목록이 되어 방금 그린 카드와 어긋난다(src/lib/notices.js 참고).
     "<" 를 escape 하지 않으면 본문의 </script> 문자열이 페이지를 깨뜨린다.
     이 주입은 404 복사(위쪽)보다 **뒤**에 일어나므로 dist/404.html 은 껍데기 그대로다 */
  const boot = state
    ? `\n    <script>window.__PRERENDER__=${JSON.stringify(state).replace(/</g, "\\u003c")}</script>`
    : "";

  return shell
    .replace(
      HEAD_RE,
      `<!-- prerender:head:start (${route}) -->\n${head}\n    <!-- prerender:head:end -->`,
    )
    .replace(ROOT_RE, `<div id="root">${markup}</div>${boot}`);
}

/* ============================================================
 * 5. 요약 로그 — 무엇이 나갔고 무엇이 왜 빠졌는지
 *
 * 회귀는 대개 "조용히 빠지는" 방식으로 온다. 빌드 로그에 매번 같은 표가 찍히면
 * 어느 날 Menu 가 사라진 것을 사람이 알아볼 수 있다.
 * ============================================================ */

function summarize({ route, meta, jsonLd, markup, notice, seedBytes = 0 }) {
  const types = [];
  for (const node of jsonLd?.["@graph"] ?? []) {
    if (node && node["@type"]) types.push(Array.isArray(node["@type"]) ? node["@type"][0] : node["@type"]);
  }

  const omitted = [];
  if (!jsonLd) omitted.push("JSON-LD 전체(origin 미설정 — SITE_ORIGIN 또는 seo_settings.site_url)");
  if (!meta.canonical) omitted.push("canonical/og:url(origin 미설정)");
  if (!meta.ogImage) omitted.push("og:image(기본 OG 경로 없음)");
  if (jsonLd && !types.includes("FAQPage") && meta.faq.length === 0) omitted.push("FAQPage(문답 0건)");
  if (jsonLd && route === "/stores" && !types.includes("Restaurant")) {
    omitted.push("Restaurant·ItemList(지점 NAP 이 자리표시자 — 상호·주소·전화가 다 실제 값일 때만 켜진다)");
  }
  if (jsonLd && route === "/" && !types.includes("Restaurant")) omitted.push("Restaurant(같은 이유)");

  const desc = meta.description.length;
  /* 설명은 검색결과에서 대략 이 언저리에서 잘린다. 지어내지 말고 길이만 알려 준다 */
  const descFlag = desc === 0 ? " ⚠비어 있음" : desc > 160 ? " ⚠160자 초과(잘릴 수 있다)" : "";

  log(`\n  ${route}${notice ? `   (공지 #${notice.id})` : ""}`);
  log(`    제목      ${meta.title}`);
  log(`    설명      ${desc}자${descFlag}`);
  log(`    robots    ${meta.robots}`);
  log(`    본문      ${textLength(markup).toLocaleString("ko-KR")}자 / ${markup.length.toLocaleString("ko-KR")}바이트`);
  /* 씨앗은 hydrate 첫 렌더가 서버와 같은 목록을 보게 하는 재료다. 조용히 부풀면 곤란하다 */
  log(`    씨앗      ${seedBytes.toLocaleString("ko-KR")}바이트`);
  log(`    스키마    ${types.length ? types.join(", ") : "(없음)"}`);
  if (omitted.length) log(`    생략      ${omitted.join(" · ")}`);
}

/* ============================================================
 * 6. 본체
 * ============================================================ */

async function main() {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    throw new Error("dist/index.html 이 없다. `vite build` 를 먼저 돌려야 한다.");
  }

  /* [404] 프리렌더보다 **먼저** 껍데기를 404.html 로 복사한다.
     순서가 핵심이다 — 아래에서 dist/index.html 을 홈 프리렌더 결과로 덮어쓰기 때문에,
     이 복사를 나중에 하면 404.html 이 "홈 페이지"가 되어 버린다.
     404.html 은 GitHub Pages 가 모르는 주소(= /admin/*, 프리렌더하지 않은 공지,
     오타 주소)에 돌려주는 파일이고, 그 자리에서 SPA 가 다시 라우팅해야 하므로
     **반드시 아무 라우트도 아닌 빈 껍데기여야 한다.** */
  const { html: shell, from } = readShell();
  fs.writeFileSync(path.join(DIST, "404.html"), shell, "utf8");
  log(`dist/404.html ← 프리렌더 전 SPA 껍데기 (원본 ${from} · 알 수 없는 주소·관리자 화면용)`);

  const client = makeClient();
  log(`\nSupabase   ${client ? "연결됨(anon)" : "환경변수 없음 → 정적 원본(seoData.js/noticeData.js)"}`);

  /* vite 를 미들웨어 모드로 띄워 SSR 로더만 쓴다. 순수 node 로 src 를 import 하면
     import.meta.env 가 undefined 라 asset.js·supabase.js 가 모듈 평가 시점에 죽고,
     JSX 와 `import "./index.css"` 도 처리되지 않는다. vite 를 거치면 셋 다 해결된다 */
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: ROOT,
    base: BASE,
    appType: "custom",
    logLevel: "warn",
    server: { middlewareMode: true, hmr: false },
  });

  try {
    const renderer = await resolveRenderer(vite);
    log(`렌더 진입점 ${renderer.kind}`);

    const seo = await loadSeoData(client);
    const { rows: notices, source: noticeSource } = await loadNotices(client, vite);
    const publicNotices = notices.filter((n) => n.is_public !== false);

    /* 화면들(NoticeBoard·NoticeDetail·홈의 NOTICE 섹션)은 useEffect 안에서 글을 읽는데
       renderToString 은 effect 를 돌리지 않는다. 그대로 두면 공지 라우트의 정적 HTML 이
       제목만 있고 본문은 한 글자도 없는 뼈대가 된다 — 프리렌더의 존재 이유가 사라진다.
       그래서 방금 읽은 글을 vite SSR 실현 안의 notices.js 에 미리 꽂아 둔다.
       **반드시 vite.ssrLoadModule 로 얻은 모듈이어야 한다.** 순수 node 로 import 하면
       화면들이 쓰는 것과 다른 사본이 되어 씨앗이 닿지 않는다. */
    const noticesModule = await vite.ssrLoadModule("/src/lib/notices.js");
    noticesModule.seedPrerenderNotices(publicNotices, { shaped: noticeSource === "fallback" });

    /* 서버 렌더가 실제로 읽어 간 목록. 화면들이 useState 초기값으로 집어 가는 것과
       **같은 배열**이라, 이것을 그대로 브라우저에 넘겨야 첫 렌더가 어긋나지 않는다 */
    const seededList = noticesModule.seededNotices() ?? [];

    const origin = trimSlash(ENV_ORIGIN || seo.settings?.site_url || SITE.siteUrl);
    log(`SEO 원본   ${seo.source} (seo_pages ${seo.pages.size}행 · 클러스터 ${CLUSTERS.length}개 — 코드 고정)`);
    log(`공지       ${noticeSource} · 공개 ${publicNotices.length}건`);
    log(`base       ${BASE}`);
    log(`origin     ${origin || "(없음)"}`);
    if (!origin) {
      log(
        "  ⚠ origin 이 없어 canonical·og:url·JSON-LD 가 전부 생략된다.\n" +
          "    빌드 환경변수 SITE_ORIGIN 또는 Supabase 의 seo_settings.site_url 을 채우면 켜진다.",
      );
    }

    /* 라우트 목록 = 정적 공개 라우트 + 공개 공지 한 건씩.
       /admin/* 은 넣지 않는다 — React.lazy 청크라 정적으로 뽑을 것이 없고,
       뽑아서도 안 된다(색인 대상이 아니다). */
    const jobs = [
      ...PRERENDER_ROUTES.map((route) => ({ route, notice: null })),
      ...publicNotices.map((n) => ({ route: `/notice/${n.id}`, notice: n })),
    ];

    log(`\n라우트 ${jobs.length}개를 그린다.`);
    const manifest = [];

    for (const job of jobs) {
      const ctx = {
        dbPage: seo.pages.get(job.notice ? "/notice/:id" : job.route) ?? null,
        dbSettings: seo.settings,
        notice: job.notice,
        notices: publicNotices,
        /* 지점은 한 건도 넘기지 않는다. StoreFinder 의 전화(010-1234-5678)와
           성수·서교 주소("0000빌딩")가 전부 자리표시자라, 넘겨도 seo.js 의
           isReal 검사에서 전부 탈락한다. 가짜 NAP 이 색인되면 구조화 데이터
           스팸으로 수동 조치 대상이다. 실제 값이 생기면 여기에 stores 를 넘기면 된다 */
        stores: [],
        origin,
        base: BASE,
      };

      const meta = resolveMeta(job.route, ctx);
      const jsonLd = buildJsonLd(job.route, { ...ctx, meta });

      const problems = validateJsonLd(jsonLd);
      if (problems.length) {
        throw new Error(
          `[${job.route}] JSON-LD 검증 실패 — 자리표시자나 끊긴 참조가 남아 있다:\n  - ` +
            problems.join("\n  - "),
        );
      }

      let markup;
      try {
        markup = renderer.render(withBase(job.route));
      } catch (err) {
        /* 여기서 삼키면 빈 껍데기가 정상인 척 배포된다. 무조건 빌드를 세운다.
           cause 로 원본을 매달아 둔다 — 메시지에 stack 을 문자열로 박아 두긴 하지만,
           그것만으로는 상위에서 원래 오류의 종류(err.code 등)를 다시 볼 수 없다. */
        throw new Error(`[${job.route}] 렌더 실패: ${err?.stack || err?.message || err}`, {
          cause: err,
        });
      }
      if (markup.includes(ERROR_BOUNDARY_MARK)) {
        throw new Error(
          `[${job.route}] 결과에 ErrorBoundary 안내문이 들어 있다. 렌더 도중 예외가 났다는 뜻이다.`,
        );
      }
      if (textLength(markup) < MIN_TEXT_LENGTH) {
        throw new Error(
          `[${job.route}] 본문이 ${textLength(markup)}자뿐이다(최소 ${MIN_TEXT_LENGTH}자). ` +
            "빈 껍데기를 뽑았을 가능성이 크다.",
        );
      }

      /* 태그 사이에 이어진 한글 덩어리가 하나도 없으면 RevealText 의 줄 단위 분기가
         사라졌다는 뜻이다(src/Reveal.jsx). 한 글자마다 <span> 을 두른 HTML 은
         단순 추출기에게 "압/구/정/곱/창" 처럼 조각나 보인다 */
      if (!CONTIGUOUS_KO.test(markup)) {
        throw new Error(
          `[${job.route}] 태그 사이에 이어진 한글 문장이 없다. ` +
            "RevealText 가 글자 단위로 쪼개져 나갔을 가능성이 크다(Reveal.jsx 의 !hydrated 분기 확인).",
        );
      }

      /* 씨앗은 서버 렌더가 실제로 읽은 것과 **같은 배열**이어야 한다. 줄이면
         목록이 200건에서 20건으로 바뀌며 카드 수가 어긋난다.
         목록 조회는 body 를 아예 안 가져오므로(listColumns) 여기서 떼어내도 잃는 게 없고,
         상세 라우트의 그 한 건만 본문을 남긴다 — 그 화면은 본문으로 첫 렌더를 그렸기 때문이다 */
      const seedList = seededList.map((n) =>
        job.notice && n.id === String(job.notice.id) ? n : stripBody(n),
      );
      const state = seedList.length ? { notices: seedList } : null;

      /* 조용히 부풀지 않게 한다. 공지가 몇 백 건 쌓이면 모든 라우트가 그만큼 무거워지는데,
         그 판단은 사람이 해야지 빌드가 몰래 넘기면 안 된다 */
      const seedBytes = state ? Buffer.byteLength(JSON.stringify(state), "utf8") : 0;
      if (seedBytes > 64 * 1024) {
        throw new Error(
          `[${job.route}] 공지 씨앗이 ${seedBytes.toLocaleString("ko-KR")}바이트다(상한 65,536). ` +
            "공지 수가 늘었다. 목록 프리렌더 범위를 줄이거나 상한을 다시 정할 것.",
        );
      }

      const html = inject(shell, {
        head: buildHead(meta, jsonLd),
        markup,
        route: job.route,
        state,
      });

      const outPath =
        job.route === "/"
          ? path.join(DIST, "index.html")
          : path.join(DIST, job.route.replace(/^\//, ""), "index.html");
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, html, "utf8");

      summarize({ route: job.route, meta, jsonLd, markup, notice: job.notice, seedBytes });

      manifest.push({
        route: job.route,
        /* sitemap 의 <lastmod> 재료. 공지는 게시일, 정적 페이지는 빌드일이 최선이다 —
           없는 수정일을 지어내지 않는다 */
        lastmod: job.notice ? toIsoDate(job.notice.published_at) : "",
        changefreq: job.notice ? "yearly" : job.route === "/notice" ? "weekly" : "monthly",
        priority: job.route === "/" ? "1.0" : job.notice ? "0.5" : "0.8",
        noindex: meta.robots.includes("noindex"),
      });
    }

    fs.writeFileSync(
      MANIFEST,
      JSON.stringify({ base: BASE, origin, generatedAt: new Date().toISOString(), routes: manifest }, null, 2),
      "utf8",
    );

    log(`\n완료 — ${jobs.length}개 라우트 · dist/404.html 은 SPA 껍데기 그대로.`);
  } finally {
    await vite.close();
  }
}

/* seo-assets.mjs 가 import 해도 본체가 돌지 않도록, 직접 실행일 때만 main() 을 부른다 */
const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((err) => {
    console.error("\n[prerender] 실패 — 빌드를 중단한다.\n");
    console.error(err?.stack || err?.message || err);
    /* 여기서 exit(1) 을 하지 않으면 깨진 결과물이 그대로 배포된다 */
    process.exit(1);
  });
}

export { BASE, MANIFEST, loadNotices, loadSeoData, main, makeClient, toIsoDate };
