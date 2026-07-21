/**
 * 라우트 하나를 jsdom 안에서 실제로 hydrate 해 보고, React 가 불일치를 말하는지 듣는다.
 * scripts/hydration-check.mjs 가 라우트마다 **별도 프로세스**로 부른다.
 *
 * 왜 한 프로세스에 하나뿐인가:
 *   src/lib/hydrated.js 의 관문은 모듈 전역이고 한 번만 열린다. 같은 프로세스에서
 *   두 번째 라우트를 hydrate 하면 이미 열린 관문으로 시작해 첫 렌더가 compact 분기로
 *   나오고, 그건 **검사 방식 때문에** 생긴 가짜 불일치다.
 *
 * 사용법: node scripts/hydrate-one.mjs <route> <viewportWidth>
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { JSDOM } from "jsdom";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIST = path.join(ROOT, "dist");

const BASE = normalizeBase(process.env.BASE_PATH || "/");
const route = process.argv[2] || "/";
const width = Number(process.argv[3] || 1440);

function normalizeBase(value) {
  let b = String(value || "/").trim();
  if (!b.startsWith("/")) b = "/" + b;
  if (!b.endsWith("/")) b += "/";
  return b;
}

/** 프리렌더 결과물의 자리 */
function htmlPath(r) {
  return r === "/"
    ? path.join(DIST, "index.html")
    : path.join(DIST, r.replace(/^\//, ""), "index.html");
}

/** React 가 뱉는 하이드레이션 불평만 골라낸다 */
const MISMATCH_RE = /hydrat|did not match|server render|server HTML/i;

async function main() {
  const file = htmlPath(route);
  if (!fs.existsSync(file)) throw new Error(`프리렌더 결과가 없다: ${file}`);
  const html = fs.readFileSync(file, "utf8");

  const dom = new JSDOM(html, {
    url: "http://localhost" + (BASE + route.replace(/^\//, "")).replace(/\/{2,}/g, "/"),
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;

  /* 화면 크기는 jsdom 기본값(1024x768)이라 그대로 두면 검사할 폭을 정할 수 없다.
     useBreakpoint 가 이 값을 읽으므로 desktop/compact 어느 쪽을 검사할지가 여기서 갈린다 */
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

  /* jsdom 에 없는 것들. 없으면 하이드레이션이 아니라 ReferenceError 로 죽어
     "불일치 없음" 과 구별이 안 된다 */
  window.matchMedia = (q) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  });
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  window.IntersectionObserver = NoopObserver;
  window.ResizeObserver = NoopObserver;
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.scrollTo = () => {};

  /* 프리렌더가 심어 둔 공지 씨앗. 화면들이 렌더 도중 동기로 읽으므로,
     hydrateRoot 를 부르기 **전에** 창에 올라와 있어야 한다 */
  for (const el of window.document.querySelectorAll("script:not([src])")) {
    if (el.textContent.includes("__PRERENDER__")) {
      window.eval(el.textContent);
    }
  }

  for (const key of [
    "window",
    "document",
    "navigator",
    "location",
    "history",
    "HTMLElement",
    "Element",
    "Node",
    "Event",
    "CustomEvent",
    "MutationObserver",
    "IntersectionObserver",
    "ResizeObserver",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "matchMedia",
  ]) {
    /* node 20+ 의 globalThis.navigator 는 getter 뿐이라 대입이 죽는다.
       defineProperty 로 덮어야 한다 */
    Object.defineProperty(globalThis, key, {
      value: window[key],
      writable: true,
      configurable: true,
    });
  }

  const { createServer } = await import("vite");
  const vite = await createServer({
    root: ROOT,
    base: BASE,
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true, hmr: false },
  });

  const problems = [];
  try {
    const { default: AppRoutes } = await vite.ssrLoadModule("/src/routes.jsx");
    const { markHydrated } = await vite.ssrLoadModule("/src/lib/hydrated.js");
    const { hydrateRoot } = await import("react-dom/client");
    const { BrowserRouter } = await import("react-router-dom");

    /* main.jsx 의 HydrationGate 와 같은 자리·같은 시점이어야 한다.
       StaticRouter 를 쓰면 안 된다 — 브라우저가 하는 일을 흉내내는 것이 목적이고,
       주소는 위에서 jsdom 에 준 URL 이 알려 준다 */
    const { useLayoutEffect } = await import("react");
    const Gate = () => {
      useLayoutEffect(() => markHydrated(), []);
      return null;
    };

    const origError = console.error;
    const origWarn = console.warn;
    const collect =
      (orig) =>
      (...args) => {
        const line = args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ");
        if (MISMATCH_RE.test(line)) problems.push(line);
        orig(...args);
      };
    console.error = collect(origError);
    console.warn = collect(origWarn);

    hydrateRoot(
      window.document.getElementById("root"),
      createElement(
        BrowserRouter,
        { basename: BASE },
        createElement(AppRoutes),
        createElement(Gate),
      ),
    );
    await new Promise((r) => setTimeout(r, 50));

    console.error = origError;
    console.warn = origWarn;
  } finally {
    await vite.close();
  }

  if (problems.length) {
    process.stderr.write(problems.join("\n---\n") + "\n");
    process.exit(1);
  }
  process.stdout.write(`ok ${route} @${width}\n`);
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write((err?.stack || err?.message || String(err)) + "\n");
  process.exit(1);
});
