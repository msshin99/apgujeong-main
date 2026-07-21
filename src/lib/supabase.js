import { isSupabaseReady, SUPABASE_ANON_KEY, SUPABASE_URL } from "./rest.js";

/**
 * Supabase SDK — **관리자 화면 전용**.
 *
 * URL 과 anon key 는 .env 에서 온다 (docs/supabase-setup.md 참고).
 * anon key 는 빌드 결과물에 그대로 박히는 공개 키다. 권한 통제는 전적으로
 * DB 쪽 RLS 정책이 담당하므로, 여기서 무엇을 감추려 해선 안 된다.
 *
 * **여기서 @supabase/supabase-js 를 정적으로 import 하지 않는다.**
 * 이 파일은 Notice.jsx·ContactForm.jsx 가 isSupabaseReady 를 가져가느라
 * 공개 화면 그래프에 들어와 있다. 위에 `import { createClient } from "..."` 한 줄만
 * 있어도 SDK(첫 화면 번들의 3분의 1) 가 홈 페이지 청크로 끌려 들어온다.
 * 그래서 SDK 는 실제로 필요해지는 순간에만 동적으로 불러온다 —
 * 로그인·업로드·관리자 쓰기, 즉 전부 lazy 로 걸린 /admin 뒤의 일이다.
 *
 * 방문자가 쓰는 조회·문의는 SDK 없이 src/lib/rest.js 의 fetch 로 처리한다.
 */
export { isSupabaseReady } from "./rest.js";

/** @type {Promise<import("@supabase/supabase-js").SupabaseClient>|null} */
let clientPromise = null;

/**
 * SDK 클라이언트를 받아 온다. 여러 번 불러도 클라이언트는 하나다 —
 * 두 개를 만들면 저장된 세션을 서로 덮어써 로그인이 오락가락한다.
 *
 * @returns {Promise<import("@supabase/supabase-js").SupabaseClient>}
 */
export function getSupabase() {
  if (!isSupabaseReady) {
    return Promise.reject(new Error("Supabase 가 설정되지 않았습니다."));
  }
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true, // 새로고침해도 로그인 유지
          autoRefreshToken: true,
        },
      }),
    );
    /* 네트워크가 끊긴 채로 한 번 실패하면 그 거절된 약속이 영원히 캐시돼
       다시 시도할 방법이 없어진다. 실패는 캐시하지 않는다 */
    clientPromise.catch(() => {
      clientPromise = null;
    });
  }
  return clientPromise;
}

/**
 * 로그인 관련 호출을 SDK 로 넘기는 얇은 창구.
 *
 * AdminLayout·useSession 이 `supabase.auth.…` 를 **동기적으로** 부르므로
 * 모양을 그대로 지킨다. 안에서만 getSupabase() 를 기다린다.
 */
const auth = {
  getSession: async (...args) => (await getSupabase()).auth.getSession(...args),
  signInWithPassword: async (...args) => (await getSupabase()).auth.signInWithPassword(...args),
  signOut: async (...args) => (await getSupabase()).auth.signOut(...args),

  /**
   * 구독은 **동기적으로** 해지 수단을 돌려줘야 한다 (useSession 의 cleanup).
   * SDK 가 아직 안 왔을 수도 있으므로, 먼저 껍데기를 돌려주고 도착하면 잇는다.
   * 도착 전에 해지되면(화면이 금방 언마운트되면) 아예 구독하지 않는다 —
   * 안 그러면 사라진 화면에 상태 변화가 계속 흘러든다.
   */
  onAuthStateChange(callback) {
    let live = null;
    let cancelled = false;

    getSupabase()
      .then((client) => {
        if (cancelled) return;
        live = client.auth.onAuthStateChange(callback).data.subscription;
      })
      .catch(() => {
        /* 여기서 실패하면 로그인 화면 자체가 뜨지 않는다. 그 안내는 AdminLayout 몫이다 */
      });

    return {
      data: {
        subscription: {
          unsubscribe() {
            cancelled = true;
            live?.unsubscribe();
            live = null;
          },
        },
      },
    };
  },
};

/**
 * 예전 이름 유지 — `supabase.auth.…` 만 쓸 수 있다.
 *
 * `.from(...)` / `.storage` 를 여기서 열어 두면 공개 화면이 무심코 그걸 부르고,
 * 그 순간 SDK 가 다시 첫 화면 번들로 딸려 들어온다. 그 실수는 사람 눈에 안 띄므로
 * 조용히 동작하게 두지 않고 무엇을 써야 하는지 알려 주며 멈춘다.
 */
export const supabase = new Proxy(
  { auth },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      /* await supabase 나 콘솔 출력이 then/Symbol 을 더듬는다. 그건 그냥 없는 값이다 */
      if (typeof prop === "symbol" || prop === "then") return undefined;
      throw new Error(
        `[supabase] supabase.${String(prop)} 는 더 이상 정적으로 쓸 수 없습니다. ` +
          "공개 화면이면 src/lib/rest.js 를, 관리자 화면이면 await getSupabase() 를 쓰세요.",
      );
    },
  },
);
