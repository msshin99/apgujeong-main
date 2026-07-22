import { describe, it, expect } from "vitest";

import {
  isReal,
  normalizeRoute,
  absoluteUrl,
  applyTitleTemplate,
  resolveMeta,
  buildBreadcrumb,
  internalLinksFor,
} from "../seo.js";
import { SITE, ROUTES } from "../seoData.js";

/**
 * seo.js 의 메타 계층 — 우선순위 · URL 조립 · 내부링크.
 *
 * 여기서 지키려는 것은 화면이 아니라 **눈에 안 보이는 계약**이다.
 * canonical 이 하나 어긋나거나 제목에 브랜드가 두 번 붙어도 사람 눈에는 안 띈다.
 * 색인에서 드러날 때는 이미 몇 주가 지난 뒤다.
 *
 * ⚠ 테스트용 가짜 도메인에 example.com/org/net 을 쓰면 안 된다.
 *   isReal 의 자리표시자 목록에 그 세 도메인이 들어 있어서 absoluteUrl 이
 *   빈 문자열을 돌려주고, 그러면 "URL 조립이 깨졌다" 가 아니라
 *   "자리표시자가 걸렸다" 를 검사하게 된다. 그래서 아래는 실제 형태의 가짜 도메인을 쓴다.
 */

/* GitHub Pages 프로젝트 사이트의 실제 배포 조건. 이 조합이 base 중복의 온상이다 */
const PAGES_BASE = "/apgujeong-main/";
const OTHER = "https://gopchang-test.co.kr";

describe("isReal — 자리표시자 판정", () => {
  it("실제 값은 통과한다", () => {
    expect(isReal("압구정곱창")).toBe(true);
    expect(isReal("+82-2-540-9070")).toBe(true);
    expect(isReal(30000)).toBe(true);
    expect(isReal(["a"])).toBe(true);
  });

  it("빈 값·공백뿐인 값은 없는 값이다", () => {
    expect(isReal("")).toBe(false);
    expect(isReal("   ")).toBe(false);
    expect(isReal(null)).toBe(false);
    expect(isReal(undefined)).toBe(false);
    expect(isReal([])).toBe(false);
    expect(isReal(NaN)).toBe(false);
  });

  it("알려진 자리표시자 패턴을 잡는다 — 이 목록이 NAP 생략의 근거다", () => {
    expect(isReal("010-1234-5678")).toBe(false);
    expect(isReal("01012345678")).toBe(false);
    expect(isReal("0000빌딩 1층")).toBe(false);
    expect(isReal("000-00-00000")).toBe(false);
    expect(isReal("XXXX")).toBe(false);
    expect(isReal("test@example.com")).toBe(false);
    expect(isReal("미정")).toBe(false);
    expect(isReal("준비 중")).toBe(false);
    expect(isReal("TBD")).toBe(false);
  });

  it("가격은 **숫자로** 다뤄야 한다 — 문자열 \"30000\" 은 자리표시자로 걸린다", () => {
    /* 30000 을 문자열로 적으면 뒤의 0 네 개가 /0{4,}/ 에 걸려 메뉴 항목이 통째로
       사라진다. 그래서 seoData 의 price 는 number 이고, validateJsonLd 도
       "문자열 값만" 훑는다. 두 사실이 같은 이유에서 나온 것임을 못 박아 둔다 */
    expect(isReal("30000")).toBe(false);
    expect(isReal(30000)).toBe(true);
    expect(isReal(480000)).toBe(true);
  });
});

describe("normalizeRoute", () => {
  it("끝 슬래시·쿼리·해시를 털어 ROUTES 키로 맞춘다", () => {
    expect(normalizeRoute("/menu/")).toBe("/menu");
    expect(normalizeRoute("/menu?utm_source=x")).toBe("/menu");
    expect(normalizeRoute("/menu#top")).toBe("/menu");
    expect(normalizeRoute("menu")).toBe("/menu");
    expect(normalizeRoute("/")).toBe("/");
    expect(normalizeRoute("")).toBe("/");
  });

  it("공지 상세는 id 가 무엇이든 템플릿 키 하나로 모인다", () => {
    expect(normalizeRoute("/notice/12")).toBe("/notice/:id");
    expect(normalizeRoute("/notice/12/")).toBe("/notice/:id");
    expect(normalizeRoute("/notice/abc")).toBe("/notice/:id");
  });

  it("모르는 경로는 정리만 하고 그대로 돌려준다", () => {
    expect(normalizeRoute("/nope/")).toBe("/nope");
  });
});

