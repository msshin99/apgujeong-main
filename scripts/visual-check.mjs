/**
 * 시각 회귀 검사 — 빌드된 dist/ 를 진짜 크로미움으로 열어 라우트 × 화면폭 전부를 찍고,
 * 저장해 둔 기준(baseline)과 비교한다.
 *
 * 왜 이게 필요한가:
 *   이 사이트의 데스크톱 레이아웃은 1920 고정 캔버스를 transform:scale 로 줄인 것이고,
 *   1200px 아래에서는 18개 컴포넌트가 **완전히 다른 트리**(isCompact)로 갈라진다.
 *   두 분기는 사람이 손으로 맞춰 왔고, 그래서 한쪽만 고쳐 놓고 아무도 모르는 사고가
 *   반복됐다. 이 저장소에는 테스트가 하나도 없다. 레이아웃을 하나로 합치는 작업을
 *   하려면 "합치기 **전** 화면" 을 붙잡아 둘 물건이 먼저 있어야 한다. 그게 이 파일이다.
 *
 * 무엇을 남기나 — 두 가지를 라우트·화면폭마다 남긴다:
 *   (1) 전체 페이지 PNG. 사람이 눈으로 확인할 최종 근거.
 *   (2) **레이아웃 지문**: 의미 있는 요소들의 좌표·크기·글자 크기를 순서대로 적은 텍스트.
 *       픽셀 비교는 "달라졌다" 까지만 말하지만 지문은 "어떤 요소가 몇 px 움직였다" 를
 *       말한다. 레이아웃을 다시 쓰는 작업에서 필요한 건 후자다.
 *
 * 쓰는 법:
 *   npm run visual:baseline   기준을 새로 찍는다(작업 **전**에 한 번)
 *   npm run visual:check      지금 dist 를 기준과 비교한다. 차이가 크면 종료코드 1
 *   추가 인자: --filter=<문자열>  라우트/화면폭 이름으로 걸러 일부만 본다
 *             --pixel-threshold=<%>  픽셀 차이 허용치(기본 0.1%)
 *             --geometry-tolerance=<px>  좌표 흔들림 허용치(기본 1px)
 *
 * 일부러 npm run build 에 걸지 않았다. 빌드는 이미 차가운 상태에서 3분이 넘고,
 * 이 검사는 "레이아웃을 건드릴 때" 만 필요하다.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

import { startStaticServer } from "./visual-serve.mjs";
import { PRERENDER_ROUTES } from "../src/lib/seoData.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, ".visual");

/* 1199 와 1280 은 일부러 나란히 둔다. isCompact 경계가 1200 이라 이 두 줄이
   "다른 트리 두 개" 를 각각 붙잡는다. 레이아웃 통합의 위험은 정확히 여기에 있다.
   1440·1280 은 노트북 실사용 폭, 900·768 은 태블릿, 375 는 휴대폰이다. */
const VIEWPORTS = [
  { w: 1920, h: 1080 },
  { w: 1440, h: 900 },
  { w: 1280, h: 800 },
  { w: 1199, h: 800 },
  { w: 900, h: 800 },
  { w: 768, h: 1024 },
  { w: 375, h: 812 },
];

/* 크로미움은 아주 긴 그림을 한 장으로 만들지 못하고(텍스처 한계), 그 전에 메모리가 먼저
   힘들어진다. 1920 폭 × 12000 이면 raw 로 69MB 다. 넘는 페이지는 위에서 잘라 찍고
   잘렸다고 보고한다 — 조용히 줄이면 "아래쪽은 검사한 적이 없다" 는 사실이 숨는다. */
const MAX_CAPTURE_HEIGHT = 12000;

/* 채널당 이만큼까지는 같은 픽셀로 친다. AVIF/WebP 디코딩과 폰트 힌팅에서 ±1~2 는 늘 흔들린다 */
const CHANNEL_THRESHOLD = 8;

const args = process.argv.slice(2);
const isBaseline = args.includes("--baseline") || args.includes("--update");
const filter = (args.find((a) => a.startsWith("--filter=")) || "").slice("--filter=".length);
const pixelThreshold = Number(
  (args.find((a) => a.startsWith("--pixel-threshold=")) || "=0.1").split("=")[1],
);
const geomTolerance = Number(
  (args.find((a) => a.startsWith("--geometry-tolerance=")) || "=1").split("=")[1],
);

