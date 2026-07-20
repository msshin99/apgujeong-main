import { useEffect, useRef } from "react";
import { DESIGN_W, useCanvasScale } from "./useCanvasScale.js";
import { useBreakpoint } from "./useBreakpoint.js";
import Reveal from "./Reveal.jsx";

/**
 * 스크롤 연동 카드 정렬 섹션.
 *
 * 초기 상태 — Figma: Group 1707481709 (335:2390)
 *   화면 중앙에 4장이 부채꼴로 겹쳐 쌓인 더미. 카드는 전부 402x516, 회전각만 다르다.
 *   좌우에 PRIME / TEXTURE (Shippori Mincho Medium 90px / lh 120 / 검정).
 *
 * 최종 상태 — Figma: Frame 2095587718 (332:751), x 120 / w 1680 / h 626.5
 *   4열 x 402, gap 24. 각 열은 세로 flex gap 20 → 이미지 516 + 텍스트 블록 90.
 *   텍스트 블록: gap 8, 제목 24px/34 Medium 검정, 본문 16px/24 Regular #767676.
 *
 * 모션:
 *   스크롤 값을 그대로 쓰면 프레임마다 값이 튀어 뻣뻣하다.
 *   목표값(target)을 향해 매 프레임 감쇠 보간(damping)한 current 를 그린다.
 *   또 값이 바뀔 때마다 리렌더하면 끊기므로, ref 로 DOM style 을 직접 갱신한다.
 */
const CARD_W = 402;
const CARD_H = 516;

/**
 * 이 섹션만 캔버스를 세로로 늘린다.
 * Figma 상에서 더미(y 1140~1768)와 그리드(y 1956~2583)는 188px 떨어져 있고
 * 카드는 816px 아래로 이동한다. 1000 높이 캔버스로는 그 하강 거리를 담을 수 없어
 * 카드가 조금 내려가다 마는 것처럼 보였다.
 */
const SCENE_H = 1200;

const GRID_GAP = 24; // Figma: 402*4 + 24*3 = 1680
const GRID_LEFT = 120; // Figma 332:751 x
// 그리드 전체 높이 = 이미지 516 + 간격 20 + 텍스트 90
const GRID_H = CARD_H + 20 + 90;
// 캔버스 세로 중앙에 놓는다 (1200 - 626) / 2 = 287
const GRID_TOP = (SCENE_H - GRID_H) / 2;

const PILE_TOP = 200; // 섹션 상단(히어로 끝)에서 더미까지의 여백
const PILE_CY = PILE_TOP + CARD_H / 2; // 더미 상태에서 카드 중심의 세로 위치

const SCROLL_LENGTH = "320vh"; // 값이 클수록 정렬이 천천히 진행된다
const X_DELAY = 0.25; // 가로 전개 지연 — 0 이면 내려감과 펼침이 동시
// 열 사이 시차. 0.25 면 각 열의 구간이 [0.25n, 0.25(n+1)] 로 서로 겹치지 않는다
// → 왼쪽 카드가 완전히 자리를 잡은 뒤 다음 카드가 출발한다
const STAGGER = 0.25;
const DAMPING = 0.09; // 작을수록 더 부드럽고 느리게 따라온다

/**
 * 배열 순서 = 더미에서의 쌓임 순서(뒤로 갈수록 위).
 * column = 최종 그리드에서의 열 번호. 내려오는 순서는 column 기준(왼쪽부터).
 * crop = Figma 에서 이미지가 402x516 프레임 안에 놓인 방식을 그대로 옮긴 값.
 */