describe("absoluteUrl — GitHub Pages base 아래에서", () => {
  it("origin 이 이미 base 로 끝나면 base 를 다시 붙이지 않는다", () => {
    /* SITE.siteUrl 이 base 를 포함하고 있는 것이 지금 배포의 실제 모양이다.
       중복 판정이 깨지면 /apgujeong-main/apgujeong-main/menu 가 되고,
       그 canonical 은 404 를 가리킨다 */
    expect(absoluteUrl("/menu", SITE.siteUrl, PAGES_BASE)).toBe(
      "https://msshin99.github.io/apgujeong-main/menu",
    );
  });

  it("origin 에 base 가 없으면 정확히 한 번 붙인다", () => {
    expect(absoluteUrl("/menu", OTHER, PAGES_BASE)).toBe(
      "https://gopchang-test.co.kr/apgujeong-main/menu",
    );
  });

  it("슬래시가 어디에 몇 개 있든 결과에 // 가 남지 않는다", () => {
    const cases = [
      absoluteUrl("menu", OTHER + "/", "apgujeong-main"),
      /* 주의 — 여기 "//menu" 를 넣으면 안 된다. 앞의 // 는 프로토콜 상대 주소로 읽혀
         그대로 반환된다(바로 아래 '이미 절대 주소' 규칙). 사이트 내부 경로가 아니다 */
      absoluteUrl("/menu", OTHER + "///", "///apgujeong-main///"),
      absoluteUrl("/menu/", OTHER, "/apgujeong-main/"),
    ];
    for (const url of cases) {
      expect(url).toBe("https://gopchang-test.co.kr/apgujeong-main/menu");
      expect(url.slice("https://".length)).not.toContain("//");
    }
  });

  it("루트만 끝 슬래시를 남긴다 — canonical 중복을 만들지 않기 위해", () => {
    expect(absoluteUrl("/", OTHER, "/")).toBe(OTHER + "/");
    expect(absoluteUrl("/menu", OTHER, "/")).toBe(OTHER + "/menu");
    expect(absoluteUrl("/", SITE.siteUrl, PAGES_BASE)).toBe(
      "https://msshin99.github.io/apgujeong-main/",
    );
  });

  it("origin 이 없으면 빈 문자열 — 상대 canonical 을 지어내지 않는다", () => {
    expect(absoluteUrl("/menu", "", "/")).toBe("");
    expect(absoluteUrl("/menu", undefined, PAGES_BASE)).toBe("");
  });

  it("이미 절대 주소인 값은 손대지 않는다", () => {
    expect(absoluteUrl("https://cdn.test.co.kr/a.png", SITE.siteUrl, PAGES_BASE)).toBe(
      "https://cdn.test.co.kr/a.png",
    );
    expect(absoluteUrl("//cdn.test.co.kr/a.png", SITE.siteUrl, PAGES_BASE)).toBe(
      "//cdn.test.co.kr/a.png",
    );
  });
});

describe("applyTitleTemplate — 브랜드 접미사가 두 번 붙지 않는다", () => {
  const T = SITE.titleTemplate;
  const N = SITE.siteName;

  it("접미사가 없으면 붙인다", () => {
    expect(applyTitleTemplate("메뉴 소개", T, N)).toBe("메뉴 소개 | 압구정곱창");
  });

  it("관리자가 완성된 제목을 저장해도 다시 붙이지 않는다", () => {
    expect(applyTitleTemplate("메뉴 소개 | 압구정곱창", T, N)).toBe("메뉴 소개 | 압구정곱창");
  });

  it("공백이 달라도 같은 브랜드로 본다", () => {
    expect(applyTitleTemplate("메뉴 소개 | 압구정 곱창", T, N)).toBe("메뉴 소개 | 압구정 곱창");
  });

  it("제목이 비면 빈 문자열 — 접미사만 남은 제목을 만들지 않는다", () => {
    expect(applyTitleTemplate("", T, N)).toBe("");
    expect(applyTitleTemplate("   ", T, N)).toBe("");
  });

  it("%s 가 없는 템플릿은 제목을 그대로 둔다", () => {
    expect(applyTitleTemplate("메뉴 소개", "압구정곱창", N)).toBe("메뉴 소개");
  });
});

