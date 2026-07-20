import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
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
