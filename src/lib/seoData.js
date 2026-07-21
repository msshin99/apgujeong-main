/**
 * SEO 정적 원본 — 사이트 전역 설정 · 라우트별 메타 · 토픽 클러스터.
 *
 * 왜 이 파일이 따로 있나:
 *   공지사항이 `src/pages/noticeData.js` 를 예비 데이터로 두고 Supabase 가 없거나
 *   실패해도 화면이 비지 않게 만든 것과 똑같은 계약이다.
 *   메타 정보는 Supabase 의 `seo_settings` / `seo_pages` 에서 오는 것이 원칙이지만,
 *   빌드 시점에 DB 가 비어 있거나(초기 배포) 환경변수가 없으면 head 가 통째로 비어 버린다.
 *   그러면 프리렌더 결과물이 무의미해지므로, **DB 가 없어도 항상 참인 값** 을 여기에 둔다.
 *
 * 우선순위는 seo.js 의 resolveMeta 가 정한다 —  DB override → 이 파일 → SITE 기본값.
 *
 * 이 파일의 규칙:
 *   1) 브라우저 API 를 쓰지 않는다. Node 빌드 스크립트가 그대로 import 한다.
 *   2) `asset()` 을 부르지 않는다. asset.js 는 모듈 최상단에서 `import.meta.env.BASE_URL`
 *      을 읽어 순수 Node 에서 TypeError 로 죽는다. 경로는 "/" 로 시작하는 원본 그대로 두고,
 *      base 붙이기는 seo.js 의 absoluteUrl() 이 인자로 받은 base 로 처리한다.
 *   3) **없는 값은 지어내지 않는다.** 지금 사이트의 전화·주소는 자리표시자
 *      (010-1234-5678 / 0000빌딩)라 실제 정보가 아니다. 빈 문자열로 두면
 *      seo.js 의 생략 규칙이 해당 스키마 블록을 통째로 빼 준다.
 */

/**
 * 사이트 전역 기본값.
 *
 * NAP(상호·주소·전화·영업시간) 칸은 **일부러 비워 둔다.**
 * 자리표시자 전화번호나 "0000빌딩" 이 JSON-LD 로 나가면 구조화 데이터 스팸이고,
 * 구글 수동 조치 사유다. 리치 결과가 안 나오는 손해보다 수동 조치가 훨씬 비싸다.
 *
 * 값이 들어오면 스키마가 자동으로 켜진다 — seo.js 는 "값이 있으면 넣고 없으면 블록째 생략"
 * 규칙으로만 짜여 있어서, 여기(또는 DB 의 seo_settings)에 주소 다섯 칸과 전화를 채우고
 * 다시 빌드하면 Organization 의 address/telephone, /stores 의 Restaurant 노드와 ItemList,
 * 홈의 Restaurant, openingHoursSpecification 이 코드 수정 없이 한꺼번에 살아난다.
 * 즉 이 생략 규칙 자체가 미래의 마이그레이션이다.
 *
 * @type {{
 *   siteName: string, siteUrl: string, titleTemplate: string,
 *   defaultTitle: string, defaultDescription: string, locale: string,
 *   defaultOgPath: string, logoPath: string, robotsDefault: string,
 *   org: Record<string, any>, sameAs: string[]
 * }}
 */
