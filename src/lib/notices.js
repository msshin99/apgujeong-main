import { isSupabaseReady, restRpc, restSelect, storagePublicUrl } from "./rest.js";
import { NOTICES as FALLBACK } from "../pages/noticeData.js";

/**
 * 공지사항 데이터 접근.
 *
 * Supabase 가 연결돼 있으면 DB 를, 아니면 예비 데이터(noticeData.js)를 쓴다.
 * 화면 쪽은 어느 쪽인지 신경 쓰지 않아도 되도록 여기서 형태를 하나로 맞춘다.
 *
 * **방문자가 쓰는 길에는 SDK 를 들이지 않는다.** 목록·상세·조회수는 anon 키로 되는
 * 평범한 REST 라 rest.js 의 fetch 로 충분하다. 반면 관리자용 함수는 로그인한
 * 사람의 JWT 가 있어야 RLS 를 통과하므로 그때만 SDK 를 동적으로 불러온다
 * (getSupabase). 이 파일이 공개 화면 그래프에 있으므로, SDK 를 위에서 정적으로
 * import 하면 홈만 열어 본 사람이 관리자 코드까지 통째로 받아 간다.
 */
const BUCKET = "notice-images";

/* 목록 카드는 본문을 그리지 않는다. body 까지 끌어오면 메인 한 번 열 때마다
   화면에 안 쓰이는 글 전문이 통째로 따라온다 */
const BASE_COLUMNS = "id, title, author, published_at, views, is_public, image_path";
/* 목록은 한 번에 이만큼만. 글이 몇 년 쌓여도 첫 로딩이 같은 무게로 유지된다 */
const LIST_LIMIT = 200;

/**
 * is_featured 는 docs/supabase-setup.md 의 2-1 을 실행해야 생기는 선택 칸이다.
 * 칸 이름을 select 에 그대로 적으면, 2-1 을 안 돌린 프로젝트에서 PostgREST 가
 * 42703 (undefined_column) 으로 조회를 통째로 거절한다 — 목록·상세·메인이 전부
 * "불러오지 못했습니다" 로 죽는다. 없어도 굴러가던 길을 막을 이유가 없으므로,
 * 한 번 그렇게 거절당하면 칸을 빼고 다시 묻고 그 뒤로는 없는 셈 친다.
 * (toView 의 Boolean(row.is_featured) 가 false 로 흘려보낸다)
 */
let hasFeatured = true;
const listColumns = () => (hasFeatured ? `${BASE_COLUMNS}, is_featured` : BASE_COLUMNS);
/* 상세 화면과 관리자 편집창은 본문이 있어야 한다 */
const detailColumns = () => `${listColumns()}, body`;

/** is_featured 칸이 없어서 거절당한 응답인가 */
function missingFeatured(error) {
  if (!error || !hasFeatured) return false;
  if (error.code !== "42703") return false;
  /* 다른 칸이 없어서 난 오류까지 여기로 삼키면 원인이 가려진다.
     메시지는 없는 칸 이름을 담고 있으므로 그것으로 가른다 */
  const message = String(error.message || "");
  return message === "" || message.includes("is_featured");
}

/**
 * is_featured 때문에 거절당하면 칸을 빼고 딱 한 번 다시 묻는다.
 * 조회 함수마다 같은 try/catch 를 복사해 두면 한 곳만 고치는 실수가 난다.
 */
async function withFeaturedRetry(run) {
  try {
    return await run();
  } catch (error) {
    if (!missingFeatured(error)) throw error;
    hasFeatured = false;
    return run();
  }
}

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
    /* 편집창이 되돌려 저장할 원본. 아래 body 는 문단을 다듬은 결과라
       그것만 들고 있으면 수정할 때마다 운영자가 넣은 줄 간격이 조용히 바뀐다.
       목록 조회는 body 를 아예 안 가져오므로 없을 수도 있다 */
    bodyRaw: typeof row.body === "string" ? row.body : "",
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

