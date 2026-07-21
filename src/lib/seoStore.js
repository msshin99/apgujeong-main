import { isSupabaseReady, restSelect, storagePublicUrl } from "./rest.js";
import { CLUSTERS, ROUTES, SITE } from "./seoData.js";

/**
 * SEO 설정 데이터 접근 — seo_settings · seo_pages · topic_clusters.
 *
 * 공지사항(`notices.js`)과 같은 계약이다. Supabase 가 연결돼 있으면 DB 를,
 * 아니면 `seoData.js` 의 정적 원본을 쓴다. 화면은 어느 쪽인지 신경 쓰지 않아도 되도록
 * 여기서 형태를 하나로 맞춘다.
 *
 * **행 모양을 DB 의 snake_case 그대로 둔다.** camelCase 로 예쁘게 바꾸고 싶은 마음이
 * 들지만 그러면 안 된다 — `seo.js` 의 resolveMeta / buildJsonLd 가 `ctx.dbPage`,
 * `ctx.dbSettings` 로 받는 것이 정확히 이 snake_case 행이기 때문이다. 관리자 화면은
 * 편집 중인 초안을 그대로 resolveMeta 에 넘겨 실시간 미리보기를 그린다.
 * 중간에 이름을 바꾸면 화면과 실제 출력이 갈라진다.
 *
 * 정적 원본은 **읽기 전용** 이다. 마이그레이션(docs/seo-setup.md)을 실행하기 전에는
 * 저장할 곳이 없으므로, 읽기 함수는 `source: "static"` 을 함께 돌려주고
 * 화면이 그 상태를 안내하며 저장 버튼을 잠근다.
 *
 * **이 파일은 useSeo 를 통해 모든 공개 라우트가 끌고 온다.** 그래서 읽기는
 * anon 키로 되는 rest.js 의 fetch 로만 하고(세 표 모두 select 가 anon 에 열려 있다),
 * SDK 는 관리자 저장·업로드 함수 안에서만 동적으로 불러온다. 위에서 정적으로
 * import 하면 홈 한 번 여는 데 관리자 SDK 가 통째로 딸려 온다.
 */

/** OG 이미지 전용 버킷. 공개 버킷이어야 한다 — 크롤러·메신저는 로그인하지 않는다 */
export const SEO_BUCKET = "seo-images";

/* 목록에 쓰이지 않는 칸까지 select * 로 끌어오면, 나중에 칸이 늘 때마다
   화면이 모르는 값을 조용히 들고 다니게 된다. 쓰는 것만 이름으로 적는다 */
const SETTINGS_COLUMNS =
  "id, site_name, site_url, title_template, default_title, default_description, " +
  "default_og_path, locale, org_legal_name, org_alternate_name, org_phone, org_email, " +
  "org_street, org_locality, org_region, org_postal_code, org_country, org_biz_number, " +
  "org_founding_date, org_price_range, org_opening_hours, same_as, robots_default, updated_at";

const PAGE_COLUMNS =
  "id, route, title, description, keywords, primary_keyword, og_path, canonical_url, " +
  "robots_index, robots_follow, robots_extra, faq, schema_type, cluster_id, admin_note, updated_at";

const CLUSTER_COLUMNS =
  "id, name, slug, description, pillar_route, keywords, sort_order, updated_at";

/**
 * 관리 대상 라우트. `seoData.js` 의 ROUTES 키 순서를 그대로 쓴다.
 *
 * DB 조회 결과를 이 순서로 다시 세우는 이유 — id 순으로 두면 마이그레이션을
 * 다시 돌리거나 행을 지웠다 넣을 때마다 목록 순서가 바뀐다. 운영자에게는
 * "홈 → 브랜드 → 메뉴 …" 라는 사이트 순서가 유일하게 말이 되는 순서다.
 * @type {string[]}
 */
export const SEO_ROUTES = Object.keys(ROUTES);

/**
 * schema_type 에 넣을 수 있는 값. DB 의 seo_pages_schema check 제약과 같아야 한다.
 * 비워 두면(null) 코드가 라우트별 기본값을 판정한다 — 그쪽이 정상 경로다.
 * @type {string[]}
 */
