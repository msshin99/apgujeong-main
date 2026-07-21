/**
 * SEO 코어 — 메타 해석 · JSON-LD 그래프 · 정규 URL · 내부링크.
 *
 * 이 파일은 **브라우저와 Node 빌드 스크립트에서 똑같이 돌아야 한다.**
 * 프리렌더 스크립트가 각 라우트의 head 를 만들 때 이 함수들을 부르고,
 * 런타임 SPA 라우팅에서도 같은 함수를 불러 head 를 갱신한다.
 * 두 곳이 다른 코드를 쓰면 언젠가 반드시 어긋나고, 그때는 크롤러가 본 것과
 * 사람이 본 것이 달라진다(cloaking 으로 오인될 수 있는 상태다).
 *
 * 그래서 지켜야 할 제약:
 *   - window / document / location 을 쓰지 않는다.
 *   - React 를 import 하지 않는다.
 *   - `import.meta.env` 를 읽지 않는다. 순수 Node ESM 에서 `import.meta.env` 는
 *     undefined 라 모듈 평가 시점에 TypeError 로 죽는다. 같은 이유로
 *     `src/lib/asset.js` 도 import 하지 않는다 — 그 파일은 최상단에서 BASE_URL 을 읽는다.
 *     base 경로가 필요한 자리는 **인자로 받는다**(absoluteUrl 의 세 번째 인자).
 *
 * ────────────────────────────────────────────────
 * 생략 규칙이 이 파일의 존재 이유다.
 *
 * 지금 사이트의 전화(010-1234-5678)·주소(0000빌딩)·푸터 사업자 정보는 전부
 * 자리표시자다. 이 값이 JSON-LD 로 나가면 구조화 데이터 스팸 정책 위반이고,
 * 구글에서는 수동 조치 사유다. 리치 결과가 안 나오는 손해보다 수동 조치가 훨씬 비싸다.
 *
 * 원칙 세 가지:
 *   (a) 값이 없으면 블록을 통째로 뺀다. 빈 문자열이나 "미정" 을 채워 넣지 않는다.
 *   (b) 그래프에 없는 노드를 @id 로 가리키지 않는다. 끊긴 참조는 없는 것보다 나쁘다 —
 *       파서가 빈 노드를 만들어 낸다.
 *   (c) 자리표시자 탐지는 코드에서 강제한다(isReal). 관리자가 실수로 "0000" 을
 *       적어 넣는 경로까지 막는 것이 목적이다.
 * ────────────────────────────────────────────────
 */

import {
  SITE,
  ROUTES,
  CLUSTERS,
  ROUTE_LABELS,
  MENU_SECTIONS,
  WINE_LIST,
} from "./seoData.js";

/* ============================================================
 * 0. 값 검증 — 자리표시자를 "없는 값" 으로 취급한다
 * ============================================================ */

/**
 * 자리표시자로 알려진 문자열 패턴.
 * 값을 넓게 잡는 것이 안전하다 — 걸러서 스키마가 안 나가는 손해는 회복되지만,
 * 못 걸러서 허위 정보가 색인되는 손해는 회복이 오래 걸린다.
 */
const PLACEHOLDER_PATTERNS = [
  /0{4,}/,                        // 0000빌딩, 000-00-00000, 00-0000-0000
  /x{4,}/i,                       // XXXX
  /1234[-\s]?5678/,               // 010-1234-5678
  /example\.(com|org|net)/i,
  /^(미정|추후|준비\s*중|tbd|todo|n\/?a)$/i,
];

/**
 * 이 값을 스키마에 실어도 되는가.
 *
 * 빈 값·공백뿐인 값·위 자리표시자 패턴에 걸리는 값은 전부 false 다.
 * false 인 값은 **속성을 빼고**, 그 속성이 블록의 하중을 받는 필드라면
 * 블록 자체를 뺀다. 이 함수 하나가 원칙 (a)(c)를 담당한다.
 *
 * @param {unknown} value
 * @returns {boolean} 실제 정보로 인정할 수 있으면 true
 */
export function isReal(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value !== "string") return false;
  const s = value.trim();
  if (!s) return false;
  return !PLACEHOLDER_PATTERNS.some((re) => re.test(s));
}

/** 배열에서 isReal 을 통과하는 값만 남긴다. 결과가 비면 빈 배열 */
function realList(list) {
  return Array.isArray(list) ? list.filter((v) => isReal(v)) : [];
}

/**
 * 값이 있는 키만 남긴 객체를 만든다.
 * JSON-LD 에 `"telephone": ""` 같은 빈 속성이 남지 않게 하는 마지막 체다.
 */
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && !v.trim()) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out;
}

/* ============================================================
 * 1. 라우트 · URL
 * ============================================================ */

/**
 * 실제 경로를 ROUTES 의 키(템플릿 경로)로 바꾼다.
 *
 *   "/menu/"      → "/menu"
 *   "/notice/12"  → "/notice/:id"
 *   "/apgujeong-main/menu" (base 포함) → 호출 전에 base 를 떼고 넘길 것
 *
 * @param {string} routePath
 * @returns {string} ROUTES 에 있는 키. 못 찾으면 정리된 경로 그대로
 */