const BASE_DIR = path.join(OUT, "baseline");
const CUR_DIR = path.join(OUT, "current");
const DIFF_DIR = path.join(OUT, "diff");

function log(line = "") {
  process.stdout.write(line + "\n");
}

/* ────────────────────────────── 라우트 고르기 ────────────────────────────── */

/**
 * 프리렌더된 공지 하나. 상세 라우트는 목록과 마크업이 달라 따로 봐야 하고,
 * 번호는 DB 사정에 따라 바뀌므로 결과물 폴더에서 가장 작은 번호를 집는다
 * (hydration-check.mjs 와 같은 방식 — 기준과 검사가 같은 글을 보도록).
 */
function oneNoticeRoute() {
  const dir = path.join(DIST, "notice");
  if (!fs.existsSync(dir)) return null;
  const id = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, "index.html")))
    .map((e) => e.name)
    .sort((a, b) => Number(a) - Number(b))[0];
  return id ? `/notice/${id}` : null;
}

function routeList() {
  const notice = oneNoticeRoute();
  return [
    ...PRERENDER_ROUTES,
    ...(notice ? [notice] : []),
    /* 관리자 화면도 1200 경계로 갈라진다(AdminLayout: 왼쪽 고정 메뉴 ↔ 위쪽 가로 메뉴).
       로그인 전 화면이지만 그 껍데기 자체가 이중 분기라 검사 대상이다 */
    "/admin/seo",
  ];
}

/** 라우트를 파일 이름으로. "/" → home, "/notice/1" → notice-1 */
function slug(route) {
  const s = route.replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9]+/g, "-");
  return s || "home";
}

const caseName = (route, vp) => `${slug(route)}@${vp.w}x${vp.h}`;

/* ────────────────────────────── 페이지 안에서 도는 코드 ────────────────────────────── */

/**
 * 레이아웃 지문을 뽑는다. 이 함수는 **브라우저 안에서** 문자열로 평가되므로
 * 바깥 스코프를 참조하면 안 된다.
 *
 * 요소를 무엇으로 식별하나 — 이게 이 파일에서 가장 중요한 설계 결정이다.
 *   CSS 경로(div>div:nth-child(3))로 잡으면 안 된다. 레이아웃을 다시 쓰는 순간 전부
 *   달라져 "전부 바뀜" 만 나오고 아무 정보가 없다. 클래스도 안 된다 — Tailwind 클래스는
 *   레이아웃 그 자체라 같이 바뀐다.
 *   그래서 **태그 + 사람이 읽는 내용**(id, alt, 글 앞부분)으로 잡는다. 트리 모양이 바뀌어도
 *   "제목 '브랜드 이야기' 가 16px 내려갔다" 는 문장이 그대로 살아남는다.
 */
const FINGERPRINT_FN = `() => {
  const SELECTOR = [
    "h1","h2","h3","h4","h5","h6","p","li","a","button","img","picture","input","textarea",
    "select","label","header","footer","nav","main","section","article","figure","table",
    "blockquote","video","[role]","[data-cursor]",
  ].join(",");

  const norm = (s) => (s || "").replace(/\\s+/g, " ").trim().slice(0, 40);
  const base = (u) => { try { return decodeURIComponent(new URL(u, location.href).pathname.split("/").pop()); } catch { return ""; } };
  const r1 = (n) => Math.round(n * 10) / 10;

  const seen = new Map();
  const rows = [];

  for (const el of document.querySelectorAll(SELECTOR)) {
    const rect = el.getBoundingClientRect();
    /* 안 보이는 것은 적지 않는다. 0 짜리를 넣으면 기준 파일이 의미 없는 줄로 부풀고,
       분기가 갈리면서 숨은 요소가 생기는 것은 이 사이트에서 정상 동작이다 */
    if (rect.width < 2 || rect.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;

    const tag = el.tagName.toLowerCase();
    let ident = "";
    if (el.id) ident = "#" + el.id;
    else if (tag === "img") ident = el.getAttribute("alt") || base(el.currentSrc || el.src);
    else if (el.getAttribute("aria-label")) ident = el.getAttribute("aria-label");
    else ident = norm(el.textContent);
    if (!ident) ident = "(비어 있음)";

    const role = el.getAttribute("role");
    let key = tag + (role ? "[role=" + role + "]" : "") + "{" + ident + "}";
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    if (n > 1) key += "~" + n;

    const row = {
      key,
      x: r1(rect.left + window.scrollX),
      y: r1(rect.top + window.scrollY),
      w: r1(rect.width),
      h: r1(rect.height),
      fs: r1(parseFloat(cs.fontSize) || 0),
    };
    /* 실제로 눈에 보이는 글자 크기. 데스크톱은 1920 캔버스를 transform:scale 로 줄이므로
       computed fontSize(16px)와 화면에 그려지는 크기(10~12px)가 다르다. 그 배율을 곱해 둔다 —
       "본문이 몇 px 로 보이는가" 는 이 사이트에서 고쳐야 할 문제 그 자체라 기록해 둘 값이다 */
    const zoom = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
    if (Math.abs(zoom - 1) > 0.01) row.efs = r1(row.fs * zoom);
    if (tag === "img") {
      row.src = base(el.currentSrc || el.src);
      row.nat = el.naturalWidth + "x" + el.naturalHeight;
    }
    rows.push(row);
  }

  return {
    doc: {
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    },
    rows,
  };
}`;

