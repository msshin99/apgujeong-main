import { useEffect, useRef } from "react";
import { DESIGN_W, useWidthScale } from "./useCanvasScale.js";
import Heritage from "./Heritage.jsx";
import Unrivaled from "./Unrivaled.jsx";
import { useBreakpoint } from "./useBreakpoint.js";

/**
 * Figma: Group 1707481190 (332:624) — 검은 배경 위에 붉은 블러 원 4개가 깔린 구간.
 *
 * 페이지 좌표(y 3802 을 0 으로 환산):
 *   배경 사각형 332:625  1920 x 4104
 *   콘텐츠 프레임 332:630 x 368 / y 200 / w 1200 / h 3705
 *     ├ Heritage  332:631  y 0
 *     └ Unrivaled 332:669  y 2162
 *   블러 원 332:626~629 — 전부 rgba(230,25,17,0.4) + blur(300px)
 */
const STAGE_H = 4104;
const CONTENT_LEFT = 368;
const CONTENT_TOP = 200;
const UNRIVALED_TOP = 2162; // Figma 332:669 y (332:630 기준)

const GLOW_BLUR = 300;

/**
 * 블러 원.
 * 1920 캔버스 안에 두면 캔버스 경계에서 잘리므로 캔버스 밖(섹션 직속)에 둔다.
 * 가로 위치는 화면의 좌/우 끝을 기준으로 잡아, 화면이 넓든 좁든 항상 밖으로 흘러나간다.
 *   offset 은 Figma 좌표에서 환산한 값 (음수 = 화면 밖으로 나간 거리)
 *   예) 332:629 는 left 1516 + w 800 = 2316 → 1920 기준 오른쪽으로 396 넘침
 */
const GLOWS = [
  {
    id: "a",
    side: "left",
    offset: -420,
    top: 200,
    width: 922,
    height: 850.68,
    drift: 0,
  },
  {
    id: "b",
    side: "right",
    offset: -396,
    top: 1090,
    width: 800,
    height: 806.42,
    drift: 1,
  },
  {
    id: "c",
    side: "left",
    offset: -383,
    top: 2173,
    width: 800,
    height: 806.42,
    drift: 2,
  },
  {
    id: "d",
    side: "right",
    offset: -314,
    top: 3082,
    width: 800,
    height: 806.42,
    drift: 3,
  },
];

// 원마다 다른 주기로 움직여 패턴이 반복돼 보이지 않게 한다.
// 서로 배수 관계가 아니어서 네 원이 같은 배치로 돌아오기까지 아주 오래 걸린다.
const DRIFT_DURATION = [8, 11, 9.5, 12.5];

/** 커서를 따라 글로우가 밀리는 최대 거리(px) — 원마다 깊이를 달리한다 */
const GLOW_PULL = [70, -46, 54, -62];

