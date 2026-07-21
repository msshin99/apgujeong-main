/**
 * 하이드레이션 검사 — `vite build` → 이미지 → 프리렌더 → seo-assets 뒤에 돈다.
 *
 * 왜 빌드 단계인가:
 *   이 사이트가 hydrateRoot 로 프리렌더 DOM 을 이어받는 근거는 "브라우저의 첫 렌더가
 *   서버와 같은 트리" 라는 한 가지 약속뿐이다(src/lib/hydrated.js). 그 약속이 깨지면
 *   화면은 멀쩡해 보인다 — React 가 조용히 전부 다시 그리기 때문이다. 즉 **아무도
 *   눈치채지 못한 채** 프리렌더의 이점이 사라진다. 그래서 사람 눈 대신 빌드가 본다.
 *
 * 왜 라우트마다 프로세스를 새로 띄우나:
 *   관문(markHydrated)은 모듈 전역이고 한 번만 열린다. 한 프로세스에서 두 번 hydrate 하면
 *   두 번째는 이미 열린 관문으로 시작해 반드시 어긋난다 — 검사 방식이 만든 가짜 실패다.
 *   그래서 scripts/hydrate-one.mjs 를 자식으로 하나씩 돌린다. 느리지만 정직하다.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { PRERENDER_ROUTES } from "../src/lib/seoData.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIST = path.join(ROOT, "dist");
const CHILD = path.join(HERE, "hydrate-one.mjs");

/* 데스크톱과 좁은 화면 양쪽을 본다. 이 사이트는 1200 을 경계로 마크업이 아예 다르고,
   프리렌더는 언제나 데스크톱 쪽이라 진짜 위험은 390 쪽에 있다 */
const WIDTHS = [1440, 390];

function log(line) {
  process.stdout.write(line + "\n");
}

/**
 * 프리렌더한 공지 중 한 건. 상세 라우트는 씨앗 모양이 목록과 달라 따로 봐야 한다.
 *
 * .prerender-manifest.json 을 읽지 않는다 — 이 검사보다 먼저 도는 seo-assets 가
 * 다 쓰고 그 파일을 지운다(seo-assets.mjs:190). 결과물 폴더를 직접 보는 편이 정확하다.
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

function main() {
  const notice = oneNoticeRoute();
  const routes = [...PRERENDER_ROUTES, ...(notice ? [notice] : [])];

  log(`\n하이드레이션 검사 — ${routes.length}개 라우트 × ${WIDTHS.join("·")}px`);
  if (!notice) log("  ⓘ 프리렌더한 공지가 없어 /notice/:id 는 건너뛴다.");

  const failures = [];
  for (const route of routes) {
    const marks = [];
    for (const width of WIDTHS) {
      const res = spawnSync(process.execPath, [CHILD, route, String(width)], {
        cwd: ROOT,
        encoding: "utf8",
        env: process.env,
      });
      if (res.status === 0) {
        marks.push(`${width} ✓`);
      } else {
        marks.push(`${width} ✗`);
        failures.push({ route, width, detail: (res.stderr || res.stdout || "").trim() });
      }
    }
    log(`  ${route.padEnd(18)} ${marks.join("   ")}`);
  }

  if (failures.length) {
    log("");
    for (const f of failures) log(`\n[${f.route} @${f.width}]\n${f.detail}`);
    throw new Error(
      `하이드레이션 불일치 ${failures.length}건. 프리렌더 DOM 을 이어받지 못하고 통째로 다시 그린다는 뜻이다 — ` +
        "src/lib/hydrated.js 의 관문을 거치지 않는 브라우저 전용 값이 렌더 경로에 들어왔을 가능성이 크다.",
    );
  }
  log(`\n완료 — ${routes.length * WIDTHS.length}건 모두 깨끗하다.`);
}

try {
  main();
} catch (err) {
  console.error("\n[hydration-check] 실패 — 빌드를 중단한다.\n");
  console.error(err?.stack || err?.message || err);
  process.exit(1);
}