describe("resolveMeta — DB override → 정적 ROUTES → SITE 기본값", () => {
  it("아무것도 안 주면 정적 ROUTES 를 쓴다", () => {
    const meta = resolveMeta("/menu");
    expect(meta.route).toBe("/menu");
    expect(meta.title).toBe("메뉴 소개 | 압구정곱창");
    expect(meta.description).toBe(ROUTES["/menu"].description);
    expect(meta.schemaType).toBe("WebPage");
    expect(meta.ogType).toBe("website");
    expect(meta.primaryKeyword).toBe("한우 곱창");
  });

  it("dbPage 가 정적 값을 이긴다", () => {
    const meta = resolveMeta("/menu", {
      dbPage: { title: "봄 메뉴", description: "봄 한정 메뉴 안내입니다." },
    });
    expect(meta.title).toBe("봄 메뉴 | 압구정곱창");
    expect(meta.description).toBe("봄 한정 메뉴 안내입니다.");
  });

  it("dbPage 의 빈 칸은 이기지 못한다 — 비워 저장한 것이 '지우라'는 뜻은 아니다", () => {
    const meta = resolveMeta("/menu", { dbPage: { title: "   ", description: "" } });
    expect(meta.title).toBe("메뉴 소개 | 압구정곱창");
    expect(meta.description).toBe(ROUTES["/menu"].description);
  });

  it("공지 상세는 글이 dbPage 보다도 먼저다", () => {
    const meta = resolveMeta("/notice/12", {
      dbPage: { title: "DB 페이지 제목" },
      notice: { id: 12, title: "설 연휴 배송 안내" },
    });
    expect(meta.title).toBe("설 연휴 배송 안내 | 압구정곱창");
    expect(meta.ogType).toBe("article");
    expect(meta.schemaType).toBe("ItemPage");
  });

  it("공지에 seo_description 이 없으면 본문 첫 문단을 요약으로 쓴다", () => {
    const meta = resolveMeta("/notice/12", {
      notice: { id: 12, title: "임시 휴무 안내", body: ["첫   문단입니다.\n둘째 줄.", "둘째 문단"] },
    });
    expect(meta.description).toBe("첫 문단입니다. 둘째 줄.");
  });

  it("긴 본문은 157자에서 잘리고 말줄임표가 붙는다", () => {
    const long = "가".repeat(300);
    const meta = resolveMeta("/notice/12", { notice: { id: 12, title: "긴 글", body: long } });
    expect(meta.description).toHaveLength(158);
    expect(meta.description.endsWith("…")).toBe(true);
  });

  it("모르는 라우트는 SITE 기본값으로 떨어지고, 그때도 브랜드가 겹치지 않는다", () => {
    const meta = resolveMeta("/nope");
    /* SITE.defaultTitle 에 이미 '압구정곱창' 이 들어 있으므로 템플릿을 타면 안 된다 */
    expect(meta.title).toBe(SITE.defaultTitle);
    expect(meta.title.match(/압구정곱창/g)).toHaveLength(1);
    expect(meta.description).toBe(SITE.defaultDescription);
    expect(meta.schemaType).toBe("WebPage");
  });

  it("홈은 템플릿을 거치지 않는다", () => {
    const meta = resolveMeta("/");
    expect(meta.title).toBe(ROUTES["/"].title);
    expect(meta.title).not.toContain(" | 압구정곱창");
  });

  it("dbSettings 가 브랜드명과 템플릿을 갈아치울 수 있다", () => {
    const meta = resolveMeta("/menu", {
      dbSettings: { site_name: "곱창하우스", title_template: "%s - 곱창하우스" },
    });
    expect(meta.title).toBe("메뉴 소개 - 곱창하우스");
    expect(meta.siteName).toBe("곱창하우스");
  });

  it("canonical 은 base 를 포함해 정확히 한 번 조립된다", () => {
    expect(resolveMeta("/menu", { base: PAGES_BASE }).canonical).toBe(
      "https://msshin99.github.io/apgujeong-main/menu",
    );
    expect(resolveMeta("/", { base: PAGES_BASE }).canonical).toBe(
      "https://msshin99.github.io/apgujeong-main/",
    );
  });

  it("공지 상세 canonical 은 템플릿이 아니라 실제 id 를 쓴다", () => {
    const meta = resolveMeta("/notice/12", { notice: { id: 12, title: "임시 휴무 안내" } });
    expect(meta.canonical).toBe("https://msshin99.github.io/apgujeong-main/notice/12");
    expect(meta.canonical).not.toContain(":id");
  });

  it("dbPage 의 canonical_url 은 조립을 건너뛰고 그대로 이긴다", () => {
    const meta = resolveMeta("/menu", { dbPage: { canonical_url: OTHER + "/menu" } });
    expect(meta.canonical).toBe("https://gopchang-test.co.kr/menu");
  });

  it("robots 는 boolean 두 칸에서 조립된다 — 자유 입력 오타로 색인이 빠지지 않게", () => {
    expect(resolveMeta("/menu").robots).toBe("index,follow");
    expect(resolveMeta("/menu", { dbPage: { robots_index: false } }).robots).toBe(
      "noindex,follow",
    );
    expect(
      resolveMeta("/menu", { dbPage: { robots_index: false, robots_follow: false } }).robots,
    ).toBe("noindex,nofollow");
    expect(
      resolveMeta("/menu", { dbPage: { robots_extra: ["max-snippet:-1", ""] } }).robots,
    ).toBe("index,follow,max-snippet:-1");
  });

  it("og:image 도 base 를 거쳐 절대 URL 이 된다", () => {
    const meta = resolveMeta("/menu", { base: PAGES_BASE });
    expect(meta.ogImage).toBe("https://msshin99.github.io/apgujeong-main" + SITE.defaultOgPath);
  });

  it("반쪽짜리 FAQ 는 버린다 — 검증기에서 오류가 나기 때문", () => {
    const meta = resolveMeta("/menu", {
      dbPage: { faq: [{ q: "질문만", a: "" }, { q: "", a: "답만" }, { q: "정상", a: "답" }] },
    });
    expect(meta.faq).toEqual([{ q: "정상", a: "답" }]);
  });
});

