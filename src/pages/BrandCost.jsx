import { useEffect, useState } from "react";
import Reveal, { useInView } from "../Reveal.jsx";

/**
 * Figma: Frame 2095587789 (332:905) — 1330 x 677
 *
 *   왼쪽 332:906  650 폭 도넛 차트 (559 지름, 가운데 26% / 월수익)
 *   오른쪽 332:936  600 폭 표 — 3열(200씩), 행 높이 76, 마지막 합계 행 #e61911
 *
 * 도넛은 Figma 가 조각마다 SVG 를 따로 내보내지만, 그대로 쓰면 크기 조절과
 * 애니메이션이 어렵다. 조각 비율을 바운딩 박스에서 역산해 SVG 로 직접 그린다.
 *   조각 1  0° ~ 137.1°   38.1%
 *   조각 2  137.1 ~ 222.9  23.8%
 *   조각 3  222.9 ~ 291.4  19.0%
 *   조각 4  291.4 ~ 337.1  12.7%
 *   조각 5  337.1 ~ 360     6.4%   (합계 100 ✓)
 */
const R_OUT = 279.5; // Figma 559 / 2
const R_IN = 107;
const R_MID = (R_OUT + R_IN) / 2;
const STROKE = R_OUT - R_IN;
const CIRC = 2 * Math.PI * R_MID;

/** 시작 각도(12시 기준 시계방향)와 비율 */
const SEGMENTS = [
  { id: "s1", from: 0, ratio: 0.381, color: "url(#costRed)", label: "인건비" },
  { id: "s2", from: 0.381, ratio: 0.238, color: "#1a1a1a", label: "인건비" },
  { id: "s3", from: 0.619, ratio: 0.19, color: "#2b2b2b", label: "재료비" },
  { id: "s4", from: 0.809, ratio: 0.127, color: "#a8a8a8", label: "인건비" },
  { id: "s5", from: 0.936, ratio: 0.064, color: "#e0e0e0", label: "인건비" },
];

/* Figma 332:917 / 920 / 925 / 931 — 조각에서 라벨로 이어지는 지시선.
   조각 중앙 각도를 따라 링 위의 점에서 바깥으로 뻗는다. */
const DOT_R = R_MID; // 점은 링 한가운데에 찍힌다
const LINE_R = R_OUT + 16; // 선이 끝나는 반지름
const TEXT_R = R_OUT + 34; // 글자가 놓이는 반지름
const CX = 279.5;

/* hover 하면 조각이 R_OUT 밖으로 자라고 지시선도 도넛 바깥까지 나간다.
   뷰박스를 559 그대로 두면 그 부분이 잘리므로 사방에 여백을 둔다. */
const MARGIN = 28;
const VB = 559 + MARGIN * 2; // 615
const VIEW_BOX = `${-MARGIN} ${-MARGIN} ${VB} ${VB}`;

/** 조각 중앙 각도의 단위 벡터 (12시에서 시계방향) */
const dirOf = (s) => {
  const a = (s.from + s.ratio / 2) * 2 * Math.PI;
  return { dx: Math.sin(a), dy: -Math.cos(a) };
};

/** 반지름을 컨테이너 % 로. 뷰박스가 여백만큼 넓어졌으므로 그 폭으로 나눈다 */
const pct = (r) => (r / VB) * 100;

/** Figma 332:939 ~ 981 — 표. 강조 행은 흰색 SemiBold */
const TABLE_HEAD = ["항목", "내용", "비용"];
const TABLE_ROWS = [
  { cells: ["가맹비", "100%", "100000원"] },
  { cells: ["교육비", "100%", "100000원"], strong: true },
  { cells: ["보증금", "100%", "100000원"] },
  { cells: ["로열티", "100%", "100000원"] },
  { cells: ["간판", "100%", "100000원"] },
];
const TABLE_TOTAL = "00000000";

