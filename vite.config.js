import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  /* GitHub Pages 프로젝트 사이트는 주소가 https://계정.github.io/저장소이름/ 이라
     자산 경로 앞에 저장소 이름이 붙어야 한다. 그 값은 배포 워크플로가
     BASE_PATH 로 넘겨 준다. 로컬에서는 "/" 라 아무 영향이 없다. */
  base: process.env.BASE_PATH || "/",
  plugins: [react(), tailwindcss()],
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