export const SITE = {
  /** 국문 브랜드 표기. 영문 워드마크는 'Apgujeong' 이지만 검색어는 국문이 압도적이다 */
  siteName: "압구정곱창",

  /**
   * ⚠ canonical 의 기준 origin — **이 한 줄이 SEO 전체의 전원 스위치다.**
   *
   * 이 값이 비면(그리고 SITE_ORIGIN 환경변수도, seo_settings.site_url 도 비면)
   * 다음이 **전부 꺼진다.** 마크업이 조금 부실해지는 정도가 아니라 아예 안 나간다:
   *   - canonical, og:url  (seo.js 의 absoluteUrl 이 빈 문자열을 돌려준다)
   *   - JSON-LD **그래프 통째로** (buildJsonLd 가 첫머리에서 null 을 반환한다 —
   *     origin 이 없으면 @id 를 못 만들고, 상대 @id 로는 노드끼리 못 잇기 때문)
   *   - sitemap.xml  (<loc> 은 규격상 절대 URL 이라 origin 없이는 파일을 안 만든다)
   * 그래서 예전처럼 비워 두면 프리렌더를 아무리 돌려도 결과물의 head 는 사실상 빈 채다.
   *
   * 지금 값은 GitHub Pages 프로젝트 사이트 주소다.
   * 배포 워크플로(.github/workflows/deploy.yml)가 BASE_PATH 를 저장소 이름
   * `/apgujeong-main/` 로 넘기고, 계정은 msshin99 이므로 실제 배포 주소는
   * https://msshin99.github.io/apgujeong-main/ 이다.
   *
   * **끝 슬래시를 붙이지 않는다.** absoluteUrl() 은 origin 의 끝 슬래시를 떼고
   * `o.endsWith(base)` 로 base 중복을 판단하는데, "…/apgujeong-main/" 처럼 적으면
   * 그 비교가 어긋나 base 가 한 번 더 붙는다(/apgujeong-main/apgujeong-main/menu).
   * 반대로 여기에 base 를 포함해 두었기 때문에 중복 판정이 걸려 정확히 한 번만 붙는다.
   *
   * ▣ 커스텀 도메인으로 옮기면 이 값을 바꿔야 한다.
   *   예: "https://apgujeong-gopchang.co.kr" (이때는 base 가 "/" 라 저장소 이름이 빠진다).
   *   다만 **코드를 고치지 않고도 덮어쓸 수 있다.** 우선순위는
   *     빌드 환경변수 SITE_ORIGIN → 관리자 화면(사이트 기본 설정)의 seo_settings.site_url
   *     → 이 값
   *   순서다. 도메인만 바뀌는 상황이라면 관리자 화면에서 고치고 다시 배포하는 쪽이 안전하다.
   *   틀린 canonical 은 없는 canonical 보다 훨씬 나쁘므로, 셋 중 어느 쪽을 쓰든
   *   실제로 열리는 주소인지 먼저 확인한다.
   */
  siteUrl: "https://msshin99.github.io/apgujeong-main",

  /** %s 자리에 페이지 제목이 들어간다. 홈은 템플릿을 쓰지 않는다 */
  titleTemplate: "%s | 압구정곱창",

  /** 템플릿을 거치지 않는 홈 전용 제목 */
  defaultTitle: "압구정곱창 | 한우 곱창 전문 다이닝",

  /** 라우트에 설명이 없을 때의 최후 보루. index.html 의 브랜드 슬로건과 같은 목소리 */
  defaultDescription:
    "진심을 담은 고집이 만들어낸 최상의 풍미와 서비스. 상위 0.1%의 한우 곱창을 72시간 저온 숙성해 400℃ 화로에서 구워내는 압구정곱창입니다.",

  /** BCP-47 변환은 seo.js 가 한다 (ko_KR → ko-KR) */
  locale: "ko_KR",

  /**
   * public 기준 경로. absoluteUrl() 이 base 와 origin 을 붙인다.
   *
   * ── og:image ─────────────────────────────────────────────
   * 전에는 `/images/og-default.png` 를 가리켰다가 그 파일이 없어서 비워 두었는데,
   * 비워 두면 카카오톡·슬랙·X 의 링크 미리보기가 그림 없는 맨 글자 카드가 된다.
   * 없는 파일을 가리키는 것(404)보다는 낫지만, **이미 있는 사진을 쓰면 둘 다 피할 수 있다.**
   *
   * 그래서 홈 히어로의 FLAVOR 컷(`src/HeroTabs.jsx` 가 쓰는 그 사진)을 그대로 쓴다.
   * 이걸 고른 이유는 셋이다:
   *   1) 원본이 1920x1000, 즉 1.92:1 이다. OG 스크레이퍼는 대략 1.91:1 로 가운데를
   *      잘라내는데 이 사진은 이미 그 비율이라 잘려 나가는 부분이 사실상 없다.
   *      세로가 긴 다른 사진들(브랜드 갤러리·와인 1:2 이상)은 접시가 통째로 잘린다.
   *   2) 홈에서 가장 먼저 보이는 그림이라, 링크를 눌러 도착한 화면과 미리보기가 일치한다.
   *      미리보기와 첫 화면이 다르면 그 자체로 이탈 사유다.
   *   3) 1MB 안쪽이다. 비율이 비슷한 후보로 /images/menu/m2~m4(2848x1496)도 있었지만
   *      3.7~6MB 라 스크레이퍼가 받다가 포기하거나(카카오톡) 용량 상한(X 5MB)에 걸린다.
   *   ※ 확장자는 .png 지만 실제 바이트는 JPEG 다. 스크레이퍼는 내용을 보고 판단하므로
   *     동작에는 문제가 없다. 아래처럼 전용 이미지를 만들 때 정리하면 된다.
   *
   * 이상적인 것은 로고와 브랜드 문구가 들어간 **전용 1200x630 이미지** 다
   * (카카오톡·X 의 큰 카드가 이 비율을 쓴다). 만들어지면 public/images 에 넣고
   * 이 상수만 그 경로로 바꾸면 끝이다 — 코드는 손댈 필요가 없고, 관리자 화면의
   * seo_settings.default_og_path 로도 덮어쓸 수 있다.
   *
   * ── logo ────────────────────────────────────────────────
   * logoPath 는 계속 비워 둔다. public/images 를 다 뒤져도 로고 파일이 없다
   * (헤더의 워드마크는 이미지가 아니라 글자다). 404 를 가리키는 Organization.logo 는
   * 생략한 것보다 나쁘다 — 구조화 데이터가 이미지 오류로 잡힌다.
   * 비어 있으면 seo.js 의 생략 규칙이 logo 속성을 통째로 빼 준다.
   */
  defaultOgPath: "/images/figma/e.png",
  logoPath: "",

  robotsDefault: "index,follow",

  /**
   * 조직/사업자 정보.
   * 전부 빈 문자열이 기본이다. 하나라도 비면 그 속성이 빠지고,
   * 주소는 다섯 칸이 **모두** 채워질 때만 PostalAddress 로 나간다.
   * 부분 주소는 지역 매칭에 도움이 안 되고 틀린 정보만 남기기 때문이다.
   */
  org: {
    legalName: "",       // 사업자등록증상 상호
    alternateName: "",   // 영문/약칭 (Apgujeong)
    phone: "",           // E.164 권장(+82-2-…). 자리표시자 010-1234-5678 은 넣지 않는다
    email: "",
    street: "",          // 도로명 + 상세
    locality: "",        // 시/군/구  예: 강남구
    region: "",          // 시/도    예: 서울특별시
    postalCode: "",
    country: "",         // ISO 2자리. 예: KR
    bizNumber: "",       // 사업자등록번호
    foundingDate: "",    // 연혁 표기는 2005 부터이나 법인 설립일과 같다는 근거가 없어 비운다
    priceRange: "",      // 예: ₩₩
    /**
     * [{ days: ["Mo","Tu"], opens: "17:00", closes: "23:00" }]
     * 영업시간도 확정 전이라 빈 배열이다. 항목마다 days/opens/closes 가
     * 다 있을 때만 openingHoursSpecification 으로 나간다.
     */
    openingHours: [],
  },

  /**
   * 외부 프로필 URL.
   *
   * NAP 이 비어 있는 동안 이 사이트에서 **유일하게 실효가 있는 신호** 다.
   * 네이버 플레이스/인스타그램 URL 하나만 채워도 사이트와 실제 업체 엔티티가 이어진다.
   * 지금은 압구정지점 네이버 플레이스(placeId 37069188)만 확인된 실주소다.
   */
  sameAs: ["https://map.naver.com/p/entry/place/37069188"],
};