/** hover 시 늘어나는 두께. 안팎으로 절반씩 자란다 */
const GROW = 18;

function Donut() {
  const [ref, inView] = useInView(0.3);
  const [hover, setHover] = useState(-1);
  // 그려지는 애니메이션이 끝나면 hover 반응을 짧은 전환으로 바꾼다
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    if (!inView) {
      setDrawn(false);
      return;
    }
    const id = setTimeout(() => setDrawn(true), 900 + SEGMENTS.length * 130);
    return () => clearTimeout(id);
  }, [inView]);

  const active = hover >= 0 ? SEGMENTS[hover] : null;

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[560px]">
      <svg viewBox={VIEW_BOX} className="w-full" role="img" aria-label="비용 구성 도넛 차트">
        <defs>
          <linearGradient id="costRed" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF6757" />
            <stop offset="55%" stopColor="#F03A2C" />
            <stop offset="100%" stopColor="#BC1E0E" />
          </linearGradient>
        </defs>

        {/* 12시에서 시작하도록 -90도 돌린다 */}
        <g transform="rotate(-90 279.5 279.5)">
          {SEGMENTS.map((s, i) => {
            const on = hover === i;
            const len = CIRC * s.ratio;

            /* 반지름(r)은 절대 바꾸지 않는다.
               r 을 바꾸면 둘레가 달라져 dasharray 도 같이 바뀌는데, 두 전환이
               서로 어긋나는 동안 조각의 각도 범위가 흔들린다. 그 끝이 커서를
               스치면 enter/leave 가 번갈아 발생해 덜덜 떨리듯 보인다.
               두께만 늘리면 각도는 그대로라 흔들림도, 되먹임도 없다. */
            return (
              <circle
                key={s.id}
                cx="279.5"
                cy="279.5"
                r={R_MID}
                fill="none"
                stroke={s.color}
                strokeWidth={on ? STROKE + GROW : STROKE}
                strokeDasharray={inView ? `${len} ${CIRC - len}` : `0 ${CIRC}`}
                strokeDashoffset={-CIRC * s.from}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(-1)}
                className="cursor-pointer"
                style={{
                  opacity: hover < 0 || on ? 1 : 0.35,
                  // 선택한 조각만 은은하게 발광한다
                  filter: on ? "drop-shadow(0 0 14px rgba(255,255,255,0.28))" : "none",
                  transition: drawn
                    ? "stroke-width 300ms ease-out, opacity 300ms ease-out, filter 300ms ease-out"
                    : `stroke-dasharray 900ms cubic-bezier(0.22,1,0.36,1) ${i * 130}ms, opacity 300ms ease-out`,
                }}
              />
            );
          })}
        </g>

        {/* Figma 332:917 / 920 / 925 / 931 — 조각 → 라벨 지시선 */}
        <g style={{ opacity: inView ? 1 : 0, transition: "opacity 500ms ease-out 800ms" }}>
          {SEGMENTS.map((s, i) => {
            const { dx, dy } = dirOf(s);
            const on = hover === i;
            return (
              <g key={s.id} style={{ transition: "opacity 320ms ease-out" }}>
                <line
                  x1={CX + DOT_R * dx}
                  y1={CX + DOT_R * dy}
                  // 올리면 선이 라벨 쪽으로 조금 더 뻗는다
                  x2={CX + (on ? LINE_R + 10 : LINE_R) * dx}
                  y2={CX + (on ? LINE_R + 10 : LINE_R) * dy}
                  stroke={on ? "#fff" : "rgba(255,255,255,0.45)"}
                  strokeWidth={on ? 2 : 1}
                  style={{
                    transition:
                      "stroke 300ms ease-out, stroke-width 300ms ease-out, x2 300ms ease-out, y2 300ms ease-out",
                  }}
                />
                <circle
                  cx={CX + DOT_R * dx}
                  cy={CX + DOT_R * dy}
                  r={on ? 9 : 6}
                  fill={on ? "#fff" : "rgba(255,255,255,0.75)"}
                  style={{ transition: "r 320ms ease-out, fill 320ms ease-out" }}
                />
              </g>
            );
          })}
        </g>
      </svg>

      {/* Figma 332:907 — 가운데 수치.
          조각에 올리면 그 조각의 비중과 이름으로 바뀐다. 두 벌을 겹쳐 교차 페이드 */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative flex flex-col items-center justify-center gap-[8px] text-center">
          {/* 기본 — Figma 332:908 / 909 */}
          <div
            className="flex flex-col items-center gap-[8px]"
            style={{
              opacity: active ? 0 : 1,
              transform: active ? "translateY(-12px)" : "none",
              transition: "opacity 280ms ease-out, transform 280ms ease-out",
            }}
          >
            {/* Gmarket Sans Bold 54 / lh 58 / -1.35 (해당 서체가 없어 Pretendard Bold 로 대체) */}
            <p className="text-[clamp(30px,7vw,54px)] leading-[1.07] font-bold tracking-[-0.025em] text-white">
              26%
            </p>
            <p className="text-[clamp(14px,3vw,24px)] leading-[1.42] font-medium tracking-[-0.025em] text-[rgba(255,255,255,0.7)]">
              월수익
            </p>
          </div>

          {/* 선택한 조각 */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-[8px]"
            style={{
              opacity: active ? 1 : 0,
              transform: active ? "none" : "translateY(12px)",
              transition: "opacity 280ms ease-out, transform 280ms ease-out",
            }}
          >
            <p className="text-[clamp(30px,7vw,54px)] leading-[1.07] font-bold tracking-[-0.025em] whitespace-nowrap text-white">
              {active ? `${(active.ratio * 100).toFixed(1)}%` : ""}
            </p>
            <p className="text-[clamp(14px,3vw,24px)] leading-[1.42] font-medium tracking-[-0.025em] whitespace-nowrap text-[rgba(255,255,255,0.7)]">
              {active ? active.label : ""}
            </p>
          </div>
        </div>
      </div>

      {/* 지시선 끝의 라벨. 선이 향하는 방향에 따라 글자를 붙이는 쪽을 바꾼다 */}
      {SEGMENTS.map((s, i) => {
        const { dx, dy } = dirOf(s);
        const on = hover === i;
        // 가로로 뻗으면 바깥쪽 정렬, 위아래로 뻗으면 가운데 정렬
        const align = dx > 0.3 ? "0, -50%" : dx < -0.3 ? "-100%, -50%" : "-50%, -50%";
        return (
          <span
            key={s.id}
            className="pointer-events-none absolute flex flex-col whitespace-nowrap"
            style={{
              left: `${50 + pct(TEXT_R) * dx}%`,
              top: `${50 + pct(TEXT_R) * dy}%`,
              transform: `translate(${align})`,
              alignItems: dx > 0.3 ? "flex-start" : dx < -0.3 ? "flex-end" : "center",
              opacity: inView ? 1 : 0,
              transition: "opacity 500ms ease-out 900ms",
            }}
          >
            {/* Figma 332:916 등 — Pretendard Medium 20 / lh 20 / -0.5 */}
            <span
              className="text-[13px] leading-[20px] font-semibold tracking-[-0.33px] md:text-[16px] lg:text-[20px] lg:leading-[26px] lg:tracking-[-0.5px]"
              style={{
                color: on ? "#fff" : "rgba(255,255,255,0.75)",
                transition: "color 300ms ease-out",
              }}
            >
              {s.label}
            </span>
            {/* 올렸을 때만 비중이 아래로 펼쳐진다.
                위 라벨보다 한 단계 작고 가볍게 두어 종속 정보로 읽히게 한다
                (라벨 20 / 수치 14 — 0.7 비율) */}
            <span
              className="overflow-hidden text-[11px] leading-[16px] font-medium tracking-[0] tabular-nums text-[#ff8c81] md:text-[12px] md:leading-[18px] lg:text-[14px] lg:leading-[20px]"
              style={{
                maxHeight: on ? 22 : 0,
                opacity: on ? 1 : 0,
                transform: on ? "none" : "translateY(-4px)",
                transition:
                  "max-height 300ms ease-out, opacity 300ms ease-out, transform 300ms ease-out",
              }}
            >
              {(s.ratio * 100).toFixed(1)}%
            </span>
          </span>
        );
      })}
    </div>
  );
}