const CARDS = [
  {
    id: "purity",
    title: "Purity",
    desc: "엄격한 위생 기준 아래 연육과 가공을 마치고 매장에서 바로 쓸 수 있게 패키징합니다",
    image: "/images/cards/33516.png",
    // Figma 332:759 — 402x516 클립 안에 525x706 이미지를 left -62 / top -102 로
    crop: { left: -62, top: -102, width: 525, height: 706 },
    scatter: { cx: 949.82, rotate: 21.59 },
    column: 1,
  },
  {
    id: "gourmet",
    title: "Gourmet",
    desc: "전문 주방장 없이도 누구나 원팩을 뜯어 5분 만에 최고급 곱창 구이를 완성합니다",
    image: "/images/cards/33513.png",
    crop: null, // Figma 332:769 — object-cover
    scatter: { cx: 959.66, rotate: -7.52 },
    column: 3,
  },
  {
    id: "winwin",
    title: "Win-Win",
    desc: "전국 어디든 신선도 0℃를 유지하는 주 X회 콜드체인 시스템으로 안전하게 배송합니다",
    image: "/images/cards/33517.png",
    // Figma 332:764 — left -11.95% / top -18.38% / w 130.1% / h 126.65%
    crop: {
      left: "-11.95%",
      top: "-18.38%",
      width: "130.1%",
      height: "126.65%",
    },
    scatter: { cx: 959.99, rotate: 7.96 },
    column: 2,
  },
  {
    id: "freshness",
    title: "Freshness",
    desc: "상위 10% 품질의 두툼하고 곱이 가득 찬 한우 및 수입 원육만을 엄선합니다",
    image: "/images/cards/33518.png",
    crop: null, // Figma 332:753 — object-cover
    scatter: { cx: 960, rotate: 0 },
    column: 0,
  },
];

/**
 * Figma 332:750 — 카드 뒤로 흘러가는 문구.
 * Shippori Mincho Medium 120px / lh 120 / 검정 / uppercase / nowrap.
 * 원본은 같은 문장을 두 번 이어 붙여 6005px 폭으로 깔아둔 것 → 무한 마퀴로 구현한다.
 * 세로 위치는 그리드 상단에서 210px 아래(= Figma y 2166 - 1956)로, 카드 이미지에 가려진다.
 */
const MARQUEE_PHRASE = "Your daily craving, served sizzling hot";
const MARQUEE_TOP_OFFSET = 210;
const MARQUEE_DURATION = 32; // 초 — 한 바퀴 도는 데 걸리는 시간

// Figma 332:777 / 332:776 — Shippori Mincho Medium 90px / lh 120 / 검정 / uppercase
const SIDE_TEXT =
  "absolute font-mincho text-[90px] leading-[120px] font-medium text-black uppercase whitespace-nowrap will-change-transform";

// PRIME / TEXTURE 가 놓인 세로 위치(= 더미 중심 기준)
const SIDE_TOP = PILE_CY - 60;
// PRIME / TEXTURE 가 흘러가는 문구 자리로 내려앉는 거리
const SIDE_TRAVEL_Y = GRID_TOP + MARQUEE_TOP_OFFSET - SIDE_TOP;
// 90px → 120px, 흘러가는 문구와 같은 크기로 커진다
const SIDE_TRAVEL_SCALE = 120 / 90;

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, t) => a + (b - a) * t;

const SPAN = 1 - STAGGER * 3; // 마지막 열이 p=1 에 도착하도록

