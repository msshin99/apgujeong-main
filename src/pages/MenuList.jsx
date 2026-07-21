import Reveal, { RevealText } from "../Reveal.jsx";
import Img from "../Img.jsx";
import { asset } from "../lib/asset.js";

/**
 * Figma: Frame 2095587816 (332:1148) — 1680 폭
 *
 *   섹션 3개(메인 / 사이드 / 술·음료), 섹션 간격 100
 *   각 섹션: 헤더 148 + 40 + 카드 그리드
 *   카드 402 x 508, 가로 gap 24  (402x4 + 24x3 = 1680 ✓)
 *     ├ 이미지 영역 402 x 402, bg #f6f7fb, 사진에 그림자
 *     └ 텍스트 w 305, gap 12
 *         ├ 이름 SemiBold 20 / -0.5 / 검정
 *         ├ 영문 Regular 16 / lh 24 / -0.4 / #767676
 *         └ 메타 행 gap 16 — "라벨 | 값" 묶음, 구분선 1x14 #e5e5ec, 값은 #e61911
 */

/** 메뉴 데이터. 사진 16장 모두 Figma 에셋을 항목별로 받아 연결했다 */
const SECTIONS = [
  {
    id: "main",
    label: "Main Menu",
    title: "메인 메뉴",
    sub: "진심을 담은 고집이 만들어낸 최상의 풍미와 서비스",
    items: [
      { ko: "한우 곱창 구이", en: "Grilled Hanwoo Small Intestines", price: "30,000원", origin: "국내산 한우", weight: "200G", image: asset("/images/menu/m1.png") },
      { ko: "한우 대창 구이", en: "Grilled Hanwoo Large Intestines", price: "30,000원", origin: "국내산 한우", weight: "200G", image: asset("/images/menu/m2.png") },
      { ko: "한우 막창 구이", en: "Grilled Hanwoo Abomasum", price: "30,000원", origin: "국내산 한우", weight: "150G", image: asset("/images/menu/m3.png") },
      { ko: "특창 구이", en: "Grilled Special Tripe", price: "33,000원", origin: "뉴질랜드산", weight: "150G", image: asset("/images/menu/m4.png") },
    ],
  },
  {
    id: "side",
    label: "Side Menu",
    title: "사이드 메뉴",
    sub: "진심을 담은 고집이 만들어낸 최상의 풍미와 서비스",
    items: [
      { ko: "한우 차돌박이", en: "Hanwoo Beef Brisket", price: "30,000원", origin: "국내산 한우", weight: "150G", image: asset("/images/menu/s1.png") },
      { ko: "한우 곱창 전골", en: "Hanwoo Beef Small Intestine Hot Pot", price: "28,000원", origin: "국내산 한우", weight: "150G", image: asset("/images/menu/s2.png") },
      { ko: "양곱창 볶음밥", en: "Tripe and Small Intestine Fried Rice", price: "10,000원", image: asset("/images/menu/s3.png") },
      { ko: "볶음밥", en: "Fried Rice", price: "4,000원", image: asset("/images/menu/s4.png") },
    ],
  },
  {
    id: "drink",
    label: "Beverages",
    title: "술 / 음료",
    sub: "진심을 담은 고집이 만들어낸 최상의 풍미와 서비스",
    items: [
      { ko: "음료", en: "콜라 / 사이다 / 갈아만든 배 / 탄산수", price: "3,000원", image: asset("/images/menu/d1.png") },
      { ko: "88 막걸리", en: "88 Korean Rice Wine", price: "10,000원", image: asset("/images/menu/d2.png") },
      { ko: "소주", en: "참이슬 / 처음처럼 / 진로", price: "6,000원", image: asset("/images/menu/d3.png") },
      { ko: "잭다니엘 하이볼", en: "Jack Daniel's Highball", price: "10,000원", image: asset("/images/menu/d4.png") },
      { ko: "맥주", en: "카스 / 테라 / 클라우드", price: "6,000원 / 7,000원", image: asset("/images/menu/d5.png") },
      { ko: "화요 25", en: "Hwayo 25", price: "30,000원", image: asset("/images/menu/d6.png") },
      { ko: "우도 땅콩 막걸리", en: "Udo Peanut Makgeolli", price: "8,000원", image: asset("/images/menu/d7.png") },
      { ko: "일품진로", en: "Ilpoom Jinro", price: "30,000원", image: asset("/images/menu/d8.png") },
    ],
  },
];

