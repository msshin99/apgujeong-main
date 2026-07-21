import { useEffect, useRef } from "react";
import Tilt from "./Tilt.jsx";
import Reveal, { RevealText } from "./Reveal.jsx";
import Img from "./Img.jsx";
import { asset } from "./lib/asset.js";

/**
 * Figma: Frame 1707488304 (332:631) — 1185 x 2002
 *
 * 세로 flex, gap 60, items-center.
 *   헤더 871 x 282 (가운데 정렬)
 *   본문 3행, 각 행 gap 200 — 텍스트 404 / 세로 구분선 3 / 이미지 376
 *
 * 배경(검정 + 붉은 블러 원)과 배치는 DarkStage 가 담당한다.
 */
const FRAME_W = 1185;

/**
 * 붉은 그라디언트 막대의 스크롤 연동.
 *
 * 진행도를 3등분해 한 구간이 한 행을 담당한다.
 * 막대는 자기 행의 구분선 안에서만 top 0 → (500-160) 으로 움직이므로
 * 구분선 밖으로 나가 잘리는 구간이 없다.
 * (행 사이 80px 간격을 트랙에 포함시키면 그 구간에서 막대가 잘려 보였다)
 */
const DIVIDER_H = 500;
const BAR_H = 160; // Figma 332:645
const BAR_W = 6; // Figma 원본은 3 이나 요청에 따라 두껍게
const SEGMENT = 1 / 3;
const FADE = 0.08; // 행이 바뀌는 지점에서 살짝 페이드 — 뚝 끊기지 않게
const DAMPING = 0.1;

const BAR_GRADIENT =
  "linear-gradient(92.9016deg, rgb(255,103,87) 18.276%, rgb(255,140,129) 49.377%, rgb(188,30,14) 80.478%)";

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;

// 막대가 그 행에 들어올 때 텍스트·이미지가 따라 올라오며 나타난다
const REVEAL_SPAN = SEGMENT * 0.45; // 구간의 앞 45% 안에 다 드러난다
const REVEAL_IMAGE_DELAY = SEGMENT * 0.12; // 이미지는 텍스트보다 살짝 늦게
const REVEAL_RISE = 40; // 아래에서 위로 올라오는 거리(px)

// 3D 아이콘이 위아래로 떠 있는 움직임. 행마다 주기·시작점을 어긋나게 한다
const FLOAT_DURATION = [6.4, 7.6, 6.9];
const FLOAT_DELAY = [0, -2.5, -4.8]; // 음수 = 이미 진행된 상태로 시작

/** Figma 332:638 / 650 / 660 */
const ROWS = [
  {
    id: "select",
    eyebrow: "0.1%의 엄격한 선별",
    title: "선별의 미학",
    desc: "전국 산지에서 매일 새벽, 육질과 곱의 밀도를 기준으로 상위 0.1%의 한우 곱창만을 엄선합니다. 타협하지 않는 원재료가 최고의 미식을 시작합니다.",
    image: asset("/images/heritage/select.png"),
    // Figma 332:649 — 300x292 박스 안에서 h 154.49% / left -24.37% / top -28.89% / w 150.53%
    frame: { width: 300, height: 292 },
    crop: {
      height: "154.49%",
      left: "-24.37%",
      top: "-28.89%",
      width: "150.53%",
    },
  },
  {
    id: "age",
    eyebrow: "72시간의 저온 숙성",
    title: "숙성의 시간",
    desc: "특제 과일 효소와 함께 72시간 동안 진행되는 저온 숙성 공법은, 곱창 본연의 고소한 풍미를 극대화하고 입안에서 녹아드는 부드러운 식감을 완성합니다.",
    image: asset("/images/heritage/age.png"),
    // Figma 332:659 — 300x340
    frame: { width: 300, height: 340 },
    crop: {
      height: "123.53%",
      left: "-22.23%",
      top: "-11.95%",
      width: "139.91%",
    },
  },
  {
    id: "cook",
    eyebrow: "400℃의 불꽃 예술",
    title: "조리의 예술",
    desc: "초고온 화로에서 순식간에 구워내는 '겉바속촉'의 정점. 수분은 가두고 불향을 입혀, 마지막 한 점까지 온전한 미식의 즐거움을 경험하게 합니다.",
    image: asset("/images/heritage/cook.png"),
    // Figma 332:668 — 299x309
    frame: { width: 299, height: 309 },
    crop: {
      height: "114.94%",
      left: "-10.07%",
      top: "-6.51%",
      width: "118.62%",
    },
  },
];

