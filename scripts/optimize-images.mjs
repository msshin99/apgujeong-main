/**
 * 빌드 시점 이미지 최적화 — public/images 를 읽어 dist/images 로 굽는다.
 *
 * 왜 필요한가:
 *   public/images 는 116 MB 다. 그런데 화면에서 그 픽셀을 다 쓰는 이미지는 하나도 없다.
 *   heritage/select.png 는 3700px 원본인데 실제로 그려지는 상자는 452 CSS px 이고,
 *   menu/m3.png 는 5.99 MB 짜리가 419px 짜리 카드 안에 들어간다.
 *   브라우저는 그걸 다 받아서 디코드한 뒤 버린다 — 홈 화면 스크린샷이 30초 안에
 *   안 끝나던 이유가 이것이다.
 *
 * 무엇을 하는가:
 *   원본 한 장마다
 *     name-<폭>w.avif   ← 실제 그려지는 크기에 맞춘 사다리 (제일 먼저 고른다)
 *     name-<폭>w.webp   ← AVIF 를 못 읽는 브라우저용
 *     name.<원래확장자> ← **원본과 똑같은 주소.** 아래 [주소] 참고
 *   그리고 dist/images/manifest.json + src/generated/image-manifest.json 을 쓴다.
 *
 * [주소] 폴백을 왜 원본과 같은 파일 이름으로 덮어쓰나:
 *   src/Img.jsx 를 아직 안 쓰는 자리가 남아 있고, 그런 자리는 <img src="/images/…png">
 *   그대로 나간다. seoData.js 의 og:image(defaultOgPath) 도 그 주소를 직접 가리킨다.
 *   원본 이름을 없애면 그 자리들이 전부 404 가 난다. 그래서 원본 주소는 **항상 살아
 *   있되 내용만 최적화된 것**으로 바꾼다. 즉 호출부를 한 줄도 안 고쳐도 이미 이득이고,
 *   Img.jsx 로 바꾼 자리는 거기에 더해 AVIF 사다리까지 받는다.
 *
 *   확장자와 실제 바이트가 어긋나는 경우(불투명 .png 를 JPEG 로 굽는 경우)가 생기는데,
 *   이 저장소에는 이미 그런 파일이 14개 있고(figma/e.png 는 JPEG 바이트다) 지금도 잘 나온다.
 *   브라우저는 <img> 를 디코드할 때 Content-Type 이 아니라 매직 바이트를 본다.
 *
 * 두 번 돈다 (package.json 참고):
 *   prebuild  → --stage : 원본을 .image-cache/ 에 굽고 매니페스트를 src/generated 에 쓴다.
 *                         vite build 가 Img.jsx 를 번들할 때 매니페스트가 이미 있어야 한다.
 *   postbuild → --emit  : .image-cache/ 를 dist/images/ 로 옮기고 원본 사본을 치운다.
 *                         vite 가 publicDir 을 통째로 복사한 **뒤**여야 덮어쓸 수 있다.
 *
 * 증분:
 *   원본의 mtime+크기와 설정 해시가 그대로면 다시 굽지 않는다.
 *   차가운 빌드는 수 분, 따뜻한 빌드는 몇 초다.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SRC_DIR = path.join(ROOT, "public", "images");
const DIST = path.join(ROOT, "dist");
const DIST_DIR = path.join(DIST, "images");
const CACHE_DIR = path.join(ROOT, ".image-cache");
const CACHE_INDEX = path.join(CACHE_DIR, "index.json");
const GEN_DIR = path.join(ROOT, "src", "generated");
const GEN_MANIFEST = path.join(GEN_DIR, "image-manifest.json");

/* 사람이 쓴 소스들. 여기 경로가 한 번도 안 나오는 이미지는 어디서도 그려지지
   않는다는 뜻이라 dist 로 내보내지 않는다.
   (원본은 git 에 그대로 남는다 — 지우는 게 아니라 배포에서 빼는 것이다) */
const SCAN_DIRS = [path.join(ROOT, "src"), path.join(ROOT, "scripts")];
const SCAN_FILES = [path.join(ROOT, "index.html")];

/* ⚠ 우리가 만든 것은 절대 읽지 않는다.
   매니페스트는 src/generated 안에 있고 모든 원본 경로를 나열한다. 그걸 같이 읽으면
   "매니페스트에 있으니 쓰이는 파일" 이라는 자기참조가 생겨서, 한 번 구워진 미사용
   파일은 영원히 미사용으로 판정되지 않는다. 이 스크립트 자신도 마찬가지다 —
   아래 buildManifest 안에 "/images/" 문자열이 있다 */
const SCAN_EXCLUDE = [path.join(ROOT, "src", "generated"), path.join(HERE, "optimize-images.mjs")];

/* ============================================================
 * 1. 상자 — 화면 폭마다 이미지가 실제로 몇 CSS px 로 그려지는가
 * ============================================================
 *
 * 예전에는 여기에 스칼라 하나(cssMax)와 손으로 적은 widths 배열이 있었다.
 * 그게 이 파이프라인의 가장 큰 버그였다. cssMax 는 "상자가 가질 수 있는 최대 폭"
 * 하나뿐이라 사실상 **데스크톱 숫자**인데, 거기서 만든
 *   `(max-width: 548px) 100vw, 548px`
 * 를 모든 화면 폭에 똑같이 넘겼다. 375px 폰에서 cards/33513 의 진짜 상자는
 * 335 CSS px(=670 device px)인데 저 문자열은 100vw=375 → 750 을 주장했고,
 * 사다리에 560 다음이 1096 밖에 없어서 브라우저가 1096w(142 KB)를 받아 갔다.
 * 그래서 **모바일이 데스크톱보다 무거웠다**(1440 에서 715 KB, 375@2 에서 974 KB).
 *
 * 이 표는 이제 스칼라가 아니라 **분기점별 상자 폭**을 적는다. sizes 문자열도,
 * 구울 폭 사다리도 전부 여기서 기계적으로 파생된다 — 손으로 적는 것은 상자뿐이다.
 *
 *   box : [{ upTo: 화면폭상한, css: "상자 폭 식" }, …, { css: "그 위 전부" }]
 *         css 는 CSS 길이 식 그대로 쓴다: "100vw", "220px", "21vw",
 *         "calc(100vw - 40px)", "min(1120px, calc(100vw - 80px))".
 *         분기점 어휘는 앱이 실제로 쓰는 것과 같다 —
 *         Tailwind sm 640 / md 768 / lg 1024, useBreakpoint.js 의 tablet 676 / desktop 1200.
 *
 * 상자 식에는 네 가지가 이미 접혀 들어가 있다(측정값이지 추정이 아니다):
 *   a. 캔버스 배율. 데스크톱 분기는 scale(min(1, innerWidth/1920)) 안에 있으므로
 *      디자인 W px 는 1920 미만에서 (W/19.2)vw 로 그려진다. 그래서 데스크톱 절은
 *      맨 `Wpx` 가 아니라 vw 로 적는다 — 옛 표가 데스크톱을 과다 신고하던 지점이다.
 *   b. 변형 확대. Collection hover 1.08, Franchise ken-burns 1.08,
 *      Notice hover 1.04, MenuCard hover 1.06 은 상자에 곱해져 있다.
 *   c. object-contain 클램프. MenuCard max-h-[74%]/max-w-[86%],
 *      WineSlider max-h-[80%]/max-w-[60%] 를 반영한 값이다.
 *      menu/d3·d5 가 다른 메뉴 카드와 다른 이유가 이것이다(비율이 달라 높이에 먼저 걸린다).
 *   d. 호출부 합집합. 한 이미지가 여러 곳에서 쓰이면 구간마다 **큰 쪽**을 적었다:
 *      collection/c3·c5 는 Collection 카드이면서 Franchise 대형 사진이고,
 *      notice/n* 는 홈 카드·목록 카드이면서 NoticeDetail 본문 이미지(1280)다.
 *
 * 표에 없는 파일은 DEFAULT_BOX(100vw)로 간다 — 새 이미지가 들어와도 일단 돌아간다.
 */