export const SCHEMA_TYPES = [
  "WebPage",
  "AboutPage",
  "ContactPage",
  "CollectionPage",
  "ItemPage",
  "FAQPage",
  "Restaurant",
  "Menu",
];

/**
 * 표(또는 칸)가 아직 없어서 거절당한 응답인가.
 *
 * SEO 표들은 docs/seo-setup.md 의 SQL 을 실행해야 생긴다. 안 돌린 프로젝트에서
 * PostgREST 는 42P01(없는 표) 또는 PGRST205(스키마 캐시에 없는 표)로 조회를 통째로
 * 거절한다. 그때 화면을 "불러오지 못했습니다" 로 죽이면, 마이그레이션을 안 돌렸을 뿐인
 * 멀쩡한 사이트에서 관리자 화면만 고장 난 것처럼 보인다.
 * 42703(없는 칸)도 같이 받아 준다 — 표는 있는데 나중에 추가된 칸만 없는 중간 상태다.
 */
function missingSeoTable(error) {
  if (!error) return false;
  const code = String(error.code ?? "");
  if (code === "42P01" || code === "42703" || code === "PGRST205" || code === "PGRST106") {
    return true;
  }
  const message = String(error.message ?? "");
  return /relation .* does not exist|could not find the table/i.test(message);
}

/**
 * 표가 없어서 난 오류면 정적 원본으로 돌아가고, 그 밖의 오류는 그대로 올린다.
 * 읽기 세 함수가 같은 판정을 하므로 한 곳에 모아 둔다.
 */
async function readOrFallback(run, fallback) {
  try {
    return await run();
  } catch (error) {
    if (missingSeoTable(error)) return fallback();
    throw error;
  }
}

/**
 * 빈 문자열을 null 로.
 *
 * 화면의 입력칸은 비면 "" 을 준다. 그런데 og_founding_date 는 date 라 "" 이 형변환
 * 오류를 내고, schema_type 은 `is null or in (...)` 제약이라 "" 이 23514 로 거절된다.
 * 즉 "비웠다" 는 뜻은 이 칸들에서 null 이어야만 한다.
 */
const nullIfBlank = (v) => {
  const s = typeof v === "string" ? v.trim() : v;
  return s === "" || s === undefined ? null : s;
};

/** 배열에서 공백 항목을 걷어 낸다. text[] 칸에 빈 문자열이 섞이면 검사 제약에 걸린다 */
const cleanList = (list) =>
  (Array.isArray(list) ? list : []).map((v) => String(v ?? "").trim()).filter(Boolean);

/* ────────── 정적 원본 → DB 행 모양 ────────── */

/** seoData.js 의 SITE → seo_settings 한 행 모양 */
function staticSettingsRow() {
  const org = SITE.org ?? {};
  return {
    id: 1,
    site_name: SITE.siteName ?? "",
    site_url: SITE.siteUrl ?? "",
    title_template: SITE.titleTemplate ?? "",
    default_title: SITE.defaultTitle ?? "",
    default_description: SITE.defaultDescription ?? "",
    default_og_path: SITE.defaultOgPath ?? null,
    locale: SITE.locale ?? "ko_KR",
    org_legal_name: org.legalName ?? "",
    org_alternate_name: org.alternateName ?? "",
    org_phone: org.phone ?? "",
    org_email: org.email ?? "",
    org_street: org.street ?? "",
    org_locality: org.locality ?? "",
    org_region: org.region ?? "",
    org_postal_code: org.postalCode ?? "",
    org_country: org.country ?? "",
    org_biz_number: org.bizNumber ?? "",
    org_founding_date: org.foundingDate || null,
    org_price_range: org.priceRange ?? "",
    org_opening_hours: Array.isArray(org.openingHours) ? org.openingHours : [],
    same_as: Array.isArray(SITE.sameAs) ? SITE.sameAs : [],
    robots_default: SITE.robotsDefault ?? "index,follow",
    updated_at: null,
  };
}

/**
 * 정적 클러스터에 붙이는 가짜 id.
 *
 * 정적 모드에서는 저장이 막혀 있으므로 이 id 는 오직 "페이지 ↔ 클러스터" 를
 * 화면에서 잇는 데만 쓰인다. 1부터 매기면 나중에 DB 로 넘어갔을 때의 id 와
 * 겹쳐 보일 수 있어 헷갈리므로, 절대 DB 에 없을 음수를 쓴다.
 */