describe("buildBreadcrumb", () => {
  it("홈은 브레드크럼을 내보내지 않는다", () => {
    expect(buildBreadcrumb("/")).toEqual([]);
  });

  it("일반 페이지는 홈 > 페이지 2단", () => {
    const trail = buildBreadcrumb("/menu", { origin: SITE.siteUrl, base: PAGES_BASE });
    expect(trail.map((t) => t.name)).toEqual(["홈", "메뉴 소개"]);
    expect(trail.map((t) => t.url)).toEqual([
      "https://msshin99.github.io/apgujeong-main/",
      "https://msshin99.github.io/apgujeong-main/menu",
    ]);
  });

  it("공지 상세는 글 제목까지 3단", () => {
    const trail = buildBreadcrumb("/notice/12", {
      origin: SITE.siteUrl,
      base: PAGES_BASE,
      notice: { id: 12, title: "임시 휴무 안내" },
    });
    expect(trail.map((t) => t.name)).toEqual(["홈", "공지사항", "임시 휴무 안내"]);
    expect(trail[2].url).toBe("https://msshin99.github.io/apgujeong-main/notice/12");
  });

  it("글 제목을 모르면 2단으로 줄어든다", () => {
    const trail = buildBreadcrumb("/notice/12", { origin: SITE.siteUrl });
    expect(trail.map((t) => t.name)).toEqual(["홈", "공지사항"]);
  });

  it("표시명이 없는 라우트는 브레드크럼을 만들지 않는다", () => {
    expect(buildBreadcrumb("/nope")).toEqual([]);
  });
});

describe("internalLinksFor — 클러스터 형제와 필러", () => {
  it("필러 페이지는 자기 자신을 링크하지 않고 형제 + 다른 필러를 건다", () => {
    /* /menu 는 '곱창 미식' 클러스터의 필러다 */
    expect(internalLinksFor("/menu")).toEqual([
      { path: "/wine", label: "와인 리스트", kind: "sibling" },
      { path: "/stores", label: "지점 찾기", kind: "cross" },
      { path: "/brand", label: "브랜드 소개", kind: "cross" },
    ]);
  });

  it("형제 페이지는 자기 클러스터의 필러를 가장 먼저 가리킨다", () => {
    const links = internalLinksFor("/wine");
    expect(links[0]).toEqual({ path: "/menu", label: "메뉴 소개", kind: "pillar" });
    expect(links.map((l) => l.path)).toEqual(["/menu", "/stores", "/brand"]);
  });

  it("홈은 어느 클러스터에도 속하지 않고 세 필러를 모두 가리킨다", () => {
    expect(internalLinksFor("/")).toEqual([
      { path: "/menu", label: "메뉴 소개", kind: "cross" },
      { path: "/stores", label: "지점 찾기", kind: "cross" },
      { path: "/brand", label: "브랜드 소개", kind: "cross" },
    ]);
  });

  it("템플릿 경로(:id)는 절대 링크로 나가지 않는다 — 실제 주소가 아니다", () => {
    const links = internalLinksFor("/notice/12");
    expect(links.map((l) => l.path)).toEqual(["/stores", "/notice", "/menu", "/brand"]);
    expect(links.every((l) => !l.path.includes(":"))).toBe(true);
  });

  it("limit 을 지킨다", () => {
    expect(internalLinksFor("/notice/12", 2)).toHaveLength(2);
    expect(internalLinksFor("/menu", 1)).toHaveLength(1);
  });

  it("어떤 라우트에서도 자기 자신은 빠지고 같은 곳을 두 번 걸지 않는다", () => {
    for (const route of Object.keys(ROUTES)) {
      const links = internalLinksFor(route, 10);
      expect(links.map((l) => l.path)).not.toContain(route);
      expect(new Set(links.map((l) => l.path)).size).toBe(links.length);
    }
  });
});
