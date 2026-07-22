import { describe, it, expect } from "vitest";

import { buildJsonLd, validateJsonLd } from "../seo.js";
import { SITE, MENU_SECTIONS, WINE_LIST } from "../seoData.js";

/**
 * JSON-LD 그래프 — 모양 · @id 연결 · **NAP 생략 규칙**.
 *
 * 이 파일에서 제일 중요한 것은 아래 "NAP 생략" 블록이다.
 * 자리표시자 전화(010-1234-5678)·주소(0000빌딩)가 스키마로 나가면 구조화 데이터
 * 스팸이고 구글 수동 조치 사유다. 그런데 그 회귀는 **화면에 아무 표시가 안 난다** —
 * 사람이 볼 수 있는 것은 몇 주 뒤 서치콘솔의 경고뿐이다.
 * 그래서 사람이 못 잡는 이 계약만큼은 테스트가 대신 잡는다.
 */

const BASE = "/apgujeong-main/";
const SITE_ROOT = SITE.siteUrl; // "https://msshin99.github.io/apgujeong-main"

/** 그래프 전체를 훑어 조건에 맞는 노드를 모은다 */
function nodesOfType(graph, type) {
  const found = [];
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    if (n["@type"] === type) found.push(n);
    Object.values(n).forEach(walk);
  };
  walk(graph?.["@graph"] ?? []);
  return found;
}

/** 그래프 어딘가에 이 키가 있는가 */
function hasKeyAnywhere(graph, key) {
  let hit = false;
  const walk = (n) => {
    if (hit) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    if (key in n) {
      hit = true;
      return;
    }
    Object.values(n).forEach(walk);
  };
  walk(graph?.["@graph"] ?? []);
  return hit;
}

/* 자리표시자를 잔뜩 채운 관리자 입력. 하나도 통과하면 안 된다 */
const PLACEHOLDER_SETTINGS = {
  org_phone: "010-1234-5678",
  org_street: "0000빌딩 1층",
  org_locality: "강남구",
  org_region: "서울특별시",
  org_postal_code: "06010",
  org_country: "KR",
  org_biz_number: "000-00-00000",
  org_email: "owner@example.com",
  org_price_range: "미정",
};

/* 실제 값이 채워졌을 때의 모습. 생략 규칙이 '값 기반' 인지 확인하는 대조군 */
const REAL_SETTINGS = {
  org_phone: "+82-2-540-9070",
  org_street: "압구정로42길 25-8 1층",
  org_locality: "강남구",
  org_region: "서울특별시",
  org_postal_code: "06010",
  org_country: "KR",
};

const PLACEHOLDER_STORE = {
  id: "apgujeong",
  name: "압구정지점",
  phone: "010-1234-5678",
  street: "0000빌딩 1층",
  locality: "강남구",
  region: "서울특별시",
  postalCode: "06010",
  country: "KR",
};

const REAL_STORE = {
  id: "apgujeong",
  name: "압구정지점",
  phone: "+82-2-540-9070",
  street: "압구정로42길 25-8 1층",
  locality: "강남구",
  region: "서울특별시",
  postalCode: "06010",
  country: "KR",
  openingHours: [{ days: ["Mo", "Tu", "We", "Th", "Fr"], opens: "17:00", closes: "23:00" }],
};

/* ============================================================
 * NAP 생략 — 이 파일의 존재 이유
 * ============================================================ */

