import { useEffect, useRef } from "react";
import Img from "../Img.jsx";
import { asset } from "../lib/asset.js";

/**
 * Figma: Frame 2095588281 (354:2421) — 1920 x 640
 *
 * 가로 flex, gap 4, 각 칸 477 x 640, 칸마다 우측에 흰 1px 선.
 *   477 x 4 + 4 x 3 = 1920 ✓
 *
 * 화면 전체 폭을 쓰는 띠라서 컨테이너 폭(1680)에 가두지 않는다.
 *
 * 예전에는 1200 이상용 가로 띠(useBreakpoint 로 isCompact 판별)와 1200 미만용 2열 격자를
 * **따로** 들고 있었다. 두 벌은 서로 어긋나기 쉽고, 훅이 폭에 의존하는 탓에 단일 트리로
 * 합치기도 어려웠다. 그래서 캔버스 배율·isCompact 분기를 버리고 CSS 로만 흐르는 **한 벌**로 바꾼다.
 *   · 좁은 화면(기본) — 4칸을 가로로 넣으면 한 칸이 100px 대로 좁아지므로 2열로 감싼다(flex-wrap).
 *   · 1200 이상(xl) — flex-nowrap 한 줄로 펴서 피그마 그대로의 가로 띠가 된다.
 * hover-grow 효과는 1200 이상·정밀 포인터에서만 켜므로, 폭 판단은 훅 없이 이 파일 안
 * matchMedia 로만 본다.
 */
const PANELS = [
  { id: "g1", image: asset("/images/brand/g1.png"), alt: "테이블에 오르는 곱창 한 상" },
  { id: "g2", image: asset("/images/brand/g2.png"), alt: "마무리 시즈닝을 뿌리는 셰프" },
  { id: "g3", image: asset("/images/brand/g3.png"), alt: "숯불 화로" },
  { id: "g4", image: asset("/images/brand/g4.png"), alt: "압구정곱창 코스터와 잔" },
];

const GAP = 4;

/** 커서가 올라간 칸은 넓어지고 나머지는 좁아진다 */
const GROW = 1.6;

export default function BrandGallery() {
  const hostRef = useRef(null);
  const panelRefs = useRef([]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof window === "undefined") return;

    /* hover-grow 는 매 프레임 flexGrow 를 다시 쓰는 JS 효과라 CSS 로 대체할 수 없다.
       다만 "1200 이상에서만, 정밀 포인터·모션 허용일 때만 켠다" 는 판단은 폭을 읽어야 하므로
       useBreakpoint 훅 대신 matchMedia 로 이 한 곳에서 직접 본다. 경계를 넘나들면 다시 건다 */
    const fine = window.matchMedia("(pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia("(min-width: 1200px)");

    let raf = 0;
    let unbind = null;

    const teardown = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (unbind) {
        unbind();
        unbind = null;
      }
      // 좁은 화면으로 넘어가면 배율을 원위치(모든 칸 균등)로 되돌린다
      panelRefs.current.forEach((el) => {
        if (el) el.style.flexGrow = "1";
      });
    };

    const setup = () => {
      teardown();
      if (!wide.matches || !fine.matches || reduce.matches) return;

      // -1 은 "커서 없음" — 네 칸이 균등해진다
      const target = { i: -1 };
      const cur = PANELS.map(() => 1); // 각 칸의 현재 비중

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
      // enter(i) 는 호출할 때마다 새 함수를 만든다.
      // 해제할 때 같은 참조를 넘겨야 하므로 한 번만 만들어 들고 있는다
      const handlers = nodes.map((_, i) => enter(i));
      nodes.forEach((el, i) => el.addEventListener("pointerenter", handlers[i]));
      host.addEventListener("pointerleave", leave);
      unbind = () => {
        nodes.forEach((el, i) => el.removeEventListener("pointerenter", handlers[i]));
        host.removeEventListener("pointerleave", leave);
      };
    };

    setup();
    wide.addEventListener("change", setup);
    return () => {
      wide.removeEventListener("change", setup);
      teardown();
    };
  }, []);

  return (
    <section className="w-full bg-white pt-[100px] md:pt-[150px] xl:pt-[200px]">
      {/* Figma 354:2421 — 좁은 화면은 2열로 감싸고(flex-wrap), 1200 이상에서 한 줄로 펴 화면 전체 폭 띠가 된다.
          칸 사이 4px, 높이는 폭에 따라 유동(clamp)이되 데스크톱 상한은 피그마 640 */}
      <div
        ref={hostRef}
        className="flex w-full flex-wrap items-stretch xl:h-[clamp(420px,33.3vw,640px)] xl:flex-nowrap xl:items-center"
        style={{ gap: GAP }}
      >
        {PANELS.map((p, i) => (
          <div
            key={p.id}
            ref={(el) => (panelRefs.current[i] = el)}
            className="group relative min-w-0 basis-[calc(50%-2px)] overflow-hidden bg-[#d9d9d9] aspect-[100/124] xl:h-full xl:basis-0 xl:aspect-auto"
            style={{ flexGrow: 1 }}
          >
            <Img
              src={p.image}
              alt={p.alt}
              className="absolute inset-0 size-full max-w-none object-cover xl:brightness-95 xl:transition-[filter] xl:duration-700 xl:ease-out xl:group-hover:brightness-110"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
