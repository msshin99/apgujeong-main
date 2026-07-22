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
 *
 * 예전에는 compact 프롭으로 데스크톱 트리(캔버스 배율)와 유동 트리를 갈랐다.
 * 그 방식은 1200~1440 구간에서 16px 본문이 배율을 타 10~12px 로 쪼그라들었다.
 * 그래서 compact 를 없애고, 폭에 따라 CSS 로만 흐르는 **한 벌**로 합친다.
 *   · 타이포는 브레이크포인트별 고정 px 계단(xl = 피그마 원본값). 배율에 얹히지 않는다.
 *   · 3행은 좁으면 세로로 쌓고(아이콘 → 텍스트), md 부터 가로로 눕히며 짝수 행을 뒤집는다.
 *     중앙 구분선/막대는 xl 에서만 켠다(그 아래는 텍스트 좌측 브랜드 세로선으로 대신한다).
 *   · 이 저장소는 lg·xl·2xl 이 전부 1200px 이라 lg: 는 죽는다. 데스크톱 단은 xl:(=1200) 로 준다.
 */

/**
 * 붉은 그라디언트 막대의 스크롤 연동. (xl 에서만 동작)
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

// 이미지 클립은 xl 에서 376px 정사각형. 그 안의 프레임 박스는 클립 대비 비율로 두어
// 브레이크포인트마다 클립이 줄어도 구도(크롭)가 그대로 유지된다.
const CLIP_XL = 376;

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

export default function Heritage() {
  const rowsRef = useRef(null);
  const barRefs = useRef([]);
  const textRefs = useRef([]);
  const imageRefs = useRef([]);

  /* 스크롤 연동 막대와 그에 맞춘 텍스트·이미지 등장은 세로 구분선(500px)이 있는
     xl 레이아웃에서만 성립한다. "1200 이상에서만 켠다" 는 판단은 폭을 읽어야 하므로
     useBreakpoint 훅 대신 matchMedia 로 이 한 곳에서 직접 보고, 1200 경계를 넘나들 때
     다시 건다. 그 아래에서는 텍스트·이미지를 CSS 로 이미 드러내 두므로(opacity-100 xl:opacity-0)
     여기서는 아무것도 하지 않아도 본문이 보인다. */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const wide = window.matchMedia("(min-width: 1200px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

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

    // 스크롤 연동을 쓰지 않을 때(좁은 화면·모션 최소화) 텍스트·이미지를 전부 드러낸다.
    // opacity 를 인라인으로 1 못박아야 xl 의 모션 최소화에서도 xl:opacity-0 에 가려지지 않는다.
    const settle = () => {
      barRefs.current.forEach((el) => {
        if (el) el.style.opacity = 0;
      });
      [textRefs, imageRefs].forEach((refs) => {
        refs.current.forEach((el) => {
          if (!el) return;
          el.style.opacity = 1;
          el.style.transform = "none";
        });
      });
    };

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

    let bound = null;
    const setup = () => {
      // 이전 구성 해제
      if (bound) {
        bound();
        bound = null;
      }
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }

      // 좁은 화면 또는 모션 최소화 — 스크롤 연동 없이 전부 드러낸 상태로 고정
      if (!wide.matches || reduce.matches) {
        settle();
        return;
      }

      readTarget();
      current.p = target.p;
      draw(current.p);
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      bound = () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      };
    };

    setup();
    // 1200 경계를 넘나들면 스크롤 연동을 켜고/끈다
    wide.addEventListener("change", setup);
    return () => {
      wide.removeEventListener("change", setup);
      if (bound) bound();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    /* Figma 332:631 — 1185 폭, 세로 gap 60 / items-center */
    <div className="mx-auto flex w-full max-w-[1185px] flex-col items-center gap-[40px] font-pretendard md:gap-[52px] xl:gap-[60px]">
      {/* Figma 332:632 — w 871, gap 24, 가운데 정렬 */}
      <div className="flex w-full max-w-[871px] flex-col items-center gap-[16px] text-center md:gap-[20px] xl:gap-[24px]">
        {/* Figma 332:633 — Pretendard Medium 20 / lh 30 / -0.5 / 흰색 */}
        {/* 다른 섹션 헤더와 같은 등장 리듬을 쓴다 — 여기만 멈춰 있으면 튄다 */}
        <Reveal className="w-full" y={16} duration={600}>
          <p className="w-full text-[15px] leading-[22px] font-medium tracking-[-0.38px] text-white md:text-[18px] md:leading-[26px] xl:text-[20px] xl:leading-[30px] xl:tracking-[-0.5px]">
            더 이상의 곱창은 없다, 절대적 미학의 시작
          </p>
        </Reveal>

        {/* Figma 332:634 — gap 16 */}
        <div className="flex w-full flex-col items-center gap-[12px] xl:gap-[16px]">
          {/* Figma 332:635 — Pretendard Bold 60 / lh 80 / -1.5 / 흰색 / uppercase */}
          <h2 className="w-full text-[clamp(26px,6.4vw,44px)] leading-[1.28] font-bold tracking-[-0.03em] text-white uppercase xl:text-[60px] xl:leading-[80px] xl:tracking-[-1.5px]">
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
            <p className="w-full text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[rgba(255,255,255,0.6)] md:text-[16px] md:leading-[24px] xl:text-[18px] xl:leading-[26px] xl:tracking-[-0.45px]">
              수 세기를 이어온 미식의 뿌리를 오늘날의 세련된 다이닝으로
              재해석하여, 당신의 테이블 위에{" "}
              {/* 줄바꿈은 데스크톱에서만 — 좁은 화면은 폭에 맞춰 자연스럽게 흐른다 */}
              <br className="hidden xl:block" />
              한국 미식의 새로운 이정표를 세웁니다.
            </p>
          </Reveal>
        </div>
      </div>

      {/* Figma 332:637 — 3행, 세로 gap 80 (좁으면 한 단계씩 줄인다) */}
      <div
        ref={rowsRef}
        className="flex w-full flex-col items-stretch gap-[56px] md:gap-[72px] xl:gap-[80px]"
      >
        {ROWS.map((row, rowIndex) => (
          <div
            key={row.id}
            // 좁으면 세로로 쌓고(아이콘 → 텍스트), md 부터 가로로 눕히며 짝수 행을 뒤집는다.
            // xl 에서는 텍스트 | 구분선 | 아이콘 3단을 양끝 정렬로 벌려 예전 gap 200 을 재현한다.
            className="flex w-full flex-col items-center gap-[24px] md:flex-row md:items-center md:gap-[48px] md:even:flex-row-reverse xl:justify-between xl:gap-0 xl:even:flex-row"
          >
            {/* Figma 332:639 — w 404, gap 28.
                좁은 화면은 좌측 브랜드 세로선으로 구분선을 대신하고, xl 에서는 중앙 구분선을 쓰므로 선을 뗀다.
                등장 opacity 는 xl 에서 JS 가 인라인으로 덮어쓴다(그 아래는 CSS 로 이미 보인다) */}
            <div
              ref={(el) => (textRefs.current[rowIndex] = el)}
              className="flex w-full flex-col items-start gap-[12px] border-l-[3px] border-[#ea665f] pl-[16px] opacity-100 will-change-transform md:pl-[20px] xl:w-[404px] xl:shrink-0 xl:gap-[28px] xl:border-l-0 xl:pl-0 xl:opacity-0"
            >
              {/* Figma 332:640 — Pretendard Medium 20 / lh 30 / -0.5 / #ea665f */}
              <p className="w-full text-[14px] leading-[20px] font-medium tracking-[-0.35px] text-[#ea665f] md:text-[16px] xl:text-[20px] xl:leading-[30px] xl:tracking-[-0.5px]">
                {row.eyebrow}
              </p>

              {/* Figma 332:641 — gap 12 */}
              <div className="flex w-full flex-col items-start gap-[12px]">
                {/* Figma 332:642 — Pretendard Bold 48 / lh 56 / 흰색 */}
                <p className="w-full text-[clamp(22px,5.6vw,34px)] leading-[1.24] font-bold text-white xl:text-[48px] xl:leading-[56px]">
                  {row.title}
                </p>
                {/* Figma 332:643 — Pretendard Regular 16 / lh 24 / -0.4 / 흰색 60% */}
                <p className="w-full text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[rgba(255,255,255,0.6)] md:text-[15px] md:leading-[23px] xl:text-[16px] xl:leading-[24px] xl:tracking-[-0.4px]">
                  {row.desc}
                </p>
              </div>
            </div>

            {/* Figma 332:644 — 세로 구분선 3 x 500, #212121, radius 999. xl 에서만 켠다.
                막대가 3px 보다 두꺼우므로 overflow-hidden 을 쓰지 않고,
                막대 위치를 구분선 안쪽으로 제한해 잘리지 않게 한다 */}
            <div className="relative hidden h-[500px] w-[3px] shrink-0 rounded-[999px] bg-[#212121] xl:block">
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

            {/* 커서 방향으로 기울어지는 3D 틸트. (터치·모션 최소화에서는 Tilt 가 no-op)
                부유(CSS 애니메이션)·등장(JS transform)과 층을 나눠 서로 덮어쓰지 않게 한다 */}
            <Tilt className="shrink-0" max={14} perspective={1000}>
              <div
                className="heritage-float"
                // 부유는 376 아이콘이 놓이는 xl 에서만 켠다(좁은 화면 아이콘은 담백하게 둔다).
                // 주기·시작점은 행마다 다르므로 CSS 변수로 넘겨 xl 미디어쿼리에서 쓴다 —
                // 인라인 animation 으로 두면 브레이크포인트로 끌 수 없어 좁은 화면에서도 떠 버린다.
                style={{
                  "--float-dur": `${FLOAT_DURATION[rowIndex]}s`,
                  "--float-delay": `${FLOAT_DELAY[rowIndex]}s`,
                }}
              >
                {/* Figma 332:646 — 376 x 376 클립(좁으면 계단식으로 줄인다) 안에 이미지.
                    프레임 박스는 클립 대비 비율(%)로 두어 클립이 줄어도 크롭 구도가 유지된다.
                    등장 opacity 는 xl 에서 JS 가 인라인으로 덮어쓴다 */}
                <div
                  ref={(el) => (imageRefs.current[rowIndex] = el)}
                  className="relative size-[240px] overflow-hidden opacity-100 will-change-transform md:size-[300px] xl:size-[376px] xl:opacity-0"
                >
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden"
                    style={{
                      width: `${(row.frame.width / CLIP_XL) * 100}%`,
                      height: `${(row.frame.height / CLIP_XL) * 100}%`,
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
        @media (min-width: 1200px) {
          .heritage-float {
            animation: heritageFloat var(--float-dur) ease-in-out infinite;
            animation-delay: var(--float-delay);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .heritage-float { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
