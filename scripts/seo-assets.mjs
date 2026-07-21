/**
 * dist/sitemap.xml · dist/robots.txt 생성 — 프리렌더 다음에 돈다.
 *
 * 라우트 목록은 scripts/prerender.mjs 가 남긴 dist/.prerender-manifest.json 에서 읽는다.
 * 같은 데이터를 두 번 조회하지 않으려는 것이고(공지 목록이 두 파일에서 어긋나면
 * 사이트맵이 없는 주소를 가리키게 된다), 매니페스트가 없으면 정적 라우트만으로
 * 만들되 그 사실을 로그에 남긴다.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PRERENDER_ROUTES } from "../src/lib/seoData.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIST = path.join(ROOT, "dist");
const MANIFEST = path.join(DIST, ".prerender-manifest.json");

function trimSlash(v) {
  return String(v || "").trim().replace(/\/+$/, "");
}

function normalizeBase(value) {
  let b = String(value || "/").trim();
  if (!b.startsWith("/")) b = "/" + b;
  if (!b.endsWith("/")) b += "/";
  return b;
}

/** origin + base + route. origin 이 이미 base 로 끝나면 두 번 붙이지 않는다 */
function absolute(origin, base, route) {
  const o = trimSlash(origin);
  const b = normalizeBase(base);
  const head = o.endsWith(trimSlash(b)) && trimSlash(b) ? o : o + trimSlash(b);
  const tail = String(route) === "/" ? "/" : route;
  return (head + tail).replace(/([^:])\/{2,}/g, "$1/");
}

function log(line) {
  process.stdout.write(line + "\n");
}

/* ============================================================
 * 1. 입력
 * ============================================================ */

function loadManifest() {
  if (fs.existsSync(MANIFEST)) {
    try {
      return JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    } catch (err) {
      log(`  ⚠ 매니페스트를 읽지 못했다(${err.message}). 정적 라우트만으로 만든다.`);
    }
  } else {
    log("  ⓘ .prerender-manifest.json 이 없다(프리렌더를 안 돌렸다). 정적 라우트만 싣는다.");
  }
  return {
    base: process.env.BASE_PATH || "/",
    origin: trimSlash(process.env.SITE_ORIGIN || process.env.VITE_SITE_ORIGIN || ""),
    routes: PRERENDER_ROUTES.map((route) => ({ route, lastmod: "", changefreq: "monthly", priority: "0.8" })),
  };
}

/* ============================================================
 * 2. sitemap.xml
 * ============================================================ */

function buildSitemap(manifest) {
  const { origin, base } = manifest;
  /* 사이트맵의 <loc> 은 규격상 절대 URL 이어야 한다. origin 이 없으면
     상대경로를 적는 대신 파일을 아예 만들지 않는다 — 틀린 사이트맵은
     크롤러가 통째로 무시하거나 오류로 기록한다 */
  if (!origin) return null;

  const entries = manifest.routes
    .filter((r) => !r.noindex)
    .map((r) => {
      const lines = [`    <loc>${absolute(origin, base, r.route)}</loc>`];
      if (r.lastmod) lines.push(`    <lastmod>${r.lastmod}</lastmod>`);
      if (r.changefreq) lines.push(`    <changefreq>${r.changefreq}</changefreq>`);
      if (r.priority) lines.push(`    <priority>${r.priority}</priority>`);
      return `  <url>\n${lines.join("\n")}\n  </url>`;
    });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
    "",
  ].join("\n");
}

/* ============================================================
 * 3. robots.txt
 * ============================================================ */

