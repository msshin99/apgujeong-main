import { useEffect, useRef, useState } from "react";
import Reveal, { RevealText } from "./Reveal.jsx";
import { asset } from "./lib/asset.js";

/**
 * Figma: Frame 2095587696 (332:669) — 1200 x 1542
 *
 * 세로 flex, gap 60, items-center.
 *   헤더 871 x 282 (가운데 정렬)
 *   원형 다이어그램 1200 x 1200 — 점선 궤도 SVG 위에 원 4개가 32px 씩 겹쳐 가로로 배치
 *
 * 원 4개의 줄(1512)이 프레임(1200)보다 넓어 좌우로 156 씩 넘친다. (Figma 332:680 x=-156)
 * 배경(검정 + 붉은 블러 원)과 배치는 DarkStage 가 담당한다.
 *
 * 예전에는 compact 프롭으로 데스크톱 트리(캔버스 배율)와 카드 목록을 갈랐다.
 * 그 방식은 1200~1440 구간에서 본문이 배율을 타 쪼그라들었다. 그래서 compact 를 없애고
 * **같은 원소 4개**를 폭에 따라 CSS 로만 바꾼다 — 정적 HTML 에 본문이 한 번만 실린다.
 *   · 좁으면 카드(둥근 사각형) 세로/2열 그리드, xl 에서 402px 원으로 겹쳐 배치한다.
 *   · 402px 원은 좁은 화면보다 커서 성립하지 않으므로 점선 궤도·회전 점은 xl 에서만 켠다.
 *   · 타이포는 브레이크포인트별 고정 px 계단(xl = 피그마 원본값).
 *   · 이 저장소는 lg·xl·2xl 이 전부 1200px 이라 lg: 는 죽는다. 데스크톱 단은 xl:(=1200) 로 준다.
 */

// 원(카드)이 화면에 들어오면 왼쪽부터 하나씩 나타난다
const REVEAL_DURATION = 900; // ms
const REVEAL_STAGGER = 220; // ms — 원 사이 시차
const REVEAL_RISE = 32; // px — 아래에서 올라오는 거리

/**
 * Figma 332:678 / 679 — 점선 궤도 위의 붉은 점 2개. (xl 에서만)
 * 원본 좌표는 (1023.5, 1027.5) / (175.5, 176.5), 반지름 13.
 * 궤도 중심(600.5, 600.5)에서 각각 약 45도 / 225도 지점 — 정확히 마주보고 있다.
 * 1200x1200 래퍼를 통째로 회전시키면 두 점이 궤도를 따라 돈다.
 */
const ORBIT_DOTS = [
  { id: "d1", cx: 1023.5, cy: 1027.5 },
  { id: "d2", cx: 175.5, cy: 176.5 },
];
const DOT_R = 13;
const ORBIT_DURATION = 12; // 초 — 한 바퀴
const DOT_GRADIENT =
  "linear-gradient(160deg, #FF6757 0%, #FF8C81 50%, #BC1E0E 100%)";
const DOT_GLOW = "0 0 10px 0 rgba(255,85,78,0.9)"; // SVG feGaussianBlur(5) 근사

/** Figma 332:681 / 686 / 691 / 696 */
/* 네 문구의 길이를 비슷하게 맞췄다.
   길이가 제각각이면 좁은 원 안에서 어떤 칸만 네 줄이 되고 마지막 줄에
   글자 한두 개만 남아 흘러내리는 것처럼 보인다. */
const CIRCLES = [
  {
    no: "01",
    label: "ORIGIN",
    desc: "전국 산지를 직접 찾아 고른 최상급 한우 생곱창만을 씁니다.",
  },
  {
    no: "02",
    label: "SECRET",
    desc: "독자적인 저온 숙성과 비법 소스로 잡내 없이 풍미를 살립니다.",
  },
  {
    no: "03",
    label: "SPACE",
    desc: "감각적인 인테리어와 조명, 음악이 어우러진 공간을 만듭니다.",
  },
  {
    no: "04",
    label: "SERVICE",
    desc: "그릴 마스터의 세심한 조리로 미식의 시간을 완성합니다.",
  },
];

