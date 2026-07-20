import { useEffect, useRef } from "react";
import { useBreakpoint } from "../useBreakpoint.js";

/**
 * Figma: Frame 2095588281 (354:2421) — 1920 x 640
 *
 * 가로 flex, gap 4, 각 칸 477 x 640, 칸마다 우측에 흰 1px 선.
 *   477 x 4 + 4 x 3 = 1920 ✓
 *
 * 화면 전체 폭을 쓰는 띠라서 컨테이너 폭(1680)에 가두지 않는다.
 */
const PANELS = [
  { id: "g1", image: "/images/brand/g1.png", alt: "테이블에 오르는 곱창 한 상" },
  { id: "g2", image: "/images/brand/g2.png", alt: "마무리 시즈닝을 뿌리는 셰프" },
  { id: "g3", image: "/images/brand/g3.png", alt: "숯불 화로" },
  { id: "g4", image: "/images/brand/g4.png", alt: "압구정곱창 코스터와 잔" },
];

const PANEL_H = 640; // Figma
const GAP = 4;

/** 커서가 올라간 칸은 넓어지고 나머지는 좁아진다 */
const GROW = 1.6;

export default function BrandGallery() {
  const { isCompact } = useBreakpoint();
  const hostRef = useRef(null);
  const panelRefs = useRef([]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || isCompact) return;
    if (
      !window.matchMedia("(pointer: fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    // -1 은 "커서 없음" — 네 칸이 균등해진다
    const target = { i: -1 };
    const cur = PANELS.map(() => 1); // 각 칸의 현재 비중
    let raf = 0;

    const tick = () => {
      let moving = false;
      panelRefs.current.forEach((el, i) => {
        if (!el) return;
        const want = target.i < 0 ? 1 : i === target.i ? GROW : (4 - GROW) / 3;
        cur[i] += (want - cur[i]) * 0.14;
        if (Math.abs(want - cur[i]) > 0.002) moving = true;
        el.style.flexGrow = String(cur[i]);
      });
      raf = moving ? requestAnimationFrame(tick) : 0;
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const enter = (i) => () => {
      target.i = i;
      start();
    };
    const leave = () => {
      target.i = -1;
      start();
    };

    const nodes = panelRefs.current.filter(Boolean);
    nodes.forEach((el, i) => el.addEventListener("pointerenter", enter(i)));
    host.addEventListener("pointerleave", leave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      nodes.forEach((el, i) => el.removeEventListener("pointerenter", enter(i)));
      host.removeEventListener("pointerleave", leave);
    };
  }, [isCompact]);

  /* 1200 미만 — 네 칸을 가로로 넣으면 한 칸이 100px 대로 좁아진다. 2열 격자로 편다 */
  if (isCompact) {
    return (
      <section className="w-full bg-white pt-[100px] md:pt-[150px] lg:pt-[200px]">
        <div className="grid w-full grid-cols-2" style={{ gap: GAP }}>
          {PANELS.map((p) => (
            <div key={p.id} className="relative w-full overflow-hidden bg-[#d9d9d9] pt-[124%]">
              <img src={p.image} alt={p.alt} className="absolute inset-0 size-full object-cover" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="w-full bg-white pt-[100px] md:pt-[150px] lg:pt-[200px]">
      {/* Figma 354:2421 — 화면 전체 폭, 칸 사이 4px */}
      <div
        ref={hostRef}
        className="flex w-full items-center"
        style={{ gap: GAP, height: `clamp(420px, 33.3vw, ${PANEL_H}px)` }}
      >
        {PANELS.map((p, i) => (
          <div
            key={p.id}
            ref={(el) => (panelRefs.current[i] = el)}
            className="group relative h-full min-w-0 basis-0 overflow-hidden bg-[#d9d9d9]"
            style={{ flexGrow: 1 }}
          >
            <img
              src={p.image}
              alt={p.alt}
              className="absolute inset-0 size-full max-w-none object-cover brightness-95 transition-[filter] duration-700 ease-out group-hover:brightness-110"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