/**
 * 인용되기를 바라는 AI 크롤러들.
 *
 * **이들을 여는 것은 실수가 아니라 의도한 선택이다(GEO).**
 * 요즘 방문자는 검색창만큼이나 ChatGPT·Claude·Perplexity·구글 AI 개요에게
 * "압구정 곱창 맛집" 을 묻는다. 그 답에 우리 이름과 메뉴·지점이 인용되려면
 * 먼저 읽히는 수밖에 없다. 기본값으로 이들을 막아 두는 사이트가 많은데,
 * 우리는 반대로 **명시적으로 허용**해 둔다. 어차피 이 사이트에 실리는 것은
 * 공개된 메뉴·가격·지점·공지뿐이고, 감출 정보는 관리자 화면 뒤에 있다.
 *
 * 생각이 바뀌어 학습을 막고 싶어지면 Disallow: / 로 바꾸면 된다.
 * 다만 그 순간 AI 답변에서의 인용도 함께 사라진다는 것을 알고 바꿔야 한다.
 *
 *   GPTBot        OpenAI 학습·수집
 *   OAI-SearchBot ChatGPT 검색 결과 표시
 *   ChatGPT-User  사용자가 링크를 열었을 때
 *   ClaudeBot     Anthropic 수집
 *   Claude-User   Claude 가 사용자 요청으로 열 때
 *   PerplexityBot Perplexity 색인
 *   Google-Extended  구글 Gemini·AI 개요 학습 (검색 색인과 별개 스위치다)
 *   Applebot-Extended  애플 인텔리전스
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
];

function buildRobots(manifest) {
  const { origin, base } = manifest;
  const lines = [
    "# 압구정곱창 — robots.txt (scripts/seo-assets.mjs 가 빌드 때 만든다. 직접 고치지 말 것)",
    "",
    "User-agent: *",
    "Allow: /",
    "# 관리자 화면은 색인 대상이 아니다. 로그인해야 보이지만 주소가 검색에 뜰 이유도 없다",
    `Disallow: ${normalizeBase(base)}admin`,
    "",
    "# ── 생성형 AI 크롤러 허용 (GEO) ──",
    "# 아래 허용은 의도한 것이다. AI 답변에 인용되려면 먼저 읽혀야 한다.",
    "# 자세한 이유는 scripts/seo-assets.mjs 의 AI_CRAWLERS 주석에 적어 두었다.",
  ];

  for (const bot of AI_CRAWLERS) {
    lines.push("", `User-agent: ${bot}`, "Allow: /", `Disallow: ${normalizeBase(base)}admin`);
  }

  if (origin) {
    lines.push("", `Sitemap: ${absolute(origin, base, "/sitemap.xml")}`);
  } else {
    lines.push(
      "",
      "# Sitemap 줄은 절대 URL 이라야 해서 origin 이 정해질 때까지 비워 둔다.",
      "# 빌드 환경변수 SITE_ORIGIN 또는 Supabase 의 seo_settings.site_url 을 채우면 자동으로 붙는다.",
    );
  }

  return lines.join("\n") + "\n";
}

/* ============================================================
 * 4. 본체
 * ============================================================ */

function main() {
  if (!fs.existsSync(DIST)) {
    throw new Error("dist 가 없다. `vite build` 를 먼저 돌려야 한다.");
  }

  const manifest = loadManifest();

  const robots = buildRobots(manifest);
  fs.writeFileSync(path.join(DIST, "robots.txt"), robots, "utf8");
  log(`dist/robots.txt   AI 크롤러 ${AI_CRAWLERS.length}종 명시 허용 · ${normalizeBase(manifest.base)}admin 차단`);

  const sitemap = buildSitemap(manifest);
  if (sitemap) {
    fs.writeFileSync(path.join(DIST, "sitemap.xml"), sitemap, "utf8");
    log(`dist/sitemap.xml  ${manifest.routes.filter((r) => !r.noindex).length}개 주소`);
  } else {
    log("dist/sitemap.xml  ⚠ 만들지 않음 — origin 이 없어 절대 URL 을 적을 수 없다.");
    log("                  SITE_ORIGIN 환경변수 또는 seo_settings.site_url 을 채우고 다시 빌드한다.");
  }

  /* 매니페스트는 빌드 내부 연락용이라 배포물에 남길 이유가 없다 */
  if (fs.existsSync(MANIFEST)) fs.rmSync(MANIFEST);
}

try {
  main();
} catch (err) {
  console.error("\n[seo-assets] 실패 — 빌드를 중단한다.\n");
  console.error(err?.stack || err?.message || err);
  process.exit(1);
}