export default function DarkStage() {
  const scale = useWidthScale();
  const { isCompact } = useBreakpoint();
  const sectionRef = useRef(null);
  const pullRefs = useRef([]);

  /* 마우스를 움직이면 붉은 글로우가 시차를 두고 끌려온다.
     글로우 자체는 CSS 키프레임으로 떠다니므로, 감싸는 층에 transform 을 준다. */
  useEffect(() => {
    const host = sectionRef.current;
    if (!host || isCompact) return;
    if (
      !window.matchMedia("(pointer: fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let raf = 0;

    const tick = () => {
      cur.x += (target.x - cur.x) * 0.06;
      cur.y += (target.y - cur.y) * 0.06;
      pullRefs.current.forEach((el, i) => {
        if (!el) return;
        const k = GLOW_PULL[i] ?? 50;
        el.style.transform = `translate3d(${cur.x * k}px, ${cur.y * k}px, 0)`;
      });
      if (
        Math.abs(target.x - cur.x) < 0.0005 &&
        Math.abs(target.y - cur.y) < 0.0005
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
      const r = host.getBoundingClientRect();
      target.x = (e.clientX - r.left) / r.width - 0.5;
      target.y =
        (e.clientY - (r.top + window.innerHeight / 2)) / window.innerHeight;
      start();
    };
    const onLeave = () => {
      target.x = 0;
      target.y = 0;
      start();
    };

    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [isCompact]);

  /* 1200 미만 — blur(300px) 원 4개는 저사양 기기에서 가장 무거운 요소라
     같은 붉은 기운을 내는 radial-gradient 2장으로 대체한다.
     페인트 한 번으로 끝나고 매 프레임 다시 그리지 않는다. */
  if (isCompact) {
    return (
      <section className="relative w-full overflow-hidden bg-black">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(60% 28% at 8% 14%, rgba(230,25,17,0.30) 0%, rgba(230,25,17,0) 70%)," +
              "radial-gradient(62% 26% at 96% 62%, rgba(230,25,17,0.26) 0%, rgba(230,25,17,0) 70%)",
          }}
        />
        <div className="relative flex flex-col gap-[96px] px-[20px] py-[80px] sm:px-[24px] md:gap-[140px] md:px-[40px] md:py-[120px]">
          <Heritage compact />
          <Unrivaled compact />
        </div>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden bg-[#000000]"
      style={{ height: STAGE_H * scale }}
    >
      {/* Figma 332:626~629 — 붉은 블러 원. 화면 전체 폭 기준으로 배치된다.
          바깥 층은 커서를 따라 밀리고, 안쪽 층은 CSS 로 계속 떠다닌다 */}
      {GLOWS.map((g, i) => (
        <div
          key={g.id}
          ref={(el) => (pullRefs.current[i] = el)}
          aria-hidden
          className="pointer-events-none absolute will-change-transform"
          style={{
            top: g.top * scale,
            width: g.width * scale,
            height: g.height * scale,
            [g.side]: g.offset * scale,
          }}
        >
          <div
            className="dark-glow size-full rounded-[9999px] will-change-transform"
            style={{
              background: "rgba(230,25,17,0.4)",
              filter: `blur(${GLOW_BLUR * scale}px)`,
              animation: `glowDrift${g.drift} ${DRIFT_DURATION[g.drift]}s ease-in-out infinite`,
            }}
          />
        </div>
      ))}

      <div className="flex justify-center">
        <div
          className="origin-top relative shrink-0"
          style={{
            width: DESIGN_W,
            height: STAGE_H,
            transform: `scale(${scale})`,
          }}
        >
          {/* Figma 332:630 — 콘텐츠 프레임 1200 폭 */}
          <div
            className="absolute"
            style={{ left: CONTENT_LEFT, top: CONTENT_TOP, width: 1200 }}
          >
            <Heritage />
            <div style={{ position: "absolute", top: UNRIVALED_TOP, left: 0 }}>
              <Unrivaled />
            </div>
          </div>
        </div>
      </div>

      {/* 제자리에서 떠도는 움직임.
          키프레임을 4단계로 쪼개 궤적이 한 방향 왕복이 아니라 불규칙한 곡선을 그리게 한다.
          이동량을 %로 두면 원 크기에 비례하므로 화면 배율이 바뀌어도 느낌이 같다. */}
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
        @keyframes glowDrift3 {
          0%   { transform: translate3d(0, 0, 0) scale(1.2); opacity: 1; }
          20%  { transform: translate3d(-30%, -40%, 0) scale(0.72); opacity: 0.75; }
          40%  { transform: translate3d(-50%, 26%, 0) scale(1.44); opacity: 1; }
          60%  { transform: translate3d(18%, 44%, 0) scale(0.82); opacity: 0.8; }
          80%  { transform: translate3d(36%, -16%, 0) scale(1.3); opacity: 0.95; }
          100% { transform: translate3d(0, 0, 0) scale(1.2); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dark-glow { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