export function normalizeRoute(routePath) {
  if (!routePath) return "/";
  // 쿼리·해시를 떼고, 끝 슬래시를 정리한다
  let p = String(routePath).split(/[?#]/)[0];
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  if (!p) p = "/";
  if (ROUTES[p]) return p;
  if (/^\/notice\/[^/]+$/.test(p)) return "/notice/:id";
  return p;
}

/**
 * 절대 URL 을 만든다. canonical / og:url / JSON-LD 의 @id 가 전부 이걸 쓴다.
 *
 * GitHub Pages 프로젝트 사이트는 `https://계정.github.io/저장소이름/` 아래에서 돌기 때문에
 * 경로 앞에 저장소 이름(base)이 붙어야 한다. 그런데 그 값을 `import.meta.env.BASE_URL`
 * 로 읽으면 이 모듈이 Node 에서 죽는다. **그래서 base 를 인자로 받는다.**
 * 브라우저에서는 호출부가 `import.meta.env.BASE_URL` 을, 빌드 스크립트에서는
 * `process.env.BASE_PATH` 를 넘긴다 — 값을 읽는 책임을 경계 밖으로 밀어낸 것이다.
 *
 * origin 에 이미 base 가 포함돼 있으면(예: site_url 을
 * "https://user.github.io/apgujeong-main" 로 저장한 경우) 두 번 붙이지 않는다.
 *
 * @param {string} path   - "/menu" 또는 "/images/og.png" 같은 사이트 내부 경로
 * @param {string} origin - "https://example.com" 처럼 끝 슬래시 없는 origin. 비면 "" 반환
 * @param {string} [base] - "/apgujeong-main/" 같은 배포 base. 기본 "/"
 * @returns {string} 절대 URL. origin 이 없으면 빈 문자열(= canonical 을 내보내지 않는다)
 */
export function absoluteUrl(path, origin, base = "/") {
  const p = String(path ?? "/");
  // 이미 완성된 주소는 그대로 둔다
  if (/^([a-z]+:)?\/\//i.test(p) || p.startsWith("data:")) return p;

  const o = String(origin ?? "").trim().replace(/\/+$/, "");
  if (!isReal(o)) return "";

  const b = "/" + String(base ?? "/").replace(/^\/+|\/+$/g, "");
  const rel = "/" + p.replace(/^\/+/, "");

  // origin 이 이미 base 로 끝나면 base 를 또 붙이지 않는다
  const prefix = b === "/" || o.endsWith(b) ? "" : b;
  const joined = (prefix + rel).replace(/\/{2,}/g, "/");

  // 루트는 끝 슬래시를 남기고, 그 외에는 뗀다 (canonical 중복 방지)
  const normalized = joined === "/" ? "/" : joined.replace(/\/+$/, "");
  return o + normalized;
}

/* ============================================================
 * 2. 메타 해석
 * ============================================================ */

/**
 * 제목에 브랜드 접미사를 붙인다. **이미 붙어 있으면 다시 붙이지 않는다.**
 *
 * 이 가드가 없으면 DB 에 "메뉴 소개 | 압구정곱창" 이라고 저장한 순간
 * "메뉴 소개 | 압구정곱창 | 압구정곱창" 이 된다. 관리자가 완성된 제목을 넣는 것은
 * 자연스러운 행동이므로, 코드가 막아야 할 실수다.
 *
 * @param {string} title    - 페이지 제목 조각
 * @param {string} template - "%s | 압구정곱창"
 * @param {string} siteName - "압구정곱창"
 * @returns {string}
 */
export function applyTitleTemplate(title, template, siteName) {
  const t = String(title ?? "").trim();
  if (!t) return "";
  if (!template || !template.includes("%s")) return t;
  // 접미사가 이미 들어 있으면(대소문자·공백 무시) 그대로 둔다
  if (isReal(siteName) && t.replace(/\s+/g, "").includes(String(siteName).replace(/\s+/g, ""))) {
    return t;
  }
  return template.replace("%s", t);
}

/**
 * 한 라우트의 최종 메타를 계산한다.
 *
 * 우선순위: **DB override(dbPage) → 정적 ROUTES → SITE 기본값.**
 * 세 단계 모두 "값이 isReal 일 때만 이긴다" — DB 에 빈 문자열이 들어 있어도
 * 정적 값이 살아남는다. 관리자가 칸을 비워 저장한 것이 곧 "지우라" 는 뜻은 아니기 때문이다.
 *
 * @param {string} routePath - 라우트 경로("/menu", "/notice/12")
 * @param {object} [ctx]
 * @param {object} [ctx.dbPage]     - seo_pages 한 행
 * @param {object} [ctx.dbSettings] - seo_settings 한 행
 * @param {object} [ctx.notice]     - 공지 상세일 때 그 글(제목·요약·og 를 최우선으로 쓴다)
 * @param {string} [ctx.origin]     - canonical 기준 origin. 없으면 설정값
 * @param {string} [ctx.base]       - 배포 base 경로. 기본 "/"
 * @returns {{
 *   route: string, title: string, description: string, canonical: string,
 *   ogImage: string, ogType: string, locale: string, robots: string,
 *   keywords: string[], primaryKeyword: string, faq: {q:string,a:string}[],
 *   schemaType: string, siteName: string
 * }}
 */
export function resolveMeta(routePath, ctx = {}) {
  const { dbPage = null, dbSettings = null, notice = null, base = "/" } = ctx;
  const route = normalizeRoute(routePath);
  const staticMeta = ROUTES[route] ?? {};

  /** 앞에서부터 isReal 인 첫 값 */
  const pick = (...vals) => vals.find((v) => isReal(v)) ?? "";

  const siteName = pick(dbSettings?.site_name, SITE.siteName);
  const template = pick(dbSettings?.title_template, SITE.titleTemplate);
  const origin = pick(ctx.origin, dbSettings?.site_url, SITE.siteUrl);
  const locale = pick(dbSettings?.locale, SITE.locale);

  /* 제목 — 공지 상세는 글의 seo_title/title 이 가장 먼저다 */
  const rawTitle = pick(
    notice?.seo_title,
    notice?.title,
    dbPage?.title,
    staticMeta.title,
    dbSettings?.default_title,
    SITE.defaultTitle,
  );
  /* 홈은 템플릿을 거치지 않는다. "압구정곱창 | 압구정곱창" 이 되기 때문 */
  const title =
    route === "/" ? rawTitle : applyTitleTemplate(rawTitle, template, siteName);

  const description = pick(
    notice?.seo_description,
    firstParagraph(notice?.body),
    dbPage?.description,
    staticMeta.description,
    dbSettings?.default_description,
    SITE.defaultDescription,
  );

  /* canonical — DB 에 명시 값이 있으면 그것, 없으면 origin + route 로 조립.
     origin 이 없으면 빈 문자열이고, 호출부는 빈 canonical 을 내보내지 않는다 */
  const canonicalPath = route === "/notice/:id" && notice?.id
    ? `/notice/${notice.id}`
    : route;
  const canonical = pick(dbPage?.canonical_url, absoluteUrl(canonicalPath, origin, base));

  const ogPath = pick(
    notice?.og_path,
    dbPage?.og_path,
    staticMeta.ogPath,
    dbSettings?.default_og_path,
    SITE.defaultOgPath,
  );
  const ogImage = ogPath ? absoluteUrl(ogPath, origin, base) : "";

  /* robots — DB 는 boolean 두 칸으로 나눠 저장한다. 자유 입력 문자열은 오타 하나로
     페이지가 색인에서 통째로 빠지기 때문에 여기서 조립한다 */
  const robots = dbPage
    ? [
        dbPage.robots_index === false ? "noindex" : "index",
        dbPage.robots_follow === false ? "nofollow" : "follow",
        ...realList(dbPage.robots_extra),
      ].join(",")
    : pick(dbSettings?.robots_default, SITE.robotsDefault);

  const keywords = realList(
    (dbPage?.keywords?.length ? dbPage.keywords : null) ??
      notice?.keywords ??
      staticMeta.keywords ??
      [],
  );

  const faq = normalizeFaq(
    (Array.isArray(notice?.faq) && notice.faq.length ? notice.faq : null) ??
      (Array.isArray(dbPage?.faq) && dbPage.faq.length ? dbPage.faq : null) ??
      staticMeta.faq ??
      [],
  );

  return {
    route,
    title,
    description,
    canonical,
    ogImage,
    ogType: route === "/notice/:id" ? "article" : "website",
    locale,
    robots,
    keywords,
    primaryKeyword: pick(dbPage?.primary_keyword, staticMeta.primaryKeyword),
    faq,
    schemaType: pick(dbPage?.schema_type, staticMeta.schemaType, defaultSchemaType(route)),
    siteName,
  };
}

/** 공지 본문(문단 배열 또는 문자열)에서 첫 문단을 요약용으로 뽑는다 */
function firstParagraph(body) {
  if (!body) return "";
  const text = Array.isArray(body) ? body[0] : String(body);
  if (!text) return "";
  const flat = String(text).replace(/\s+/g, " ").trim();
  return flat.length > 160 ? flat.slice(0, 157) + "…" : flat;
}

/** q·a 가 **둘 다** 있는 항목만 남긴다. 반쪽짜리 문답은 검증기에서 오류가 난다 */
function normalizeFaq(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((f) => ({ q: String(f?.q ?? "").trim(), a: String(f?.a ?? "").trim() }))
    .filter((f) => f.q && f.a);
}

/** 라우트별 WebPage 세부 타입 기본값 */
function defaultSchemaType(route) {
  switch (route) {
    case "/brand":
      return "AboutPage";
    case "/contact":
      return "ContactPage";
    case "/wine":
    case "/stores":
    case "/notice":
      return "CollectionPage";
    case "/notice/:id":
      return "ItemPage";
    default:
      return "WebPage";
  }
}

/* ============================================================
 * 3. 브레드크럼
 * ============================================================ */

/**
 * 라우트 계층에서 브레드크럼 항목을 만든다.
 *
 * 홈은 브레드크럼을 내보내지 않는다(항목이 하나뿐이면 무의미하고,
 * 검증기도 2개 이상을 요구한다). `/notice/12` 는 홈 > 공지사항 > {글 제목} 3단이다.
 *
 * 반환은 스키마가 아니라 **평평한 항목 배열** 이다. 같은 배열을 화면의 breadcrumb UI 에도
 * 쓸 수 있어야 마크업과 본문이 어긋나지 않는다.
 *
 * @param {string} routePath
 * @param {object} [ctx]
 * @param {string} [ctx.origin] - 절대 URL 을 만들 origin. 없으면 item 은 상대경로
 * @param {string} [ctx.base]   - 배포 base
 * @param {object} [ctx.notice] - 공지 상세일 때 마지막 항목 이름·주소에 쓴다
 * @returns {{ name: string, path: string, url: string }[]} 2개 미만이면 빈 배열
 */
export function buildBreadcrumb(routePath, ctx = {}) {
  const { origin = "", base = "/", notice = null } = ctx;
  const route = normalizeRoute(routePath);
  if (route === "/") return [];

  const trail = [{ name: ROUTE_LABELS["/"], path: "/" }];

  if (route === "/notice/:id") {
    trail.push({ name: ROUTE_LABELS["/notice"], path: "/notice" });
    const name = String(notice?.title ?? "").trim();
    /* 글 제목을 모르면 3단을 만들 수 없다. 그래도 홈 > 공지사항 2단은 유효하다 */
    if (name) trail.push({ name, path: `/notice/${notice?.id ?? ""}` });
  } else {
    const name = ROUTE_LABELS[route];
    if (!name) return [];
    trail.push({ name, path: route });
  }

  if (trail.length < 2) return [];
  return trail.map((t) => ({ ...t, url: absoluteUrl(t.path, origin, base) }));
}

/* ============================================================
 * 4. JSON-LD 그래프
 * ============================================================ */

/** 그래프 안에서 노드를 가리키는 고정 @id 들 */
function ids(site) {
  return {
    organization: `${site}/#organization`,
    website: `${site}/#website`,
    logo: `${site}/#logo`,
    menu: `${site}/menu#menu`,
  };
}

/**
 * Organization 노드를 만든다. 하중을 받는 필드는 name 과 url 둘뿐이다.
 * 둘 중 하나라도 없으면 **노드를 만들지 않고 null 을 돌려준다** — 그러면 호출부가
 * publisher/provider 참조까지 전부 생략한다(원칙 b).
 */
function buildOrganization(cfg) {
  const { site, org, siteName, logoUrl, sameAs, id } = cfg;
  if (!isReal(siteName) || !isReal(site)) return null;

  /* 주소는 다섯 칸이 모두 실제 값일 때만. 부분 주소는 지역 매칭에 도움이 안 되고
     틀린 정보만 남는다 — 지금은 "0000빌딩" 때문에 전부 여기서 탈락한다 */
  const addr = [org.street, org.locality, org.region, org.postalCode, org.country];
  const address = addr.every(isReal)
    ? {
        "@type": "PostalAddress",
        streetAddress: org.street,
        addressLocality: org.locality,
        addressRegion: org.region,
        postalCode: org.postalCode,
        addressCountry: org.country,
      }
    : null;

  return compact({
    "@type": "Organization",
    "@id": id,
    name: siteName,
    url: site + "/",
    alternateName: isReal(org.alternateName) ? org.alternateName : "",
    legalName: isReal(org.legalName) ? org.legalName : "",
    /* 자리표시자 전화 010-1234-5678 은 isReal 에서 걸러진다 */
    telephone: isReal(org.phone) ? org.phone : "",
    email: isReal(org.email) ? org.email : "",
    vatID: isReal(org.bizNumber) ? org.bizNumber : "",
    foundingDate: isReal(org.foundingDate) ? org.foundingDate : "",
    address,
    logo: logoUrl ? { "@type": "ImageObject", "@id": cfg.logoId, url: logoUrl } : null,
    /* NAP 이 비어 있는 동안 실효가 있는 유일한 신호 */
    sameAs: realList(sameAs).filter((u) => /^https?:\/\//.test(u)),
  });
}

/**
 * 지점(Restaurant) 노드. **이름 + 완전한 주소 + 전화가 모두 실제 값일 때만** 만든다.
 *
 * 지금 /stores 의 세 지점은 전부 전화가 010-1234-5678 이고 성수·서교는 주소가
 * "0000빌딩" 이라 전 지점이 여기서 탈락한다 → 홈과 /stores 에 Restaurant 이 하나도
 * 안 나가고, 그래서 /stores 의 ItemList 도 통째로 생략된다(이름만 나열한 ItemList 는
 * 검색엔진에 의미가 없고, 주소 없는 점포를 실체로 선언하는 셈이 된다).
 *
 * 좌표(geo)도 latitude·longitude 가 둘 다 있을 때만 넣는다. 지금 좌표는 코드에
 * "동네의 대략적 위치" 라고 적혀 있으므로 넣지 않는다 — 틀린 좌표는 없는 좌표보다 나쁘다.
 *
 * aggregateRating·review 는 어떤 조건에서도 만들지 않는다. 사이트에 1차 리뷰
 * 데이터가 없고, 외부 플랫폼 별점을 자기 마크업으로 옮겨 적는 것은 명백한 위반이다.
 */
function buildRestaurant(store, cfg) {
  if (!store) return null;
  const { site, base, origin, orgId, org } = cfg;
  const name = String(store.name ?? "").trim();
  const addrParts = [
    store.street ?? store.address,
    store.locality,
    store.region,
    store.postalCode,
    store.country,
  ];
  if (!isReal(name) || !isReal(store.phone) || !addrParts.every(isReal)) return null;

  const hours = normalizeOpeningHours(store.openingHours ?? org?.openingHours);
  const hasGeo = isReal(store.latitude) && isReal(store.longitude);

  return compact({
    "@type": "Restaurant",
    "@id": `${site}/#restaurant-${store.id ?? name}`,
    name,
    url: absoluteUrl("/stores", origin, base),
    telephone: store.phone,
    address: {
      "@type": "PostalAddress",
      streetAddress: addrParts[0],
      addressLocality: addrParts[1],
      addressRegion: addrParts[2],
      postalCode: addrParts[3],
      addressCountry: addrParts[4],
    },
    geo: hasGeo
      ? { "@type": "GeoCoordinates", latitude: store.latitude, longitude: store.longitude }
      : null,
    servesCuisine: ["한식", "곱창"],
    priceRange: isReal(org?.priceRange) ? org.priceRange : "",
    menu: absoluteUrl("/menu", origin, base),
    openingHoursSpecification: hours,
    parentOrganization: orgId ? { "@id": orgId } : null,
  });
}

/** days/opens/closes 가 모두 있는 항목만 남긴다. 결과가 비면 빈 배열 → 속성 생략 */
function normalizeOpeningHours(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((h) => Array.isArray(h?.days) && h.days.length > 0 && isReal(h?.opens) && isReal(h?.closes))
    .map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: h.days,
      opens: h.opens,
      closes: h.closes,
    }));
}

/** Menu / MenuSection / MenuItem — /menu 전용. 이 사이트에서 가장 알찬 그래프다 */
function buildMenu(cfg) {
  const { site, locale } = cfg;
  const sections = MENU_SECTIONS.map((sec) => {
    const items = (sec.items ?? [])
      .filter((it) => isReal(it?.name))
      .map((it) =>
        compact({
          "@type": "MenuItem",
          name: it.name,
          description: [it.en, it.note].filter(isReal).join(" · "),
          /* 값이 둘인 항목(맥주 6,000/7,000원)은 price 가 null 이라 offers 를 생략한다.
             앞의 것만 취하면 표시 가격이 실제와 달라져 가격 오인 문제가 된다 */
          offers: isReal(it.price)
            ? { "@type": "Offer", price: it.price, priceCurrency: "KRW" }
            : null,
        }),
      );
    if (!isReal(sec?.name) || items.length === 0) return null;
    return { "@type": "MenuSection", name: sec.name, hasMenuItem: items };
  }).filter(Boolean);

  if (sections.length === 0) return null;
  return compact({
    "@type": "Menu",
    "@id": `${site}/menu#menu`,
    name: "압구정곱창 메뉴",
    inLanguage: toBcp47(locale),
    hasMenuSection: sections,
  });
}

/** ko_KR → ko-KR */
function toBcp47(locale) {
  return String(locale ?? "").replace("_", "-");
}

/**
 * 사이트 전체 JSON-LD 그래프를 만든다.
 *
 * 페이지마다 `<script type="application/ld+json">` **하나**만 내보내고,
 * 그 안은 `{"@context":"https://schema.org","@graph":[…]}` 다.
 * 블록마다 script 를 나누면 같은 조직이 페이지마다 새 노드로 잡혀 엔티티가 흩어진다.
 *
 * Organization 은 홈에만 전문(全文)으로 싣고 나머지 페이지는 `{"@id": …}` 참조 한 줄만
 * 남긴다. 조직 정보를 페이지마다 반복하면 값이 어긋났을 때 어느 쪽이 참인지 알 수 없다.
 *
 * @param {string} routePath
 * @param {object} [ctx]
 * @param {object}   [ctx.meta]       - resolveMeta 결과. 없으면 내부에서 계산한다
 * @param {object}   [ctx.dbSettings] - seo_settings 한 행(조직 정보 override)
 * @param {object}   [ctx.notice]     - 공지 상세의 글
 * @param {object[]} [ctx.notices]    - /notice 목록의 공개 글들
 * @param {object[]} [ctx.stores]     - 지점 목록. NAP 이 실제 값인 것만 노드가 된다
 * @param {string}   [ctx.origin]
 * @param {string}   [ctx.base]
 * @returns {{ "@context": string, "@graph": object[] }|null} 그래프가 비면 null
 */
export function buildJsonLd(routePath, ctx = {}) {
  const {
    dbSettings = null,
    notice = null,
    notices = [],
    stores = [],
    base = "/",
  } = ctx;

  const route = normalizeRoute(routePath);
  const meta = ctx.meta ?? resolveMeta(route, ctx);

  const pick = (...vals) => vals.find((v) => isReal(v)) ?? "";
  const origin = pick(ctx.origin, dbSettings?.site_url, SITE.siteUrl);
  /* origin 이 없으면 @id 를 만들 수 없다. 상대 @id 는 노드끼리 못 잇는다 → 그래프 자체를 포기 */
  const site = String(origin ?? "").replace(/\/+$/, "");
  if (!isReal(site)) return null;

  const ID = ids(site);
  const siteName = pick(dbSettings?.site_name, SITE.siteName);
  const locale = pick(dbSettings?.locale, SITE.locale);

  const org = {
    legalName: pick(dbSettings?.org_legal_name, SITE.org.legalName),
    alternateName: pick(dbSettings?.org_alternate_name, SITE.org.alternateName),
    phone: pick(dbSettings?.org_phone, SITE.org.phone),
    email: pick(dbSettings?.org_email, SITE.org.email),
    street: pick(dbSettings?.org_street, SITE.org.street),
    locality: pick(dbSettings?.org_locality, SITE.org.locality),
    region: pick(dbSettings?.org_region, SITE.org.region),
    postalCode: pick(dbSettings?.org_postal_code, SITE.org.postalCode),
    country: pick(dbSettings?.org_country, SITE.org.country),
    bizNumber: pick(dbSettings?.org_biz_number, SITE.org.bizNumber),
    foundingDate: pick(dbSettings?.org_founding_date, SITE.org.foundingDate),
    priceRange: pick(dbSettings?.org_price_range, SITE.org.priceRange),
    openingHours: Array.isArray(dbSettings?.org_opening_hours) && dbSettings.org_opening_hours.length
      ? dbSettings.org_opening_hours
      : SITE.org.openingHours,
  };
  const sameAs = realList(
    Array.isArray(dbSettings?.same_as) && dbSettings.same_as.length ? dbSettings.same_as : SITE.sameAs,
  );
  const logoUrl = SITE.logoPath ? absoluteUrl(SITE.logoPath, origin, base) : "";

  const organization = buildOrganization({
    site, org, siteName, logoUrl, sameAs, id: ID.organization, logoId: ID.logo,
  });
  /* Organization 이 없으면 그것을 가리키는 참조도 전부 없어야 한다(원칙 b) */
  const orgRef = organization ? { "@id": ID.organization } : null;

  const graph = [];

  /* ── WebSite — 홈에만 전문. potentialAction(SearchAction)은 내보내지 않는다.
        사이트에 검색 결과 URL 이 없어서 target 을 적으면 순수한 거짓말이 된다.
        나중에 /search?q= 라우트가 생기면 그때 추가한다 ── */
  const website = isReal(siteName)
    ? compact({
        "@type": "WebSite",
        "@id": ID.website,
        name: siteName,
        url: site + "/",
        inLanguage: toBcp47(locale),
        publisher: orgRef,
      })
    : null;

  if (route === "/" && organization) graph.push(organization);
  else if (organization) graph.push(orgRef);
  if (website) graph.push(route === "/" ? website : { "@id": ID.website });

  /* ── WebPage — 전 페이지. name/url 은 항상 만들 수 있어 실질적으로 항상 나간다 ── */
  const pageUrl = isReal(meta.canonical)
    ? meta.canonical
    : absoluteUrl(route === "/notice/:id" && notice?.id ? `/notice/${notice.id}` : route, origin, base);

  const faq = normalizeFaq(meta.faq);
  const webPageId = `${pageUrl}#webpage`;

  /* 페이지 세부 타입이 이미 FAQPage 면 별도 노드를 만들지 않고 mainEntity 로 붙인다.
     같은 URL 에 WebPage 와 FAQPage 두 노드가 각각 생기면 어느 쪽이 그 URL 인지 모호해진다 */
  const faqEntity =
    faq.length > 0
      ? {
          "@type": "FAQPage",
          "@id": `${pageUrl}#faq`,
          mainEntity: faq.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }
      : null;

  const webPage = compact({
    "@type": meta.schemaType || "WebPage",
    "@id": webPageId,
    name: meta.title,
    url: pageUrl,
    description: meta.description,
    inLanguage: toBcp47(locale),
    isPartOf: website ? { "@id": ID.website } : null,
    primaryImageOfPage: isReal(meta.ogImage) ? { "@type": "ImageObject", url: meta.ogImage } : null,
    /* /menu 는 Menu 노드를, 그 외에는 FAQ 를 mainEntity 로 건다 */
    mainEntity: route === "/menu" ? { "@id": ID.menu } : null,
  });
  graph.push(webPage);

  /* ── BreadcrumbList — 홈 제외. 항목 2개 이상 + 각 항목에 name·item 이 있을 때만 ── */
  const crumbs = buildBreadcrumb(route, { origin, base, notice });
  if (crumbs.length >= 2 && crumbs.every((c) => isReal(c.name) && isReal(c.url))) {
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${pageUrl}#breadcrumb`,
      itemListElement: crumbs.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        item: c.url,
      })),
    });
  }

  /* ── FAQPage — 페이지 본문에 보이지 않는 Q&A 는 절대 넣지 않는다(정책 위반).
        즉 faq 를 채우면 그 페이지에 FAQ 섹션을 함께 그려야 한다 ── */
  if (faqEntity && route !== "/menu") graph.push(faqEntity);

  /* ── 지점 노드. 조건을 통과한 것만 살아남고, 지금은 전부 탈락한다 ── */
  const restaurants = (Array.isArray(stores) ? stores : [])
    .map((s) => buildRestaurant(s, { site, base, origin, orgId: organization ? ID.organization : null, org }))
    .filter(Boolean);

  if (route === "/") {
    for (const r of restaurants) graph.push(r);
  }

  if (route === "/stores" && restaurants.length > 0) {
    for (const r of restaurants) graph.push(r);
    graph.push({
      "@type": "ItemList",
      "@id": `${pageUrl}#itemlist`,
      itemListElement: restaurants.map((r, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: { "@id": r["@id"] },
      })),
    });
  }

  /* ── /menu — Menu + Section + Item ── */
  if (route === "/menu") {
    const menu = buildMenu({ site, locale });
    if (menu) graph.push(menu);
    /* Menu 를 mainEntity 로 이미 썼으므로 FAQ 는 별도 노드로 붙인다 */
    if (faqEntity) graph.push(faqEntity);
  }

  /* ── /wine — 이름이 있는 항목만. 가격이 확인된 것에만 offers ── */
  if (route === "/wine") {
    const items = WINE_LIST.filter((w) => isReal(w?.name));
    if (items.length > 0) {
      graph.push({
        "@type": "ItemList",
        "@id": `${pageUrl}#itemlist`,
        name: "압구정곱창 와인 리스트",
        itemListElement: items.map((w, i) =>
          compact({
            "@type": "ListItem",
            position: i + 1,
            name: w.name,
            item: compact({
              "@type": "Product",
              name: w.name,
              alternateName: isReal(w.en) ? w.en : "",
              offers: isReal(w.price)
                ? { "@type": "Offer", price: w.price, priceCurrency: "KRW" }
                : null,
            }),
          }),
        ),
      });
    }
  }

  /* ── /notice — 공개 글 목록. 0건이면 생략 ── */
  if (route === "/notice") {
    const list = (Array.isArray(notices) ? notices : [])
      .filter((n) => n && n.is_public !== false && isReal(n.title))
      .map((n, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: n.title,
        url: absoluteUrl(`/notice/${n.id}`, origin, base),
      }))
      .filter((li) => isReal(li.url));
    if (list.length > 0) {
      graph.push({
        "@type": "ItemList",
        "@id": `${pageUrl}#itemlist`,
        itemListElement: list,
      });
    }
  }

  /* ── /notice/{id} — BlogPosting.
        NewsArticle 이 아니라 BlogPosting 을 쓴다. NewsArticle 은 뉴스 발행 주체를
        전제하고 Google News 정책 심사를 끌어들이는데, 매장 공지는 그 범주가 아니다. ── */
  if (route === "/notice/:id" && notice) {
    const headline = String(notice.seo_title || notice.title || "").trim().slice(0, 110);
    const datePublished = notice.published_at ?? notice.date ?? "";
    if (isReal(headline) && isReal(datePublished)) {
      /* author 가 조직명과 같으면 Organization 참조로, 다르면 Person 으로.
         둘 다 없으면 속성만 생략한다 — headline+datePublished 면 유효하다 */
      const authorName = String(notice.author ?? "").trim();
      let author = null;
      if (authorName && organization && authorName === siteName) author = orgRef;
      else if (authorName) author = { "@type": "Person", name: authorName };

      /* image 는 **공개 URL 일 때만.** 비공개 버킷의 서명 URL 은 만료가 있고
         크롤러는 로그인하지 않으므로, 넣으면 이미지 오류만 남는다 */
      const image = isReal(meta.ogImage) ? meta.ogImage : "";

      graph.push(
        compact({
          "@type": "BlogPosting",
          "@id": `${pageUrl}#article`,
          headline,
          datePublished,
          /* dateModified 는 컬럼이 없다. created_at 을 수정일로 둔갑시키지 않는다 */
          description: meta.description,
          image,
          author,
          publisher: orgRef,
          mainEntityOfPage: { "@id": webPageId },
        }),
      );
    }
  }

  return graph.length > 0 ? { "@context": "https://schema.org", "@graph": graph } : null;
}

