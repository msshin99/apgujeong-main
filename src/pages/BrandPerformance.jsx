import Reveal, { RevealText, useInView } from "../Reveal.jsx";
import GlowBackdrop from "../GlowBackdrop.jsx";
import BrandCost from "./BrandCost.jsx";

/**
 * Figma: Frame 2095587787 (332:853) — 1680 x 790
 *
 *   헤더 332:854  w 871, gap 24 / 16, 가운데 정렬
 *   카드 3장 332:859  544 x 554, 가로 gap 24  (544x3 + 24x2 = 1680 ✓)
 *     카드 332:860  bg #161616, p 48, radius 16, 세로 gap 24
 *       ├ 제목 332:861  w 448, gap 16
 *       └ 그래프 332:864  가로 gap 68, 하단 정렬
 *           막대 108 폭, 라벨과 gap 8, 수치와 gap 12
 *
 * 배경은 메인페이지 다크 구간과 같은 검정 + 붉은 블러 원.
 */
const BAR_W = 108;
const BASE_H = 60; // Figma 332:868 — 기준 막대
const PEAK_H = 240; // Figma 332:873 — 강조 막대

const BAR_GRADIENT =
  "linear-gradient(140.578deg, rgb(255,103,87) 18.276%, rgb(255,140,129) 49.377%, rgb(188,30,14) 80.478%)";

/** Figma 332:860 / 875 / 890 */
const CARDS = [
  {
    id: "sales",
    title: "전년대비 매출 성장률",
    sub: "2025-2026 비교 데이터",
    base: { value: "+10%", label: ["기존 지점", "평균"] },
    peak: { value: "+120%", label: ["신규 프리미엄", "지점"] },
  },
  {
    id: "csi",
    title: "고객 만족도 점수 (CSI)",
    sub: "온라인 리뷰 & 설문조사 결과",
    base: { value: "+10%", label: ["이전 분기", "점수"] },
    peak: { value: "+120%", label: ["목표 달성", "현재"] },
  },
  {
    id: "revisit",
    title: "재방문 고객 비율",
    sub: "단골 고객과의 신뢰의 지표",
    base: { value: "+10%", label: ["이전 분기", "평균"] },
    peak: { value: "+120%", label: ["현재 목표", "달성율"] },
  },
];