describe("NAP 생략 규칙 — 없는/가짜 사업자 정보는 절대 색인되지 않는다", () => {
  it("기본 상태(SITE.org 가 전부 빈 문자열)에서 주소·전화 노드가 하나도 없다", () => {
    for (const route of ["/", "/brand", "/menu", "/stores", "/contact"]) {
      const graph = buildJsonLd(route, { base: BASE, stores: [PLACEHOLDER_STORE] });
      expect(nodesOfType(graph, "PostalAddress"), route).toHaveLength(0);
      expect(nodesOfType(graph, "Restaurant"), route).toHaveLength(0);
      expect(nodesOfType(graph, "LocalBusiness"), route).toHaveLength(0);
      expect(hasKeyAnywhere(graph, "telephone"), route).toBe(false);
      expect(hasKeyAnywhere(graph, "address"), route).toBe(false);
    }
  });

  it("관리자가 자리표시자를 저장해도 스키마로 나가지 않는다", () => {
    const graph = buildJsonLd("/", {
      base: BASE,
      dbSettings: PLACEHOLDER_SETTINGS,
      stores: [PLACEHOLDER_STORE],
    });
    const json = JSON.stringify(graph);
    expect(json).not.toContain("1234-5678");
    expect(json).not.toContain("0000");
    expect(json).not.toContain("example.com");
    expect(json).not.toContain("미정");
    expect(hasKeyAnywhere(graph, "telephone")).toBe(false);
    expect(nodesOfType(graph, "PostalAddress")).toHaveLength(0);
    expect(nodesOfType(graph, "Restaurant")).toHaveLength(0);
  });

  it("주소 다섯 칸 중 하나만 자리표시자여도 PostalAddress 를 통째로 뺀다", () => {
    const graph = buildJsonLd("/", {
      base: BASE,
      dbSettings: { ...REAL_SETTINGS, org_street: "0000빌딩 1층" },
    });
    expect(nodesOfType(graph, "PostalAddress")).toHaveLength(0);
    /* 전화는 진짜였으므로 그것만은 남는다 — 블록 단위 판정이 각각 독립인지 확인 */
    const org = nodesOfType(graph, "Organization")[0];
    expect(org.telephone).toBe("+82-2-540-9070");
  });

  it("전화가 자리표시자면 telephone 만 빠지고 나머지는 유지된다", () => {
    const graph = buildJsonLd("/", {
      base: BASE,
      dbSettings: { ...REAL_SETTINGS, org_phone: "010-1234-5678" },
    });
    const org = nodesOfType(graph, "Organization")[0];
    expect(org.telephone).toBeUndefined();
    expect(org.address["@type"]).toBe("PostalAddress");
  });

  it("진짜 값을 넣으면 규칙이 켜진다 — 생략은 값 기반이지 하드코딩이 아니다", () => {
    const graph = buildJsonLd("/", { base: BASE, dbSettings: REAL_SETTINGS });
    const org = nodesOfType(graph, "Organization")[0];
    expect(org.telephone).toBe("+82-2-540-9070");
    expect(org.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: "압구정로42길 25-8 1층",
      addressLocality: "강남구",
      addressRegion: "서울특별시",
      postalCode: "06010",
      addressCountry: "KR",
    });
  });

  it("지점은 이름+전화+완전한 주소가 모두 진짜일 때만 Restaurant 이 된다", () => {
    const none = buildJsonLd("/stores", { base: BASE, stores: [PLACEHOLDER_STORE] });
    expect(nodesOfType(none, "Restaurant")).toHaveLength(0);
    /* 지점이 하나도 안 남으면 ItemList 도 통째로 생략된다 —
       이름만 나열한 목록은 주소 없는 점포를 실체로 선언하는 셈이라 */
    expect(nodesOfType(none, "ItemList")).toHaveLength(0);

    const some = buildJsonLd("/stores", {
      base: BASE,
      stores: [REAL_STORE, PLACEHOLDER_STORE],
    });
    const restaurants = nodesOfType(some, "Restaurant");
    expect(restaurants).toHaveLength(1);
    expect(restaurants[0].name).toBe("압구정지점");
    expect(restaurants[0].telephone).toBe("+82-2-540-9070");
    expect(restaurants[0]["@id"]).toBe(`${SITE_ROOT}/#restaurant-apgujeong`);
  });

  it("좌표가 없으면 geo 를 지어내지 않는다", () => {
    const graph = buildJsonLd("/stores", { base: BASE, stores: [REAL_STORE] });
    expect(nodesOfType(graph, "GeoCoordinates")).toHaveLength(0);

    const withGeo = buildJsonLd("/stores", {
      base: BASE,
      stores: [{ ...REAL_STORE, latitude: 37.5271, longitude: 127.0286 }],
    });
    expect(nodesOfType(withGeo, "GeoCoordinates")[0]).toEqual({
      "@type": "GeoCoordinates",
      latitude: 37.5271,
      longitude: 127.0286,
    });
  });

  it("별점·리뷰는 어떤 조건에서도 만들지 않는다 — 1차 데이터가 없다", () => {
    const graph = buildJsonLd("/stores", {
      base: BASE,
      stores: [{ ...REAL_STORE, aggregateRating: 4.9, review: [{ author: "누군가" }] }],
    });
    const json = JSON.stringify(graph);
    expect(json).not.toContain("aggregateRating");
    expect(json).not.toContain("AggregateRating");
    expect(json).not.toContain("\"review\"");
  });

  it("영업시간은 days/opens/closes 가 모두 있을 때만 나간다", () => {
    const broken = buildJsonLd("/stores", {
      base: BASE,
      stores: [{ ...REAL_STORE, openingHours: [{ days: ["Mo"], opens: "17:00" }] }],
    });
    expect(nodesOfType(broken, "OpeningHoursSpecification")).toHaveLength(0);

    const ok = buildJsonLd("/stores", { base: BASE, stores: [REAL_STORE] });
    expect(nodesOfType(ok, "OpeningHoursSpecification")[0]).toEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Mo", "Tu", "We", "Th", "Fr"],
      opens: "17:00",
      closes: "23:00",
    });
  });
});