const PLAN = {
  /* — 히어로·전체폭: 두 분기 모두 absolute inset-0 / w-full 이라 진짜로 100vw 다.
       이 항목들만은 옛 표의 문자열도 이미 옳았다 */
  "figma/e.png": { box: [{ css: "100vw" }] },
  "figma/d.png": { box: [{ css: "100vw" }] },
  "figma/c.png": { box: [{ css: "100vw" }] },
  "pages/hero.png": { box: [{ css: "100vw" }] },
  "pages/menu-hero.png": { box: [{ css: "100vw" }] },
  "pages/wine-hero.png": { box: [{ css: "100vw" }] },
  "pages/stores-hero.png": { box: [{ css: "100vw" }] },
  "pages/notice-hero.png": { box: [{ css: "100vw" }] },
  "pages/contact-hero.png": { box: [{ css: "100vw" }] },
  "stores/map.png": { box: [{ css: "100vw" }] },

  /* — ScatterCards. compact 분기가 데스크톱 분기보다 **넓다**(모바일 335 > 데스크톱 302).
       이 역전은 진짜라서 아래 감사(監査)에 걸리지 않도록 compactWider 로 명시한다.
       21vw = 402/1920 (33513·33518), 27.4vw = 526/1920 (33516·33517) */
  "cards/33513.png": {
    compactWider: true,
    box: [
      { upTo: 639, css: "calc(100vw - 40px)" }, // compact 1열, px-[20px]
      { upTo: 767, css: "calc(100vw - 48px)" }, // compact 1열, sm:px-[24px]
      { upTo: 1199, css: "calc(50vw - 52px)" }, // compact 2열, md:px-[40px] + gap-x-[24px]
      { css: "21vw" }, // 1920 캔버스: 402 / 1920
    ],
  },
  "cards/33518.png": {
    compactWider: true,
    box: [
      { upTo: 639, css: "calc(100vw - 40px)" },
      { upTo: 767, css: "calc(100vw - 48px)" },
      { upTo: 1199, css: "calc(50vw - 52px)" },
      { css: "21vw" },
    ],
  },
  "cards/33516.png": {
    compactWider: true,
    box: [
      { upTo: 639, css: "calc(100vw - 40px)" },
      { upTo: 767, css: "calc(100vw - 48px)" },
      { upTo: 1199, css: "calc(50vw - 52px)" },
      { css: "27.4vw" }, // 세로가 긴 카드라 데스크톱에서 526px
    ],
  },
  "cards/33517.png": {
    compactWider: true,
    box: [
      { upTo: 639, css: "calc(100vw - 40px)" },
      { upTo: 767, css: "calc(100vw - 48px)" },
      { upTo: 1199, css: "calc(50vw - 52px)" },
      { css: "27.3vw" },
    ],
  },

  /* — Collection 카드. 320px + hover 1.08 = 346 이 끝이고, 1920 미만에서는
       캔버스 배율을 타므로 18vw(=346/1920)로 적는다. compact 는 고정 폭 카드다 */
  "collection/c1.png": { box: COLLECTION_CARD_BOX() },
  "collection/c2.png": { box: COLLECTION_CARD_BOX() },
  "collection/c4.png": { box: COLLECTION_CARD_BOX() },
  "collection/c6.png": { box: COLLECTION_CARD_BOX() },
  "collection/c7.png": { box: COLLECTION_CARD_BOX() },
  /* c3·c5 는 Collection 카드(346)이면서 Franchise 대형 사진(1112 × ken-burns 1.08)이다.
     구간마다 큰 쪽 — 즉 Franchise 쪽 — 을 따른다 */
  "collection/c3.png": { box: WIDE_PHOTO_BOX() },
  "collection/c5.png": { box: WIDE_PHOTO_BOX() },
  "franchise/store.png": { box: WIDE_PHOTO_BOX() },

  /* heritage 는 3D 렌더라 그라데이션이 매끈하다 — 밴딩이 잘 보여서 화질을 한 단계
     올려 잡는다(아래 QUALITY.render). 크기 낭비는 사이트에서 제일 심하다:
     3700px 원본이 452px 상자에 들어간다. compact 는 고정 폭, 데스크톱은 캔버스 배율 */
  "heritage/select.png": {
    box: [{ upTo: 1199, css: "289px" }, { upTo: 1919, css: "23.6vw" }, { css: "452px" }],
  },
  "heritage/age.png": {
    box: [{ upTo: 1199, css: "269px" }, { upTo: 1919, css: "21.9vw" }, { css: "420px" }],
  },
  "heritage/cook.png": {
    box: [{ upTo: 1199, css: "227px" }, { upTo: 1919, css: "18.5vw" }, { css: "355px" }],
  },

  /* — MenuCard. 4열 그리드(45.6vw 는 2열 구간, 22.8vw 는 4열 구간)에 max-w-[86%]·
       max-h-[74%] object-contain 과 hover 1.06 이 접혀 있다.
       모바일 상자는 145 CSS px 밖에 안 된다 — 옛 표의 419 와 세 배 가까이 차이났다 */
  "menu/m1.png": { box: MENU_CARD_BOX() },
  "menu/m2.png": { box: MENU_CARD_BOX() },
  "menu/m3.png": { box: MENU_CARD_BOX() },
  "menu/m4.png": { box: MENU_CARD_BOX() },
  "menu/s1.png": { box: MENU_CARD_BOX() },
  "menu/s2.png": { box: MENU_CARD_BOX() },
  "menu/s3.png": { box: MENU_CARD_BOX() },
  "menu/s4.png": { box: MENU_CARD_BOX() },
  "menu/d1.png": { box: MENU_CARD_BOX() },
  "menu/d2.png": { box: MENU_CARD_BOX() },
  "menu/d4.png": { box: MENU_CARD_BOX() },
  "menu/d6.png": { box: MENU_CARD_BOX() },
  "menu/d7.png": { box: MENU_CARD_BOX() },
  "menu/d8.png": { box: MENU_CARD_BOX() },
  /* d3·d5 는 세로가 길어 max-w 가 아니라 max-h-[74%] 에 먼저 걸린다.
     상자가 각각 0.68배·0.54배로 줄어든다 — 매직 넘버가 아니라 비율에서 나오는 값이다 */
  "menu/d3.png": { box: MENU_CARD_BOX(0.683) },
  "menu/d5.png": { box: MENU_CARD_BOX(0.538) },

  /* — 와인 병. WineSlider 는 자체 배율 Math.min(1, Math.max(0.48, innerWidth/1560)) 에
       **0.48 바닥**이 있어서 749px 아래로는 상자가 더 줄지 않는다. 그 바닥을 적어야
       모바일이 오히려 부족해지지 않는다. max-w-[60%] 라 데스크톱 상자는 241px */
  "wine/w1.png": { box: WINE_BOTTLE_BOX() },
  "wine/w2.png": { box: WINE_BOTTLE_BOX() },
  "wine/w3.png": { box: WINE_BOTTLE_BOX() },
  "wine/w4.png": { box: WINE_BOTTLE_BOX() },
  "wine/w5.png": { box: WINE_BOTTLE_BOX() },

  /* — 공지 이미지. 홈·목록 카드이면서 NoticeDetail 본문(CONTENT_W = 1280)이다.
       본문이 제일 크므로 데스크톱 절은 1280px 고정이다(캔버스 밖 유동 레이아웃) */
  "notice/n1.png": { box: NOTICE_BOX() },
  "notice/n2.png": { box: NOTICE_BOX() },
  "notice/n3.png": { box: NOTICE_BOX() },

  /* — BrandGallery 패널은 flex-grow 를 JS 가 hover 때 GROW=1.6/4 로 움직인다.
       정적 분석으로는 볼 수 없는 값이라 40vw 로 직접 적는다(1.6/4 = 0.4) */
  "brand/g1.png": { box: [{ upTo: 1199, css: "50vw" }, { css: "40vw" }] },
  "brand/g2.png": { box: BRAND_PHOTO_BOX() },
  "brand/g3.png": { box: BRAND_PHOTO_BOX() },
  "brand/g4.png": { box: BRAND_PHOTO_BOX() },
  /* BrandSpace·BrandValue 는 데스크톱에서 글 칼럼과 나란히 놓여
     "화면 폭 - 글 칼럼" 이 상자가 된다. 1200 아래로는 위아래로 쌓여 전체 폭이다 */
  "brand/space1.png": {
    box: [
      { upTo: 639, css: "calc(100vw - 40px)" },
      { upTo: 767, css: "calc(100vw - 48px)" },
      { upTo: 1023, css: "calc(100vw - 80px)" },
      { upTo: 1199, css: "calc(100vw - 760px)" },
      { css: "656px" },
    ],
  },
  "brand/value1.png": {
    box: [
      { upTo: 639, css: "calc(100vw - 40px)" },
      { upTo: 767, css: "calc(100vw - 48px)" },
      { upTo: 1023, css: "calc(100vw - 80px)" },
      { upTo: 1199, css: "calc(100vw - 884px)" },
      { css: "642px" },
    ],
  },
};

