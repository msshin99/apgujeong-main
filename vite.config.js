import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * 개발 서버에서 .image-cache/ 를 /images/ 로 내보내는 다리.
 *
 * 왜 필요한가:
 *   scripts/optimize-images.mjs 는 변형(AVIF·WebP 사다리)을 .image-cache/ 에 굽고
 *   dist 로는 postbuild 에서야 옮긴다. public/ 에는 원본만 있다.
 *   그런데 src/Img.jsx 는 매니페스트(src/generated/image-manifest.json)만 있으면
 *   개발 서버에서도 <picture> 로 사다리 주소를 내보낸다.
 *   그 주소가 public/ 에 없으면 vite 는 SPA 폴백으로 index.html 을 200 으로 돌려주고,
 *   브라우저는 그것을 이미지로 해독하려다 실패한다 — 404 도 아니라 콘솔조차 조용하다.
 *   즉 `npm run dev` 의 모든 사진이 깨진 채로 보인다.
 *
 * 빌드에는 아무 영향이 없다(apply: "serve"). 캐시가 없으면 그냥 지나간다.
 */
function serveImageCache() {
  const CACHE = path.resolve(process.cwd(), ".image-cache");
  return {
    name: "apgujeong-image-cache",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || "").split("?")[0];
        if (!url.startsWith("/images/")) return next();
        /* 경로 탈출 방지 — 캐시 폴더 밖으로 나가는 주소는 넘기지 않는다 */
        const file = path.resolve(CACHE, decodeURIComponent(url.slice("/images/".length)));
        if (!file.startsWith(CACHE) || !fs.existsSync(file)) return next();
        /* 아는 확장자만 내보낸다. MIME 을 잘못 붙이면 브라우저가 그리기를 거부하는데
           (SVG 를 octet-stream 으로 주면 그렇다) 화면에는 그냥 안 보일 뿐이라
           원인을 찾기 어렵다. 모르는 것은 vite 의 기본 처리에 넘긴다 */
        const type = {
          ".avif": "image/avif",
          ".webp": "image/webp",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".svg": "image/svg+xml",
        }[path.extname(file).toLowerCase()];
        if (!type) return next();
        res.setHeader("Content-Type", type);
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  /* GitHub Pages 프로젝트 사이트는 주소가 https://계정.github.io/저장소이름/ 이라
     자산 경로 앞에 저장소 이름이 붙어야 한다. 그 값은 배포 워크플로가
     BASE_PATH 로 넘겨 준다. 로컬에서는 "/" 라 아무 영향이 없다.

     ⚠ scripts/prerender.mjs 도 **같은 BASE_PATH 를 읽는다.**
        프리렌더는 이 값으로 StaticRouter 의 basename 을 잡고 링크/자산 주소를 만든다.
        두 곳이 어긋나면 정적 HTML 의 링크와 실제 배포 경로가 달라져 한쪽이 404 가 된다.
        canonical·JSON-LD 에 쓰이는 배포 origin 은 별도 환경변수 SITE_ORIGIN 이다
        (없으면 Supabase 의 seo_settings.site_url, 그것도 없으면 통째로 생략). */
  base: process.env.BASE_PATH || "/",
  plugins: [react(), tailwindcss(), serveImageCache()],
  server: {
    /* 포트를 고정한다.
       네이버 지도 API 는 요청 주소가 콘솔에 등록된 "Web 서비스 URL" 과 다르면
       인증을 거부한다. 기본 동작대로 포트가 밀리면(5173 → 5174 → …)
       지도만 조용히 안 뜨고 원인을 찾기 어렵다.
       strictPort 로 밀리는 대신 아예 실패하게 해서 바로 알아채게 한다. */
    port: 5173,
    strictPort: true,
  },
});
