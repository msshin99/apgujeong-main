import { useEffect, useRef } from "react";

/**
 * 화면 최상단에 붙는 스크롤 진행 바.
 * 브랜드 그라디언트(Heritage 막대와 동일)를 써서 페이지 전체를 하나로 묶는다.
 */
const BAR_GRADIENT =
  "linear-gradient(90deg, rgb(255,103,87) 0%, rgb(255,140,129) 50%, rgb(188,30,14) 100%)";

export default function ScrollProgress() {
  const barRef = useRef(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = barRef.current;
      if (!el) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
      el.style.transform = `scaleX(${p})`;
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

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[300] h-[3px] w-full"
    >
      <div
        ref={barRef}
        className="h-full w-full origin-left will-change-transform"
        style={{ backgroundImage: BAR_GRADIENT, transform: "scaleX(0)" }}
      />
    </div>
  );
}