/**
 * 흔들림 제거. 여기 적힌 것 하나하나가 "이걸 안 껐더니 매번 다르게 나왔다" 의 기록이다.
 * 문서 로드 전에 걸어야 첫 페인트부터 적용된다.
 */
const DETERMINISM_INIT = `
  /* 애니메이션·전환을 끈다. 스크롤 위치나 찍는 순간의 프레임에 따라 값이 달라지는 것들 */
  const style = document.createElement("style");
  style.textContent = \`
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
      animation-duration: 0s !important;
      transition-duration: 0s !important;
      scroll-behavior: auto !important;
      caret-color: transparent !important;
    }
  \`;
  const put = () => document.head && document.head.appendChild(style);
  if (document.head) put(); else document.addEventListener("DOMContentLoaded", put);

  /* 시간에 따라 달라지는 값을 못 박는다. 화면에 날짜를 그리는 곳이 생기면 이 한 줄이
     "어제 찍은 기준" 과 오늘을 갈라 놓는 사고를 막는다 */
  const FROZEN = new Date("2026-01-01T09:00:00+09:00").getTime();
  const RealDate = Date;
  Date.now = () => FROZEN;
  window.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [FROZEN])); }
    static now() { return FROZEN; }
  };

  /* 난수는 순서만 같으면 되므로 아주 단순한 선형 합동 생성기로 바꾼다 */
  let seed = 0x2f6e2b1;
  Math.random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
`;

/* ────────────────────────────── 한 장 찍기 ────────────────────────────── */

/**
 * React 가 #root 를 이어받았는지 본다.
 *
 * 이 한 줄이 없으면 검사가 거짓말을 한다 — 실제로 겪었다. load 이벤트만 믿고 찍었더니
 * 768px 에서 프리렌더 그대로인(=1920 데스크톱 트리) 화면이 기준으로 저장됐다.
 * 프리렌더 HTML 은 언제나 데스크톱 분기라(useBreakpoint), 하이드레이션 전에 찍으면
 * 좁은 화면인데 넓은 화면이 찍힌다. 그리고 그건 **화면이 멀쩡해 보이는** 실패라
 * 사람이 눈으로는 절대 못 잡는다.
 *
 * hydrateRoot 는 컨테이너 DOM 노드에 __reactContainer$… 라는 내부 속성을 붙인다.
 * 공개 API 는 아니지만 앱 코드를 건드리지 않고 "이어받기가 끝났다" 를 알 수 있는
 * 유일한 신호다. 못 찾으면 예외를 던져 검사를 세운다 — 조용히 넘어가면 안 되는 자리다.
 */
const HYDRATED_FN = `() => {
  const el = document.getElementById("root");
  if (!el || !el.firstChild) return false;
  for (const k in el) if (k.startsWith("__reactContainer$")) return true;
  return false;
}`;