/**
 * 브레드크럼과 내부링크에 쓰는 라우트 표시명.
 * 화면의 h1 과 같은 말을 쓴다 — 마크업과 본문이 어긋나면 그 자체가 신뢰 신호를 깎는다.
 * @type {Record<string, string>}
 */
export const ROUTE_LABELS = {
  "/": "홈",
  "/brand": "브랜드 소개",
  "/menu": "메뉴 소개",
  "/wine": "와인 리스트",
  "/stores": "지점 찾기",
  "/notice": "공지사항",
  "/notice/:id": "공지사항",
  "/contact": "문의하기",
};

/**
 * 프리렌더 대상 라우트.
 * /admin/* 은 React.lazy + 인증 화면이라 정적 HTML 로 뽑을 것이 없고,
 * 뽑아도 안 된다(noindex 강제 대상).
 * @type {string[]}
 */
export const PRERENDER_ROUTES = [
  "/",
  "/brand",
  "/menu",
  "/wine",
  "/stores",
  "/notice",
  "/contact",
];

/**
 * 라우트별 메타 원본.
 *
 * 모든 문구는 실제 페이지에 **보이는 내용** 에서만 뽑았다.
 * 페이지에 없는 것을 description 이나 FAQ 에 적으면 그건 낚시고,
 * 특히 FAQ 는 "마크업에만 있는 Q&A" 가 정책 위반이다.
 * 그래서 faq 를 채운 라우트는 화면에도 같은 문답이 보여야 한다.
 *
 * schemaType 은 seo.js 의 라우트 기본 판정을 덮어쓸 때만 쓴다.
 *
 * @type {Record<string, {
 *   title: string, description: string, primaryKeyword: string,
 *   keywords: string[], faq: {q: string, a: string}[],
 *   schemaType?: string, ogPath?: string
 * }>}
 */