export default function ScatterCards() {
  const sectionRef = useRef(null);
  const sideRefs = useRef([]);
  const marqueeRef = useRef(null);
  const cardRefs = useRef([]);
  const imageRefs = useRef([]);
  const textRefs = useRef([]);
  const scale = useCanvasScale(SCENE_H);
  const { isCompact } = useBreakpoint();

  useEffect(() => {
    // 1200 미만에서는 스크롤 연동 정렬을 쓰지 않는다 (정적 그리드)
    if (isCompact) return;

    const target = { p: 0 };
    const current = { p: 0 };
    let raf = 0;

    const draw = (p) => {
      /* PRIME / TEXTURE → 흘러가는 문구로의 전환.
         좌우로 사라지는 게 아니라, 문구가 흘러갈 자리까지 내려앉으며
         같은 크기(120px)로 커지고 왼쪽으로 밀리다가 마퀴와 교차 페이드된다. */
      const sideT = easeInOutCubic(clamp((p - 0.08) / 0.42, 0, 1));
      const sideOpacity = clamp(1 - sideT * 1.6, 0, 1); // 이동 도중에 먼저 옅어진다
      sideRefs.current.forEach((el) => {
        if (!el) return;
        el.style.opacity = sideOpacity;
        el.style.transform =
          `translate3d(${lerp(0, -220, sideT)}px, ${lerp(0, SIDE_TRAVEL_Y, sideT)}px, 0)` +
          ` scale(${lerp(1, SIDE_TRAVEL_SCALE, sideT)})`;
      });

      // 마퀴는 PRIME/TEXTURE 가 옅어지는 구간에서 겹쳐 올라온다
      if (marqueeRef.current) {
        marqueeRef.current.style.opacity = clamp((sideT - 0.35) / 0.45, 0, 1);
      }

      CARDS.forEach((card, i) => {
        // 왼쪽 열부터 순서대로 출발
        const raw = clamp((p - STAGGER * card.column) / SPAN, 0, 1);

        // 세로(내려앉기)가 먼저, 가로(펼치기)는 X_DELAY 만큼 뒤따른다
        const tY = easeOutCubic(raw);
        const tX = easeInOutCubic(clamp((raw - X_DELAY) / (1 - X_DELAY), 0, 1));

        const finalLeft = GRID_LEFT + card.column * (CARD_W + GRID_GAP);
        const x = lerp(card.scatter.cx - (finalLeft + CARD_W / 2), 0, tX);
        const y = lerp(PILE_CY - (GRID_TOP + CARD_H / 2), 0, tY);
        const r = lerp(card.scatter.rotate, 0, tX);

        const wrap = cardRefs.current[i];
        if (wrap) wrap.style.transform = `translate3d(${x}px, ${y}px, 0)`;

        const img = imageRefs.current[i];
        if (img) img.style.transform = `rotate(${r}deg)`;

        // 텍스트는 정렬이 거의 끝난 뒤 이미지 "아래"에 드러난다
        const textT = clamp((raw - 0.7) / 0.3, 0, 1);
        const text = textRefs.current[i];
        if (text) {
          text.style.opacity = textT;
          text.style.transform = `translate3d(0, ${lerp(12, 0, textT)}px, 0)`;
        }
      });
    };

    const readTarget = () => {
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // 섹션 상단이 화면 상단에 닿는 순간 0, 스크롤을 다 소진하면 1
      const total = rect.height - window.innerHeight;
      target.p = total <= 0 ? 1 : clamp(-rect.top / total, 0, 1);
    };

    // 접근성: 모션을 줄이도록 설정한 사용자에게는 정렬된 상태로 바로 고정
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      draw(1);
      return;
    }

    const tick = () => {
      const diff = target.p - current.p;
      if (Math.abs(diff) < 0.0002) {
        current.p = target.p;
        draw(current.p);
        raf = 0; // 다 따라잡았으면 루프를 쉬게 한다
        return;
      }
      current.p += diff * DAMPING;
      draw(current.p);
      raf = requestAnimationFrame(tick);
    };

    const onScroll = () => {
      readTarget();
      if (!raf) raf = requestAnimationFrame(tick);
    };

    readTarget();
    current.p = target.p;
    draw(current.p);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [isCompact]);

  /* 1200 미만 — 더미에서 정렬되는 스크롤 연동 대신 정적 그리드.
     매 프레임 4장을 다시 그리는 비용을 없애 저사양 기기에서도 부드럽다. */
  if (isCompact) {
    const sorted = [...CARDS].sort((a, b) => a.column - b.column);
    return (
      <section className="w-full bg-white px-[20px] py-[80px] sm:px-[24px] md:px-[40px] md:py-[120px]">
        <div className="mx-auto grid w-full max-w-[1120px] grid-cols-1 gap-x-[24px] gap-y-[48px] md:grid-cols-2">
          {sorted.map((card, i) => (
            <Reveal key={card.id} delay={i * 110} y={36}>
              <article className="flex w-full flex-col">
                <div className="relative w-full overflow-hidden bg-neutral-200 pt-[128%]">
                  <img
                    src={card.image}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                  />
                </div>
                <div className="flex flex-col gap-[8px] pt-[16px] font-pretendard">
                  <p className="text-[18px] leading-[26px] font-medium tracking-[-0.45px] text-black md:text-[20px] md:leading-[28px]">
                    {card.title}
                  </p>
                  <p className="text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[15px]">
                    {card.desc}
                  </p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      className="relative bg-white"
      style={{ height: SCROLL_LENGTH }}
    >
      {/* 스크롤이 진행되는 동안 화면에 고정 */}
      <div className="sticky top-0 h-[100dvh] overflow-hidden bg-white">
        {/* Figma 332:750 — 카드 뒤로 흘러가는 문구.
            1680 그리드나 1920 캔버스에 갇히지 않고 화면 전체 폭을 가로지르도록
            캔버스 바깥(sticky 컨테이너)에 두고, 크기·위치만 scale 로 환산한다.
            캔버스보다 먼저 그려지므로 카드 뒤에 깔린다. */}
        <div
          ref={marqueeRef}
          aria-hidden
          // opacity 는 draw() 가 직접 갱신한다. style prop 에 두면 리사이즈 리렌더 때 0 으로 되돌아간다
          className="pointer-events-none absolute top-1/2 left-0 w-full overflow-hidden opacity-0"
          style={{
            height: 120 * scale,
            // 캔버스 중심(top-1/2) 에서 문구 띠 상단까지의 거리
            transform: `translateY(${(GRID_TOP + MARQUEE_TOP_OFFSET - SCENE_H / 2) * scale}px)`,
          }}
        >
          <div
            className="flex w-max will-change-transform"
            style={{
              animation: `cardsMarquee ${MARQUEE_DURATION}s linear infinite`,
            }}
          >
            {/* 4벌 이어 붙이고 -50%(=2벌) 이동 → 넓은 화면에서도 빈틈 없이 순환 */}
            {[0, 1, 2, 3].map((k) => (
              <span
                key={k}
                className="font-mincho font-medium text-black uppercase whitespace-nowrap"
                style={{
                  fontSize: 120 * scale,
                  lineHeight: `${120 * scale}px`,
                }}
              >
                {MARQUEE_PHRASE}&nbsp;&nbsp;
              </span>
            ))}
          </div>
        </div>

        <div
          className="absolute top-1/2 left-1/2"
          style={{
            width: DESIGN_W,
            height: SCENE_H,
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
        >
          {/* Figma 332:777 / 332:776 — left 291 / 1260 */}
          {["Prime", "Texture"].map((word, k) => (
            <span
              key={word}
              ref={(el) => (sideRefs.current[k] = el)}
              className={SIDE_TEXT}
              style={{
                left: k === 0 ? 291 : 1260,
                top: SIDE_TOP,
                transformOrigin: "left center",
              }}
            >
              {word}
            </span>
          ))}

          {CARDS.map((card, i) => (
            <div
              key={card.id}
              ref={(el) => (cardRefs.current[i] = el)}
              className="absolute will-change-transform"
              style={{
                left: GRID_LEFT + card.column * (CARD_W + GRID_GAP),
                top: GRID_TOP,
                width: CARD_W,
              }}
            >
              {/* Figma 332:753 / 758 / 764 / 769 — 402 x 516 */}
              <div
                ref={(el) => (imageRefs.current[i] = el)}
                className="relative overflow-hidden bg-white will-change-transform"
                style={{ width: CARD_W, height: CARD_H }}
              >
                <img
                  src={card.image}
                  alt=""
                  className={
                    card.crop
                      ? "absolute max-w-none object-cover"
                      : "absolute inset-0 size-full object-cover"
                  }
                  style={card.crop ?? undefined}
                />
              </div>

              {/* Figma 332:754 — 이미지에서 20px 아래, 내부 gap 8 */}
              <div
                ref={(el) => (textRefs.current[i] = el)}
                className="flex flex-col gap-[8px] pt-[20px] font-pretendard opacity-0 will-change-transform"
              >
                {/* Figma 332:755 는 24/34/-0.6 이나 요청에 따라 20px 로 조정
                    (lh·tracking 도 같은 비율로 28 / -0.5) */}
                <p className="truncate text-[20px] leading-[28px] font-medium tracking-[-0.5px] text-black">
                  {card.title}
                </p>
                {/* Figma 332:756 — Pretendard Regular 16 / lh 24 / -0.4 / #767676 */}
                <p className="text-[16px] leading-[24px] font-normal tracking-[-0.4px] text-[#767676]">
                  {card.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 문구를 두 벌 이어 붙였으므로 -50% 이동이 곧 이음매 없는 한 바퀴가 된다 */}
      <style>{`
        @keyframes cardsMarquee {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(-50%, 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="cardsMarquee"] { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
