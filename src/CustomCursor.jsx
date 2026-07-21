import { useEffect, useRef } from "react";

/**
 * 커스텀 커서 — 즉시 따라오는 점 + 한 박자 늦게 따라오는 고리.
 *
 * mix-blend-mode: difference 를 써서 흰 섹션에서는 검게, 검은 섹션에서는 희게
 * 저절로 반전된다. 섹션마다 색을 갈아끼울 필요가 없다.
 *
 * 마우스가 있는 환경에서만 켠다. 터치 기기나 모션을 줄인 설정에서는 렌더하지 않는다.
 */
const RING_DAMPING = 0.18;
const RING_SIZE = 40;
const DOT_SIZE = 6;

/** 이 요소들 위에서는 고리가 커진다 */
const INTERACTIVE = "a, button, [role='tab'], [data-cursor='hover']";

export default function CustomCursor() {
  const ringRef = useRef(null);
  const dotRef = useRef(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!fine || reduce) return;

    const ring = ringRef.current;
    const dot = dotRef.current;
    if (!ring || !dot) return;

    ring.style.opacity = "1";
    dot.style.opacity = "1";

    const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const ringPos = { ...mouse };
    let scale = 1;
    let targetScale = 1;
    let raf = 0;

    const tick = () => {
      ringPos.x += (mouse.x - ringPos.x) * RING_DAMPING;
      ringPos.y += (mouse.y - ringPos.y) * RING_DAMPING;
      scale += (targetScale - scale) * 0.15;

      ring.style.transform = `translate3d(${ringPos.x - RING_SIZE / 2}px, ${ringPos.y - RING_SIZE / 2}px, 0) scale(${scale})`;
      dot.style.transform = `translate3d(${mouse.x - DOT_SIZE / 2}px, ${mouse.y - DOT_SIZE / 2}px, 0)`;

      // 고리가 포인터를 따라잡았으면 멈춘다. 가만히 있는데도 매 프레임 도는 건 낭비다
      if (
        Math.abs(mouse.x - ringPos.x) < 0.1 &&
        Math.abs(mouse.y - ringPos.y) < 0.1 &&
        Math.abs(targetScale - scale) < 0.001
      ) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      // 커서 아래에 인터랙티브 요소가 있으면 고리를 키운다
      targetScale = e.target?.closest?.(INTERACTIVE) ? 2 : 1;
      start();
    };
    const onLeave = () => {
      ring.style.opacity = "0";
      dot.style.opacity = "0";
    };
    const onEnter = () => {
      ring.style.opacity = "1";
      dot.style.opacity = "1";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointerenter", onEnter);
    start();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerenter", onEnter);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[400] mix-blend-difference"
    >
      <div
        ref={ringRef}
        className="absolute top-0 left-0 rounded-full border border-white opacity-0 transition-opacity duration-300 will-change-transform"
        style={{ width: RING_SIZE, height: RING_SIZE }}
      />
      <div
        ref={dotRef}
        className="absolute top-0 left-0 rounded-full bg-white opacity-0 transition-opacity duration-300 will-change-transform"
        style={{ width: DOT_SIZE, height: DOT_SIZE }}
      />
    </div>
  );
}