export const ROUTES = {
  "/": {
    /* 홈만은 템플릿을 거치지 않는다. "압구정곱창 | 압구정곱창" 이 되면 안 되기 때문 */
    title: "압구정곱창 | 한우 곱창 전문 다이닝",
    description:
      "상위 0.1%의 한우 곱창을 72시간 저온 숙성해 400℃ 화로에서 구워냅니다. 압구정·성수동·서교동 지점, 시그니처 메뉴와 와인 페어링까지 압구정곱창에서 만나보세요.",
    /* 홈은 어느 클러스터에도 속하지 않고 브랜드명 검색만 전담한다 */
    primaryKeyword: "압구정곱창",
    keywords: [
      "한우 곱창",
      "곱창 맛집",
      "압구정 곱창",
      "곱창 전문점",
      "프리미엄 곱창",
      "곱창 다이닝",
    ],
    schemaType: "WebPage",
    faq: [
      {
        q: "압구정곱창은 어떤 원육을 쓰나요?",
        a: "전국 산지에서 매일 새벽 육질과 곱의 밀도를 기준으로 상위 0.1%의 한우 곱창만을 엄선합니다. 상위 10% 품질의 두툼하고 곱이 가득 찬 한우 및 수입 원육을 함께 사용합니다.",
      },
      {
        q: "곱창을 어떻게 숙성하나요?",
        a: "특제 과일 효소와 함께 72시간 동안 진행되는 저온 숙성 공법으로 곱창 본연의 고소한 풍미를 극대화하고 입안에서 녹아드는 부드러운 식감을 완성합니다.",
      },
      {
        q: "조리 방식은 어떻게 되나요?",
        a: "400℃ 초고온 화로에서 순식간에 구워내 수분은 가두고 불향을 입히며, 전문 그릴러가 가장 완벽하게 익은 순간에 테이블로 전달합니다.",
      },
      {
        q: "압구정곱창 지점은 어디에 있나요?",
        a: "성수동지점, 압구정지점, 서교동지점을 운영하고 있습니다.",
      },
    ],
  },

  "/brand": {
    title: "브랜드 소개",
    /*
     * 창업 의도로 방향을 잡는다. 식사 의도의 신뢰 신호는 홈과 /stores 가 이미 맡고 있어서,
     * 여기에 두 의도를 다 걸면 대표 검색어를 정할 수 없다. 이 결정이 이 클러스터의 핵심.
     */
    description:
      "2005년부터 맛의 極을 향해 걸어온 압구정곱창의 이야기. 정직한 식재료와 장인의 손길로 완성되는 프리미엄 한우 곱창의 표준, 그리고 창업 개설 비용 안내까지 확인하세요.",
    primaryKeyword: "곱창 프랜차이즈 창업",
    keywords: [
      "곱창 프랜차이즈",
      "곱창 창업",
      "한우 곱창 전문점 창업",
      "곱창 가맹",
      "프리미엄 곱창 브랜드",
      "곱창 개설 비용",
    ],
    schemaType: "AboutPage",
    faq: [
      {
        q: "압구정곱창은 언제부터 시작되었나요?",
        a: "브랜드 소개 페이지는 2005년부터 2026년까지 이어지는 발자취를 소개하며, 맛의 極(극)을 향한 고집으로 본연의 깊이를 지켜왔다고 밝히고 있습니다.",
      },
      {
        q: "압구정곱창의 핵심 가치는 무엇인가요?",
        a: "정직한 식재료와 장인의 손길로 완성되는 프리미엄 곱창의 표준을 제시하는 것입니다. 첫 번째 원칙인 '철저한 원육 선별'은 매일 아침 도축장에서부터 시작되는 엄격한 품질 관리로, 가장 깨끗하고 신선한 한우 곱창만을 선보이겠다는 약속입니다.",
      },
      {
        q: "매장은 어떤 콘셉트인가요?",
        a: "단순한 식사를 넘어 미각과 시각이 조화를 이루는, 미니멀하고 세련된 공간에서 깊은 풍미를 경험할 수 있도록 구성했습니다.",
      },
    ],
  },

  "/menu": {
    title: "메뉴 소개",
    description:
      "한우 곱창·대창·막창 구이부터 곱창 전골, 양곱창 볶음밥, 막걸리와 하이볼까지. 압구정곱창의 전 메뉴와 가격, 원산지·중량을 한눈에 확인하세요.",
    /* /wine 과 검색어가 겹치지 않도록 여기는 '한우 곱창' 쪽으로 못 박는다 */
    primaryKeyword: "한우 곱창",
    keywords: [
      "한우 곱창 구이 가격",
      "곱창 대창 막창",
      "곱창 전골",
      "양곱창 볶음밥",
      "곱창집 메뉴판",
      "곱창 가격",
    ],
    /* Menu 노드를 따로 내보내므로 페이지 자체에 중복 성격을 부여하지 않는다 */
    schemaType: "WebPage",
    faq: [
      {
        q: "한우 곱창 구이 가격은 얼마인가요?",
        a: "한우 곱창 구이는 국내산 한우 200G 기준 30,000원입니다. 한우 대창 구이도 200G 30,000원, 한우 막창 구이는 150G 30,000원입니다.",
      },
      {
        q: "곱창 외에 어떤 메뉴가 있나요?",
        a: "사이드 메뉴로 한우 차돌박이(30,000원), 한우 곱창 전골(28,000원), 양곱창 볶음밥(10,000원), 볶음밥(4,000원)이 있습니다.",
      },
      {
        q: "특창 구이는 어느 나라 원육을 쓰나요?",
        a: "특창 구이는 뉴질랜드산 원육을 사용하며 150G 33,000원입니다. 그 외 곱창·대창·막창·차돌박이·곱창 전골은 국내산 한우입니다.",
      },
      {
        q: "주류는 어떤 것을 파나요?",
        a: "소주(참이슬·처음처럼·진로) 6,000원, 맥주(카스·테라·클라우드) 6,000~7,000원, 88 막걸리 10,000원, 우도 땅콩 막걸리 8,000원, 잭다니엘 하이볼 10,000원, 화요 25와 일품진로 각 30,000원을 판매합니다.",
      },
    ],
  },

  "/wine": {
    title: "와인 리스트",
    description:
      "곱창과 어울리는 프리미엄 와인 리스트. 돔 페리뇽 루미너스, 모엣 샹동 아이스 앵페리얼, 보테가 골드 프로세코 등 압구정곱창의 와인과 가격을 확인하세요.",
    primaryKeyword: "곱창 와인 페어링",
    keywords: [
      "압구정곱창 와인",
      "곱창 와인 맛집",
      "돔 페리뇽 가격",
      "모엣 샹동 아이스 앵페리얼",
      "샴페인 곱창",
      "와인 있는 곱창집",
    ],
    schemaType: "CollectionPage",
    faq: [
      {
        q: "압구정곱창에서 어떤 와인을 마실 수 있나요?",
        a: "우드스톡 콜렛레인 까버네쇼비뇽, 모엣 샹동 아이스 앵페리얼, 제이콥스 크릭 스파클링 로제, 돔 페리뇽 루미너스, 보테가 골드 프로세코를 준비하고 있습니다.",
      },
      {
        q: "와인 가격대는 어떻게 되나요?",
        a: "제이콥스 크릭 스파클링 로제 90,000원부터 보테가 골드 프로세코 120,000원, 우드스톡 콜렛레인 130,000원, 모엣 샹동 아이스 앵페리얼 150,000원, 돔 페리뇽 루미너스 480,000원까지 있습니다.",
      },
    ],
  },

  "/stores": {
    title: "지점 찾기",
    description:
      "압구정곱창 지점 안내. 압구정지점·성수동지점·서교동지점의 위치를 지도에서 확인하고 네이버 예약으로 바로 자리를 잡으세요.",
    primaryKeyword: "압구정 곱창 맛집",
    keywords: [
      "압구정곱창 지점",
      "압구정 곱창 위치",
      "성수동 곱창",
      "서교동 곱창",
      "홍대 곱창",
      "압구정곱창 예약",
    ],
    schemaType: "CollectionPage",
    faq: [
      {
        q: "압구정곱창은 어디에 있나요?",
        a: "압구정지점은 서울 강남구 압구정로42길 25-8 1층에 있으며, 그 외 성수동지점(성동구 성수동)과 서교동지점(마포구 서교동)을 함께 운영합니다.",
      },
      {
        q: "예약은 어떻게 하나요?",
        a: "지점 찾기 페이지의 '네이버 예약하기' 버튼을 눌러 네이버 지도 예약 페이지에서 예약할 수 있습니다.",
      },
    ],
  },

  "/notice": {
    title: "공지사항",
    description:
      "압구정곱창의 새 소식과 안내를 전해 드립니다. 휴무·배송 안내, 신메뉴와 이벤트 등 매장 공지사항을 한곳에서 확인하세요.",
    primaryKeyword: "압구정곱창 공지사항",
    keywords: [
      "압구정곱창 소식",
      "곱창집 휴무 안내",
      "압구정곱창 이벤트",
      "압구정곱창 새소식",
    ],
    schemaType: "CollectionPage",
    faq: [],
  },

  /**
   * 공지 상세의 '기본값' 행.
   * 실제 제목·설명은 notices 테이블의 값이 이긴다. 여기 title/description 은
   * 글을 못 불러왔을 때 쓰이는 것이 아니라(그때는 페이지 자체가 없다),
   * 라우트 단위 키워드·클러스터 소속을 적어 두는 자리다.
   */
  "/notice/:id": {
    title: "공지사항",
    description:
      "압구정곱창의 공지사항입니다. 휴무·영업시간 변경, 이벤트 등 방문 전 확인이 필요한 안내를 전해 드립니다.",
    primaryKeyword: "압구정곱창 공지",
    keywords: ["압구정곱창 안내", "압구정곱창 휴무", "압구정곱창 배송 안내"],
    schemaType: "ItemPage",
    faq: [],
  },

  "/contact": {
    title: "문의하기",
    description:
      "압구정곱창에 궁금한 점을 남겨 주세요. 성함과 연락처, 문의 내용을 남기시면 담당자가 확인 후 빠르게 연락드립니다.",
    /* 가맹 상담이 이 페이지의 실제 목표 행동이다 */
    primaryKeyword: "곱창 창업 상담",
    keywords: [
      "곱창 가맹 문의",
      "압구정곱창 창업 문의",
      "곱창 프랜차이즈 상담",
      "압구정곱창 문의",
      "압구정곱창 연락처",
    ],
    schemaType: "ContactPage",
    faq: [
      {
        q: "문의하려면 무엇을 입력해야 하나요?",
        a: "성함, 연락처, 이메일, 문의사항을 입력하고 개인정보 수집 및 이용에 동의하시면 문의를 보낼 수 있습니다.",
      },
      {
        q: "문의하면 언제 답변을 받나요?",
        a: "문의가 접수되면 담당자가 확인 후 빠르게 연락드린다고 안내하고 있습니다.",
      },
    ],
  },
};

