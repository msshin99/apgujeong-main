/**
 * PostgREST 최소 클라이언트 — 공개 화면 전용.
 *
 * 방문자가 쓰는 길은 전부 anon 키 하나로 되는 평범한 REST 다.
 * 공지 목록·상세 조회(GET), 조회수 +1(rpc POST), 문의 남기기(insert POST),
 * SEO 설정 읽기(GET) — 이게 전부이고 auth·realtime·Storage 업로드는 하나도 없다.
 * 그런데 이걸 하려고 @supabase/supabase-js 를 정적으로 import 하면
 * SDK 가 첫 화면 번들의 3분의 1을 차지한다. 홈만 열어 본 사람이 관리자 로그인
 * 코드를 통째로 받아 가는 셈이다.
 *
 * 그래서 공개 경로는 이 파일의 fetch 로 대신하고, SDK 는 관리자 화면이
 * 실제로 필요해질 때 동적으로 불러온다(supabase.js 의 getSupabase 참고).
 *
 * **오류 모양을 supabase-js 와 똑같이 맞춘다.** PostgREST 는 실패할 때
 * `{ message, details, hint, code }` 본문을 주는데 SDK 는 그걸 그대로 넘긴다.
 * notices.js 의 42703 관용 처리, seoStore.js 의 42P01/PGRST205 폴백,
 * admin/ui.jsx 의 explainError 가 전부 `err.code` 와 `err.message` 만 본다 —
 * 그 두 값을 보존하지 않으면 세 곳이 조용히 동시에 망가진다.
 */

/*
 * 환경변수를 읽는 통로를 한 곳으로 모은다.
 *
 * 순수 Node(프리렌더 스크립트)에서는 `import.meta.env` 자체가 undefined 라
 * `.VITE_SUPABASE_URL` 을 바로 읽으면 모듈 평가 시점에 TypeError 로 죽는다.
 * 그렇다고 `import.meta.env?.X` 로 쓰면 Vite 의 치환 패턴(`import.meta.env.X` 문자열)이
 * 어긋날 수 있으므로, `typeof import.meta.env` 로 존재만 확인하고 통째로 받아 둔다.
 * Vite 는 `import.meta.env` 도 객체 리터럴로 치환하므로 브라우저 경로는 그대로다.
 */
const ENV = typeof import.meta.env !== "undefined" ? import.meta.env : {};

/** 빌드 스크립트가 process.env 로 넘겨준 값도 함께 본다 (Vite 밖에서 도는 프리렌더용) */
const readEnv = (key) => {
  const fromVite = ENV[key];
  if (fromVite) return fromVite;
  if (typeof process !== "undefined" && process.env) return process.env[key];
  return undefined;
};

/** 끝 슬래시가 붙어 있어도 경로가 `//rest/v1` 이 되지 않게 한 번 털어 둔다 */
export const SUPABASE_URL = String(readEnv("VITE_SUPABASE_URL") || "").replace(/\/+$/, "");
export const SUPABASE_ANON_KEY = String(readEnv("VITE_SUPABASE_ANON_KEY") || "");

/**
 * 키가 다 있으면 true.
 *
 * 뜻이 "클라이언트 객체가 만들어졌다" 에서 "URL 과 키가 있다" 로 바뀌었지만
 * 값은 언제나 같다 — 예전에도 이 두 값만으로 클라이언트를 만들지 말지 정했다.
 * 화면들은 이 값을 보고 "아직 연결 안 됨" 상태(정적 예비 데이터)를 처리한다.
 */
export const isSupabaseReady = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// DEV 도 같은 통로로 읽는다. 프리렌더에서는 값이 없어 경고가 조용히 생략된다.
if (!isSupabaseReady && ENV.DEV) {
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없습니다. " +
      "공지사항은 예비 데이터로, 문의는 전송 없이 동작합니다.",
  );
}

const REST_BASE = `${SUPABASE_URL}/rest/v1`;

/**
 * anon 키는 `role: anon` 이 박힌 JWT 다.
 * apikey 만 보내고 Authorization 을 빼면 PostgREST 가 역할을 정하지 못해
 * RLS 판정이 달라진다 — 공개 조회가 통째로 빈 배열이 되는 식으로.
 */
function authHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Accept: "application/json",
  };
}

/**
 * 응답 본문 → supabase-js 와 같은 모양의 Error.
 *
 * code 를 반드시 살려야 한다. 42703(없는 칸)·42P01(없는 표)·PGRST205 같은 값이
 * 없으면 "마이그레이션을 안 돌렸을 뿐인 멀쩡한 사이트" 가 오류 화면으로 죽는다.
 */
