import { supabase, isSupabaseReady } from "./supabase.js";
import { NOTICES as FALLBACK } from "../pages/noticeData.js";

/**
 * 공지사항 데이터 접근.
 *
 * Supabase 가 연결돼 있으면 DB 를, 아니면 예비 데이터(noticeData.js)를 쓴다.
 * 화면 쪽은 어느 쪽인지 신경 쓰지 않아도 되도록 여기서 형태를 하나로 맞춘다.
 */
const BUCKET = "notice-images";

/** DB 행 → 화면이 쓰는 모양 */
function toView(row) {
  return {
    id: String(row.id),
    tag: "NEWS",
    title: row.title,
    detailTitle: row.title,
    author: row.author,
    date: formatDate(row.published_at),
    views: row.views ?? 0,
    isPublic: row.is_public,
    isFeatured: Boolean(row.is_featured),
    /* 본문은 빈 줄 기준으로 문단을 나눈다. 한 문단 안의 줄바꿈은 그대로 살린다 */
    body: String(row.body || "")
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean),
    image: publicUrl(row.image_path),
    imagePath: row.image_path || null,
    /* DB 이미지는 원본 그대로 채우면 되므로 잘라내기 값이 없다 */
    crop: null,
  };
}

/** 2026-04-22 → 2026.04.22 */
function formatDate(value) {
  if (!value) return "";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return `${y}.${m}.${d}`;
}

/** Storage 경로 → 공개 URL */
export function publicUrl(path) {
  if (!path) return null;
  if (!isSupabaseReady) return path;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * 목록.
 * includeHidden 이 true 면 비공개 글까지 가져온다 (관리자 화면 전용 —
 * 로그인 상태가 아니면 RLS 가 알아서 공개 글만 돌려준다).
 */
export async function listNotices({ includeHidden = false } = {}) {
  if (!isSupabaseReady) return FALLBACK.map((n) => ({ ...n, isPublic: true }));

  let query = supabase
    .from("notices")
    .select("*")
    .order("published_at", { ascending: false })
    .order("id", { ascending: false });

  if (!includeHidden) query = query.eq("is_public", true);

  const { data, error } = await query;
  if (error) throw error;
  return data.map(toView);
}

/**
 * 메인 페이지 NOTICE 섹션에 실을 3건.
 *
 * 관리자가 고른 글(is_featured)을 우선 쓰고, 3건이 안 되면 최신 공개 글로 채운다.
 * 이렇게 해야 아무것도 고르지 않은 상태에서도 메인이 비지 않는다.
 */
export const FEATURED_LIMIT = 3;

export async function listFeatured() {
  if (!isSupabaseReady) return FALLBACK.slice(0, FEATURED_LIMIT);

  const all = await listNotices();
  const picked = all.filter((n) => n.isFeatured).slice(0, FEATURED_LIMIT);
  if (picked.length === FEATURED_LIMIT) return picked;

  const ids = new Set(picked.map((n) => n.id));
  const filler = all.filter((n) => !ids.has(n.id)).slice(0, FEATURED_LIMIT - picked.length);
  return [...picked, ...filler];
}

/** 상세 한 건 */
export async function getNotice(id) {
  if (!isSupabaseReady) return FALLBACK.find((n) => n.id === id) ?? null;

  const { data, error } = await supabase
    .from("notices")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? toView(data) : null;
}

/**
 * 조회수 +1.
 * 익명에게 update 를 열면 제목까지 바꿀 수 있으므로 전용 함수만 호출한다.
 * 실패해도 글은 보여야 하니 조용히 넘긴다.
 */
export async function bumpViews(id) {
  if (!isSupabaseReady) return;
  await supabase.rpc("increment_notice_views", { notice_id: Number(id) });
}

/* ────────── 관리자용 ────────── */

export async function createNotice(fields) {
  const { data, error } = await supabase.from("notices").insert(fields).select().single();
  if (error) throw error;
  return toView(data);
}

export async function updateNotice(id, fields) {
  const { data, error } = await supabase
    .from("notices")
    .update(fields)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return toView(data);
}

export async function deleteNotice(id, imagePath) {
  const { error } = await supabase.from("notices").delete().eq("id", id);
  if (error) throw error;
  // 글이 지워졌으면 사진도 남길 이유가 없다. 실패해도 글 삭제는 이미 끝났다
  if (imagePath) await supabase.storage.from(BUCKET).remove([imagePath]);
}

/** 이미지 업로드 → Storage 경로를 돌려준다 */
export async function uploadNoticeImage(file) {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  /* 파일명이 겹치지 않도록 랜덤 이름을 쓴다. 한글 파일명이 경로에 들어가는 것도 막는다 */
  const name = `${crypto.randomUUID()}.${ext}`;
  const path = `${new Date().getFullYear()}/${name}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  return path;
}