/**
 * 토픽 클러스터 — 새 글을 만드는 표가 아니라 **이미 있는 페이지를 묶는** 표다.
 *
 * 묶는 이유는 하나. 어느 페이지가 어느 검색어의 대표(필러)인지 정해 두어야
 * 내부링크를 그쪽으로 몰아 줄 수 있고, 같은 검색어로 두 페이지가 서로 경쟁하는
 * 자기잠식(cannibalization)을 막을 수 있다.
 *
 * '/' 는 어디에도 넣지 않는다. 홈은 클러스터의 구성원이 아니라 세 필러를 모두
 * 가리키는 허브이고, 브랜드명 검색만 전담한다. 홈을 특정 클러스터에 넣는 순간
 * 그 필러와 브랜드명 검색어를 두고 경쟁하게 된다.
 *
 * @type {{ name: string, slug: string, description: string,
 *          pillarRoute: string, routes: string[], keywords: string[] }[]}
 */
export const CLUSTERS = [
  {
    name: "곱창 미식",
    slug: "gopchang-dining",
    description:
      "무엇을 먹을지 정하려는 방문자. 품목·가격·원산지를 다 가진 /menu 가 대표이고, 와인은 같은 식사 결정의 하위 질문이라 곁가지로 붙인다.",
    pillarRoute: "/menu",
    routes: ["/menu", "/wine"],
    keywords: [
      "압구정곱창",
      "한우곱창",
      "곱창구이",
      "대창",
      "막창",
      "곱창전골",
      "곱창 가격",
    ],
  },
  {
    name: "지점 방문",
    slug: "store-visit",
    description:
      "어디로 갈지·언제 여는지 확인하려는 지역 검색 의도. 공지는 대부분 지점 소식이라 같은 묶음에 두고, 계속 늘어나는 페이지로서 신선도 신호를 공급한다.",
    pillarRoute: "/stores",
    routes: ["/stores", "/notice", "/notice/:id"],
    keywords: [
      "압구정 곱창 맛집",
      "강남 곱창",
      "성수 곱창",
      "압구정곱창 지점",
      "압구정곱창 예약",
    ],
  },
  {
    name: "브랜드·가맹",
    slug: "brand-franchise",
    description:
      "창업을 검토하는 예비 가맹점주. 브랜드 신뢰 근거와 창업비용이 /brand 한 페이지에 있고, /contact 는 그 검색의 전환 지점이다.",
    pillarRoute: "/brand",
    routes: ["/brand", "/contact"],
    keywords: [
      "곱창 프랜차이즈",
      "곱창집 창업",
      "압구정곱창 가맹",
      "가맹비",
      "창업비용",
    ],
  },
];