const staticClusterId = (index) => -(index + 1);

/** seoData.js 의 CLUSTERS → topic_clusters 행 모양 */
function staticClusterRows() {
  return CLUSTERS.map((c, i) => ({
    id: staticClusterId(i),
    name: c.name,
    slug: c.slug,
    description: c.description ?? "",
    pillar_route: c.pillarRoute,
    keywords: Array.isArray(c.keywords) ? c.keywords : [],
    sort_order: (i + 1) * 10,
    updated_at: null,
  }));
}

/** seoData.js 의 ROUTES 한 칸 → seo_pages 한 행 모양 */
function staticPageRow(route, index) {
  const meta = ROUTES[route] ?? {};
  const clusterIndex = CLUSTERS.findIndex((c) => c.routes.includes(route));
  return {
    id: -(index + 1),
    route,
    title: meta.title ?? "",
    description: meta.description ?? "",
    keywords: Array.isArray(meta.keywords) ? meta.keywords : [],
    primary_keyword: meta.primaryKeyword ?? "",
    og_path: meta.ogPath ?? null,
    canonical_url: null,
    robots_index: true,
    robots_follow: true,
    robots_extra: [],
    faq: Array.isArray(meta.faq) ? meta.faq : [],
    schema_type: meta.schemaType ?? null,
    cluster_id: clusterIndex === -1 ? null : staticClusterId(clusterIndex),
    admin_note: "",
    updated_at: null,
  };
}

/* ────────── 읽기 ────────── */

/**
 * 사이트 전역 설정 한 행.
 *
 * @returns {Promise<{ source: "db"|"static", row: object }>}
 *   source 가 "static" 이면 마이그레이션 전이라 **저장할 곳이 없다.**
 *   화면은 이 값을 보고 안내를 띄우고 저장 버튼을 잠근다.
 */
export async function loadSeoSettings() {
  const fallback = () => ({ source: "static", row: staticSettingsRow() });
  if (!isSupabaseReady) return fallback();

  return readOrFallback(async () => {
    const data = await restSelect("seo_settings", {
      columns: SETTINGS_COLUMNS,
      eq: { id: 1 },
      maybeSingle: true,
    });
    /* 마이그레이션이 id=1 을 미리 넣어 두지만, 누군가 지웠을 수도 있다.
       행이 없을 때 화면이 insert 경로를 따로 갖게 하지 않으려고 정적 값으로 채운다 */
    if (!data) return fallback();
    return { source: "db", row: data };
  }, fallback);
}

/**
 * 라우트별 메타 8행.
 *
 * DB 에 없는 라우트(마이그레이션 이후 코드에 새 라우트가 늘어난 경우)는 정적 값으로
 * 채워 목록에 끼워 넣는다. 목록에서 아예 사라지면 운영자는 그 페이지의 메타를
 * 손볼 방법이 없다는 것조차 알 수 없다.
 *
 * @returns {Promise<{ source: "db"|"static", rows: object[] }>}
 */
export async function loadSeoPages() {
  const fallback = () => ({
    source: "static",
    rows: SEO_ROUTES.map((route, i) => staticPageRow(route, i)),
  });

  if (!isSupabaseReady) return fallback();

  return readOrFallback(async () => {
    const data = await restSelect("seo_pages", { columns: PAGE_COLUMNS });
    if (!data || data.length === 0) return fallback();

    const byRoute = new Map(data.map((row) => [row.route, row]));
    const known = SEO_ROUTES.map((route, i) => byRoute.get(route) ?? staticPageRow(route, i));
    /* 코드에 없는 라우트가 DB 에 들어 있을 수도 있다(운영자가 직접 추가).
       감추면 "저장했는데 어디에도 안 보인다" 가 되므로 뒤에 붙여 보여 준다 */
    const extra = data.filter((row) => !SEO_ROUTES.includes(row.route));
    return { source: "db", rows: [...known, ...extra] };
  }, fallback);
}

/**
 * 토픽 클러스터 전체.
 * @returns {Promise<{ source: "db"|"static", rows: object[] }>}
 */
