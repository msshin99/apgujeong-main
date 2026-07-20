import { useEffect, useRef, useState } from "react";
import { DESIGN_H, DESIGN_W, useCanvasScale } from "./useCanvasScale.js";
import { useBreakpoint } from "./useBreakpoint.js";
import { asset } from "./lib/asset.js";

/**
 * Figma: Frame 2095588280 (332:2154) — 1920 x 1000
 *
 * 수치는 Figma 실측 그대로 고정 px.
 * 1920x1000 이 아닌 화면에서는 캔버스 전체에 scale 을 걸어 비율만 맞춘다.
 * (scale 은 가로/세로 중 작은 쪽 기준 = contain → 스크롤 없이 한 화면에 다 들어감)
 */
const TABS = [
  { id: "flavor", label: "FLAVOR", image: asset("/images/figma/e.png") },
  { id: "juicy", label: "JUICY", image: asset("/images/figma/d.png") },
  { id: "sizzle", label: "SIZZLE", image: asset("/images/figma/c.png") },
];

const HEAD = "RICH";
const TAIL = "JOURNEY";

// Figma 332:779 / 781 / 782 — Shippori Mincho Bold, 80px, line-height 90px
const TITLE_TEXT =
  "font-mincho font-bold uppercase text-white whitespace-nowrap text-[80px] leading-[90px]";

