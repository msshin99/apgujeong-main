/**
 * Pretendard 가변(Variable) dynamic subset 을 public/fonts/pretendard/ 로 내려받고,
 * src/index.css 의 @font-face 블록을 다시 만들어 넣는다.
 *
 * ── 왜 이 스크립트가 빌드에 걸려 있지 않은가 ──────────────────────────────
 * woff2 92개(약 2.9MB)는 **저장소에 커밋한다.** 이 스크립트는 "다시 받는" 용도다.
 * 커밋을 고른 이유:
 *   1) 이미 Shippori Mincho woff2 두 개를 같은 방식으로 커밋해 두었다 — 선례를 따른다.
 *   2) `npm ci && npm run build` 가 폰트 CDN 에 의존하지 않는다. 빌드 중 네트워크가
 *      막히거나 jsDelivr 가 죽어도 배포가 멈추지 않는다. 폰트를 자체 호스팅하는
 *      이유가 "서드파티 의존을 끊는 것"인데 빌드에서 다시 매달리면 앞뒤가 안 맞는다.
 *   3) npm 의존성으로 걸지 않은 이유: pretendard 패키지 tarball 이 72MB / 1,826 파일인데
 *      우리가 쓰는 건 그중 4% 뿐이다. CI 설치를 무겁게 만들 값어치가 없다.
 * 대신 출처가 코드에 남아야 하므로(어느 버전의 어느 파일인지) 이 스크립트를 둔다.
 *
 * 실행: node scripts/fetch-fonts.mjs        (이미 있는 파일은 건너뛴다 — 몇 번 돌려도 같다)
 *       node scripts/fetch-fonts.mjs --force (전부 다시 받는다)
 */
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 버전을 박아 둔다. 올릴 때는 이 한 줄만 고치고 --force 로 다시 받으면 된다. */
const VERSION = "1.3.9";
const CDN = `https://cdn.jsdelivr.net/npm/pretendard@${VERSION}/dist/web/variable`;
const CSS_URL = `${CDN}/pretendardvariable-dynamic-subset.css`;

const OUT_DIR = path.join(ROOT, "public", "fonts", "pretendard");
const CSS_FILE = path.join(ROOT, "src", "index.css");

/** src/index.css 안에서 이 두 줄 사이만 갈아 끼운다. 나머지는 사람이 쓴 코드다. */
const MARK_START = "/* pretendard:font-face:start */";
const MARK_END = "/* pretendard:font-face:end */";

const force = process.argv.includes("--force");

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * 패키지 CSS 를 우리 것으로 바꾼다. 고치는 곳은 정확히 두 군데뿐이다.
 *
 *  (1) font-family: 'Pretendard Variable' → "Pretendard"
 *      @theme 의 --font-mincho 가 `"Shippori Mincho", "Pretendard", serif` 라
 *      라틴 미초로 찍은 요소의 한글 폴백이 "Pretendard" 라는 이름을 찾는다.
 *      이름을 그대로 두면 그 폴백이 시스템 세리프로 떨어져 미초 섹션의 한글만 튄다.
 *  (2) url(./woff2-dynamic-subset/…) → url("/fonts/pretendard/…")
 *      절대경로로 적어야 vite 가 base(GitHub Pages 저장소 경로)를 붙여 준다.
 */
function transformCss(src) {
  const files = new Set();
  const out = src
    .replace(/font-family:\s*'Pretendard Variable'/g, 'font-family: "Pretendard"')
    .replace(/url\(\.\/woff2-dynamic-subset\/([^)]+)\)/g, (_, file) => {
      files.add(file);
      return `url("/fonts/pretendard/${file}")`;
    });
  return { css: out, files: [...files] };
}

async function main() {
  console.log(`[fetch-fonts] pretendard@${VERSION} variable dynamic subset`);

  const rawCss = await fetchText(CSS_URL);
  const { css, files } = transformCss(rawCss);
  console.log(`[fetch-fonts] 샤드 ${files.length}개`);

  await mkdir(OUT_DIR, { recursive: true });

  let got = 0;
  let skipped = 0;
  for (const file of files) {
    const dest = path.join(OUT_DIR, file);
    if (!force && existsSync(dest) && (await stat(dest)).size > 0) {
      skipped += 1;
      continue;
    }
    await writeFile(dest, await fetchBuffer(`${CDN}/woff2-dynamic-subset/${file}`));
    got += 1;
  }
  console.log(`[fetch-fonts] 내려받음 ${got}개 / 건너뜀 ${skipped}개 → public/fonts/pretendard/`);

  // 받아 놓은 폴더에 CSS 가 참조하지 않는 파일이 남아 있으면 알려만 준다(지우지는 않는다).
  const onDisk = (await readdir(OUT_DIR)).filter((f) => f.endsWith(".woff2"));
  const orphan = onDisk.filter((f) => !files.includes(f));
  if (orphan.length) console.warn(`[fetch-fonts] ⚠ CSS 가 안 쓰는 파일 ${orphan.length}개: ${orphan.join(", ")}`);

  // src/index.css 의 마커 사이를 갈아 끼운다
  const current = await readFile(CSS_FILE, "utf8");
  const a = current.indexOf(MARK_START);
  const b = current.indexOf(MARK_END);
  if (a === -1 || b === -1) throw new Error(`src/index.css 에서 마커를 못 찾았다: ${MARK_START} / ${MARK_END}`);

  const header = [
    MARK_START,
    `/* pretendard@${VERSION} variable dynamic subset — scripts/fetch-fonts.mjs 가 생성. 직접 고치지 말 것.`,
    `   ${files.length}개 샤드가 unicode-range 로 나뉘어 있고, 브라우저는 화면에 실제로 찍히는`,
    `   글자가 속한 샤드만 받는다. 그래서 커버리지는 100%(한글 음절 11,172자 전부)인데`,
    `   전송량은 사용량에 비례한다 — 공지 본문이 Supabase 에서 런타임에 와도 두부가 안 뜬다. */`,
  ].join("\n");

  const body = css
    .replace(/\/\*[\s\S]*?\*\/\s*/, "") // 맨 앞 OFL 라이선스 주석은 아래 한 줄로 대체
    .replace(/\t/g, "  ") // 집 규칙: 들여쓰기는 스페이스 2칸
    .replace(/'woff2-variations'/g, '"woff2-variations"') // 집 규칙: 큰따옴표
    .trim();

  const license = `/* Pretendard: Copyright (c) 2021 Kil Hyung-jin — SIL Open Font License 1.1
   https://github.com/orioncactus/pretendard */`;

  const next = current.slice(0, a) + header + "\n" + license + "\n" + body + "\n" + current.slice(b);
  await writeFile(CSS_FILE, next);
  console.log(`[fetch-fonts] src/index.css @font-face ${files.length}개 갱신`);
}

main().catch((err) => {
  console.error("[fetch-fonts] 실패:", err.message);
  process.exit(1);
});