/* ============================================================
 * 그래프 모양과 @id 연결
 * ============================================================ */

describe("buildJsonLd — 그래프 모양", () => {
  it("페이지마다 @graph 하나에 담아 내보낸다", () => {
    const graph = buildJsonLd("/menu", { base: BASE });
    expect(graph["@context"]).toBe("https://schema.org");
    expect(Array.isArray(graph["@graph"])).toBe(true);
  });

  it("홈에는 Organization·WebSite 를 전문으로 싣는다", () => {
    const graph = buildJsonLd("/", { base: BASE });
    const org = graph["@graph"][0];
    const site = graph["@graph"][1];
    expect(org["@type"]).toBe("Organization");
    expect(org["@id"]).toBe(`${SITE_ROOT}/#organization`);
    expect(org.name).toBe("압구정곱창");
    expect(org.url).toBe(`${SITE_ROOT}/`);
    /* NAP 이 비어 있는 동안 실효가 있는 유일한 신호 */
    expect(org.sameAs).toEqual(["https://map.naver.com/p/entry/place/37069188"]);
    expect(site["@type"]).toBe("WebSite");
    expect(site.inLanguage).toBe("ko-KR");
    expect(site.publisher).toEqual({ "@id": org["@id"] });
  });

  it("홈이 아닌 페이지는 Organization·WebSite 를 참조 한 줄로만 남긴다", () => {
    const graph = buildJsonLd("/brand", { base: BASE });
    expect(graph["@graph"][0]).toEqual({ "@id": `${SITE_ROOT}/#organization` });
    expect(graph["@graph"][1]).toEqual({ "@id": `${SITE_ROOT}/#website` });
    /* 조직 정보를 페이지마다 반복하면 값이 어긋났을 때 어느 쪽이 참인지 알 수 없다 */
    expect(nodesOfType(graph, "Organization")).toHaveLength(0);
  });

  it("WebPage 의 @type 은 라우트별 세부 타입을 따른다", () => {
    const t = (route) => nodesOfType(buildJsonLd(route, { base: BASE }), "AboutPage");
    expect(t("/brand")).toHaveLength(1);
    expect(
      buildJsonLd("/contact", { base: BASE })["@graph"].find((n) => n["@type"] === "ContactPage"),
    ).toBeTruthy();
    expect(
      buildJsonLd("/stores", { base: BASE })["@graph"].find(
        (n) => n["@type"] === "CollectionPage",
      ),
    ).toBeTruthy();
  });

  it("WebPage 의 @id·url 은 canonical 과 같은 주소를 쓴다", () => {
    const graph = buildJsonLd("/menu", { base: BASE });
    const page = graph["@graph"].find((n) => n["@type"] === "WebPage");
    expect(page.url).toBe(`${SITE_ROOT}/menu`);
    expect(page["@id"]).toBe(`${SITE_ROOT}/menu#webpage`);
    expect(page.isPartOf).toEqual({ "@id": `${SITE_ROOT}/#website` });
  });

  it("/menu 의 mainEntity 는 실제 Menu 노드를 가리킨다 (@id 연결)", () => {
    const graph = buildJsonLd("/menu", { base: BASE });
    const page = graph["@graph"].find((n) => n["@type"] === "WebPage");
    const menu = nodesOfType(graph, "Menu")[0];
    expect(menu).toBeTruthy();
    expect(page.mainEntity).toEqual({ "@id": menu["@id"] });
    expect(menu["@id"]).toBe(`${SITE_ROOT}/menu#menu`);
    expect(nodesOfType(graph, "MenuSection")).toHaveLength(MENU_SECTIONS.length);
  });

  it("값이 둘인 메뉴(맥주)는 offers 없이 이름만 남는다", () => {
    const graph = buildJsonLd("/menu", { base: BASE });
    const items = nodesOfType(graph, "MenuItem");
    const beer = items.find((i) => i.name === "맥주");
    const gopchang = items.find((i) => i.name === "한우 곱창 구이");
    expect(beer.offers).toBeUndefined();
    expect(gopchang.offers).toEqual({ "@type": "Offer", price: 30000, priceCurrency: "KRW" });
  });

  it("/wine 은 이름 있는 항목만 ItemList 로 낸다", () => {
    const graph = buildJsonLd("/wine", { base: BASE });
    const list = nodesOfType(graph, "ItemList")[0];
    expect(list.itemListElement).toHaveLength(WINE_LIST.length);
    expect(list.itemListElement[0].position).toBe(1);
    expect(list.itemListElement[3].item.offers.price).toBe(480000);
  });

  it("/stores 의 ItemList 는 실제로 정의된 Restaurant 만 가리킨다", () => {
    const graph = buildJsonLd("/stores", { base: BASE, stores: [REAL_STORE] });
    const list = nodesOfType(graph, "ItemList")[0];
    const restaurant = nodesOfType(graph, "Restaurant")[0];
    expect(list.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, item: { "@id": restaurant["@id"] } },
    ]);
    expect(validateJsonLd(graph)).toEqual([]);
  });

  it("브레드크럼은 position 이 1부터 이어지고 홈에는 없다", () => {
    expect(nodesOfType(buildJsonLd("/", { base: BASE }), "BreadcrumbList")).toHaveLength(0);
    const crumb = nodesOfType(buildJsonLd("/menu", { base: BASE }), "BreadcrumbList")[0];
    expect(crumb.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "홈", item: `${SITE_ROOT}/` },
      { "@type": "ListItem", position: 2, name: "메뉴 소개", item: `${SITE_ROOT}/menu` },
    ]);
  });

  it("FAQPage 는 페이지당 하나이고 Q·A 가 짝을 이룬다", () => {
    const graph = buildJsonLd("/", { base: BASE });
    const faqs = nodesOfType(graph, "FAQPage");
    expect(faqs).toHaveLength(1);
    expect(faqs[0]["@id"]).toBe(`${SITE_ROOT}/#faq`);
    expect(faqs[0].mainEntity).toHaveLength(4);
    expect(faqs[0].mainEntity[0].name).toBe("압구정곱창은 어떤 원육을 쓰나요?");
    expect(faqs[0].mainEntity[0].acceptedAnswer["@type"]).toBe("Answer");
  });

  it("/menu 에서도 FAQPage 가 딱 한 번만 붙는다 — Menu 와 중복 push 되지 않게", () => {
    expect(nodesOfType(buildJsonLd("/menu", { base: BASE }), "FAQPage")).toHaveLength(1);
  });

  it("FAQ 가 없는 라우트에는 FAQPage 를 만들지 않는다", () => {
    expect(nodesOfType(buildJsonLd("/notice", { base: BASE }), "FAQPage")).toHaveLength(0);
  });

  it("/notice 는 공개 글만 목록에 싣는다", () => {
    const graph = buildJsonLd("/notice", {
      base: BASE,
      notices: [
        { id: 1, title: "설 연휴 배송 안내", is_public: true },
        { id: 2, title: "비공개 초안", is_public: false },
        { id: 3, title: "", is_public: true },
      ],
    });
    const list = nodesOfType(graph, "ItemList")[0];
    expect(list.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "설 연휴 배송 안내",
        url: `${SITE_ROOT}/notice/1`,
      },
    ]);
  });

  it("공개 글이 0건이면 ItemList 자체를 만들지 않는다", () => {
    expect(nodesOfType(buildJsonLd("/notice", { base: BASE, notices: [] }), "ItemList")).toHaveLength(0);
  });

  it("공지 상세는 BlogPosting 이고 mainEntityOfPage 가 그 페이지를 가리킨다", () => {
    const notice = {
      id: 12,
      title: "설 연휴 배송 안내",
      published_at: "2026-04-22",
      author: "압구정곱창",
      body: "연휴 기간 배송이 지연될 수 있습니다.",
    };
    const graph = buildJsonLd("/notice/12", { base: BASE, notice });
    const post = nodesOfType(graph, "BlogPosting")[0];
    const page = graph["@graph"].find((n) => n["@type"] === "ItemPage");

    /* NewsArticle 이 아니라 BlogPosting 이어야 한다 — 뉴스 정책 심사를 끌어들이지 않는다 */
    expect(nodesOfType(graph, "NewsArticle")).toHaveLength(0);
    expect(post.headline).toBe("설 연휴 배송 안내");
    expect(post.datePublished).toBe("2026-04-22");
    expect(post["@id"]).toBe(`${SITE_ROOT}/notice/12#article`);
    expect(post.mainEntityOfPage).toEqual({ "@id": page["@id"] });
    /* 글쓴이가 조직명과 같으면 Person 을 새로 만들지 않고 Organization 을 참조한다 */
    expect(post.author).toEqual({ "@id": `${SITE_ROOT}/#organization` });
    /* dateModified 컬럼이 없으므로 created_at 을 수정일로 둔갑시키지 않는다 */
    expect(post.dateModified).toBeUndefined();
  });

  it("글쓴이가 조직과 다르면 Person 으로 낸다", () => {
    const graph = buildJsonLd("/notice/12", {
      base: BASE,
      notice: { id: 12, title: "새 소식", published_at: "2026-04-22", author: "김점장" },
    });
    expect(nodesOfType(graph, "BlogPosting")[0].author).toEqual({
      "@type": "Person",
      name: "김점장",
    });
  });

  it("발행일이 없으면 BlogPosting 을 만들지 않는다", () => {
    const graph = buildJsonLd("/notice/12", { base: BASE, notice: { id: 12, title: "새 소식" } });
    expect(nodesOfType(graph, "BlogPosting")).toHaveLength(0);
  });
});