export default function Unrivaled() {
  const circlesRef = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = circlesRef.current;
    if (!el) return;

    // 접근성: 모션을 줄이도록 설정한 사용자에게는 바로 드러낸다
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }

    // 관찰을 끊지 않는다 — 벗어나면 접혔다가 다시 들어올 때 처음부터 재생된다
    const io = new IntersectionObserver(
      ([entry]) => setShown(entry.isIntersecting),
      {
        threshold: 0.2,
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    /* Figma 332:669 — 1200 폭, 세로 gap 60 / items-center */
    <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-[48px] font-pretendard md:gap-[56px] xl:gap-[60px]">
      {/* Figma 332:670 — w 871, gap 24, 가운데 정렬 */}
      <div className="flex w-full max-w-[871px] flex-col items-center gap-[16px] text-center md:gap-[20px] xl:gap-[24px]">
        {/* Figma 332:671 — Pretendard Medium 20 / lh 30 / -0.5 / 흰색 */}
        <Reveal className="w-full" y={20} duration={700}>
          <p className="w-full text-[15px] leading-[22px] font-medium tracking-[-0.38px] text-white md:text-[18px] md:leading-[26px] xl:text-[20px] xl:leading-[30px] xl:tracking-[-0.5px]">
            K-곱창의 기준을 다시 쓰다
          </p>
        </Reveal>

        {/* Figma 332:672 — gap 16 */}
        <div className="flex w-full flex-col items-center gap-[12px] xl:gap-[16px]">
          {/* Figma 332:673 — Pretendard Bold 60 / lh 80 / -1.5 / 흰색 / uppercase */}
          <h2 className="w-full text-[clamp(26px,6.4vw,44px)] leading-[1.28] font-bold tracking-[-0.03em] text-white uppercase xl:text-[60px] xl:leading-[80px] xl:tracking-[-1.5px]">
            {/* 줄바꿈이 일어나는 영문 제목이라 단어 단위로 쪼갠다 */}
            <RevealText
              lines={["The Unrivaled Masterpiece of Taste"]}
              unit="word"
              step={70}
              delay={120}
            />
          </h2>
          {/* Figma 332:674 — Pretendard Regular 18 / lh 26 / -0.45 / 흰색 60% / 2줄 */}
          <Reveal className="w-full" delay={420} y={20} duration={700}>
            <p className="w-full text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[rgba(255,255,255,0.6)] md:text-[16px] md:leading-[24px] xl:text-[18px] xl:leading-[26px] xl:tracking-[-0.45px]">
              우리는 단순한 곱창을 요리하는 것이 아닌, 한 편의 미식 작품을
              완성합니다. 전통의 깊이와 현대적 세련미가 교차하는{" "}
              {/* 줄바꿈은 데스크톱에서만 — 좁은 화면은 폭에 맞춰 자연스럽게 흐른다 */}
              <br className="hidden xl:block" />그 정점의 순간, 곱창
              마스터피스만의 철학을 경험하십시오.
            </p>
          </Reveal>
        </div>
      </div>

      {/* Figma 332:675 — xl 에서 1200 x 1200 무대. 좁으면 카드 그리드를 담는 자연 높이 래퍼가 된다 */}
      <div className="relative w-full xl:size-[1200px] xl:shrink-0">
        {/* Figma 332:677 — 점선 원 궤도. xl 에서만 (좁은 화면은 카드라 궤도가 없다) */}
        <img
          src={asset("/images/unrivaled/orbit.svg")}
          alt=""
          aria-hidden
          // 첫 화면 아래의 장식 궤도라 늦게 받아도 된다
          loading="lazy"
          decoding="async"
          className="absolute inset-0 hidden size-full max-w-none xl:block"
        />

        {/* Figma 332:678 / 679 — 궤도 위의 붉은 점. xl 에서만.
            래퍼를 회전시키면 두 점이 점선 궤도를 따라 한 바퀴 돈다.
            (transform-origin 기본값이 1200x1200 의 중심 = 궤도 중심) */}
        <div
          aria-hidden
          className="orbit-dots pointer-events-none absolute inset-0 hidden will-change-transform xl:block"
          style={{ animation: `orbitSpin ${ORBIT_DURATION}s linear infinite` }}
        >
          {ORBIT_DOTS.map((d) => (
            <div
              key={d.id}
              className="absolute rounded-full"
              style={{
                left: d.cx - DOT_R,
                top: d.cy - DOT_R,
                width: DOT_R * 2,
                height: DOT_R * 2,
                backgroundImage: DOT_GRADIENT,
                boxShadow: DOT_GLOW,
              }}
            />
          ))}
        </div>

        {/* 같은 원소 4개 — 좁으면 카드 그리드, xl 에서 top 399 가로 중앙에 겹친 원(32px 겹침).
            IntersectionObserver 로 등장을 재생하므로 절대·그리드 어느 쪽이든 관찰이 붙는다 */}
        <div
          ref={circlesRef}
          className="grid w-full grid-cols-1 gap-[16px] md:grid-cols-2 md:gap-[20px] xl:absolute xl:top-[399px] xl:left-1/2 xl:flex xl:w-auto xl:-translate-x-1/2 xl:items-center xl:gap-0"
        >
          {CIRCLES.map((c, i) => (
            <div
              key={c.no}
              // 좁으면 둥근 사각형 카드(좌측 정렬), xl 에서 402 원(가운데 정렬).
              // Figma 332:681 — 402 원, 흰 테두리 1px, p 60, 내부 gap 28.
              // hover 는 transform 을 쓰지 않는 속성만 건드린다 —
              // 등장 모션이 transform 을 점유하고 있어 겹치면 서로 덮어쓴다.
              // 겹침(-32)은 xl 에서만, 마지막 원은 0 으로 되돌린다.
              className="group flex h-full flex-col items-start gap-[14px] rounded-[20px] border border-solid border-white/25 bg-white/[0.03] p-[24px] will-change-transform md:p-[28px] xl:size-[402px] xl:-mr-[32px] xl:shrink-0 xl:items-center xl:justify-center xl:gap-[28px] xl:rounded-[9999px] xl:border-white/70 xl:bg-transparent xl:p-[60px] xl:transition-[background-color,border-color,box-shadow] xl:duration-500 xl:last:mr-0 xl:hover:border-white xl:hover:bg-[rgba(234,102,95,0.07)] xl:hover:shadow-[0_0_80px_rgba(234,102,95,0.35)]"
              style={{
                opacity: shown ? 1 : 0,
                transform: shown
                  ? "translate3d(0,0,0)"
                  : `translate3d(0, ${REVEAL_RISE}px, 0)`,
                transition:
                  `opacity ${REVEAL_DURATION}ms cubic-bezier(0.22,1,0.36,1) ${i * REVEAL_STAGGER}ms,` +
                  ` transform ${REVEAL_DURATION}ms cubic-bezier(0.22,1,0.36,1) ${i * REVEAL_STAGGER}ms`,
              }}
            >
              {/* Figma 332:682 — 라벨 + 어깨번호, gap 4 */}
              <div className="flex shrink-0 items-start gap-[4px] whitespace-nowrap">
                {/* Figma 332:683 — Inter Bold 38 / lh 34 / -0.95 / 흰색
                          (Inter 대신 Pretendard — 라틴 글리프가 Inter 기반) */}
                <p className="text-[26px] leading-[28px] font-bold tracking-[-0.65px] text-white md:text-[30px] md:leading-[32px] xl:text-[38px] xl:leading-[34px] xl:tracking-[-0.95px]">
                  {c.label}
                </p>
                {/* Figma 332:684 — Pretendard Regular 18 / lh 26 / -0.45 / #ea665f / top -13 */}
                <span className="relative top-[-8px] text-[14px] leading-[20px] font-normal tracking-[-0.35px] text-[#ea665f] xl:top-[-13px] xl:text-[18px] xl:leading-[26px] xl:tracking-[-0.45px]">
                  {c.no}
                </span>
              </div>

              {/* Figma 332:685 — Pretendard Regular 16 / lh 24 / -0.4 / 흰색 70% / xl 에서 가운데.
                  break-keep 은 단어 중간에서 줄이 끊기지 않게 한다.
                  없으면 "완/벽히" 처럼 어절이 쪼개져 읽기 나쁘다. */}
              <p className="w-full text-left text-[14px] leading-[22px] font-normal tracking-[-0.35px] break-keep text-[rgba(255,255,255,0.7)] md:text-[15px] xl:text-center xl:text-[16px] xl:leading-[24px] xl:tracking-[-0.4px] xl:transition-colors xl:duration-500 xl:group-hover:text-white">
                {c.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes orbitSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .orbit-dots { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
