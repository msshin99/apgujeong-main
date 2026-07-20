import { supabase, isSupabaseReady } from "./supabase.js";

/**
 * 문의하기.
 *
 * 쓰기는 누구나, 읽기는 로그인한 관리자만 — RLS 정책이 그렇게 걸려 있다.
 * 그래서 여기 함수들은 권한을 따로 확인하지 않는다. DB 가 거절한다.
 */

/** 방문자가 남기는 문의 */
export async function submitInquiry({ name, phone, email, message, agreeSms }) {
  if (!isSupabaseReady) throw new Error("Supabase 가 설정되지 않았습니다.");

  const { error } = await supabase.from("inquiries").insert({
    name,
    phone,
    email,
    message,
    agree_sms: Boolean(agreeSms),
  });
  if (error) throw error;
}

/** 관리자 목록 */
export async function listInquiries() {
  const { data, error } = await supabase
    .from("inquiries")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function markInquiryRead(id, isRead) {
  const { error } = await supabase.from("inquiries").update({ is_read: isRead }).eq("id", id);
  if (error) throw error;
}

export async function deleteInquiry(id) {
  const { error } = await supabase.from("inquiries").delete().eq("id", id);
  if (error) throw error;
}