/**
 * 사이트 단위로 한 번만 정의되는 노드의 @id 꼬리표.
 *
 * Organization 과 WebSite 는 **홈에만 전문으로 싣고** 나머지 페이지는 참조만 남기는 것이
 * 의도된 설계다(같은 조직이 페이지마다 새 노드로 잡혀 엔티티가 흩어지는 것을 막는다).
 * 그러니 이 둘을 가리키는 참조는 "같은 페이지 그래프 안에 정의가 없다" 고 해서
 * 끊긴 참조가 아니다. 검사에서 면제한다.
 */
const SITE_LEVEL_ID_SUFFIXES = ["#organization", "#website", "#logo"];

/**
 * 그래프 자체 점검 — 빌드에서 부르고, 걸리면 **빌드를 실패시킨다.**
 * 경고로 두면 아무도 안 본다.
 *
 * 두 가지를 본다:
 *   (1) 페이지 안에서 만들어진 @id 참조가 실제 노드를 가리키는가 (원칙 b).
 *       단 사이트 단위 노드(Organization/WebSite/로고)는 홈에서 정의되므로 면제한다.
 *   (2) 자리표시자 문자열이 결과에 남아 있지 않은가 (원칙 c).
 *       **문자열 값만 검사한다.** JSON 전체를 문자열로 만들어 훑으면 30,000원 같은
 *       정상 가격의 `30000` 이 `0{4,}` 패턴에 걸려 멀쩡한 빌드를 깨뜨린다.
 *
 * @param {object|null} graph - buildJsonLd 결과
 * @returns {string[]} 문제 목록. 비어 있으면 통과
 */