export async function loadClusters() {
  const fallback = () => ({ source: "static", rows: staticClusterRows() });
  if (!isSupabaseReady) return fallback();

  return readOrFallback(async () => {
    const data = await restSelect("topic_clusters", {
      columns: CLUSTER_COLUMNS,
      order: [
        ["sort_order", "asc"],
        ["id", "asc"],
      ],
    });
    /* 표는 있는데 비어 있는 경우는 정적으로 되돌리지 않는다 —
       운영자가 클러스터를 전부 지운 상태일 수 있고, 그건 유효한 상태다 */
    return { source: "db", rows: data ?? [] };
  }, fallback);
}

/* ────────── 쓰기 ──────────
 *
 * 여기 아래는 전부 로그인한 사람의 JWT 로만 통과한다. 그래서 SDK 가 필요하고,
 * SDK 는 함수 안에서 동적으로 불러온다 — 위에서 정적으로 import 하면 이 파일을
 * 끌고 오는 모든 공개 라우트가 관리자 SDK 까지 받아 가게 된다.
 */

/** 관리자 쓰기용 SDK 클라이언트. /admin 화면에서만 실제로 내려받는다 */
async function adminClient() {
  const { getSupabase } = await import("./supabase.js");
  return getSupabase();
}

/**
 * 사이트 전역 설정 저장. seo_settings 는 항상 id=1 한 행뿐이라 update 만 한다
 * (DB 에도 insert/delete 정책이 아예 없다).
 *
 * @param {object} fields - snake_case 칸 이름 그대로
 */