/**
 * 메뉴판 원본 — /menu 의 Menu / MenuSection / MenuItem 스키마 재료.
 *
 * `src/pages/MenuList.jsx` 와 같은 내용이지만 그쪽을 import 하지 않는다.
 * 페이지 모듈은 React 와 asset() 을 끌고 들어와 Node 빌드에서 죽기 때문이다.
 * **두 곳을 같이 고쳐야 한다** — 가격을 바꿀 때 이 파일도 함께 손본다.
 *
 * price 가 null 인 항목은 값이 둘 이상이라(맥주 6,000/7,000원) 하나만 적으면
 * 표시 가격이 실제와 달라진다. 그런 항목은 offers 를 생략하고 이름만 남긴다.
 *
 * @type {{ name: string, items: { name: string, en?: string, price: number|null, note?: string }[] }[]}
 */
export const MENU_SECTIONS = [
  {
    name: "메인 메뉴",
    items: [
      { name: "한우 곱창 구이", en: "Grilled Hanwoo Small Intestines", price: 30000, note: "국내산 한우 200G" },
      { name: "한우 대창 구이", en: "Grilled Hanwoo Large Intestines", price: 30000, note: "국내산 한우 200G" },
      { name: "한우 막창 구이", en: "Grilled Hanwoo Abomasum", price: 30000, note: "국내산 한우 150G" },
      { name: "특창 구이", en: "Grilled Special Tripe", price: 33000, note: "뉴질랜드산 150G" },
    ],
  },
  {
    name: "사이드 메뉴",
    items: [
      { name: "한우 차돌박이", price: 30000, note: "국내산 한우 150G" },
      { name: "한우 곱창 전골", price: 28000, note: "국내산 한우 150G" },
      { name: "양곱창 볶음밥", price: 10000 },
      { name: "볶음밥", price: 4000 },
    ],
  },
  {
    name: "술 / 음료",
    items: [
      { name: "음료", price: 3000, note: "콜라·사이다·갈아만든 배·탄산수" },
      { name: "88 막걸리", price: 10000 },
      { name: "우도 땅콩 막걸리", price: 8000 },
      { name: "소주", price: 6000, note: "참이슬·처음처럼·진로" },
      /* 6,000원과 7,000원 두 가지라 단일 가격으로 못 적는다 → offers 생략 */
      { name: "맥주", price: null, note: "카스·테라·클라우드" },
      { name: "잭다니엘 하이볼", price: 10000 },
      { name: "화요 25", price: 30000 },
      { name: "일품진로", price: 30000 },
    ],
  },
];