async function toPostgrestError(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* 502 HTML 처럼 JSON 이 아닌 응답도 온다. 그때는 상태 코드로 채운다 */
    body = null;
  }
  const error = new Error(body?.message || res.statusText || `HTTP ${res.status}`);
  error.name = "PostgrestError";
  error.code = body?.code ?? String(res.status);
  error.details = body?.details ?? null;
  error.hint = body?.hint ?? null;
  error.status = res.status;
  return error;
}

/**
 * 공통 요청.
 *
 * fetch 자체가 실패한 경우(오프라인 등)는 **감싸지 않고 그대로 흘려보낸다.**
 * 브라우저가 던지는 `TypeError: Failed to fetch` 메시지를 explainError 의
 * 네트워크 분기(admin/ui.jsx)가 정규식으로 알아보기 때문이다.
 */
async function request(path, init) {
  if (!isSupabaseReady) throw new Error("Supabase 가 설정되지 않았습니다.");
  const res = await fetch(`${REST_BASE}${path}`, init);
  if (!res.ok) throw await toPostgrestError(res);
  return res;
}

/** eq 필터 값. 불리언·숫자는 그대로, 나머지는 문자열로 (인코딩은 URLSearchParams 가 한다) */
const formatValue = (value) => (value === null ? "null" : String(value));

/**
 * select 조회.
 *
 * @param {string} table
 * @param {object} [options]
 * @param {string} [options.columns]     - "id, title" 처럼 사람이 읽기 좋게 적어도 된다(공백은 여기서 턴다)
 * @param {Record<string, unknown>} [options.eq] - 칸 = 값 필터
 * @param {[string, "asc"|"desc"][]} [options.order] - 정렬. **한 파라미터로 합쳐 보낸다** —
 *   order 를 두 번 붙이면 PostgREST 가 뒤엣것만 보고 앞의 기준이 조용히 사라진다
 * @param {number} [options.limit]
 * @param {boolean} [options.maybeSingle] - 한 행만. 없으면 null (supabase-js 의 maybeSingle 과 같은 계약)
 */
export async function restSelect(
  table,
  { columns = "*", eq = null, order = null, limit = null, maybeSingle = false } = {},
) {
  const params = new URLSearchParams();
  params.set("select", String(columns).replace(/\s+/g, ""));

  if (eq) {
    for (const [column, value] of Object.entries(eq)) {
      if (value === undefined) continue;
      params.append(column, `eq.${formatValue(value)}`);
    }
  }
  if (Array.isArray(order) && order.length > 0) {
    params.set("order", order.map(([column, dir = "asc"]) => `${column}.${dir}`).join(","));
  }
  /* 한 행만 볼 거면 굳이 더 받아 올 이유가 없다. 406(PGRST116)을 따로 다루는 대신
     평범한 배열로 받아 첫 항목을 꺼낸다 — 없으면 null 이라 계약이 그대로다 */
  if (maybeSingle) params.set("limit", "1");
  else if (limit != null) params.set("limit", String(limit));

  const res = await request(`/${table}?${params.toString()}`, {
    method: "GET",
    headers: authHeaders(),
  });
  const rows = await res.json();
  if (!maybeSingle) return Array.isArray(rows) ? rows : [];
  return Array.isArray(rows) ? (rows[0] ?? null) : (rows ?? null);
}

/**
 * insert.
 *
 * `Prefer: return=minimal` 로 응답 본문을 받지 않는다. 문의 표는 익명에게
 * insert 만 열려 있고 select 는 막혀 있어서, 방금 넣은 행을 돌려 달라고 하면
 * RLS 가 그 select 를 거절해 **저장은 됐는데 실패로 보이는** 상태가 된다.
 */
export async function restInsert(table, values) {
  await request(`/${table}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(values),
  });
}

/** 함수 호출(rpc). 반환값이 없는 함수는 204 라 null 을 돌려준다 */
export async function restRpc(name, args = {}) {
  const res = await request(`/rpc/${name}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Storage 공개 URL.
 *
 * SDK 의 getPublicUrl 은 네트워크를 타지 않는 **문자열 조립**일 뿐이라
 * 이것 하나 때문에 SDK 를 들고 있을 이유가 없다.
 * 경로 조각마다 인코딩한다 — 슬래시는 경로 구분자로 살려야 하므로 통째로 감싸지 않는다.
 */
export function storagePublicUrl(bucket, path) {
  const encoded = String(path)
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encoded}`;
}