async function capture(page, url, route, outDir, name) {
  const errors = [];
  const onError = (e) => errors.push(String(e.message || e));
  page.on("pageerror", onError);

  await page.goto(url + route, { waitUntil: "load", timeout: 60_000 });
  /* networkidle 은 지도·외부 스크립트를 막아 둔 상태에서도 대개 금방 온다.
     안 오면 그냥 넘어간다 — 검사가 멈추는 것보다 낫다 */
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

  try {
    await page.waitForFunction(HYDRATED_FN, null, { timeout: 30_000 });
  } catch {
    /* 한 번은 다시 열어 본다. 63장을 연달아 찍다 보면 첫 시도가 밀리는 일이 있다 */
    await page.goto(url + route, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(HYDRATED_FN, null, { timeout: 30_000 }).catch(() => {
      throw new Error(
        `[${name}] React 하이드레이션이 끝나지 않았다. 이 상태로 찍으면 프리렌더(데스크톱) ` +
          `트리가 좁은 화면의 기준으로 저장된다.` +
          (errors.length ? `\n  페이지 오류: ${errors.join(" / ")}` : ""),
      );
    });
  }

  await page.evaluate(async () => {
    /* 지연 로딩을 전부 즉시 로딩으로 바꾸고 실제로 해독될 때까지 기다린다.
       이걸 안 하면 화면 아래쪽 사진이 찍히는 순간마다 있다 없다 한다 */
    const imgs = [...document.images];
    for (const img of imgs) {
      img.loading = "eager";
      img.removeAttribute("loading");
    }
    await Promise.all(
      imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())),
    );
    /* 폰트가 늦게 붙으면 모든 글자의 높이가 통째로 달라진다 */
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    /* 페이지를 한 번 훑고 올라온다.
       왜 필요한가 — 이것도 실제로 겪은 흔들림이다. 데스크톱 분기는 캔버스를 통째로
       transform:scale 로 줄이므로 사진이 정수 배율이 아닌 크기로 그려진다. 크로미움은
       그럴 때 먼저 거친 축소본을 깔고 잠시 뒤 고품질로 다시 그린다. 화면 밖에 있는
       사진은 그 "다시 그리기" 가 아예 오지 않아서, 같은 빌드를 두 번 찍어도 사진 영역만
       5% 씩 달라졌다(좌표는 한 곳도 안 움직였는데도). 한 번 지나가며 래스터를 확정시킨다. */
    const step = Math.round(window.innerHeight * 0.9);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    window.scrollTo(0, 0);
  });

  /* 두 프레임 기다린다 — 하이드레이션 뒤 레이아웃이 한 번 더 자리를 잡는다
     (useBreakpoint 관문이 열리며 compact 분기로 갈아끼워지는 순간) */
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.waitForTimeout(400);

  /* 지문이 먼저다. 전체 페이지 촬영이 내부적으로 스크롤을 건드릴 수 있어서,
     좌표는 스크롤 0 인 상태에서 읽어 둔다 */
  const fp = await page.evaluate(`(${FINGERPRINT_FN})()`);

  /* 빈 화면을 기준으로 저장하는 것이 이 도구가 저지를 수 있는 가장 나쁜 실패다.
     그 뒤로는 "모든 것이 새로 생겼다" 만 나와 아무도 보고를 읽지 않게 된다 */
  if (fp.rows.length < 5) {
    throw new Error(
      `[${name}] 그려진 것이 거의 없다(요소 ${fp.rows.length}개). 빈 화면을 기준으로 남기지 않는다.` +
        (errors.length ? `\n  페이지 오류: ${errors.join(" / ")}` : ""),
    );
  }

  const height = Math.min(fp.doc.scrollHeight, MAX_CAPTURE_HEIGHT);
  const truncated = fp.doc.scrollHeight > MAX_CAPTURE_HEIGHT;
  const pngPath = path.join(outDir, name + ".png");
  await page.screenshot({
    path: pngPath,
    fullPage: !truncated,
    ...(truncated
      ? { clip: { x: 0, y: 0, width: fp.doc.scrollWidth, height } }
      : {}),
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });

  page.off("pageerror", onError);

  const meta = { route, name, doc: fp.doc, truncated, errors };
  /* 한 줄에 요소 하나씩 적는다. JSON.stringify(…, 2) 로 뭉개면 요소 하나가 여덟 줄이 되어
     git diff 나 눈으로 훑는 일이 불가능해진다. 지문의 값어치는 "읽히는 것" 에 있다 */
  const body = fp.rows.map((r) => "  " + JSON.stringify(r)).join(",\n");
  fs.writeFileSync(
    path.join(outDir, name + ".json"),
    `{\n "meta": ${JSON.stringify(meta)},\n "doc": ${JSON.stringify(fp.doc)},\n "rows": [\n${body}\n ]\n}\n`,
    "utf8",
  );
  return meta;
}

