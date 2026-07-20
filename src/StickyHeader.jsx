import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Header from "./Header.jsx";
import { DESIGN_W, useWidthScale } from "./useCanvasScale.js";
import { useBreakpoint } from "./useBreakpoint.js";

/**
 * 스크롤을 따라오는 헤더.
 *
 * variant
 *   "overlay" — 홈. 히어로 사진 위에 얹혀 처음에는 투명하고,
 *               사진을 지나 내려가면 검은 배경이 깔린다.
 *   "solid"   — 하위 페이지. 흰 배경 + 아래 실선을 늘 유지한다.
 *
 * 어디까지 내려가든 화면 맨 위에 그대로 붙어 있는다.
 * 바뀌는 것은 배경뿐이다 — 히어로 위에서는 투명하고, 내려가면 배경이 깔린다.
 */

/** 이만큼 내려오면 배경을 깐다 */
const SOLID_AT = 40;

function useScrolled() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > SOLID_AT);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return scrolled;
}

export default function StickyHeader({ variant = "overlay" }) {
  const scale = useWidthScale();
  const { isCompact } = useBreakpoint();
  const scrolled = useScrolled();

  /* fixed 로 띄우면 문서 흐름에서 빠져 그만큼 본문이 위로 밀린다.
     실제 높이를 재서 같은 크기의 자리를 대신 채워 준다. */
  const barRef = useRef(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isCompact, scale]);

  const solid = variant === "solid";
  const dark = solid; // 흰 배경 위에서는 글씨가 검어야 한다

  const surface = solid
    ? "border-b border-solid border-[#e5e5ec] bg-white"
    : scrolled
      ? "bg-black/80 backdrop-blur-[10px]"
      : "bg-transparent";

  return (
    <>
      <div
        ref={barRef}
        className={`fixed top-0 left-0 z-[120] w-full transition-colors duration-500 ease-out ${surface}`}
      >
        {isCompact ? (
          <div className="px-[20px] sm:px-[24px] md:px-[40px]">
            <Header compact dark={dark} />
          </div>
        ) : (
          /* 1200 이상은 1920 캔버스를 축소해 쓴다. scale 은 레이아웃 높이를
             바꾸지 않으므로 바깥 상자의 높이를 직접 계산해 준다 */
          <div
            className="flex w-full justify-center overflow-hidden"
            style={{ height: 96 * scale }}
          >
            <div
              className="origin-top shrink-0"
              style={{ width: DESIGN_W, transform: `scale(${scale})` }}
            >
              <div className="mx-[120px]">
                <Header dark={dark} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 하위 페이지는 헤더 아래에서 본문이 시작하므로 그만큼 자리를 비운다.
          홈은 히어로 사진 위에 얹히는 구조라 자리를 만들지 않는다. */}
      {solid && <div aria-hidden style={{ height }} />}
    </>
  );
}