export async function saveSeoSettings(fields) {
  const patch = {
    ...fields,
    default_og_path: nullIfBlank(fields.default_og_path),
    org_founding_date: nullIfBlank(fields.org_founding_date),
    same_as: cleanList(fields.same_as),
    org_opening_hours: normalizeHours(fields.org_opening_hours),
  };

  const supabase = await adminClient();
  const { data, error } = await supabase
    .from("seo_settings")
    .update(patch)
    .eq("id", 1)
    .select(SETTINGS_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

/**
 * 영업시간 항목 정리.
 * days(비어 있지 않은 배열)·opens·closes 가 **모두** 있는 항목만 남긴다.
 * 반쪽짜리 항목은 openingHoursSpecification 으로 나갈 수 없어 어차피 버려지는데,
 * 저장돼 있으면 운영자는 "입력했는데 왜 안 나오지" 를 알 길이 없다.
 */
function normalizeHours(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((h) => ({
      days: cleanList(h?.days),
      opens: String(h?.opens ?? "").trim(),
      closes: String(h?.closes ?? "").trim(),
    }))
    .filter((h) => h.days.length > 0 && h.opens && h.closes);
}

/**
 * 라우트 한 개의 메타 저장.
 *
 * 키는 id 가 아니라 route 다. 라우트는 코드에도 그대로 있는 이름이라
 * "이 id 가 어느 페이지였더라" 를 뒤질 일이 없다.
 * 행이 없으면(코드에 새로 생긴 라우트) 만들어 준다.
 *
 * @param {string} route
 * @param {object} fields - snake_case 칸 이름 그대로
 */
export async function saveSeoPage(route, fields) {
  const patch = {
    route,
    title: fields.title ?? "",
    description: fields.description ?? "",
    keywords: cleanList(fields.keywords),
    primary_keyword: fields.primary_keyword ?? "",
    og_path: nullIfBlank(fields.og_path),
    canonical_url: nullIfBlank(fields.canonical_url),
    robots_index: fields.robots_index !== false,
    robots_follow: fields.robots_follow !== false,
    robots_extra: cleanList(fields.robots_extra),
    faq: normalizeFaqRows(fields.faq),
    schema_type: nullIfBlank(fields.schema_type),
    cluster_id: fields.cluster_id ?? null,
    admin_note: fields.admin_note ?? "",
  };

  /* upsert 의 기준을 route 로 잡는다. unique 제약이 route 에 걸려 있어서
     같은 라우트를 두 번 저장해도 행이 늘지 않는다 */
  const supabase = await adminClient();
  const { data, error } = await supabase
    .from("seo_pages")
    .upsert(patch, { onConflict: "route" })
    .select(PAGE_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

/**
 * q·a 가 **둘 다** 있는 문답만 남긴다.
 * 반쪽짜리는 FAQPage 검증기에서 오류가 나고, seo.js 도 어차피 걸러 낸다.
 * 저장 단계에서 미리 털어야 다음에 열었을 때 화면과 실제가 같다.
 */
function normalizeFaqRows(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((f) => ({ q: String(f?.q ?? "").trim(), a: String(f?.a ?? "").trim() }))
    .filter((f) => f.q && f.a);
}

/** 클러스터 새로 만들기 */
export async function createCluster(fields) {
  const supabase = await adminClient();
  const { data, error } = await supabase
    .from("topic_clusters")
    .insert(clusterPatch(fields))
    .select(CLUSTER_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

/** 클러스터 고치기 */
export async function updateCluster(id, fields) {
  const supabase = await adminClient();
  const { data, error } = await supabase
    .from("topic_clusters")
    .update(clusterPatch(fields))
    .eq("id", id)
    .select(CLUSTER_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

function clusterPatch(fields) {
  return {
    name: String(fields.name ?? "").trim(),
    slug: String(fields.slug ?? "").trim(),
    description: fields.description ?? "",
    pillar_route: fields.pillar_route,
    keywords: cleanList(fields.keywords),
    sort_order: Number(fields.sort_order) || 0,
  };
}

/**
 * 클러스터 삭제.
 *
 * seo_pages.cluster_id 는 on delete set null 이라 페이지는 남고 소속만 풀린다.
 * 반대로 pillar_route 는 on delete restrict 로 seo_pages 를 지키고 있으므로,
 * 여기서 지워지는 것은 클러스터뿐이다.
 */
export async function deleteCluster(id) {
  const supabase = await adminClient();
  const { error } = await supabase.from("topic_clusters").delete().eq("id", id);
  if (error) throw error;
}

/**
 * 클러스터에 속한 페이지 목록을 통째로 맞춘다.
 *
 * 빠진 라우트를 null 로 되돌리는 일을 서버 쪽 `not in` 으로 하지 않는 이유 —
 * 라우트에는 `/` 와 `:` 가 들어 있어 PostgREST 필터 문자열에서 따옴표 처리가 까다롭다.
 * 화면이 이미 "이전 목록" 을 알고 있으니 뺄 것을 명시적으로 넘기는 편이 안전하다.
 *
 * @param {number} clusterId
 * @param {string[]} routes         - 이제부터 이 클러스터에 속할 라우트
 * @param {string[]} previousRoutes - 직전까지 속해 있던 라우트
 */
export async function assignClusterRoutes(clusterId, routes, previousRoutes = []) {
  const next = cleanList(routes);
  const removed = cleanList(previousRoutes).filter((r) => !next.includes(r));

  const supabase = await adminClient();
  if (removed.length > 0) {
    const { error } = await supabase
      .from("seo_pages")
      .update({ cluster_id: null })
      .in("route", removed);
    if (error) throw error;
  }
  if (next.length > 0) {
    const { error } = await supabase
      .from("seo_pages")
      .update({ cluster_id: clusterId })
      .in("route", next);
    if (error) throw error;
  }
}

/* ────────── OG 이미지 ────────── */

/** Storage 경로 → 공개 URL. 값이 없으면 null */
export function seoImageUrl(path) {
  if (!path) return null;
  /* "/images/og-default.png" 처럼 public 폴더의 정적 파일을 가리키는 값도 들어온다.
     그건 버킷 경로가 아니므로 그대로 돌려준다 */
  if (path.startsWith("/") || path.startsWith("http")) return path;
  if (!isSupabaseReady) return path;
  return storagePublicUrl(SEO_BUCKET, path);
}

/** 겹치지 않는 파일 이름 (notices.js 와 같은 이유로 randomUUID 를 못 믿는다) */
function uniqueFileName() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * OG 이미지 업로드 → Storage 경로를 돌려준다.
 * notice-images 와 버킷을 나눈 이유는 이쪽이 **반드시 공개** 여야 하기 때문이다.
 * 서명 URL 은 만료가 있어 og:image 로 쓸 수 없다(크롤러는 로그인하지 않는다).
 */
export async function uploadSeoImage(file) {
  const supabase = await adminClient();
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `og/${uniqueFileName()}.${ext}`;

  const { error } = await supabase.storage.from(SEO_BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  return path;
}