export default function Heritage({ compact = false }) {
  const rowsRef = useRef(null);
  const barRefs = useRef([]);
  const textRefs = useRef([]);
  const imageRefs = useRef([]);

  useEffect(() => {
    // 1200 미만에서는 스크롤 연동 막대를 쓰지 않는다
    if (compact) return;

    const target = { p: 0 };
    const current = { p: 0 };
    let raf = 0;

    const draw = (p) => {
      // 현재 진행도가 속한 행
      const active = Math.min(2, Math.floor(p / SEGMENT));
      barRefs.current.forEach((el, k) => {
        if (!el) return;
        const t = clamp((p - k * SEGMENT) / SEGMENT, 0, 1);
        // 막대가 구분선 안에 온전히 들어오는 범위에서만 이동
        el.style.transform = `translate3d(0, ${t * (DIVIDER_H - BAR_H)}px, 0)`;
        const fade = clamp(Math.min(t / FADE, (1 - t) / FADE), 0, 1);
        el.style.opacity = k === active ? fade : 0;
      });

      // 막대가 내려오는 것과 맞물려 그 행의 텍스트·이미지가 떠오르며 나타난다
      const reveal = (refs, delay) => {
        refs.current.forEach((el, k) => {
          if (!el) return;
          const t = easeOutCubic(
            clamp((p - k * SEGMENT - delay) / REVEAL_SPAN, 0, 1),
          );
          el.style.opacity = t;
          el.style.transform = `translate3d(0, ${lerp(REVEAL_RISE, 0, t)}px, 0)`;
        });
      };
      reveal(textRefs, 0);
      reveal(imageRefs, REVEAL_IMAGE_DELAY);
    };

    const readTarget = () => {
      const el = rowsRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // 블록 상단이 화면 아래끝에 닿을 때 0, 블록 하단이 화면 위끝을 지날 때 1.
      // 스크롤 구간이 (블록 높이 + 화면 높이) 로 길어져 막대가 천천히 내려간다.
      const vh = window.innerHeight;
      target.p = clamp((vh - rect.top) / (rect.height + vh), 0, 1);
    };

    // 접근성: 모션을 줄이도록 설정한 사용자에게는 전부 드러난 상태로 고정
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
  }, [compact]);

  /* 1200 미만 — 텍스트/구분선/이미지 3단을 이미지 위·텍스트 아래로 쌓는다 */
  if (compact) {
    return (
      <div className="mx-auto flex w-full max-w-[1120px] flex-col items-center gap-[56px] font-pretendard md:gap-[80px]">
        <div className="flex w-full flex-col items-center gap-[14px] text-center">
          <Reveal y={16} duration={600}>
            <p className="text-[15px] leading-[22px] font-medium tracking-[-0.38px] text-white md:text-[18px] md:leading-[26px]">
              더 이상의 곱창은 없다, 절대적 미학의 시작
            </p>
          </Reveal>
          <h2 className="text-[clamp(26px,6.4vw,44px)] leading-[1.28] font-bold tracking-[-0.03em] text-white uppercase">
            <RevealText
              lines={["The Art of Korean Heritage"]}
              unit="word"
              step={70}
              delay={80}
            />
          </h2>
          <Reveal delay={320} y={16} duration={600}>
            <p className="text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[rgba(255,255,255,0.6)] md:text-[16px] md:leading-[24px]">
              수 세기를 이어온 미식의 뿌리를 오늘날의 세련된 다이닝으로 재해석하여, 당신의 테이블
              위에 한국 미식의 새로운 이정표를 세웁니다.
            </p>
          </Reveal>
        </div>

        <div className="flex w-full flex-col gap-[64px] md:gap-[88px]">
          {ROWS.map((row, i) => (
            <Reveal key={row.id} y={36} delay={i * 60}>
              <article className="flex w-full flex-col items-center gap-[24px] md:flex-row md:items-center md:gap-[48px] md:even:flex-row-reverse">
                {/* 3D 아이콘 */}
                <div className="relative size-[240px] shrink-0 overflow-hidden md:size-[300px]">
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden"
                    style={{
                      width: row.frame.width * (0.64),
                      height: row.frame.height * (0.64),
                    }}
                  >
                    <Img
                      src={row.image}
                      alt=""
                      // 장식용 3D 아이콘이라 첫 화면 로딩을 붙잡을 이유가 없다
                      loading="lazy"
                      decoding="async"
                      className="absolute max-w-none object-cover"
                      style={row.crop}
                    />
                  </div>
                </div>

                {/* 텍스트 — 좌측에 브랜드 컬러 세로선 */}
                <div className="flex w-full flex-col items-start gap-[12px] border-l-[3px] border-[#ea665f] pl-[16px] md:pl-[20px]">
                  <p className="text-[14px] leading-[20px] font-medium tracking-[-0.35px] text-[#ea665f] md:text-[16px]">
                    {row.eyebrow}
                  </p>
                  <p className="text-[clamp(22px,5.6vw,34px)] leading-[1.24] font-bold text-white">
                    {row.title}
                  </p>
                  <p className="text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[rgba(255,255,255,0.6)] md:text-[15px] md:leading-[23px]">
                    {row.desc}
                  </p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    );
  }

  return (
    /* Figma 332:631 — 1185 폭, 세로 gap 60 / items-center */
    <div
      className="flex flex-col items-center gap-[60px] font-pretendard"
      style={{ width: FRAME_W }}
    >
      {/* Figma 332:632 — w 871, gap 24, 가운데 정렬 */}
      <div className="flex w-[871px] flex-col items-start gap-[24px] text-center">
        {/* Figma 332:633 — Pretendard Medium 20 / lh 30 / -0.5 / 흰색 */}
        {/* 다른 섹션 헤더와 같은 등장 리듬을 쓴다 — 여기만 멈춰 있으면 튄다 */}
        <Reveal className="w-full" y={16} duration={600}>
          <p className="w-full text-[20px] leading-[30px] font-medium tracking-[-0.5px] text-white">
            더 이상의 곱창은 없다, 절대적 미학의 시작
          </p>
        </Reveal>

        {/* Figma 332:634 — gap 16 */}
        <div className="flex w-full flex-col items-start gap-[16px]">
          {/* Figma 332:635 — Pretendard Bold 60 / lh 80 / -1.5 / 흰색 / uppercase */}
          <h2 className="w-full text-[60px] leading-[80px] font-bold tracking-[-1.5px] text-white uppercase">
            {/* 줄바꿈이 일어나는 영문 제목이라 단어 단위로 쪼갠다 */}
            <RevealText
              lines={["The Art of Korean Heritage"]}
              unit="word"
              step={70}
              delay={80}
            />
          </h2>
          {/* Figma 332:636 — Pretendard Regular 18 / lh 26 / -0.45 / 흰색 60% / 2줄 */}
          <Reveal className="w-full" delay={320} y={16} duration={600}>
            <p className="w-full text-[18px] leading-[26px] font-normal tracking-[-0.45px] text-[rgba(255,255,255,0.6)]">
              수 세기를 이어온 미식의 뿌리를 오늘날의 세련된 다이닝으로
              재해석하여, 당신의 테이블 위에
              <br />
              한국 미식의 새로운 이정표를 세웁니다.
            </p>
          </Reveal>
        </div>
      </div>

      {/* Figma 332:637 — 3행, 세로 gap 80 */}
      <div
        ref={rowsRef}
        className="flex w-full flex-col items-start gap-[80px]"
      >
        {ROWS.map((row, rowIndex) => (
          <div key={row.id} className="flex w-full items-center gap-[200px]">
            {/* Figma 332:639 — w 404, gap 28 */}
            <div
              ref={(el) => (textRefs.current[rowIndex] = el)}
              className="flex w-[404px] shrink-0 flex-col items-start gap-[28px] opacity-0 will-change-transform"
            >
              {/* Figma 332:640 — Pretendard Medium 20 / lh 30 / -0.5 / #ea665f */}
              <p className="w-full text-[20px] leading-[30px] font-medium tracking-[-0.5px] text-[#ea665f]">
                {row.eyebrow}
              </p>

              {/* Figma 332:641 — gap 12 */}
              <div className="flex w-full flex-col items-start gap-[12px]">
                {/* Figma 332:642 — Pretendard Bold 48 / lh 56 / 흰색 */}
                <p className="w-full text-[48px] leading-[56px] font-bold text-white">
                  {row.title}
                </p>
                {/* Figma 332:643 — Pretendard Regular 16 / lh 24 / -0.4 / 흰색 60% */}
                <p className="w-full text-[16px] leading-[24px] font-normal tracking-[-0.4px] text-[rgba(255,255,255,0.6)]">
                  {row.desc}
                </p>
              </div>
            </div>

            {/* Figma 332:644 — 세로 구분선 3 x 500, #212121, radius 999
                막대가 3px 보다 두꺼우므로 overflow-hidden 을 쓰지 않고,
                막대 위치를 구분선 안쪽으로 제한해 잘리지 않게 한다 */}
            <div className="relative h-[500px] w-[3px] shrink-0 rounded-[999px] bg-[#212121]">
              {/* Figma 332:645 — 160px 그라디언트 막대. 스크롤에 따라 아래로 내려간다 */}
              <div
                ref={(el) => (barRefs.current[rowIndex] = el)}
                className="absolute top-0 rounded-[999px] opacity-0 will-change-transform"
                style={{
                  backgroundImage: BAR_GRADIENT,
                  width: BAR_W,
                  height: BAR_H,
                  left: (3 - BAR_W) / 2, // 3px 선의 중앙에 맞춘다
                }}
              />
            </div>

            {/* 커서 방향으로 기울어지는 3D 틸트.
                부유(CSS 애니메이션)·등장(JS transform)과 층을 나눠 서로 덮어쓰지 않게 한다 */}
            <Tilt className="shrink-0" max={14} perspective={1000}>
              <div
                className="heritage-float"
                style={{
                  animation: `heritageFloat ${FLOAT_DURATION[rowIndex]}s ease-in-out infinite`,
                  animationDelay: `${FLOAT_DELAY[rowIndex]}s`,
                }}
              >
                {/* Figma 332:646 — 376 x 376 클립 안에 이미지 */}
                <div
                  ref={(el) => (imageRefs.current[rowIndex] = el)}
                  className="relative size-[376px] overflow-hidden opacity-0 will-change-transform"
                >
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden"
                    style={row.frame}
                  >
                    <Img
                      src={row.image}
                      alt=""
                      // 장식용 3D 아이콘이라 첫 화면 로딩을 붙잡을 이유가 없다
                      loading="lazy"
                      decoding="async"
                      className="absolute max-w-none object-cover"
                      style={row.crop}
                    />
                  </div>
                </div>
              </div>
            </Tilt>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes heritageFloat {
          0%, 100% { transform: translate3d(0, -42px, 0) rotate(-2.5deg); }
          50%      { transform: translate3d(0, 42px, 0) rotate(2.5deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .heritage-float { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