/* ============================================================
 * 자기 점검
 * ============================================================ */

describe("validateJsonLd", () => {
  it("실제 라우트의 그래프는 전부 통과한다", () => {
    const routes = ["/", "/brand", "/menu", "/wine", "/stores", "/notice", "/contact"];
    for (const route of routes) {
      const graph = buildJsonLd(route, { base: BASE, stores: [REAL_STORE] });
      expect(validateJsonLd(graph), route).toEqual([]);
    }
  });

  it("30,000원 같은 정상 가격을 자리표시자로 오인하지 않는다", () => {
    /* price 는 number 라 문자열 검사에 걸리지 않는다. 여기가 깨지면 빌드가
       멀쩡한 메뉴 때문에 실패하기 시작한다 */
    const graph = buildJsonLd("/menu", { base: BASE });
    expect(JSON.stringify(graph)).toContain("30000");
    expect(validateJsonLd(graph)).toEqual([]);
  });

  it("끊긴 @id 참조를 잡는다", () => {
    const problems = validateJsonLd({
      "@graph": [
        { "@type": "WebPage", "@id": "https://a.co.kr/x#webpage", name: "x" },
        { "@type": "WebPage", "@id": "https://a.co.kr/y#webpage", about: { "@id": "https://a.co.kr/#nope" } },
      ],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("끊긴 @id 참조");
  });

  it("사이트 단위 노드(Organization/WebSite/로고) 참조는 면제한다", () => {
    /* 홈에서만 정의하고 나머지 페이지는 참조만 남기는 것이 의도된 설계다 */
    expect(
      validateJsonLd({
        "@graph": [
          { "@id": "https://a.co.kr/#organization" },
          { "@id": "https://a.co.kr/#website" },
          { "@id": "https://a.co.kr/#logo" },
        ],
      }),
    ).toEqual([]);
  });

  it("자리표시자 문자열이 남아 있으면 잡는다", () => {
    const problems = validateJsonLd({
      "@graph": [{ "@type": "Organization", "@id": "https://a.co.kr/#o", telephone: "010-1234-5678" }],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("telephone");
  });

  it("그래프가 null 이면 문제 없음으로 본다", () => {
    expect(validateJsonLd(null)).toEqual([]);
  });
});