/* ============================================================
 * 프리렌더 씨앗
 *
 * 화면들은 전부 useEffect 안에서 글을 가져온다. 그런데 renderToString 은
 * effect 를 돌리지 않으므로, 손대지 않으면 프리렌더 결과물의 공지 목록·상세는
 * **뼈대(skeleton)만 남는다.** 제목만 <title> 에 박히고 본문은 한 글자도 없는
 * HTML 이 나가는데, 그건 프리렌더를 하는 이유 자체를 지운다.
 *
 * 그래서 빌드 스크립트가 이미 읽어 둔 글을 여기에 미리 꽂아 두고, 화면은
 * useState 초기값으로 그것을 **동기적으로** 집어 간다.
 * 심는 사람은 scripts/prerender.mjs 하나뿐이다. 빌드에서는 아래 ssrSeed 에,
 * 브라우저에서는 결과 HTML 의 window.__PRERENDER__ 에 심는다 — hydrateRoot 가
 * 그 DOM 을 이어받으려면 브라우저의 첫 렌더도 **같은 목록**을 봐야 하기 때문이다.
 *
 * 주의 — 브라우저 쪽 모양은 toView() 의 출력과 반드시 발을 맞춰야 한다.
 * toView 를 고치고 다시 빌드하지 않으면, 증상은 여기서 두 파일 떨어진
 * 화면에서 하이드레이션 불일치로 나타난다.
 * ============================================================ */

/** @type {ReturnType<typeof toView>[]|null} */
let ssrSeed = null;

/**
 * 빌드 시점에 공지를 심는다. scripts/prerender.mjs 전용.
 *
 * @param {object[]} rows
 * @param {{ shaped?: boolean }} [options] - shaped 면 이미 화면 모양(noticeData.js)이라
 *   toView 를 거치지 않는다. DB 행이면 false 로 두어 여기서 모양을 맞춘다.
 */
export function seedPrerenderNotices(rows, { shaped = false } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  ssrSeed = list.map((row) =>
    shaped ? { ...row, id: String(row.id), isPublic: row.is_public ?? true } : toView(row),
  );
}

/** 심어 둔 목록. 빌드에서는 ssrSeed, 브라우저에서는 프리렌더가 HTML 에 심어 둔 것 */
export function seededNotices() {
  if (ssrSeed) return ssrSeed;
  /* 브라우저: 프리렌더가 #root 뒤에 심어 둔 것과 **같은 목록**을 읽는다.
     이게 없으면 하이드레이션 첫 렌더가 빈 목록이 되어 서버가 그린 카드와 어긋난다.
     프리렌더하지 않은 화면(dist/404.html · 개발 서버)에는 없으므로 종전대로 null 이다 */
  if (typeof window === "undefined") return null;
  const seed = window.__PRERENDER__?.notices;
  return Array.isArray(seed) ? seed : null;
}

/** 심어 둔 글 한 건 */
export function seededNotice(id) {
  const list = seededNotices();
  if (!list) return null;
  return list.find((n) => n.id === String(id)) ?? null;
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
  return storagePublicUrl(BUCKET, path);
}

/**
 * 목록.
 * includeHidden 이 true 면 비공개 글까지 가져온다 (관리자 화면 전용 —
 * 로그인 상태가 아니면 RLS 가 알아서 공개 글만 돌려준다).
 */
export async function listNotices({ includeHidden = false } = {}) {
  if (!isSupabaseReady) return FALLBACK.map((n) => ({ ...n, isPublic: true }));

  /* 관리자 목록은 미리보기 한 줄과 편집창 때문에 본문이 필요하다. 방문자 목록은 아니다.
     그리고 비공개 글은 로그인한 JWT 로만 보이므로, 그때만 SDK 를 부른다 —
     anon 키로 물으면 RLS 가 공개 글만 돌려줘 관리자 목록이 조용히 반쪽이 된다 */
  const run = includeHidden ? () => listAsAdmin() : () => listAsVisitor();

  const rows = await withFeaturedRetry(run);
  return rows.map(toView);
}

/** 방문자 목록 — anon 키로 되는 평범한 GET */
function listAsVisitor() {
  return restSelect("notices", {
    columns: listColumns(),
    eq: { is_public: true },
    order: [
      ["published_at", "desc"],
      ["id", "desc"],
    ],
    limit: LIST_LIMIT,
  });
}