/* 같은 상자를 쓰는 무리는 함수로 묶는다 — 한 벌만 고치면 전부 따라온다.
   (호이스팅 덕에 위 PLAN 리터럴에서 부를 수 있다) */
function COLLECTION_CARD_BOX() {
  return [{ upTo: 675, css: "220px" }, { upTo: 1199, css: "260px" }, { upTo: 1919, css: "18vw" }, { css: "346px" }];
}
function WIDE_PHOTO_BOX() {
  return [
    { upTo: 639, css: "calc(100vw - 40px)" },
    { upTo: 767, css: "calc(100vw - 48px)" },
    { upTo: 1199, css: "min(1120px, calc(100vw - 80px))" },
    { upTo: 1919, css: "62.5vw" }, // 1112 × 1.08 = 1201, / 1920
    { css: "1201px" },
  ];
}
/** @param k 세로가 긴 그림이 max-h-[74%] 에 먼저 걸릴 때의 축소 계수 */
function MENU_CARD_BOX(k = 1) {
  const s = (n) => +(n * k).toFixed(1);
  return [
    { upTo: 639, css: `calc(${s(45.6)}vw - ${s(26)}px)` },
    { upTo: 767, css: `calc(${s(45.6)}vw - ${s(29)}px)` },
    { upTo: 1023, css: `calc(${s(45.6)}vw - ${s(48)}px)` },
    { upTo: 1759, css: `calc(${s(22.8)}vw - ${s(35)}px)` },
    { css: `${Math.round(366 * k)}px` },
  ];
}
function WINE_BOTTLE_BOX() {
  return [{ upTo: 749, css: "116px" }, { upTo: 1559, css: "15.5vw" }, { css: "241px" }];
}
function NOTICE_BOX() {
  return [
    { upTo: 639, css: "calc(100vw - 40px)" },
    { upTo: 767, css: "calc(100vw - 48px)" },
    { upTo: 1359, css: "calc(100vw - 80px)" },
    { css: "1280px" },
  ];
}
function BRAND_PHOTO_BOX() {
  return [
    { upTo: 639, css: "calc(100vw - 40px)" },
    { upTo: 767, css: "calc(100vw - 48px)" },
    { upTo: 1199, css: "calc(100vw - 80px)" },
    { upTo: 1639, css: "656px" },
    { css: "40vw" },
  ];
}

/** 표에 없는 파일 — 화면 전체라고 보고 넓게 잡는다 */
const DEFAULT_BOX = [{ css: "100vw" }];

/* 사다리를 만들 때 "실제로 존재하는" 화면 폭과 그 폭에서 현실적인 DPR.
   DPR 3 을 큰 화면에까지 곱하면 아무도 쓰지 않는 3000px 짜리를 굽게 된다 —
   DPR 3 은 폰에만, DPR 2 는 2560 데스크톱에는 붙이지 않는다(5K 는 이 사이트의 대상이 아니다) */
