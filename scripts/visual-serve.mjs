/**
 * dist/ 를 그대로 내보내는 아주 작은 정적 서버 — 시각 회귀 검사(scripts/visual-check.mjs)용.
 *
 * 왜 `vite preview` 를 쓰지 않나:
 *   preview 는 포트를 고정하고(vite.config.js 의 server.port 와 같은 취급), 이 저장소에서는
 *   5173 이 사람이 쓰는 개발 서버, 4180 이 다른 정적 서버 자리다. 검사가 그 둘 중 하나를
 *   빼앗으면 작업하던 사람의 화면이 조용히 죽는다. 그래서 **포트 0(비어 있는 아무 포트)** 으로
 *   띄우고 실제 번호는 OS 에게 물어본다. 두 개를 동시에 돌려도 서로 부딪히지 않는다.
 *
 * 왜 GitHub Pages 흉내가 필요한가:
 *   배포처가 Pages 라 라우팅 규칙이 "폴더/index.html, 없으면 404.html" 이다.
 *   /admin/* 은 프리렌더하지 않으므로 404.html(빈 껍데기)이 나가고 그 안에서 SPA 가 다시
 *   라우팅한다. 그 경로를 검사에서도 똑같이 지나가야 관리자 화면을 진짜와 같은 방식으로 본다.
 *   다만 404.html 을 404 코드로 주면 Playwright 쪽 판단이 갈리므로 여기서는 200 으로 준다 —
 *   검사 대상은 상태 코드가 아니라 **그려진 화면** 이다.
 *
 * 단독 실행: node scripts/visual-serve.mjs [포트]  (0 이나 생략이면 비어 있는 포트)
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

/**
 * 요청 주소를 dist 안의 파일 하나로 푼다.
 * 경로 탈출(../)은 여기서 막는다 — 이 서버는 검사용이지만 그래도 dist 밖은 내보내지 않는다.
 */
function resolveFile(root, urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  const target = path.resolve(root, "." + rel);
  if (target !== root && !target.startsWith(root + path.sep)) return null;

  if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;

  const indexed = path.join(target, "index.html");
  if (fs.existsSync(indexed)) return indexed;

  return null;
}

/**
 * dist 를 내보내는 서버를 띄우고 실제 주소를 돌려준다.
 *
 * @param {{ root?: string, port?: number }} [options]
 * @returns {Promise<{ url: string, port: number, close: () => Promise<void> }>}
 */
export function startStaticServer(options = {}) {
  const root = path.resolve(options.root || path.join(ROOT, "dist"));
  const port = options.port ?? 0;

  if (!fs.existsSync(path.join(root, "index.html"))) {
    return Promise.reject(
      new Error(`빌드 결과가 없다: ${root}/index.html\n  먼저 npm run build 를 돌릴 것.`),
    );
  }

  const fallback = path.join(root, "404.html");

  const server = http.createServer((req, res) => {
    const file = resolveFile(root, req.url || "/");
    /* 알 수 없는 주소는 Pages 와 같이 404.html(껍데기)로 보낸다.
       그 자리에서 SPA 가 스스로 라우팅한다 */
    const send = file || (fs.existsSync(fallback) ? fallback : null);
    if (!send) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("없다");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(send).toLowerCase()] || "application/octet-stream",
      /* 검사는 같은 서버를 라우트마다 다시 두드린다. 캐시가 끼면 "고쳤는데 안 바뀐다" 는
         가짜 현상이 생기므로 아예 끈다 */
      "Cache-Control": "no-store",
    });
    fs.createReadStream(send).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      /* address() 는 유닉스 소켓이면 문자열, 아직 안 붙었으면 null 을 준다.
         TCP 로 listen 한 지금은 언제나 객체지만, 그 가정을 코드에 적어 둔다 —
         .port 를 그냥 읽으면 아닐 때 undefined 가 되어 주소가 조용히 망가진다 */
      const addr = server.address();
      const actual = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        url: `http://127.0.0.1:${actual}`,
        port: actual,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

/* 단독 실행 — 손으로 열어 보고 싶을 때 */
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, "/") ||
    process.argv[1] === fileURLToPath(import.meta.url)) {
  const wanted = Number(process.argv[2] || 0);
  startStaticServer({ port: Number.isFinite(wanted) ? wanted : 0 }).then(({ url }) => {
    process.stdout.write(`dist 를 내보내는 중: ${url}  (Ctrl+C 로 종료)\n`);
  });
}