/**
 * 와인 목록 원본 — /wine 의 ItemList 재료.
 * MENU_SECTIONS 와 같은 이유로 `src/pages/WineSlider.jsx` 를 import 하지 않는다.
 * @type {{ name: string, en?: string, price: number|null }[]}
 */
export const WINE_LIST = [
  { name: "우드스톡 콜렛레인 까버네쇼비뇽", en: "Woodstock Collett Lane", price: 130000 },
  { name: "모엣 샹동 아이스 앵페리얼", en: "Moët & Chandon Ice Impérial", price: 150000 },
  { name: "제이콥스 크릭 스파클링 로제", en: "Jacob's Creek Sparkling Rosé", price: 90000 },
  { name: "돔 페리뇽 루미너스", en: "Dom Pérignon Luminous", price: 480000 },
  { name: "보테가 골드 프로세코", en: "Bottega Gold Prosecco", price: 120000 },
];

/**
 * 라우트 정적 메타를 찾는다. 없으면 null.
 * `/notice/12` 처럼 실제 id 가 붙은 경로는 seo.js 의 normalizeRoute 를 먼저 거쳐야 한다.
 *
 * @param {string} routePath - "/menu" 같은 라우트 경로
 * @returns {object|null}
 */
export function findRouteMeta(routePath) {
  if (!routePath) return null;
  return ROUTES[routePath] ?? null;
}

/**
 * 어떤 라우트가 속한 클러스터를 찾는다. 홈('/')은 어디에도 속하지 않으므로 항상 null.
 *
 * @param {string} routePath
 * @returns {object|null}
 */
export function findCluster(routePath) {
  if (!routePath) return null;
  return CLUSTERS.find((c) => c.routes.includes(routePath)) ?? null;
}
