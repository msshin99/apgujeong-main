import { defineConfig } from "vitest/config";

/**
 * 테스트 설정 — **vite.config.js 를 일부러 쓰지 않는다.**
 *
 * vite.config.js 는 react·tailwind 플러그인과 .image-cache 미들웨어를 끌고 온다.
 * 지금 검사하려는 것은 src/lib 의 순수 로직뿐이라 그 셋 중 무엇도 필요 없고,
 * 붙여 두면 테스트가 이미지 파이프라인 상태에 따라 흔들린다.
 * 그래서 defineConfig 를 따로 두고 최소 설정만 남긴다.
 *
 * environment 를 node 로 둔 것도 같은 이유다. src/lib/seo.js 는 문서 첫머리에
 * "window/document 를 쓰지 않는다" 고 못 박고 있는데, jsdom 을 깔아 두면
 * 누군가 document 를 만지는 코드를 넣어도 테스트가 통과해 버린다.
 * node 환경이면 그 순간 ReferenceError 로 터진다 — 규칙을 문서가 아니라
 * 실행 환경으로 강제하는 셈이다.
 *
 * 다만 notices.js → noticeData.js → asset.js 는 최상단에서 import.meta.env.BASE_URL
 * 을 읽는다. vite 의 변환을 거치므로(vitest 는 vite 위에 있다) node 환경에서도
 * 그 값은 정의된다 — 순수 `node` 실행과 다른 점이다.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.js"],
    /* 전역 expect/describe 를 쓰지 않는다. 매 파일이 무엇을 쓰는지 import 로 드러나면
       나중에 러너를 바꿀 때 고칠 자리를 찾기 쉽다 */
    globals: false,
    /**
     * Supabase 키를 **가짜 값으로 못 박는다.**
     *
     * 이걸 안 하면 테스트 결과가 그 컴퓨터에 .env 가 있느냐에 따라 달라진다.
     * src/lib/rest.js 의 isSupabaseReady 는 이 두 값의 유무만 보고,
     * notices.js 는 그 값에 따라 아예 다른 길(예비 데이터 / REST)을 탄다 —
     * 즉 .env 가 있는 내 컴퓨터에서는 통과하고 CI 에서는 실패하는(또는 그 반대)
     * 테스트가 만들어진다. 여기서 고정해 두면 어디서 돌려도 같은 길을 검사한다.
     *
     * 값이 가짜여도 안전하다. 검사 대상은 네트워크를 타기 **전에** 판정이 끝나는
     * 함수들(getNotice 의 id 검증, publicUrl 의 경로 조립)뿐이다.
     */
    env: {
      VITE_SUPABASE_URL: "https://test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