export function validateJsonLd(graph) {
  const problems = [];
  if (!graph) return problems;

  const defined = new Set();
  const referenced = [];
  /** 자리표시자 검사에서 뺄 키 — URL 은 도메인·경로에 0 이 이어질 수 있다 */
  const skipKeys = new Set(["@id", "@context", "url", "item", "sameAs", "mainEntityOfPage"]);

  const walk = (node, key) => {
    if (Array.isArray(node)) return node.forEach((v) => walk(v, key));
    if (typeof node === "string") {
      if (!skipKeys.has(key) && !isReal(node)) {
        problems.push(`자리표시자가 그래프에 남아 있다: ${key} = ${node}`);
      }
      return;
    }
    if (!node || typeof node !== "object") return;
    /* 키가 @id 하나뿐이면 참조, 그 외 속성이 함께 있으면 정의다 */
    if (node["@id"]) {
      if (Object.keys(node).length > 1) defined.add(node["@id"]);
      else referenced.push(node["@id"]);
    }
    for (const [k, v] of Object.entries(node)) walk(v, k);
  };
  walk(graph["@graph"], "");

  for (const ref of referenced) {
    if (defined.has(ref)) continue;
    if (SITE_LEVEL_ID_SUFFIXES.some((s) => ref.endsWith(s))) continue;
    problems.push(`끊긴 @id 참조: ${ref}`);
  }
  return problems;
}

