import { describe, it, expect } from "vitest";

import {
  SITE,
  ROUTES,
  ROUTE_LABELS,
  PRERENDER_ROUTES,
  CLUSTERS,
  MENU_SECTIONS,
  WINE_LIST,
  findRouteMeta,
  findCluster,
} from "../seoData.js";
import { resolveMeta, normalizeRoute } from "../seo.js";

/**
 * seoData.js 는 코드가 아니라 **표**다. 그래서 함수처럼 테스트할 것이 없고,
 * 대신 표가 지켜야 하는 불변식을 검사한다.
 *
 * 이 표는 사람이 손으로 고치는 자리라(라우트 추가·문구 수정) 규칙이 조용히
 * 깨지기 쉽다. 설명이 길어져 잘리거나, 새 라우트를 클러스터에 안 넣거나,
 * 두 페이지가 같은 검색어를 놓고 싸우게 되는 식이다. 셋 다 화면에는 안 보인다.
 */

/* 검색결과 스니펫이 잘리기 시작하는 지점. 넘는다고 페널티는 없지만
   뒤가 잘리면 문장이 끊긴 채로 노출되므로 여기서는 상한으로 다룬다 */
const DESCRIPTION_MAX = 155;

/** 템플릿 라우트(:id)는 실제 값이 글에서 오므로 '표의 값' 검사에서 뺀다 */
const CONCRETE_ROUTES = Object.keys(ROUTES).filter((r) => !r.includes(":"));