const VIEWPORTS = [
  { w: 375, dprs: [1, 2, 3] },
  { w: 430, dprs: [1, 2, 3] },
  { w: 639, dprs: [1, 2] },
  { w: 675, dprs: [1, 2] },
  { w: 767, dprs: [1, 2] },
  { w: 800, dprs: [1, 2] },
  { w: 1023, dprs: [1, 2] },
  { w: 1199, dprs: [1, 2] },
  { w: 1440, dprs: [1, 2] },
  { w: 1920, dprs: [1, 2] },
  { w: 2560, dprs: [1] },
];

/* 가까운 필요 폭들을 한 칸으로 합칠 때의 허용 비율.
   1.25 = 어떤 (화면폭 × DPR) 조합도 필요한 픽셀의 1.25배를 넘게 받지 않는다는 뜻이다.
   더 촘촘히(1.12) 하면 이미지당 12~14칸이 나와서 dist 와 인코딩 시간이 배로 뛰고,
   더 성기게 하면 지금 고치려는 그 구멍이 다시 생긴다. 1.25 는 이미지당 4~7칸이다 */
const MERGE_RATIO = 1.25;

/* 감사(監査) 임계값. 이보다 크게 과다 전송되는 조합이 하나라도 있으면 빌드를 세운다.
   33513 이 670 이 필요한데 1096 을 받던 그날(1.64배) 이 검사가 있었으면 바로 잡혔다 */
const MAX_OVERSHOOT = 1.35;

/* ============================================================
 * 2. 화질 — 내용 종류마다 다르다
 * ============================================================
 *
 * photo   불투명 사진. 어둡고 거친 음식 사진이라 AVIF q50 아래로 내려가면
 *         이 브랜드 색을 지배하는 그림자 그라데이션이 얼룩진다.
 * jpeg    이미 JPEG 로 한 번 압축된 원본(매직 바이트로 판별한 14개).
 *         폴백을 다시 JPEG 로 구우면 열화가 겹치므로 폴백만 화질을 올려 잡는다.
 * cutout  흰 배판 위에 누끼 딴 제품 사진(menu·wine). **알파가 진짜로 쓰인다** —
 *         MenuList.jsx:94 / WineSlider.jsx:265 의 drop-shadow() 가 알파 실루엣을
 *         따라가기 때문에 JPEG 로 눕히면 병마다 회색 네모가 생긴다. 폴백은 반드시 PNG.
 * render  heritage 의 3D 아이콘. 합성 이미지라 밴딩이 유난히 잘 보인다.
 */
const QUALITY = {
  photo: { avif: 52, webp: 74, jpeg: 78, subsample: "4:2:0" },
  jpeg: { avif: 52, webp: 74, jpeg: 82, subsample: "4:2:0" },
  cutout: { avif: 58, webp: 80, subsample: "4:4:4" },
  render: { avif: 60, webp: 82, subsample: "4:4:4" },
};

/** 설정이 바뀌면 캐시를 통째로 무효화해야 한다 — 안 그러면 옛 화질이 남는다 */
const CONFIG_HASH = crypto
  .createHash("sha1")
  .update(JSON.stringify({ PLAN, DEFAULT_BOX, VIEWPORTS, MERGE_RATIO, QUALITY, v: 2 }))
  .digest("hex")
  .slice(0, 12);

/* ============================================================
 * 3. 도구
 * ============================================================ */