/** Figma 332:1167 — "라벨 | 값" 묶음. 값만 브랜드 컬러 */
function Meta({ label, value }) {
  return (
    <span className="flex items-center gap-[8px]">
      <span className="text-[14px] leading-[24px] font-normal tracking-[-0.35px] whitespace-nowrap text-[#767676] md:text-[16px] md:leading-[26px] md:tracking-[-0.4px]">
        {label}
      </span>
      <span className="h-[14px] w-px shrink-0 bg-[#e5e5ec]" />
      <span className="text-[14px] leading-[24px] font-medium tracking-[-0.35px] whitespace-nowrap text-[#e61911] md:text-[16px] md:leading-[26px] md:tracking-[-0.4px]">
        {value}
      </span>
    </span>
  );
}

function MenuCard({ item }) {
  return (
    <article className="group flex w-full flex-col gap-[16px]">
      {/* Figma 332:1157 — 402 x 402, bg #f6f7fb */}
      <div
        className="flex w-full items-center justify-center overflow-hidden bg-[#f6f7fb]"
        style={{ aspectRatio: "1 / 1" }}
      >
        <Img
          src={item.image}
          alt=""
          /* 메뉴 사진 16장이 모두 대표 이미지 아래에 있어 첫 화면에서는 한 장도 보이지 않는다.
             전부 한꺼번에 받으면 첫 진입이 느려지므로 화면에 들어올 때 받는다 */
          loading="lazy"
          decoding="async"
          /* Figma 332:1160 — shadow 12 12 10 rgba(0,0,0,0.3).
             box-shadow 는 이미지의 사각 박스를 따라가므로 배경이 투명한 누끼 사진에서는
             네모난 그림자가 생긴다. drop-shadow 는 알파 실루엣을 따라간다. */
          className="max-h-[74%] max-w-[86%] object-contain drop-shadow-[12px_12px_10px_rgba(0,0,0,0.3)] transition-transform duration-700 ease-out group-hover:scale-[1.06]"
        />
      </div>

      {/* Figma 332:1162 — w 305, gap 12 */}
      <div className="flex w-full max-w-[305px] flex-col gap-[12px]">
        <div className="flex flex-col gap-[4px]">
          {/* Figma 332:1164 — Pretendard SemiBold 20 / -0.5 / 검정 */}
          <p className="text-[17px] leading-[24px] font-semibold tracking-[-0.43px] text-black md:text-[20px] md:tracking-[-0.5px]">
            {item.ko}
          </p>
          {/* Figma 332:1165 — Pretendard Regular 16 / lh 24 / -0.4 / #767676 */}
          <p className="text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[16px] md:leading-[24px] md:tracking-[-0.4px]">
            {item.en}
          </p>
        </div>

        {/* Figma 332:1166 — 메타 행, gap 16 */}
        <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[4px]">
          <Meta label="가격" value={item.price} />
          {item.origin && <Meta label={item.origin} value={item.weight} />}
        </div>
      </div>
    </article>
  );
}

export default function MenuList() {
  return (
    <div className="w-full bg-white px-[20px] pt-[100px] pb-[100px] sm:px-[24px] md:px-[40px] md:pt-[150px] md:pb-[150px] lg:pt-[200px] lg:pb-[200px]">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-[80px] font-pretendard md:gap-[100px]">
        {SECTIONS.map((section) => (
          <section key={section.id} className="flex w-full flex-col gap-[28px] md:gap-[40px]">
            {/* Figma 332:1150 — 헤더 */}
            <div className="flex w-full flex-col gap-[12px] md:gap-[20px]">
              {/* Figma 332:1151 — Pretendard Medium 20 / lh 30 / -0.5 / #e61911 */}
              <Reveal y={16} duration={600}>
                <p className="text-[15px] leading-[22px] font-medium tracking-[-0.38px] text-[#e61911] md:text-[18px] lg:text-[20px] lg:leading-[30px] lg:tracking-[-0.5px]">
                  {section.label}
                </p>
              </Reveal>
              {/* Figma 332:1153 — Pretendard Bold 46 / lh 60 / 검정 */}
              <h2 className="text-[clamp(24px,5.2vw,46px)] leading-[1.3] font-bold tracking-[-0.025em] text-black">
                <RevealText lines={[section.title]} delay={80} step={26} />
              </h2>
              {/* Figma 332:1154 — Pretendard Regular 18 / lh 26 / -0.45 / #767676 */}
              <Reveal delay={300} y={16} duration={600}>
                <p className="text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[16px] lg:text-[18px] lg:leading-[26px] lg:tracking-[-0.45px]">
                  {section.sub}
                </p>
              </Reveal>
            </div>

            {/* Figma 332:1155 — 카드 그리드, gap 24 / 세로 48 */}
            <div className="grid w-full grid-cols-2 gap-x-[16px] gap-y-[36px] md:gap-x-[24px] md:gap-y-[48px] lg:grid-cols-4">
              {section.items.map((item, i) => (
                <Reveal key={item.ko} delay={(i % 4) * 100} y={32}>
                  <MenuCard item={item} />
                </Reveal>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
