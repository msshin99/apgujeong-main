import { useEffect, useRef } from "react";
import { useBreakpoint } from "./useBreakpoint.js";

/**
 * 검은 배경 위를 떠다니는 붉은 블러 원.
 * 메인페이지 DarkStage 에서 쓰던 연출을 다른 섹션에서도 쓸 수 있게 분리했다.
 *
 * 부모에 position: relative 를 두고 이 컴포넌트를 그 안에 넣으면 배경으로 깔린다.
 * 위치는 %로 잡아 섹션 높이와 무관하게 비율이 유지된다.
 *
 * 1200 미만에서는 blur(300px) 가 저사양 기기에서 가장 무거운 요소라
 * 같은 붉은 기운을 내는 radial-gradient 로 대체한다.
 */
const GLOWS = [
  { id: "a", side: "left", offset: "-22%", top: "-6%", w: "48%", h: "42%", drift: 0, pull: 70 },
  { id: "b", side: "right", offset: "-20%", top: "28%", w: "42%", h: "40%", drift: 1, pull: -46 },
  { id: "c", side: "left", offset: "-18%", top: "62%", w: "42%", h: "40%", drift: 2, pull: 54 },
];

export default function GlowBackdrop({ blur = 260 }) {
  const { isCompact } = useBreakpoint();
  const hostRef = useRef(null);
  const pullRefs = useRef([]);

  /* 마우스를 움직이면 글로우가 시차를 두고 끌려온다.
     글로우 자체는 CSS 키프레임으로 떠다니므로 감싸는 층에 transform 을 준다. */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || isCompact) return;
    if (
      !window.matchMedia("(pointer: fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const parent = host.parentElement;
    if (!parent) return;

    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let raf = 0;

    const tick = () => {
      cur.x += (target.x - cur.x) * 0.06;
      cur.y += (target.y - cur.y) * 0.06;
      pullRefs.current.forEach((el, i) => {
        if (!el) return;
        const k = GLOWS[i].pull;
        el.style.transform = `translate3d(${cur.x * k}px, ${cur.y * k}px, 0)`;
      });
      if (Math.abs(target.x - cur.x) < 0.0005 && Math.abs(target.y - cur.y) < 0.0005) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onMove = (e) => {
      const r = parent.getBoundingClientRect();
      target.x = (e.clientX - r.left) / r.width - 0.5;
      target.y = (e.clientY - (r.top + window.innerHeight / 2)) / window.innerHeight;
      start();
    };
    const onLeave = () => {
      target.x = 0;
      target.y = 0;
      start();
    };

    parent.addEventListener("pointermove", onMove);
    parent.addEventListener("pointerleave", onLeave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      parent.removeEventListener("pointermove", onMove);
      parent.removeEventListener("pointerleave", onLeave);
    };
  }, [isCompact]);

  if (isCompact) {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(60% 26% at 6% 10%, rgba(230,25,17,0.30) 0%, rgba(230,25,17,0) 70%)," +
            "radial-gradient(62% 24% at 98% 52%, rgba(230,25,17,0.26) 0%, rgba(230,25,17,0) 70%)," +
            "radial-gradient(58% 24% at 4% 92%, rgba(230,25,17,0.24) 0%, rgba(230,25,17,0) 70%)",
        }}
      />
    );
  }

  return (
    <div ref={hostRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {GLOWS.map((g, i) => (
        <div
          key={g.id}
          ref={(el) => (pullRefs.current[i] = el)}
          className="absolute will-change-transform"
          style={{ top: g.top, width: g.w, height: g.h, [g.side]: g.offset }}
        >
          <div
            className="glow-drift size-full rounded-[9999px] will-change-transform"
            style={{
              background: "rgba(230,25,17,0.4)",
              filter: `blur(${blur}px)`,
              animation: `glowDrift${g.drift} ${[8, 11, 9.5][g.drift]}s ease-in-out infinite`,
            }}
          />
        </div>
      ))}

      <style>{`
        @keyframes glowDrift0 {
          0%   { transform: translate3d(0, 0, 0) scale(1); opacity: 0.85; }
          20%  { transform: translate3d(48%, -26%, 0) scale(1.45); opacity: 1; }
          40%  { transform: translate3d(22%, 34%, 0) scale(0.72); opacity: 0.7; }
          60%  { transform: translate3d(-34%, 12%, 0) scale(1.34); opacity: 1; }
          80%  { transform: translate3d(-12%, -30%, 0) scale(0.85); opacity: 0.8; }
          100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.85; }
        }
        @keyframes glowDrift1 {
          0%   { transform: translate3d(0, 0, 0) scale(1.12); opacity: 1; }
          20%  { transform: translate3d(-40%, 36%, 0) scale(0.7); opacity: 0.72; }
          40%  { transform: translate3d(-54%, -18%, 0) scale(1.5); opacity: 1; }
          60%  { transform: translate3d(16%, -34%, 0) scale(0.88); opacity: 0.8; }
          80%  { transform: translate3d(30%, 20%, 0) scale(1.28); opacity: 0.95; }
          100% { transform: translate3d(0, 0, 0) scale(1.12); opacity: 1; }
        }
        @keyframes glowDrift2 {
          0%   { transform: translate3d(0, 0, 0) scale(0.9); opacity: 0.78; }
          20%  { transform: translate3d(38%, 40%, 0) scale(1.42); opacity: 1; }
          40%  { transform: translate3d(56%, -14%, 0) scale(0.74); opacity: 0.7; }
          60%  { transform: translate3d(-20%, -36%, 0) scale(1.36); opacity: 1; }
          80%  { transform: translate3d(-42%, 10%, 0) scale(0.92); opacity: 0.85; }
          100% { transform: translate3d(0, 0, 0) scale(0.9); opacity: 0.78; }
        }
        @media (prefers-reduced-motion: reduce) {
          .glow-drift { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