const log = (s = "") => console.log(s);
const posix = (p) => p.split(path.sep).join("/");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function pct(before, after) {
  if (!before) return "—";
  return `${(((before - after) / before) * 100).toFixed(1)}%`;
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

/** 소스 전체를 한 덩어리로 읽어 둔다. 경로가 여기 없으면 아무도 안 쓴다는 뜻 */
function readSourceText() {
  const files = [...SCAN_FILES];
  for (const d of SCAN_DIRS) {
    for (const f of walk(d)) {
      if (SCAN_EXCLUDE.some((x) => f === x || f.startsWith(x + path.sep))) continue;
      if (/\.(jsx?|tsx?|mjs|cjs|css|html|json)$/i.test(f)) files.push(f);
    }
  }
  return files
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");
}

/**
 * 이 이미지를 코드가 실제로 가리키는가.
 *
 * 파일 이름만 보면 안 된다 — asset.js 의 설명 주석에 예시로 적힌 `/images/a.png`
 * 한 줄 때문에 쓰이지도 않는 figma/a.png 가 살아남았다. 호출부는 언제나
 * asset("/images/폴더/이름.png") 처럼 폴더까지 적으므로 그 조각으로 찾는다.
 */
function isReferenced(rel, sourceText) {
  return sourceText.includes(`images/${rel}`);
}

/* ============================================================
 * 4. 한 장 굽기
 * ============================================================ */

/**
 * 종류를 정한다. 확장자는 **믿지 않는다** — 이 저장소에는 JPEG 바이트에
 * .png 이름이 붙은 파일이 14개 있고, 확장자로 분기하면 그 파일들에
 * 엉뚱한 인코더와 엉뚱한 화질이 걸린다. sharp 는 매직 바이트로 포맷을 읽는다.
 */
async function classify(file, rel) {
  const meta = await sharp(file).metadata();
  const isJpegBytes = meta.format === "jpeg";

  /* hasAlpha 만 보면 안 된다. 알파 채널은 있는데 전부 불투명한 PNG 가 흔하다.
     그런 파일까지 PNG 로 내보내면 사진 한 장에 몇 백 KB 를 그냥 버린다.
     실제로 반투명 화소가 있는지 알파 채널 최소값으로 확인한다 */
  let alpha = false;
  if (meta.hasAlpha) {
    const st = await sharp(file).ensureAlpha().extractChannel(3).stats();
    alpha = st.channels[0].min < 250;
  }

  let kind;
  if (alpha) kind = rel.startsWith("heritage/") ? "render" : "cutout";
  else kind = isJpegBytes ? "jpeg" : "photo";

  return { width: meta.width, height: meta.height, alpha, isJpegBytes, kind };
}

/* ── 상자 식 계산기 ─────────────────────────────────────────
 * CSS 길이 식을 화면 폭 하나에 대해 숫자로 푼다.
 * 브라우저가 sizes 를 푸는 방식과 같은 규칙만 쓴다: vw, px, calc 의 덧뺄셈, min().
 * 여기서 나온 값이 곧 "브라우저가 이 이미지에 몇 CSS px 라고 믿을 값" 이므로,
 * sizes 문자열과 사다리가 **같은 함수**에서 나와야 둘이 어긋나지 않는다.
 */
function evalLen(expr, vw) {
  let s = String(expr).trim();
  const m = s.match(/^min\((.*)\)$/);
  if (m) {
    const parts = [];
    let depth = 0;
    let cur = "";
    for (const ch of m[1]) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        parts.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    parts.push(cur);
    return Math.min(...parts.map((p) => evalLen(p, vw)));
  }
  s = s.replace(/^calc\((.*)\)$/, "$1");
  const toks = s.match(/[-+]|[\d.]+(?:vw|px)?/g) || [];
  let total = 0;
  let sign = 1;
  for (const t of toks) {
    if (t === "+") {
      sign = 1;
      continue;
    }
    if (t === "-") {
      sign = -1;
      continue;
    }
    const n = parseFloat(t);
    total += sign * (t.endsWith("vw") ? (n * vw) / 100 : n);
    sign = 1;
  }
  return total;
}

const boxOf = (rel) => PLAN[rel]?.box ?? DEFAULT_BOX;

/** 이 화면 폭에서 상자가 몇 CSS px 인가 — 첫 번째로 맞는 절을 쓴다(브라우저와 같은 규칙) */
function boxAt(rel, vw) {
  const box = boxOf(rel);
  for (const r of box) if (r.upTo === undefined || vw <= r.upTo) return evalLen(r.css, vw);
  return evalLen(box[box.length - 1].css, vw);
}

/** sizes 속성. 상자 표의 기계적인 이어붙이기일 뿐 — 손으로 쓰는 문자열은 이제 없다 */
function sizesFor(rel) {
  return boxOf(rel)
    .map((r) => (r.upTo === undefined ? r.css : `(max-width: ${r.upTo}px) ${r.css}`))
    .join(", ");
}

/**
 * 사다리도 상자에서 파생한다. 손으로 폭을 적지 않는다.
 *
 * (1) 실제로 존재하는 화면 폭마다 상자를 재고, 그 폭에서 현실적인 DPR 을 곱해
 *     "이 조합이 진짜로 필요로 하는 device px" 를 모은다.
 * (2) 원본보다 큰 값은 원본 폭으로 자른다 — 없는 픽셀을 만들어 봐야 용량만 는다.
 * (3) 서로 MERGE_RATIO 안에 있는 값들을 한 칸으로 합치고 **큰 쪽**을 남긴다.
 *     큰 쪽이어야 그 무리의 어떤 조합도 부족해지지 않고, 비율을 묶어 뒀으니
 *     과다 전송도 MERGE_RATIO 배로 상한이 잡힌다.
 */
function ladderFor(rel, intrinsicW) {
  const needs = [];
  for (const { w, dprs } of VIEWPORTS) {
    const box = boxAt(rel, w);
    for (const d of dprs) needs.push(Math.min(Math.ceil(box * d), intrinsicW));
  }
  const sorted = [...new Set(needs.filter((n) => n > 0))].sort((a, b) => a - b);
  if (!sorted.length) return [intrinsicW];

  const rungs = [];
  let low = sorted[0];
  let top = sorted[0];
  for (const n of sorted) {
    if (n / low <= MERGE_RATIO) {
      top = n;
      continue;
    }
    rungs.push(top);
    low = n;
    top = n;
  }
  rungs.push(top);
  return rungs;
}

/**
 * 감사 — 사다리가 실제로 촘촘한지 (화면폭 × DPR) 조합마다 확인한다.
 *
 * 이게 이 파일에서 제일 중요한 부분이다. sizes 를 고치는 것만으로는 부족하다:
 * 33513 은 375@2 에서 진짜로 670 device px 이 필요한데 사다리가 [360,560,1096] 이면
 * 여전히 1096 을 받는다(1.64배). 레이아웃이 바뀌어 상자가 움직이면 그런 구멍이
 * 조용히 다시 생기는데, 빌드도 테스트도 통과하므로 아무도 못 잡는다. 여기서 세운다.
 */
function auditLadder(rel, intrinsicW, widths) {
  const problems = [];
  const ladder = [...widths].sort((a, b) => a - b);

  for (const { w, dprs } of VIEWPORTS) {
    const box = boxAt(rel, w);
    for (const d of dprs) {
      const need = Math.min(Math.ceil(box * d), intrinsicW);
      if (need <= 0) continue;
      const pick = ladder.find((x) => x >= need) ?? ladder[ladder.length - 1];
      if (pick < need) continue; // 원본이 모자란 경우 — 확대는 하지 않는다
      const over = pick / need;
      if (over > MAX_OVERSHOOT) {
        problems.push(
          `${rel} — ${w}px@${d}x 는 ${need}px 이 필요한데 ${pick}w 를 고른다 (${over.toFixed(2)}배)`,
        );
      }
    }
  }

  /* 이 버그의 지문: 모바일 절이 데스크톱 절보다 크다.
     ScatterCards 처럼 compact 분기가 진짜로 더 넓은 경우가 있으므로,
     그건 표에 compactWider 로 적어 두게 한다 — 조용히 넘어가지 않도록 */
  if (boxAt(rel, 375) > boxAt(rel, 1440) && !PLAN[rel]?.compactWider) {
    problems.push(
      `${rel} — 375px 상자(${Math.round(boxAt(rel, 375))})가 1440px 상자(${Math.round(
        boxAt(rel, 1440),
      )})보다 넓다. 진짜라면 PLAN 에 compactWider: true 를 적을 것`,
    );
  }
  return problems;
}

async function encodeOne(file, rel, outDir) {
  const info = await classify(file, rel);
  const q = QUALITY[info.kind];
  const widths = ladderFor(rel, info.width);
  const top = widths[widths.length - 1];

  const stem = rel.replace(/\.[^.]+$/, "");
  const ext = path.extname(rel);
  const base = path.basename(stem);

  fs.mkdirSync(path.join(outDir, path.dirname(rel)), { recursive: true });

  const emitted = [];
  const write = async (name, buf) => {
    const abs = path.join(outDir, path.dirname(rel), name);
    fs.writeFileSync(abs, buf);
    emitted.push({ name: posix(path.join(path.dirname(rel), name)), size: buf.length });
    return buf.length;
  };

  const resized = (w) =>
    sharp(file).resize({ width: w, withoutEnlargement: true, fit: "inside" });

  const avif = [];
  const webp = [];
  for (const w of widths) {
    const a = await resized(w)
      .avif({ quality: q.avif, effort: 6, chromaSubsampling: q.subsample })
      .toBuffer();
    await write(`${base}-${w}w.avif`, a);
    avif.push({ w, file: `${base}-${w}w.avif`, size: a.length });

    const b = await resized(w)
      .webp({ quality: q.webp, effort: 6, alphaQuality: 100, smartSubsample: true })
      .toBuffer();
    await write(`${base}-${w}w.webp`, b);
    webp.push({ w, file: `${base}-${w}w.webp`, size: b.length });
  }

  /* 폴백은 **원본과 똑같은 파일 이름**으로 나간다. 위 [주소] 주석 참고 —
     Img.jsx 를 아직 안 쓰는 자리와 og:image 가 이 주소를 직접 가리킨다 */
  let fallbackBuf;
  if (info.alpha) {
    /* 알파가 진짜 쓰이는 이미지는 PNG 로 유지한다. palette:true 는 pngquant 와
       같은 방식(256색 양자화)이라 반투명 가장자리를 지키면서 크기를 크게 줄인다 */
    fallbackBuf = await sharp(file)
      .resize({ width: top, withoutEnlargement: true, fit: "inside" })
      .png({ palette: true, quality: 82, effort: 8, compressionLevel: 9 })
      .toBuffer();
  } else {
    fallbackBuf = await sharp(file)
      .resize({ width: top, withoutEnlargement: true, fit: "inside" })
      .flatten({ background: "#000000" })
      .jpeg({ quality: q.jpeg, progressive: true, mozjpeg: true, chromaSubsampling: "4:2:0" })
      .toBuffer();
  }

  /* 최적화가 오히려 살찌우는 경우가 있다. 줄일 폭이 없는(top == 원본 폭) 데다
     원본이 이미 JPEG 인 파일들 — pages/notice-hero.png 는 652 KB 짜리를 q82 로
     다시 구우니 그보다 커졌다. 이럴 땐 원본 바이트를 그대로 쓴다.
     작기만 한 게 아니라 재압축이 아예 없으니 화질 열화도 없다 */
  const original = fs.readFileSync(file);
  if (top >= info.width && original.length <= fallbackBuf.length) fallbackBuf = original;

  await write(`${base}${ext}`, fallbackBuf);

  const topMeta = await sharp(path.join(outDir, rel)).metadata();

  return {
    rel,
    kind: info.kind,
    alpha: info.alpha,
    intrinsic: { w: topMeta.width, h: topMeta.height },
    source: { w: info.width, h: info.height },
    widths,
    sizes: sizesFor(rel),
    avif,
    webp,
    fallback: `${base}${ext}`,
    fallbackSize: fallbackBuf.length,
    emitted,
    totalOut: emitted.reduce((a, e) => a + e.size, 0),
  };
}

/* ============================================================
 * 5. 굽기 단계 (--stage)
 * ============================================================ */

async function stage() {
  if (!fs.existsSync(SRC_DIR)) throw new Error(`${posix(SRC_DIR)} 이 없다.`);

  const all = walk(SRC_DIR);
  const sourceText = readSourceText();

  const rasters = [];
  const svgs = [];
  const dead = [];

  for (const abs of all) {
    const rel = posix(path.relative(SRC_DIR, abs));
    if (!isReferenced(rel, sourceText)) {
      /* 어디서도 안 쓰이는 파일. 원본은 git 에 남기고 dist 로만 안 내보낸다.
         cards/33514.png 는 저장소에서 제일 큰 6 MB 짜리인데 한 번도 안 그려진다 */
      dead.push({ rel, size: fs.statSync(abs).size });
      continue;
    }
    if (/\.svg$/i.test(rel)) svgs.push({ rel, abs, size: fs.statSync(abs).size });
    else rasters.push({ rel, abs });
  }

  /* 캐시 색인은 { configHash, entries } 모양이다. entries 를 꺼내지 않고 통째로 쓰면
     조회가 언제나 빗나가서 증분이 조용히 죽는다(차가운 빌드가 매번 2분) */
  const index = fs.existsSync(CACHE_INDEX)
    ? (JSON.parse(fs.readFileSync(CACHE_INDEX, "utf8")).entries ?? {})
    : {};
  const next = {};

  /* 바이트가 똑같은 원본이 4쌍 있다(figma/c == pages/menu-hero 등).
     한 번만 굽고 결과를 복사해서 인코딩 시간을 통째로 아낀다 */
  const byHash = new Map();

  let reused = 0;
  let encoded = 0;

  const jobs = rasters.map((r) => {
    const st = fs.statSync(r.abs);
    return { ...r, mtimeMs: Math.round(st.mtimeMs), size: st.size };
  });

  /* 인코딩은 libvips 스레드풀에서 돌아 이벤트 루프를 막지 않는다.
     코어 수만큼 동시에 돌리면 차가운 빌드가 몇 배 빨라진다 */
  const limit = Math.max(2, Math.min(8, os.cpus().length));
  let cursor = 0;

  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const prev = index[job.rel];
      const fresh =
        prev &&
        prev.mtimeMs === job.mtimeMs &&
        prev.size === job.size &&
        prev.configHash === CONFIG_HASH &&
        prev.emitted.every((e) => fs.existsSync(path.join(CACHE_DIR, e.name)));

      if (fresh) {
        next[job.rel] = prev;
        reused++;
        continue;
      }

      const hash = crypto
        .createHash("sha1")
        .update(fs.readFileSync(job.abs))
        .digest("hex");

      const twin = byHash.get(hash);
      /* 바이트가 같아도 **상자가 같아야** 결과를 물려받을 수 있다.
         사다리가 상자에서 나오므로, 같은 그림이 다른 자리에 다른 크기로 쓰이면
         구울 폭도 달라진다(오늘은 네 쌍 모두 100vw 히어로라 실제로 같다) */
      if (twin && sizesFor(twin.rel) === sizesFor(job.rel)) {
        /* 같은 바이트 → 같은 결과. 파일만 새 이름으로 복사한다 */
        const cloned = cloneResult(twin, job.rel);
        next[job.rel] = { ...cloned, mtimeMs: job.mtimeMs, size: job.size, configHash: CONFIG_HASH };
        reused++;
        continue;
      }

      const res = await encodeOne(job.abs, job.rel, CACHE_DIR);
      byHash.set(hash, res);
      next[job.rel] = { ...res, mtimeMs: job.mtimeMs, size: job.size, configHash: CONFIG_HASH };
      encoded++;
      process.stdout.write(`  · ${job.rel} (${res.kind}) ${bytes(job.size)} → ${bytes(res.totalOut)}\n`);
    }
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  log(`\n이미지 최적화 — 원본 ${rasters.length}장 · SVG ${svgs.length}개 · 미사용 ${dead.length}개`);
  await Promise.all(Array.from({ length: limit }, worker));

  /* SVG 는 손대지 않는다. 다 합쳐 4 KB 라 손댈 값어치가 없고,
     vector-effect·currentColor 같은 게 섞여 있으면 최적화가 오히려 깨뜨린다 */
  for (const s of svgs) {
    const out = path.join(CACHE_DIR, s.rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(s.abs, out);
    next[s.rel] = { rel: s.rel, kind: "svg", passthrough: true, size: s.size, emitted: [{ name: s.rel, size: s.size }] };
  }

  /* 캐시에서 사라진 원본의 찌꺼기를 치운다 */
  const keep = new Set();
  for (const v of Object.values(next)) for (const e of v.emitted) keep.add(e.name);
  for (const f of walk(CACHE_DIR)) {
    const rel = posix(path.relative(CACHE_DIR, f));
    if (rel === "index.json") continue;
    if (!keep.has(rel)) fs.rmSync(f, { force: true });
  }

  fs.writeFileSync(CACHE_INDEX, JSON.stringify({ configHash: CONFIG_HASH, entries: next }, null, 2));

  /* 사다리 감사. 캐시에서 그대로 온 항목도 함께 본다 — 상자를 고쳤는데 캐시가
     따뜻해서 옛 사다리가 남아 있는 경우가 제일 위험하다(설정 해시가 그걸 막지만
     이중으로 확인한다) */
  const problems = [];
  for (const [rel, v] of Object.entries(next)) {
    if (v.passthrough) continue;
    problems.push(...auditLadder(rel, v.source.w, v.widths));
  }
  if (problems.length) {
    log("\n사다리 감사 실패 — 아래 조합이 필요한 것보다 크게 받는다:");
    for (const p of problems) log(`  ✗ ${p}`);
    throw new Error(`사다리 감사 실패 ${problems.length}건`);
  }

  const manifest = buildManifest(next);
  fs.mkdirSync(GEN_DIR, { recursive: true });
  fs.writeFileSync(GEN_MANIFEST, JSON.stringify(manifest, null, 2));

  log(`\n  새로 구움 ${encoded}장 · 캐시 재사용 ${reused}장`);
  log(`  매니페스트 → ${posix(path.relative(ROOT, GEN_MANIFEST))} (${Object.keys(manifest).length}항목)`);

  return { entries: next, dead, svgs, rasters };
}

/** 바이트가 같은 쌍 — 굽지 않고 파일만 복사한다 */
function cloneResult(src, rel) {
  const dir = path.dirname(rel);
  const base = path.basename(rel).replace(/\.[^.]+$/, "");
  const ext = path.extname(rel);
  fs.mkdirSync(path.join(CACHE_DIR, dir), { recursive: true });

  const remap = (list) =>
    list.map((v) => {
      const name = `${base}-${v.w}w${path.extname(v.file)}`;
      fs.copyFileSync(
        path.join(CACHE_DIR, path.dirname(src.rel), v.file),
        path.join(CACHE_DIR, dir, name),
      );
      return { ...v, file: name };
    });

  const avif = remap(src.avif);
  const webp = remap(src.webp);
  const fallback = `${base}${ext}`;
  fs.copyFileSync(
    path.join(CACHE_DIR, path.dirname(src.rel), src.fallback),
    path.join(CACHE_DIR, dir, fallback),
  );

  const emitted = [...avif, ...webp, { file: fallback, size: src.fallbackSize }].map((v) => ({
    name: posix(path.join(dir, v.file)),
    size: v.size,
  }));

  return {
    ...src,
    rel,
    sizes: sizesFor(rel),
    avif,
    webp,
    fallback,
    emitted,
    totalOut: emitted.reduce((a, e) => a + e.size, 0),
  };
}

/* ============================================================
 * 6. 매니페스트
 * ============================================================
 *
 * 키는 **소스에 적히는 주소 그대로** — asset() 이 받는 "/images/…" 다.
 * src/Img.jsx 가 이걸 그대로 찾아 쓰고, 못 찾으면 평범한 <img> 로 떨어진다.
 */
function buildManifest(entries) {
  const out = {};
  /* 키를 정렬해서 넣는다. entries 의 순서는 **굽기가 끝난 순서** — 워커가 몇 개 붙었는지,
     그날 CPU 가 얼마나 바빴는지에 따라 매번 달라진다. 그러면 내용이 똑같은데도
     매니페스트 JSON 의 글자 배열이 달라지고, 그걸 import 하는 src/Img.jsx 를 거쳐
     번들 해시(assets/index-XXXX.js)가 빌드마다 바뀐다. 소스를 한 줄도 안 고쳤는데
     배포할 때마다 방문자의 JS 캐시가 통째로 무효가 되는 것이다.
     정렬 한 번이면 같은 입력에 같은 산출물이 나온다 */
  for (const [rel, v] of Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (v.passthrough) continue; // SVG 는 사다리가 없다
    const dir = posix(path.dirname(rel));
    const url = (name) => `/images/${dir === "." ? "" : `${dir}/`}${name}`;
    out[`/images/${rel}`] = {
      w: v.intrinsic.w,
      h: v.intrinsic.h,
      /* sizes 힌트 — 상자 표에서 그때그때 만든다(캐시에 굳은 값을 쓰지 않는다).
         화면 폭마다 다른 절을 주는 것이 핵심이다: 옛날처럼 스칼라 하나로
         "(max-width: 548px) 100vw, 548px" 를 주면 375px 폰이 335px 짜리 상자에
         750 device px 를 요구해서 사다리 맨 위 장을 받아 간다 */
      sizes: sizesFor(rel),
      avif: v.avif.map((a) => ({ w: a.w, src: url(a.file) })),
      webp: v.webp.map((a) => ({ w: a.w, src: url(a.file) })),
      fallback: url(v.fallback),
    };
  }
  return out;
}

/* ============================================================
 * 7. 내보내기 단계 (--emit)
 * ============================================================ */

function emit(staged) {
  if (!fs.existsSync(DIST)) {
    log("\ndist/ 가 없다 — 내보내기를 건너뛴다 (vite build 를 먼저 돌릴 것).");
    return null;
  }

  const entries = staged.entries;

  /* vite 는 publicDir 을 통째로 dist 로 복사한다. 그래서 이 시점의
     dist/images 에는 116 MB 짜리 원본이 그대로 들어 있다. 통째로 지우고
     구운 것만 넣는다 — 미사용 파일이 사라지는 것도 여기서 일어난다 */
  rmrf(DIST_DIR);
  fs.mkdirSync(DIST_DIR, { recursive: true });

  for (const v of Object.values(entries)) {
    for (const e of v.emitted) {
      const from = path.join(CACHE_DIR, e.name);
      const to = path.join(DIST_DIR, e.name);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }

  const manifest = buildManifest(entries);
  fs.writeFileSync(path.join(DIST_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

/* ============================================================
 * 8. 요약표
 * ============================================================ */

function summarize({ entries, dead }) {
  const dirs = new Map();
  const bump = (dir, k, n) => {
    if (!dirs.has(dir)) dirs.set(dir, { before: 0, emitted: 0, best: 0, dropped: 0, n: 0 });
    dirs.get(dir)[k] += n;
  };

  for (const [rel, v] of Object.entries(entries)) {
    const dir = posix(path.dirname(rel));
    const before = fs.statSync(path.join(SRC_DIR, rel)).size;
    bump(dir, "before", before);
    bump(dir, "n", 1);
    if (v.passthrough) {
      bump(dir, "emitted", v.size);
      bump(dir, "best", v.size);
      continue;
    }
    bump(dir, "emitted", v.totalOut);
    /* 실제로 브라우저가 받는 것은 사다리 중 **한 장**이다.
       AVIF 를 읽는 브라우저(오늘날 95% 이상)가 제일 큰 장을 골랐을 때를 잡는다 —
       즉 이건 최악의 경우이고 보통은 이보다 적게 받는다 */
    bump(dir, "best", Math.max(...v.avif.map((a) => a.size)));
  }
  for (const d of dead) bump(posix(path.dirname(d.rel)), "dropped", d.size);
  for (const d of dead) bump(posix(path.dirname(d.rel)), "before", d.size);

  const rows = [...dirs.entries()].sort((a, b) => b[1].before - a[1].before);
  const pad = (s, n) => String(s).padStart(n);
  const padR = (s, n) => String(s).padEnd(n);

  log("\n┌─ 디렉터리별 ────────────────────────────────────────────────────────────");
  log(
    `│ ${padR("폴더", 12)} ${pad("장", 3)} ${pad("원본", 10)} ${pad("dist 전체", 10)} ${pad("실제 전송", 10)} ${pad("절감", 7)}`,
  );
  log("├──────────────────────────────────────────────────────────────────────────");
  let B = 0;
  let E = 0;
  let T = 0;
  let D = 0;
  for (const [dir, v] of rows) {
    B += v.before;
    E += v.emitted;
    T += v.best;
    D += v.dropped;
    log(
      `│ ${padR(dir, 12)} ${pad(v.n, 3)} ${pad(bytes(v.before), 10)} ${pad(bytes(v.emitted), 10)} ${pad(bytes(v.best), 10)} ${pad(pct(v.before, v.best), 7)}`,
    );
  }
  log("├──────────────────────────────────────────────────────────────────────────");
  log(
    `│ ${padR("합계", 12)} ${pad("", 3)} ${pad(bytes(B), 10)} ${pad(bytes(E), 10)} ${pad(bytes(T), 10)} ${pad(pct(B, T), 7)}`,
  );
  log("└──────────────────────────────────────────────────────────────────────────");
  log("  원본      = public/images 의 바이트");
  log("  dist 전체 = 구운 변형 전부(AVIF+WebP+폴백). 배포 아티팩트 크기다");
  log("  실제 전송 = 브라우저가 실제로 받는 양. 사다리에서 한 장만 고르므로");
  log("              여기서는 AVIF 최대 폭을 다 받았다고 친 **최악의 경우**다");
  if (D) log(`  미사용 ${dead.length}개 ${bytes(D)} 는 dist 로 내보내지 않았다(원본은 git 에 그대로).`);
  return { before: B, emitted: E, transfer: T, dropped: D };
}

/* ============================================================
 * 9. 본체
 * ============================================================ */

/**
 * --plan : 굽지 않고 "무엇을 구울 것인지" 만 보여 준다.
 * 상자를 고친 뒤 사다리가 어떻게 나오는지 2분짜리 인코딩 없이 확인하려고 둔 문이다.
 */
async function showPlan() {
  const sourceText = readSourceText();
  const rows = [];
  for (const abs of walk(SRC_DIR)) {
    const rel = posix(path.relative(SRC_DIR, abs));
    if (!isReferenced(rel, sourceText) || /\.svg$/i.test(rel)) continue;
    const meta = await sharp(abs).metadata();
    const widths = ladderFor(rel, meta.width);
    rows.push({ rel, w: meta.width, widths, problems: auditLadder(rel, meta.width, widths) });
  }
  rows.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  let rungs = 0;
  for (const r of rows) {
    rungs += r.widths.length;
    log(`\n${r.rel}  (원본 ${r.w}px)`);
    log(`  사다리 ${r.widths.join(" / ")}`);
    log(`  sizes  ${sizesFor(r.rel)}`);
    for (const p of r.problems) log(`  ✗ ${p}`);
  }
  const bad = rows.reduce((a, r) => a + r.problems.length, 0);
  log(`\n${rows.length}장 · 사다리 칸 합계 ${rungs} (장당 평균 ${(rungs / rows.length).toFixed(1)}) · 감사 실패 ${bad}건`);
  if (bad) process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--plan")) return showPlan();
  const doStage = args.includes("--stage") || !args.includes("--emit");
  const doEmit = args.includes("--emit") || !args.includes("--stage");

  let staged;
  if (doStage) {
    staged = await stage();
  } else {
    /* --emit 단독. 캐시가 없거나 설정이 바뀌었으면 조용히 넘어가면 안 된다 —
       그대로 두면 dist 에 최적화 안 된 원본이 나가고 아무도 모른다 */
    if (!fs.existsSync(CACHE_INDEX)) {
      log("캐시가 없다 → 지금 굽는다.");
      staged = await stage();
    } else {
      const idx = JSON.parse(fs.readFileSync(CACHE_INDEX, "utf8"));
      if (idx.configHash !== CONFIG_HASH) {
        log("설정이 바뀌었다 → 다시 굽는다.");
        staged = await stage();
      } else {
        staged = { entries: idx.entries, dead: [], svgs: [], rasters: [] };
        /* --emit 단독일 때도 미사용 목록은 다시 계산해야 요약이 맞는다 */
        const sourceText = readSourceText();
        for (const abs of walk(SRC_DIR)) {
          const rel = posix(path.relative(SRC_DIR, abs));
          if (!isReferenced(rel, sourceText)) staged.dead.push({ rel, size: fs.statSync(abs).size });
        }
      }
    }
  }

  if (doEmit) {
    const m = emit(staged);
    if (m) log(`\n  dist/images/manifest.json (${Object.keys(m).length}항목)`);
  }

  summarize(staged);
}

main().catch((err) => {
  /* 조용히 실패하면 116 MB 가 그대로 배포된다. 빌드를 세운다 */
  console.error("\n이미지 최적화 실패:", err);
  process.exit(1);
});