/* ────────────────────────────── 비교 ────────────────────────────── */

/** 픽셀 비교. sharp 로 둘 다 raw RGB 로 풀고 채널 차이가 문턱을 넘는 픽셀을 센다 */
async function comparePixels(aPath, bPath, diffPath) {
  const [a, b] = await Promise.all(
    [aPath, bPath].map((p) =>
      sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    ),
  );

  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    return {
      sizeChanged: `${a.info.width}x${a.info.height} → ${b.info.width}x${b.info.height}`,
      diff: Math.max(a.info.width * a.info.height, b.info.width * b.info.height),
      total: Math.max(a.info.width * a.info.height, b.info.width * b.info.height),
      pct: 100,
    };
  }

  const { width, height } = a.info;
  const total = width * height;
  const out = Buffer.alloc(total * 3);
  let diff = 0;

  for (let i = 0, p = 0; p < total; p += 1, i += 3) {
    const dr = Math.abs(a.data[i] - b.data[i]);
    const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
    const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (dr > CHANNEL_THRESHOLD || dg > CHANNEL_THRESHOLD || db > CHANNEL_THRESHOLD) {
      diff += 1;
      out[i] = 255;
      out[i + 1] = 0;
      out[i + 2] = 64;
    } else {
      /* 같은 자리는 흐리게 깔아 둔다. 빨간 자국이 페이지 어디쯤인지 보이도록 */
      const g = 255 - Math.round((255 - (a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3) * 0.15);
      out[i] = out[i + 1] = out[i + 2] = g;
    }
  }

  if (diff > 0) {
    await sharp(out, { raw: { width, height, channels: 3 } }).png().toFile(diffPath);
  }
  return { diff, total, pct: (diff / total) * 100, sizeChanged: null };
}

/** 지문 비교 — 사라짐 / 새로 생김 / 움직임 */
function compareGeometry(before, after, tol) {
  const A = new Map(before.rows.map((r) => [r.key, r]));
  const B = new Map(after.rows.map((r) => [r.key, r]));

  const removed = [];
  const added = [];
  const moved = [];

  for (const [key, a] of A) {
    const b = B.get(key);
    if (!b) {
      removed.push(key);
      continue;
    }
    const parts = [];
    for (const f of ["x", "y", "w", "h"]) {
      const d = b[f] - a[f];
      if (Math.abs(d) >= tol) {
        parts.push(`${f} ${a[f]} → ${b[f]} (${d > 0 ? "+" : ""}${Math.round(d * 10) / 10})`);
      }
    }
    if (Math.abs((b.fs || 0) - (a.fs || 0)) >= 0.5) parts.push(`글자 ${a.fs}px → ${b.fs}px`);
    if (Math.abs((b.efs ?? b.fs ?? 0) - (a.efs ?? a.fs ?? 0)) >= 0.5) {
      parts.push(`보이는 글자 ${a.efs ?? a.fs}px → ${b.efs ?? b.fs}px`);
    }
    if (a.src && b.src && a.src !== b.src) parts.push(`그림 ${a.src} → ${b.src}`);
    if (parts.length) moved.push({ key, parts });
  }
  for (const key of B.keys()) if (!A.has(key)) added.push(key);

  const docChanged =
    before.doc.scrollHeight !== after.doc.scrollHeight ||
    before.doc.scrollWidth !== after.doc.scrollWidth
      ? `문서 크기 ${before.doc.scrollWidth}x${before.doc.scrollHeight} → ${after.doc.scrollWidth}x${after.doc.scrollHeight}`
      : null;

  return { removed, added, moved, docChanged };
}

/* ────────────────────────────── 본체 ────────────────────────────── */