export default function BrandCost() {
  return (
    <div className="mx-auto flex w-full max-w-[1330px] flex-col items-center gap-[56px] lg:flex-row lg:items-center lg:gap-[80px]">
      {/* 도넛 — 지시선과 라벨이 바깥으로 나가므로 좌우 여백을 넉넉히 준다 */}
      <div className="w-full px-[44px] sm:px-[56px] lg:w-[650px] lg:shrink-0 lg:px-[76px]">
        <Donut />
      </div>

      {/* Figma 332:936 — 표 */}
      <div className="flex w-full flex-col gap-[20px] lg:w-[600px] lg:shrink-0 lg:gap-[27px]">
        {/* Figma 332:937 — Pretendard Medium 28 / lh 36 / -0.7 / 흰색 */}
        <Reveal y={16} duration={600}>
          <p className="text-[20px] leading-[28px] font-medium tracking-[-0.5px] text-white md:text-[24px] lg:text-[28px] lg:leading-[36px] lg:tracking-[-0.7px]">
            프리미엄 한우 곱창 전문점 창업 개설 비용
          </p>
        </Reveal>

        <div className="w-full border-t border-solid border-white">
          {/* 머리행 */}
          <div className="flex w-full items-center border-b border-solid border-[rgba(255,255,255,0.2)]">
            {TABLE_HEAD.map((h) => (
              <div key={h} className="flex flex-1 items-center justify-center p-[14px] lg:p-[24px]">
                <p className="w-full text-center text-[15px] leading-[22px] font-normal tracking-[-0.38px] text-[rgba(255,255,255,0.5)] md:text-[18px] lg:text-[20px] lg:leading-[28px] lg:tracking-[-0.5px]">
                  {h}
                </p>
              </div>
            ))}
          </div>

          {/* 본문행 — 강조 행만 흰색 SemiBold */}
          {TABLE_ROWS.map((row, i) => (
            <Reveal key={row.cells[0]} delay={i * 70} y={14} duration={600}>
              <div className="flex w-full items-center border-b border-solid border-[rgba(255,255,255,0.2)] transition-colors duration-300 hover:bg-white/[0.04]">
                {row.cells.map((cell) => (
                  <div
                    key={cell}
                    className="flex flex-1 items-center justify-center p-[14px] lg:p-[24px]"
                  >
                    <p
                      className={`w-full text-center text-[15px] leading-[22px] tracking-[-0.38px] md:text-[18px] lg:text-[20px] lg:leading-[28px] lg:tracking-[-0.5px] ${
                        row.strong
                          ? "font-semibold text-white"
                          : "font-normal text-[rgba(255,255,255,0.5)]"
                      }`}
                    >
                      {cell}
                    </p>
                  </div>
                ))}
              </div>
            </Reveal>
          ))}

          {/* Figma 332:982 — 합계 행, bg #e61911 */}
          <div className="flex w-full items-center border-b border-solid border-[rgba(255,255,255,0.4)]">
            <div className="flex flex-1 items-center justify-center bg-[#e61911] p-[16px] lg:p-[24px]">
              <p className="w-full text-center text-[18px] leading-[26px] font-bold tracking-[-0.45px] text-white md:text-[22px] lg:text-[26px] lg:leading-[28px] lg:tracking-[-0.65px]">
                {TABLE_TOTAL}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
