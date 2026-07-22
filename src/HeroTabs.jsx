import { useEffect, useRef, useState } from "react";
import Img from "./Img.jsx";
import { asset } from "./lib/asset.js";

/**
 * Figma: Frame 2095588280 (332:2154) — 1920 x 1000
 *
 * 데스크톱 수치는 Figma 실측 그대로(타이틀 80px, 탭 24px)를 상한으로 두고,
 * 좁은 화면에서는 유동적으로 줄어드는 단일 반응형 트리다.
 * (예전엔 캔버스 contain 분기 + isCompact 분기로 나뉘어 있었고,
 *  캔버스 scale 때문에 라벨 폭을 offsetWidth 로 재는 취약한 훅이 필요했다 —
 *  이제 콘텐츠 폭으로 자연스럽게 배치되므로 그 측정도, 이중 분기도 사라졌다.)
 */
const TABS = [
  { id: "flavor", label: "FLAVOR", image: asset("/images/figma/e.png") },
  { id: "juicy", label: "JUICY", image: asset("/images/figma/d.png") },
  { id: "sizzle", label: "SIZZLE", image: asset("/images/figma/c.png") },
];

const HEAD = "RICH";
const TAIL = "JOURNEY";

// Figma 332:779 / 781 / 782 — Shippori Mincho Bold, 80px(데스크톱 상한), line-height 90px(≈1.125em)
// clamp 로 좁은 화면에서 줄어들고 ~1080px 부터 Figma 80px 로 고정된다.
const TITLE_TEXT =
  "font-mincho font-bold uppercase text-white text-[clamp(26px,7.4vw,80px)] leading-[1.15]";

export default function HeroTabs() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState(0);
  const firstRender = useRef(true);
  const bgRef = useRef(null);
  const contentRef = useRef(null);

  const active = TABS[activeIndex];
  const prev = TABS[prevIndex];
  const isSwapping = prevIndex !== activeIndex;

  useEffect(() => {
    firstRender.current = false;
  }, []);

  /* 스크롤로 히어로를 빠져나갈 때 — 배경은 서서히 확대되고,
     타이틀·탭은 위로 떠오르며 사라진다. 다음 섹션으로 자연스럽게 넘어간다.
     bgRef/contentRef 만 건드리므로 캔버스 스케일과 무관하다. */
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
              <Img
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

      {/* 중앙 콘텐츠 — 단일 반응형 트리. 스크롤 시 위로 떠오르며 사라지는 층(contentRef). */}
      <div
        ref={contentRef}
        className="absolute inset-0 z-40 flex flex-col px-[20px] will-change-transform sm:px-[24px] md:px-[40px] min-[1200px]:px-[120px]"
      >
        {/* 고정 헤더가 덮는 만큼 위를 비워 둔다 */}
        <div aria-hidden className="h-[92px] shrink-0 min-[1200px]:h-[120px]" />

        {/* Figma 332:778 — 타이틀 행. 화면 중앙에 두고, 좁은 화면에서는 줄바꿈 허용 */}
        <div className="flex flex-1 items-center justify-center">
          <h1
            className={`flex flex-wrap items-center justify-center gap-x-[0.3em] gap-y-[0.1em] text-center ${TITLE_TEXT}`}
          >
            <span>{HEAD}</span>

            {/* Figma 332:780 — 괄호는 고정, 안쪽 라벨만 교차한다.
                라벨 창 폭을 em 기준(4.6em)으로 잡아 라벨이 바뀌어도 괄호·RICH·JOURNEY 가 밀리지 않는다.
                (예전엔 offsetWidth 로 폭을 재서 고정했지만, 유동 레이아웃에선 불필요하다) */}
            <span className="inline-flex items-center gap-[0.25em]">
              <span>(</span>

              {/* line-height(1.15em) 창 안에서 아래 → 위로 밀어올린다 */}
              <span className="relative block h-[1.15em] w-[4.6em] overflow-hidden">
                {isSwapping && (
                  // 빠져나가는 라벨은 화면에만 남기고 접근성 트리에서는 뺀다.
                  // 안 그러면 스크린리더가 "RICH ( FLAVOR JUICY ) JOURNEY" 로 읽는다
                  <span
                    key={`out-${prev.id}-${activeIndex}`}
                    aria-hidden
                    className="absolute inset-x-0 top-0 block animate-[textOutUp_620ms_cubic-bezier(0.76,0,0.24,1)_both] text-center"
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

            <span>{TAIL}</span>
          </h1>
        </div>

        {/* Figma 332:822 — 하단 탭. 각 칸 1/3(flex-1), 데스크톱 최대 폭 1680px 로 중앙 정렬 */}
        <nav
          role="tablist"
          aria-label="메뉴 카테고리"
          className="mx-auto flex w-full max-w-[1680px] items-center pb-[28px] md:pb-[40px] min-[1200px]:pb-[2px]"
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
                  "flex flex-1 items-center justify-center py-[18px] md:py-[24px] min-[1200px]:py-[48px]",
                  // Figma 332:824 — Pretendard, 24px(데스크톱 상한), line-height 34px, tracking -0.6px(≈-0.025em)
                  "font-pretendard text-[clamp(13px,3.4vw,24px)] leading-[1.4] tracking-[-0.025em] whitespace-nowrap",
                  "transition-colors duration-500 ease-out outline-none",
                  "focus-visible:underline focus-visible:underline-offset-8",
                  isActive
                    ? "font-bold text-white"
                    : "font-medium text-[rgba(255,255,255,0.4)] hover:text-[rgba(255,255,255,0.6)]",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
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