async function main() {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    log("빌드 결과가 없다. 먼저 npm run build 를 돌릴 것.");
    process.exitCode = 1;
    return;
  }

  const outDir = isBaseline ? BASE_DIR : CUR_DIR;
  if (!isBaseline && !fs.existsSync(BASE_DIR)) {
    log("기준이 없다. 먼저 npm run visual:baseline 을 돌릴 것.");
    process.exitCode = 1;
    return;
  }
  /* --filter 로 몇 장만 다시 찍을 때 폴더를 비우면 나머지 기준이 통째로 날아간다.
     걸러 찍는 것은 "이 몇 장만 갱신" 이라는 뜻이므로 덮어쓰기만 한다 */
  if (!filter) fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  if (!isBaseline) {
    fs.rmSync(DIFF_DIR, { recursive: true, force: true });
    fs.mkdirSync(DIFF_DIR, { recursive: true });
  }

  const routes = routeList();
  const jobs = [];
  for (const vp of VIEWPORTS) {
    for (const route of routes) {
      const name = caseName(route, vp);
      if (filter && !name.includes(filter) && !route.includes(filter)) continue;
      jobs.push({ route, vp, name });
    }
  }

  const server = await startStaticServer({ root: DIST });
  log(`\n시각 회귀 ${isBaseline ? "기준 촬영" : "검사"} — ${jobs.length}장`);
  log(`  서버 ${server.url}  (빈 포트를 받아 쓴다)`);
  log(`  결과 ${path.relative(ROOT, outDir).replace(/\\/g, "/")}`);

  const browser = await chromium.launch({
    args: [
      /* 폰트 렌더링이 기기·세션마다 흔들리지 않게 한다 */
      "--font-render-hinting=none",
      "--disable-lcd-text",
      "--force-color-profile=srgb",
      "--hide-scrollbars",
      "--disable-skia-runtime-opts",
      /* 아래 넷은 "사진만 5~10% 씩 달라지는데 좌표는 한 곳도 안 움직이는" 흔들림을
         잡으려고 넣었다. 크로미움은 큰 사진을 일단 거친 축소본으로 깔고(checker imaging)
         나중에 고품질로 다시 그리는데, 그 '나중' 이 세션마다 다르게 온다.
         체커링을 끄고, 합성 단계를 전부 끝낸 뒤에 그리게 하고, 덜 그려진 화면을 시간이
         됐다고 내보내는 길을 막는다. 느려지지만 검사에서 필요한 것은 속도가 아니다 */
      "--disable-checker-imaging",
      "--disable-partial-raster",
      "--run-all-compositor-stages-before-draw",
      "--disable-new-content-rendering-timeout",
    ],
  });

  const failures = [];
  const rows = [];

  try {
    for (const vp of VIEWPORTS) {
      const mine = jobs.filter((j) => j.vp === vp);
      if (!mine.length) continue;

      const context = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        deviceScaleFactor: 1,
        locale: "ko-KR",
        timezoneId: "Asia/Seoul",
        colorScheme: "light",
        /* 이 사이트는 곳곳에서 prefers-reduced-motion 을 직접 읽어 "최종 상태로 즉시" 를
           고른다(Reveal, Collection 자동넘김, ScatterCards, GlowBackdrop …).
           그래서 reduce 로 두는 것이 애니메이션을 CSS 로 억지로 끄는 것보다 정직하다 —
           앱이 스스로 정한 정지 상태를 찍는 셈이다. 커스텀 커서도 이때 아예 렌더되지 않아
           마우스 위치라는 변수가 통째로 사라진다 */
        reducedMotion: "reduce",
      });

      /* 바깥 세상을 끊는다. Supabase(공지·문의)와 네이버 지도는 응답이 그때그때 다르고
         네트워크가 없으면 아예 다른 화면이 된다. 막아 두면 앱이 프리렌더 씨앗으로
         떨어지므로 언제 돌려도 같은 화면이 나온다 */
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (url.startsWith(server.url) || url.startsWith("data:") || url.startsWith("blob:")) {
          return route.continue();
        }
        return route.abort();
      });

      await context.addInitScript(DETERMINISM_INIT);

      for (const job of mine) {
        /* 라우트마다 탭을 새로 연다. 한 탭으로 63장을 내리 찍으면 크로미움의 이미지
           메모리 예산이 차면서 해독해 둔 사진을 버리기 시작하고, 그 뒤로 찍는 사진은
           거친 축소본 상태로 남는다 — 홈 화면에서 좌표는 한 곳도 안 움직였는데 픽셀만
           5.5% 달라지는 현상이 세 번에 한 번꼴로 나왔고, 한 장만 따로 찍으면 절대
           재현되지 않았다. 탭을 버리면 그 예산도 같이 비워진다. */
        const page = await context.newPage();
        const meta = await capture(page, server.url, job.route, outDir, job.name).finally(
          () => page.close(),
        );
        if (isBaseline) {
          log(`  ✓ ${job.name}${meta.truncated ? "  (아래 잘림)" : ""}`);
          continue;
        }

        const basePng = path.join(BASE_DIR, job.name + ".png");
        const baseJson = path.join(BASE_DIR, job.name + ".json");
        if (!fs.existsSync(basePng) || !fs.existsSync(baseJson)) {
          log(`  ? ${job.name}  기준에 없다(새 라우트/화면폭)`);
          failures.push({ name: job.name, why: "기준에 없다" });
          continue;
        }

        const px = await comparePixels(
          basePng,
          path.join(outDir, job.name + ".png"),
          path.join(DIFF_DIR, job.name + ".png"),
        );
        const before = JSON.parse(fs.readFileSync(baseJson, "utf8"));
        const after = JSON.parse(fs.readFileSync(path.join(outDir, job.name + ".json"), "utf8"));
        const geo = compareGeometry(before, after, geomTolerance);

        const geoCount = geo.moved.length + geo.added.length + geo.removed.length;
        const bad = px.pct > pixelThreshold || geoCount > 0 || !!geo.docChanged;
        rows.push({ job, px, geo, geoCount, bad });
        if (bad) failures.push({ name: job.name, px, geo });

        log(
          `  ${bad ? "✗" : "✓"} ${job.name.padEnd(28)} ` +
            `픽셀 ${px.pct.toFixed(3)}%  기하 ${geoCount}건` +
            (px.sizeChanged ? `  [${px.sizeChanged}]` : ""),
        );
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }

  if (isBaseline) {
    log(`\n기준을 ${jobs.length}장 저장했다. 이제 레이아웃을 고쳐도 되돌아올 자리가 있다.`);
    return;
  }

  /* 상세 보고 — 여기가 이 도구의 값어치다. "달라졌다" 가 아니라 "무엇이" 를 적는다 */
  log("");
  if (!failures.length) {
    log(`차이 없음 — ${rows.length}장 모두 기준과 같다.`);
    return;
  }

  log(`── 차이 ${failures.length}건 ──`);
  for (const f of failures) {
    if (!f.px) {
      log(`\n${f.name}\n  ${f.why}`);
      continue;
    }
    log(`\n${f.name}`);
    if (f.px.sizeChanged) log(`  그림 크기가 달라졌다: ${f.px.sizeChanged}`);
    log(
      `  픽셀  ${f.px.diff.toLocaleString("ko-KR")} / ${f.px.total.toLocaleString("ko-KR")}` +
        `  (${f.px.pct.toFixed(3)}%, 허용 ${pixelThreshold}%)`,
    );
    if (f.geo.docChanged) log(`  ${f.geo.docChanged}`);
    if (f.geo.moved.length) {
      log(`  움직인 요소 ${f.geo.moved.length}개${f.geo.moved.length > 12 ? " (앞 12개)" : ""}`);
      for (const m of f.geo.moved.slice(0, 12)) log(`    · ${m.key}\n        ${m.parts.join(", ")}`);
    }
    if (f.geo.removed.length) {
      log(`  사라진 요소 ${f.geo.removed.length}개: ${f.geo.removed.slice(0, 6).join(", ")}`);
    }
    if (f.geo.added.length) {
      log(`  새로 생긴 요소 ${f.geo.added.length}개: ${f.geo.added.slice(0, 6).join(", ")}`);
    }
  }

  log(
    `\n차이 그림: ${path.relative(ROOT, DIFF_DIR).replace(/\\/g, "/")}/ ` +
      `(빨간 자국이 달라진 픽셀)`,
  );
  log("의도한 변경이라면 npm run visual:baseline 으로 기준을 다시 찍을 것.");
  process.exitCode = 1;
}

main().catch((err) => {
  log("\n시각 회귀 검사가 넘어졌다:\n" + (err?.stack || err?.message || String(err)));
  process.exitCode = 1;
});
