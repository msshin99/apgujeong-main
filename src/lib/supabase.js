import { createClient } from "@supabase/supabase-js";

/**
 * Supabase 클라이언트.
 *
 * URL 과 anon key 는 .env 에서 온다 (docs/supabase-setup.md 참고).
 * anon key 는 빌드 결과물에 그대로 박히는 공개 키다. 권한 통제는 전적으로
 * DB 쪽 RLS 정책이 담당하므로, 여기서 무엇을 감추려 해선 안 된다.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** 키가 없으면 null. 화면들은 이 값을 보고 "아직 연결 안 됨" 상태를 처리한다 */
export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true, // 새로고침해도 로그인 유지
          autoRefreshToken: true,
        },
      })
    : null;

export const isSupabaseReady = Boolean(supabase);

if (!isSupabaseReady && import.meta.env.DEV) {
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없습니다. " +
      "공지사항은 예비 데이터로, 문의는 전송 없이 동작합니다.",
  );
}