export default function HeroTabs() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState(0);
  const [labelWidth, setLabelWidth] = useState(0);
  const firstRender = useRef(true);
  const measureRef = useRef(null);
  const bgRef = useRef(null);
  const contentRef = useRef(null);

  const active = TABS[activeIndex];
  const prev = TABS[prevIndex];
  const isSwapping = prevIndex !== activeIndex;

  // 히어로는 한 화면(100dvh) 안에 다 들어가도록 캔버스를 contain
  const scale = useCanvasScale();
  const { isCompact } = useBreakpoint();

  useEffect(() => {
    firstRender.current = false;
  }, []);

  /* 스크롤로 히어로를 빠져나갈 때 — 배경은 서서히 확대되고,
     타이틀·탭은 위로 떠오르며 사라진다. 다음 섹션으로 자연스럽게 넘어간다. */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight || 1;
      const p = Math.min(Math.max(window.scrollY / vh, 0), 1);
      if (bgRef.current) {
        bgRef.current.style.transform = `scale(${1 + p * 0.16})`;
      }
      if (contentRef.current) {
        contentRef.current.style.transform = `translate3d(0, ${-p * 120}px, 0)`;
        contentRef.current.style.opacity = String(Math.max(1 - p * 1.4, 0));
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  /* 라벨 중 가장 긴 것의 폭을 재서 창 폭으로 고정한다.
     offsetWidth 는 transform(scale) 의 영향을 받지 않으므로 디자인 기준 px 가 그대로 나온다.
     웹폰트가 늦게 로드되면 폭이 달라지므로 fonts.ready 이후 한 번 더 잰다. */
  useEffect(() => {
    const measure = () => {
      const el = measureRef.current;
      if (!el) return;
      const max = Math.max(...Array.from(el.children, (c) => c.offsetWidth));
      setLabelWidth(Math.ceil(max));
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
  }, []);

  const handleSelect = (i) => {
    if (i === activeIndex) return;
    setPrevIndex(activeIndex);
    setActiveIndex(i);
  };

  return (
    <section className="relative h-[100dvh] w-full overflow-hidden bg-neutral-950">
      {/* 배경 — 화면 전체를 채운다 (캔버스 스케일과 무관하게 full-bleed) */}
      <div
        ref={bgRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden will-change-transform"
      >
        {TABS.map((tab, i) => {
          // 새 이미지가 아래에서 위로 덮어 올라오고, 그 밑에 직전 이미지가 깔려 있다
          const z =
            i === activeIndex ? "z-20" : i === prevIndex ? "z-10" : "z-0";
          return (
            <div
              key={tab.id}
              className={`absolute inset-0 overflow-hidden ${z}`}
            >
              <img
                // key 를 바꿔 재마운트 → 활성화될 때마다 리빌 모션 재생
                key={`${tab.id}-${i === activeIndex ? activeIndex : "idle"}`}
                alt=""
                src={tab.image}
                className={[
                  "absolute inset-0 size-full max-w-none object-cover",
                  i === activeIndex && !firstRender.current
                    ? "animate-[imageReveal_1100ms_cubic-bezier(0.76,0,0.24,1)_both]"
                    : "",
                ].join(" ")}
              />
            </div>
          );
        })}
        {/* Figma: fill rgba(0,0,0,0.2). 좁은 화면에서는 글자 대비를 위해 조금 더 어둡게 */}
        <div className="absolute inset-0 z-30 bg-[rgba(0,0,0,0.2)] lg:bg-[rgba(0,0,0,0.2)] max-lg:bg-[rgba(0,0,0,0.38)]" />
      </div>

      {/* 헤더는 이 섹션 밖(App.jsx 의 StickyHeader)에서 화면에 고정된다.
          히어로 안에 두면 스크롤과 함께 위로 사라지기 때문이다. */}

      {/* 1200 미만 — 캔버스를 버리고 유동 레이아웃 */}
      {isCompact && (
        <div className="absolute inset-0 z-40 flex flex-col px-[20px] sm:px-[24px] md:px-[40px]">
          {/* 고정 헤더가 덮는 만큼 위를 비워 둔다 */}
          <div aria-hidden className="h-[92px] shrink-0" />

          {/* 타이틀 — 화면 중앙 */}
          <div className="flex flex-1 items-center justify-center">
            <h1 className="flex flex-wrap items-center justify-center gap-x-[0.3em] gap-y-[0.1em] text-center font-mincho text-[clamp(26px,7.4vw,56px)] leading-[1.15] font-bold text-white uppercase">
              <span>{HEAD}</span>
              <span className="inline-flex items-center gap-[0.25em]">
                <span>(</span>
                {/* 데스크톱과 같은 아래→위 교체. 폭은 em 기준으로 잡아 괄호가 밀리지 않는다 */}
                <span className="relative block h-[1.15em] w-[4.6em] overflow-hidden">
                  {isSwapping && (
                    <span
                      key={`m-out-${prev.id}-${activeIndex}`}
                      className="absolute inset-x-0 top-0 block animate-[textOutUp_620ms_cubic-bezier(0.76,0,0.24,1)_both] text-center"
                    >
                      {prev.label}
                    </span>
                  )}
                  <span
                    key={`m-in-${active.id}`}
                    className={`absolute inset-x-0 top-0 block text-center ${
                      firstRender.current
                        ? ""
                        : "animate-[textInUp_620ms_cubic-bezier(0.76,0,0.24,1)_both]"
                    }`}
                  >
                    {active.label}
                  </span>
                </span>
                <span>)</span>
              </span>
              <span>{TAIL}</span>
            </h1>
          </div>

          {/* 탭 — 하단 3등분 */}
          <nav
            role="tablist"
            aria-label="메뉴 카테고리"
            className="flex w-full items-center pb-[28px] md:pb-[40px]"
          >
            {TABS.map((tab, i) => {
              const isActive = i === activeIndex;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleSelect(i)}
                  className={[
                    "flex flex-1 items-center justify-center py-[18px] md:py-[24px]",
                    "font-pretendard text-[clamp(13px,3.4vw,20px)] leading-[1.4] tracking-[-0.025em] whitespace-nowrap",
                    "transition-colors duration-500 outline-none",
                    isActive
                      ? "font-bold text-white"
                      : "font-medium text-[rgba(255,255,255,0.4)]",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {/* 1920x1000 디자인 캔버스 — 1200 이상에서만 */}
      <div
        className={`absolute top-1/2 left-1/2 z-40 ${isCompact ? "hidden" : ""}`}
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {/* 스크롤에 따라 살짝 떠오르며 사라지는 층 (캔버스 transform 과 충돌하지 않게 안쪽에 둔다) */}
        <div
          ref={contentRef}
          className="absolute inset-0 will-change-transform"
        >
          {/* 라벨 폭 측정용 — 레이아웃에 영향을 주지 않는 숨김 노드 */}
          <span
            ref={measureRef}
            aria-hidden
            className={`${TITLE_TEXT} pointer-events-none absolute top-0 left-0 invisible`}
          >
            {TABS.map((tab) => (
              <span key={tab.id} className="block">
                {tab.label}
              </span>
            ))}
          </span>


          {/* Figma 332:2154 — px 120 / pt 454 / pb 2 */}
          <div className="flex h-full flex-col items-start px-[120px] pt-[454px] pb-[2px]">
            {/* Figma 332:2153 — w 1680, h 544, gap 304 */}
            <div className="flex w-[1680px] flex-col items-center gap-[304px]">
              {/* Figma 332:778 — 타이틀 행 h 110, gap 32 */}
              <h1 className="flex items-center gap-[32px]">
                <span className={TITLE_TEXT}>{HEAD}</span>

                {/* Figma 332:780 — p 10 래퍼 / w 494 고정(가장 긴 라벨 기준)
                  → 라벨이 바뀌어도 RICH·JOURNEY 가 흔들리지 않는다 */}
                <span className="flex w-[494px] items-center justify-center p-[10px]">
                  {/* 괄호는 고정, 안쪽 라벨만 교차한다.
                    라벨 창 폭을 가장 긴 라벨 기준으로 고정해 괄호가 밀리지 않게 한다. */}
                  <span
                    className={`${TITLE_TEXT} flex items-center gap-[20px]`}
                  >
                    <span>(</span>

                    {/* 90px(line-height) 창 안에서 아래 → 위로 밀어올린다 */}
                    <span
                      className="relative block h-[90px] overflow-hidden"
                      style={{ width: labelWidth || undefined }}
                    >
                      {isSwapping && (
                        <span
                          key={`out-${prev.id}-${activeIndex}`}
                          className="absolute inset-x-0 top-0 block text-center animate-[textOutUp_620ms_cubic-bezier(0.76,0,0.24,1)_both]"
                        >
                          {prev.label}
                        </span>
                      )}
                      <span
                        key={`in-${active.id}`}
                        className={`absolute inset-x-0 top-0 block text-center ${
                          firstRender.current
                            ? ""
                            : "animate-[textInUp_620ms_cubic-bezier(0.76,0,0.24,1)_both]"
                        }`}
                      >
                        {active.label}
                      </span>
                    </span>

                    <span>)</span>
                  </span>
                </span>

                <span className={TITLE_TEXT}>{TAIL}</span>
              </h1>

              {/* Figma 332:822 — w 1680, h 130 / 각 칸 560 (= 1680 / 3), px 10, py 48 */}
              <nav
                role="tablist"
                aria-label="메뉴 카테고리"
                className="flex w-[1680px] items-center"
              >
                {TABS.map((tab, i) => {
                  const isActive = i === activeIndex;
                  return (
                    <button
                      key={tab.id}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => handleSelect(i)}
                      className={[
                        "flex w-[560px] items-center justify-center px-[10px] py-[48px]",
                        // Figma 332:824 — Pretendard, 24px, line-height 34px, tracking -0.6px
                        "font-pretendard text-[24px] leading-[34px] tracking-[-0.6px] whitespace-nowrap",
                        "transition-colors duration-500 ease-out outline-none",
                        "focus-visible:underline focus-visible:underline-offset-8",
                        isActive
                          ? "font-bold text-white"
                          : "font-medium text-[rgba(255,255,255,0.3)] hover:text-[rgba(255,255,255,0.6)]",
                      ].join(" ")}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        /* 중앙 괄호 텍스트 — 아래에서 위로 교체 */
        @keyframes textInUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes textOutUp {
          from { transform: translateY(0);     opacity: 1; }
          to   { transform: translateY(-100%); opacity: 0; }
        }
        /* 배경 이미지 — 아래에서 위로 걷히며 드러나고, 동시에 줌아웃 */
        @keyframes imageReveal {
          from { clip-path: inset(100% 0 0 0); transform: scale(1.18); filter: brightness(1.25); }
          to   { clip-path: inset(0 0 0 0);    transform: scale(1);    filter: brightness(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-\\[textInUp_620ms_cubic-bezier\\(0\\.76\\,0\\,0\\.24\\,1\\)_both\\],
          .animate-\\[textOutUp_620ms_cubic-bezier\\(0\\.76\\,0\\,0\\.24\\,1\\)_both\\],
          .animate-\\[imageReveal_1100ms_cubic-bezier\\(0\\.76\\,0\\,0\\.24\\,1\\)_both\\] {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