describe("ROUTES — 표 자체의 불변식", () => {
  it.each(Object.keys(ROUTES))("%s 는 필수 칸을 모두 갖는다", (route) => {
    const meta = ROUTES[route];
    expect(typeof meta.title).toBe("string");
    expect(meta.title.trim()).not.toBe("");
    expect(typeof meta.description).toBe("string");
    expect(meta.description.trim()).not.toBe("");
    expect(typeof meta.primaryKeyword).toBe("string");
    expect(meta.primaryKeyword.trim()).not.toBe("");
    expect(Array.isArray(meta.keywords)).toBe(true);
    expect(Array.isArray(meta.faq)).toBe(true);
  });

  it.each(Object.keys(ROUTES))("%s 의 description 이 %i자 안에 들어온다", (route) => {
    expect(ROUTES[route].description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it("description 은 잘린 문장이 아니라 끝맺음이 있다", () => {
    for (const route of Object.keys(ROUTES)) {
      expect(ROUTES[route].description.trim(), route).toMatch(/[.。!?요다]$/);
    }
  });

  it("정적 제목이 서로 겹치지 않는다", () => {
    const titles = CONCRETE_ROUTES.map((r) => ROUTES[r].title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("최종 제목(템플릿을 거친 뒤)도 서로 겹치지 않는다", () => {
    /* 정적 제목이 달라도 브랜드 접미사를 붙인 뒤 같아질 수 있다.
       실제로 <title> 에 나가는 것은 이쪽이므로 여기까지 봐야 한다 */
    const titles = CONCRETE_ROUTES.map((r) => resolveMeta(r).title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("description 도 서로 겹치지 않는다", () => {
    const descriptions = CONCRETE_ROUTES.map((r) => ROUTES[r].description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("대표 검색어(primaryKeyword)가 겹치지 않는다 — 자기잠식 방지가 이 표의 목적이다", () => {
    const keywords = Object.values(ROUTES).map((m) => m.primaryKeyword);
    expect(new Set(keywords).size).toBe(keywords.length);
  });

  it("FAQ 는 q·a 가 모두 채워져 있다 — 반쪽짜리는 검증기에서 오류가 난다", () => {
    for (const [route, meta] of Object.entries(ROUTES)) {
      for (const f of meta.faq) {
        expect(f.q?.trim(), route).toBeTruthy();
        expect(f.a?.trim(), route).toBeTruthy();
      }
    }
  });

  it("모든 라우트에 표시명이 있다 — 없으면 브레드크럼이 통째로 사라진다", () => {
    for (const route of Object.keys(ROUTES)) {
      expect(ROUTE_LABELS[route], route).toBeTruthy();
    }
  });

  it("표시명 쪽에 ROUTES 에 없는 유령 라우트가 없다", () => {
    for (const route of Object.keys(ROUTE_LABELS)) {
      expect(ROUTES[route], route).toBeTruthy();
    }
  });

  it("라우트 키는 normalizeRoute 를 통과한 모양 그대로다", () => {
    /* 키에 끝 슬래시나 쿼리가 섞이면 resolveMeta 가 그 행을 영영 못 찾는다 */
    for (const route of Object.keys(ROUTES)) {
      expect(normalizeRoute(route)).toBe(route);
    }
  });
});

describe("PRERENDER_ROUTES", () => {
  it("전부 ROUTES 에 있는 실제 라우트다", () => {
    for (const route of PRERENDER_ROUTES) {
      expect(ROUTES[route], route).toBeTruthy();
    }
  });

  it("템플릿 경로(:id)와 /admin 은 들어 있지 않다", () => {
    /* :id 는 정적 HTML 로 뽑을 것이 없고, /admin 은 noindex 강제 대상이다 */
    for (const route of PRERENDER_ROUTES) {
      expect(route).not.toContain(":");
      expect(route.startsWith("/admin")).toBe(false);
    }
  });

  it("중복이 없다", () => {
    expect(new Set(PRERENDER_ROUTES).size).toBe(PRERENDER_ROUTES.length);
  });
});

describe("CLUSTERS — 필러와 형제", () => {
  it.each(CLUSTERS.map((c) => [c.slug, c]))(
    "%s 의 pillarRoute 가 자기 routes 안에 있다",
    (_slug, cluster) => {
      /* 필러가 자기 목록 밖에 있으면 internalLinksFor 가 형제를 필러로 못 모은다 */
      expect(cluster.routes).toContain(cluster.pillarRoute);
    },
  );

  it("클러스터의 모든 라우트가 ROUTES 에 실재한다", () => {
    for (const cluster of CLUSTERS) {
      for (const route of cluster.routes) {
        expect(ROUTES[route], `${cluster.slug} → ${route}`).toBeTruthy();
      }
    }
  });

  it("한 라우트가 두 클러스터에 겹쳐 들지 않는다", () => {
    const seen = new Map();
    for (const cluster of CLUSTERS) {
      for (const route of cluster.routes) {
        expect(seen.has(route), `${route} 가 ${seen.get(route)} 와 ${cluster.slug} 에 중복`).toBe(
          false,
        );
        seen.set(route, cluster.slug);
      }
    }
  });

  it("slug 가 겹치지 않는다", () => {
    const slugs = CLUSTERS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("홈은 어느 클러스터에도 속하지 않는다 — 허브이지 구성원이 아니다", () => {
    for (const cluster of CLUSTERS) {
      expect(cluster.routes).not.toContain("/");
    }
    expect(findCluster("/")).toBeNull();
  });

  it("홈을 뺀 모든 라우트가 어느 한 클러스터에는 속한다", () => {
    /* 어디에도 없는 페이지는 내부링크를 한 줄도 못 받는 고아가 된다 */
    for (const route of Object.keys(ROUTES)) {
      if (route === "/") continue;
      expect(findCluster(route), route).toBeTruthy();
    }
  });
});

describe("SITE — NAP 은 비어 있어야 한다", () => {
  it("전화·주소·사업자번호가 비어 있다 (자리표시자를 채워 넣지 않는다)", () => {
    /* 값이 들어오는 것 자체는 언젠가 옳지만, 그때는 **진짜 값**이어야 한다.
       지금 이 검사가 지키는 것은 "누가 010-1234-5678 을 도로 적어 넣는" 회귀다.
       실제 값을 채우게 되면 이 테스트를 지우는 것이 정상적인 다음 단계다 */
    for (const key of ["phone", "street", "locality", "region", "postalCode", "country", "bizNumber"]) {
      expect(SITE.org[key], key).toBe("");
    }
    expect(SITE.org.openingHours).toEqual([]);
  });

  it("siteUrl 에 끝 슬래시가 없다 — 있으면 base 가 한 번 더 붙는다", () => {
    expect(SITE.siteUrl.endsWith("/")).toBe(false);
    expect(SITE.siteUrl).toMatch(/^https:\/\//);
  });

  it("titleTemplate 에 %s 자리가 있다", () => {
    expect(SITE.titleTemplate).toContain("%s");
  });

  it("sameAs 는 전부 http(s) 절대 주소다", () => {
    for (const url of SITE.sameAs) {
      expect(url).toMatch(/^https?:\/\//);
    }
  });

  it("logoPath 가 비어 있다 — 없는 파일을 가리키느니 생략한다", () => {
    expect(SITE.logoPath).toBe("");
  });
});

describe("메뉴·와인 원본", () => {
  it("모든 메뉴 항목에 이름이 있고 가격은 숫자이거나 null 이다", () => {
    for (const section of MENU_SECTIONS) {
      expect(section.name.trim()).not.toBe("");
      expect(section.items.length).toBeGreaterThan(0);
      for (const item of section.items) {
        expect(item.name.trim(), item.name).not.toBe("");
        /* 문자열 "30000" 으로 적으면 isReal 의 /0{4,}/ 에 걸려 항목이 사라진다 */
        expect(item.price === null || typeof item.price === "number", item.name).toBe(true);
        if (typeof item.price === "number") expect(item.price).toBeGreaterThan(0);
      }
    }
  });

  it("메뉴 이름이 섹션을 넘어 중복되지 않는다", () => {
    const names = MENU_SECTIONS.flatMap((s) => s.items.map((i) => i.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it("와인도 이름이 있고 가격이 숫자다", () => {
    for (const wine of WINE_LIST) {
      expect(wine.name.trim()).not.toBe("");
      expect(typeof wine.price).toBe("number");
    }
    const names = WINE_LIST.map((w) => w.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("조회 도우미", () => {
  it("findRouteMeta 는 정확한 키만 찾는다", () => {
    expect(findRouteMeta("/menu")).toBe(ROUTES["/menu"]);
    /* 실제 id 가 붙은 경로는 normalizeRoute 를 먼저 거쳐야 한다 */
    expect(findRouteMeta("/notice/12")).toBeNull();
    expect(findRouteMeta(normalizeRoute("/notice/12"))).toBe(ROUTES["/notice/:id"]);
    expect(findRouteMeta("")).toBeNull();
  });

  it("findCluster 는 형제 라우트에서도 같은 클러스터를 준다", () => {
    expect(findCluster("/menu").slug).toBe("gopchang-dining");
    expect(findCluster("/wine").slug).toBe("gopchang-dining");
    expect(findCluster("/notice/:id").slug).toBe("store-visit");
    expect(findCluster("/nope")).toBeNull();
  });
});