/* ============================================================
 * 5. 내부링크
 * ============================================================ */

/**
 * 이 라우트에서 걸어야 할 관련 링크를 클러스터 지도에서 뽑는다.
 *
 * 링크는 **필러로 모으는 것** 이 목적이다. 그래서 순서가 정해져 있다 —
 *   (1) 같은 클러스터의 필러(자기 자신이면 건너뛴다)
 *   (2) 같은 클러스터의 나머지 형제 페이지
 *   (3) 다른 클러스터의 필러 (허브 성격의 홈, 또는 의도가 다른 방문자를 위한 통로)
 * 자기 자신은 언제나 빠진다.
 *
 * @param {string} routePath
 * @param {number} [limit] - 최대 개수. 기본 4
 * @returns {{ path: string, label: string, kind: "pillar"|"sibling"|"cross" }[]}
 */
export function internalLinksFor(routePath, limit = 4) {
  const route = normalizeRoute(routePath);
  const own = CLUSTERS.find((c) => c.routes.includes(route)) ?? null;
  const out = [];
  const seen = new Set([route]);

  const push = (path, kind) => {
    if (!path || seen.has(path)) return;
    /* 템플릿 경로(:id)는 링크로 걸 수 없다 — 실제 주소가 아니다 */
    if (path.includes(":")) return;
    const label = ROUTE_LABELS[path];
    if (!label) return;
    seen.add(path);
    out.push({ path, label, kind });
  };

  if (own) {
    push(own.pillarRoute, "pillar");
    for (const r of own.routes) push(r, "sibling");
  }
  /* 홈은 어느 클러스터에도 속하지 않는 허브라 세 필러를 모두 가리킨다 */
  for (const c of CLUSTERS) {
    if (c === own) continue;
    push(c.pillarRoute, "cross");
  }
  return out.slice(0, limit);
}
