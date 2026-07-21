import { isSupabaseReady, restInsert } from "./rest.js";

/**
 * 문의하기.
 *
 * 쓰기는 누구나, 읽기는 로그인한 관리자만 — RLS 정책이 그렇게 걸려 있다.
 * 그래서 여기 함수들은 권한을 따로 확인하지 않는다. DB 가 거절한다.
 *
 * 그 경계가 번들에도 그대로 있다. 방문자가 쓰는 submitInquiry 는 anon 키로 되는
 * insert 하나뿐이라 rest.js 의 fetch 로 보내고, 관리자 목록·수정·삭제만
 * SDK 를 동적으로 불러온다. 문의 페이지를 여는 사람이 관리자 코드를 받을 이유가 없다.
 */

/** 관리자 쓰기용 SDK 클라이언트. /admin 화면에서만 실제로 내려받는다 */
async function adminClient() {
  const { getSupabase } = await import("./supabase.js");
  return getSupabase();
}

/**
 * 방문자가 남기는 문의.
 *
 * agree_privacy 는 개인정보 수집·이용 '필수' 동의다. 이름·전화·이메일을 보관하는
 * 근거가 이 기록뿐이라 반드시 함께 저장한다 (agree_sms 는 선택 동의).
 * 인자는 화면 쪽 표기(camelCase)로 받고 DB 칸 이름(snake_case)은 insert 안에서만 쓴다 —
 * 컬럼 이름이 밖으로 새지 않게 이 파일이 경계 역할을 한다.
 *
 * agree_privacy 칸은 docs/seo-setup.md · docs/supabase-setup.md 2-2 의 칸 추가가 선행돼야 한다.
 * 다만 그 마이그레이션을 아직 안 돌린 상태에서 이 칸을 그냥 넣으면 42703 으로
 * **문의가 100% 거절된다.** 동의 기록이 없는 것보다 문의 자체가 사라지는 쪽이
 * 훨씬 나쁘므로(방문자는 원인 모를 실패만 본다), 칸이 없으면 빼고 한 번 더 보낸다.
 * notices.js 가 is_featured 를 다루는 방식과 같은 규칙이다.
 * 칸이 생기는 순간 자동으로 동의까지 함께 기록된다 — 배포 순서에 의존하지 않는다.
 */
export async function submitInquiry({ name, phone, email, message, agreeSms, agreePrivacy }) {
  if (!isSupabaseReady) throw new Error("Supabase 가 설정되지 않았습니다.");

  const base = { name, phone, email, message, agree_sms: Boolean(agreeSms) };

  try {
    await restInsert("inquiries", { ...base, agree_privacy: Boolean(agreePrivacy) });
  } catch (error) {
    if (!isMissingAgreePrivacy(error)) throw error;

    /* 운영자가 알아야 고칠 수 있다. 방문자에게는 아무 일도 없었던 것처럼 보인다 */
    console.warn(
      "[inquiries] inquiries.agree_privacy 칸이 없어 동의 기록 없이 저장했습니다. " +
        "docs/seo-setup.md 의 칸 추가 마이그레이션을 실행하세요.",
    );
    await restInsert("inquiries", base);
  }
}

/** 42703(없는 칸) 중에서도 agree_privacy 를 지목한 것만. 다른 칸 오류는 그대로 터뜨린다 */
function isMissingAgreePrivacy(error) {
  const code = error?.code ?? error?.details?.code;
  const text = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`;
  return (code === "42703" || code === "PGRST204") && text.includes("agree_privacy");
}

/* 화면이 실제로 쓰는 칸만. * 로 받으면 나중에 관리용 칸이 늘어날 때 조용히 같이 따라온다 */
const LIST_COLUMNS = "id, name, phone, email, message, agree_sms, is_read, created_at";
/* 한 번에 이만큼만. 문의가 몇 년 쌓여도 관리자 화면이 같은 무게로 열린다 */
const LIST_LIMIT = 200;

/** 관리자 목록 */
export async function listInquiries() {
  const supabase = await adminClient();
  const { data, error } = await supabase
    .from("inquiries")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;
  return data;
}

export async function markInquiryRead(id, isRead) {
  const supabase = await adminClient();
  const { error } = await supabase.from("inquiries").update({ is_read: isRead }).eq("id", id);
  if (error) throw error;
}

export async function deleteInquiry(id) {
  const supabase = await adminClient();
  const { error } = await supabase.from("inquiries").delete().eq("id", id);
  if (error) throw error;
}