/** 막대가 화면에 들어오면 아래에서 위로 자라난다 */
function Bar({ height, gradient, delay }) {
  const [ref, inView] = useInView(0.35);

  return (
    <div
      ref={ref}
      className={`w-full origin-bottom overflow-hidden rounded-[4px] transition-[filter,box-shadow] duration-500 ease-out ${
        gradient
          ? "group-hover/col:shadow-[0_0_48px_rgba(240,58,44,0.55)] group-hover/col:brightness-115"
          : "group-hover/col:brightness-140"
      }`}
      style={{
        height,
        background: gradient ? BAR_GRADIENT : "#575757",
        transform: inView ? "scaleY(1)" : "scaleY(0)",
        transition: `transform 1100ms cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
    />
  );
}

function Column({ data, gradient, delay }) {
  return (
    // hover 하면 막대가 밝아지고 살짝 떠오른다
    <div
      className="group/col flex cursor-default flex-col items-center gap-[12px] transition-transform duration-500 ease-out hover:-translate-y-[6px]"
      style={{ width: BAR_W }}
    >
      {/* Figma 332:866 / 871 — Pretendard SemiBold 28 / lh 38 / -0.7 */}
      <Reveal delay={delay + 300} y={12} duration={600}>
        <p
          className={`w-full text-center text-[22px] leading-[30px] font-semibold tracking-[-0.55px] md:text-[28px] md:leading-[38px] md:tracking-[-0.7px] ${
            gradient ? "text-white" : "text-[#767676]"
          }`}
        >
          {data.value}
        </p>
      </Reveal>

      <div className="flex w-full flex-col items-center gap-[8px]">
        <Bar height={gradient ? PEAK_H : BASE_H} gradient={gradient} delay={delay} />
        {/* Figma 332:869 / 874 — Pretendard Medium 20 / lh 30 / -0.5 */}
        <p
          className={`w-full text-center text-[16px] leading-[24px] font-medium tracking-[-0.4px] md:text-[20px] md:leading-[30px] md:tracking-[-0.5px] ${
            gradient ? "text-white" : "text-[#767676]"
          }`}
        >
          {data.label.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

export default function BrandPerformance() {
  return (
    <section className="relative w-full overflow-hidden bg-black">
      {/* 메인페이지와 같은 붉은 블러 원 배경 */}
      <GlowBackdrop />

      {/* 검은 배경 블록이라 위아래 간격을 안쪽 여백으로 갖는다 (앞뒤 섹션과 각각 200) */}
      <div className="relative mx-auto flex w-full max-w-[1680px] flex-col items-center gap-[40px] px-[20px] py-[100px] font-pretendard sm:px-[24px] md:px-[40px] md:py-[150px] lg:gap-[60px] lg:py-[200px]">
        {/* Figma 332:854 — 헤더 w 871 */}
        <div className="flex w-full max-w-[871px] flex-col items-center gap-[14px] text-center lg:gap-[24px]">
          {/* Figma 332:855 — Pretendard Medium 20 / lh 30 / -0.5 / 흰색 */}
          <Reveal y={16} duration={600}>
            <p className="text-[15px] leading-[22px] font-medium tracking-[-0.38px] text-white md:text-[18px] lg:text-[20px] lg:leading-[30px] lg:tracking-[-0.5px]">
              성능요약
            </p>
          </Reveal>
          {/* Figma 332:857 — Pretendard Bold 60 / lh 80 / -1.5 / 흰색 */}
          <h2 className="w-full text-[clamp(26px,6.4vw,60px)] leading-[1.32] font-bold tracking-[-0.025em] text-white">
            <RevealText lines={["최상의 맛과 만족을 위한 노력"]} delay={80} step={24} />
          </h2>
          {/* Figma 332:858 — Pretendard Regular 18 / lh 26 / -0.45 / 흰색 60% */}
          <Reveal delay={360} y={16} duration={600}>
            <p className="text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[rgba(255,255,255,0.6)] md:text-[16px] lg:text-[18px] lg:leading-[26px] lg:tracking-[-0.45px]">
              2026년 상반기 핵심 성과 지표 분석
            </p>
          </Reveal>
        </div>

        {/* Figma 332:859 — 카드 3장, gap 24 */}
        <div className="grid w-full grid-cols-1 gap-[24px] md:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card, i) => (
            <Reveal key={card.id} delay={i * 120} y={32}>
              {/* Figma 332:860 — bg #161616, p 48, radius 16 */}
              <div className="flex h-full flex-col items-center gap-[24px] rounded-[16px] bg-[#161616] p-[28px] transition-colors duration-500 hover:bg-[#1c1c1c] md:p-[40px] lg:p-[48px]">
                <div className="flex w-full flex-col items-start gap-[10px] md:gap-[16px]">
                  {/* Figma 332:862 — Pretendard SemiBold 26 / lh 36 / -0.65 / 흰색 */}
                  <p className="text-[20px] leading-[28px] font-semibold tracking-[-0.5px] text-white md:text-[26px] md:leading-[36px] md:tracking-[-0.65px]">
                    {card.title}
                  </p>
                  {/* Figma 332:863 — Pretendard Regular 16 / lh 24 / -0.4 / #767676 */}
                  <p className="w-full text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[16px] md:leading-[24px] md:tracking-[-0.4px]">
                    {card.sub}
                  </p>
                </div>

                {/* Figma 332:864 — 가로 gap 68, 하단 정렬 */}
                <div className="mt-[16px] flex items-end gap-[40px] md:mt-[24px] md:gap-[68px]">
                  <Column data={card.base} gradient={false} delay={i * 120} />
                  <Column data={card.peak} gradient delay={i * 120 + 120} />
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Figma 332:905 — 비용 구성 도넛 + 개설 비용 표 (같은 다크 구간 안) */}
        <div className="mt-[40px] w-full lg:mt-[80px]">
          <BrandCost />
        </div>
      </div>
    </section>
  );
}