/** 관리자 목록 — 비공개 글까지. 로그인 JWT 가 필요해 SDK 를 쓴다 */
async function listAsAdmin() {
  const supabase = await adminClient();
  const { data, error } = await supabase
    .from("notices")
    .select(detailColumns())
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;
  return data ?? [];
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

  /* id 칸은 bigint 라 /notice/abc 같은 주소가 그대로 넘어가면 Postgres 가 형변환
     오류를 낸다. 그러면 '찾을 수 없습니다' 대신 '불러오지 못했습니다' 가 뜬다 */
  if (!/^\d+$/.test(String(id)) || Number(id) <= 0) return null;

  const run = () =>
    restSelect("notices", { columns: detailColumns(), eq: { id }, maybeSingle: true });

  const data = await withFeaturedRetry(run);
  return data ? toView(data) : null;
}

/**
 * 조회수 +1.
 * 익명에게 update 를 열면 제목까지 바꿀 수 있으므로 전용 함수만 호출한다.
 * 실패해도 글은 보여야 하니 조용히 넘긴다.
 */
export async function bumpViews(id) {
  if (!isSupabaseReady) return;
  await restRpc("increment_notice_views", { notice_id: Number(id) });
}

/* ────────── 관리자용 ──────────
 *
 * 여기 아래는 전부 로그인한 사람의 JWT 로만 통과하는 쓰기다. 그래서 SDK 가 필요하고,
 * SDK 는 함수 안에서 동적으로 불러온다 — 위에서 정적으로 import 하면 이 파일을 쓰는
 * 공개 화면(Notice·NoticeBoard·NoticeDetail)까지 SDK 를 받아 가게 된다.
 */

/** 관리자 쓰기용 SDK 클라이언트. /admin 화면에서만 실제로 내려받는다 */
async function adminClient() {
  const { getSupabase } = await import("./supabase.js");
  return getSupabase();
}

export async function createNotice(fields) {
  const supabase = await adminClient();
  const { data, error } = await supabase.from("notices").insert(fields).select().single();
  if (error) throw error;
  return toView(data);
}

export async function updateNotice(id, fields) {
  const supabase = await adminClient();
  const { data, error } = await supabase
    .from("notices")
    .update(fields)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return toView(data);
}

/**
 * 공지 삭제. 지우지 못하고 남은 이미지 경로를 돌려준다 (없으면 null).
 *
 * 순서는 행 먼저, 사진 나중이다. 반대로 하면 사진만 지워지고 글이 남는 순간이
 * 생겨 방문자에게 깨진 이미지가 그대로 보인다. 아무도 못 보는 파일이 남는 쪽이 낫다.
 * 대신 남은 경로를 조용히 묻지 않고 콘솔과 반환값으로 알려 나중에 손으로 지울 수 있게 한다.
 */
export async function deleteNotice(id, imagePath) {
  const supabase = await adminClient();
  const { error } = await supabase.from("notices").delete().eq("id", id);
  if (error) throw error;
  if (!imagePath) return null;

  const { error: removeError } = await supabase.storage.from(BUCKET).remove([imagePath]);
  if (removeError) {
    console.warn(
      `[notices] 공지는 삭제됐지만 이미지가 남았습니다. 수동으로 지워야 하는 경로: ${imagePath}`,
      removeError,
    );
    return imagePath;
  }
  return null;
}

/**
 * 겹치지 않는 파일 이름.
 *
 * crypto.randomUUID 는 https 나 localhost 에서만 있다. 운영자가 사내 IP(http)로
 * 화면을 확인할 때는 undefined 라 업로드가 통째로 죽으므로 대체 이름을 만든다.
 * 여기서 필요한 건 안 겹치는 이름이지 예측 불가능한 이름이 아니다.
 */
function uniqueFileName() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 이미지 업로드 → Storage 경로를 돌려준다 */
export async function uploadNoticeImage(file) {
  const supabase = await adminClient();
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  /* 파일명이 겹치지 않도록 랜덤 이름을 쓴다. 한글 파일명이 경로에 들어가는 것도 막는다 */
  const name = `${uniqueFileName()}.${ext}`;
  const path = `${new Date().getFullYear()}/${name}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  return path;
}
