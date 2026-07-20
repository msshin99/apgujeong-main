import { useEffect, useRef } from "react";
import Reveal, { RevealText, useInView } from "../Reveal.jsx";

/**
 * Figma: Frame 2095587779 (332:1045) — 1160 x 390, 세로 gap 80
 *
 *   연도 행 332:1046  flex gap 60 — "2005" / 눈금자 / "2026"
 *     눈금자 332:1048  3묶음 + 마지막 큰 눈금, 묶음 사이 gap 12
 *       한 묶음 = 큰 눈금 1(1x14 검정) + 작은 눈금 10(1x5 #aaa), gap 12
 *       → 11 x 1px + 10 x 12px = 131 ✓  /  131x3 + 12x3 + 1 = 430 ✓
 *   문구 332:1087  w 841, gap 24, 가운데 정렬
 *
 * 눈금자는 정적 그래픽이 아니라 실제로 훑을 수 있는 눈금자처럼 동작한다.
 * 커서에 가까운 눈금이 솟아오르고 진해지며, 그 지점의 연도가 따라다닌다.
 */
const TICKS_PER_GROUP = 10; // 큰 눈금 뒤에 붙는 작은 눈금 수
const GROUPS = 3;

const YEAR_FROM = 2005;
const YEAR_TO = 2026;

// 두 연도 모두 2000 에서 시작해 제 값까지 올라간다
const COUNT_START = 2000;
const COUNT_DURATION = 1800; // ms

// 커서가 없을 때 눈금자를 훑고 지나가는 빛의 주기
const SWEEP_PERIOD = 2.2; // 초

const TICK = {
  major: { base: 14, peak: 34 },
  minor: { base: 5, peak: 22 },
};
const FALLOFF = 110; // px — 이 거리 안의 눈금이 반응한다
const DAMPING = 0.18;

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const lerp = (a, b, t) => a + (b - a) * t;

function Ruler() {
  const [revealRef, inView] = useInView(0.4);
  const hostRef = useRef(null);
  const tickRefs = useRef([]);
  const bubbleRef = useRef(null);
  const yearRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (
      !window.matchMedia("(pointer: fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    // 눈금 중심 x 는 레이아웃이 잡힌 뒤 한 번만 재고, 리사이즈 때 갱신한다
    let centers = [];
    const measure = () => {
      centers = tickRefs.current.map((el) => (el ? el.offsetLeft + 0.5 : 0));
    };
    measure();

    // -1 은 "커서 없음" — 이때는 자동 스윕이 눈금을 훑는다
    const target = { x: -1 };
    const cur = { x: -1 };
    let raf = 0;
    let sweep = 0; // 0~1, 자동 스윕 진행도
    let last = 0;

    const paint = (cursorX) => {
      const width = host.clientWidth || 1;
      tickRefs.current.forEach((el, i) => {
        if (!el) return;
        const spec = el.dataset.major === "1" ? TICK.major : TICK.minor;
        const w =
          cursorX < 0 ? 0 : clamp(1 - Math.abs(cursorX - centers[i]) / FALLOFF, 0, 1);
        // 부드러운 종 모양 감쇠
        const e = w * w * (3 - 2 * w);
        el.style.height = `${lerp(spec.base, spec.peak, e)}px`;
        el.style.backgroundColor =
          el.dataset.major === "1" ? "#000" : `rgb(${lerp(170, 0, e)} ${lerp(170, 0, e)} ${lerp(170, 0, e)})`;
      });

      // 연도 표시는 커서로 훑을 때만 (자동 스윕 때는 눈금만 움직인다)
      const bubble = bubbleRef.current;
      const showBubble = target.x >= 0;
      if (bubble) {
        bubble.style.opacity = showBubble ? "1" : "0";
        if (showBubble) {
          bubble.style.transform = `translate3d(${cursorX}px, 0, 0) translateX(-50%)`;
        }
      }
      if (yearRef.current && showBubble) {
        const t = clamp(cursorX / width, 0, 1);
        yearRef.current.textContent = String(Math.round(lerp(YEAR_FROM, YEAR_TO, t)));
      }
    };

    /* 루프는 멈추지 않는다.
       커서가 있으면 그 위치를 감쇠 보간으로 따라가고,
       없으면 스윕이 왼쪽 밖에서 오른쪽 밖까지 반복해서 지나간다. */
    const tick = (now) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;

      if (target.x >= 0) {
        if (cur.x < 0) cur.x = target.x;
        cur.x += (target.x - cur.x) * DAMPING;
        paint(cur.x);
      } else {
        sweep = (sweep + dt / SWEEP_PERIOD) % 1;
        const span = (host.clientWidth || 1) + FALLOFF * 2;
        cur.x = sweep * span - FALLOFF;
        paint(cur.x);
      }
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e) => {
      target.x = e.clientX - host.getBoundingClientRect().left;
    };
    const onLeave = () => {
      target.x = -1;
      cur.x = -1; // 스윕이 이어받도록 초기화
    };
    const onResize = () => {
      measure();
      paint(cur.x);
    };

    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", onResize);
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  let index = 0;
  const pushRef = (el) => {
    if (el) tickRefs.current[Number(el.dataset.idx)] = el;
  };

  return (
    <div ref={revealRef} className="relative min-w-0 flex-1">
      {/* 커서를 따라다니는 연도 */}
      <div
        ref={bubbleRef}
        aria-hidden
        className="pointer-events-none absolute bottom-[calc(100%+14px)] left-0 rounded-[9999px] bg-black px-[10px] py-[4px] text-[13px] leading-[18px] font-medium tracking-[-0.33px] whitespace-nowrap text-white opacity-0 transition-opacity duration-300"
      >
        <span ref={yearRef}>{YEAR_FROM}</span>
      </div>

      {/* 눈금 자체는 14px 이라 잡기 어렵다. 위아래 패딩으로 hit area 만 넓힌다 */}
      <div
        ref={hostRef}
        aria-hidden
        className="-my-[22px] flex origin-left items-center gap-[12px] overflow-hidden py-[22px]"
        style={{
          transform: inView ? "scaleX(1)" : "scaleX(0)",
          transition: "transform 1200ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {Array.from({ length: GROUPS }, (_, g) => (
          <div key={g} className="flex shrink-0 items-center gap-[12px]">
            {/* Figma 332:1050 — 큰 눈금 1 x 14, 검정 */}
            <span
              ref={pushRef}
              data-major="1"
              data-idx={index++}
              className="w-px shrink-0 bg-black transition-none"
              style={{ height: TICK.major.base }}
            />
            {Array.from({ length: TICKS_PER_GROUP }, (_, t) => (
              // Figma 332:1051 — 작은 눈금 1 x 5, #aaa
              <span
                key={t}
                ref={pushRef}
                data-major="0"
                data-idx={index++}
                className="w-px shrink-0"
                style={{ height: TICK.minor.base, backgroundColor: "#aaa" }}
              />
            ))}
          </div>
        ))}
        {/* Figma 332:1085 — 끝을 닫는 큰 눈금 */}
        <span
          ref={pushRef}
          data-major="1"
          data-idx={index++}
          className="w-px shrink-0 bg-black"
          style={{ height: TICK.major.base }}
        />
      </div>
    </div>
  );
}

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * 화면에 들어오면 2000 에서 목표 연도까지 올라간다.
 *
 * 숫자를 텍스트로 갈아끼우면 2000→2005 가 정수 6단계뿐이라 뚝뚝 끊긴다.
 * 자릿수마다 0~9 를 세로로 쌓아 두고 소수까지 포함한 위치로 밀어 올린다.
 * 자리별로 시작 숫자에서 끝 숫자까지만 굴리므로 엉뚱한 중간값이 스치지 않는다.
 */
function CountUpYear({ value, delay = 0 }) {
  const [ref, inView] = useInView(0.4);
  const reelRefs = useRef([]);

  const from = String(COUNT_START).split("").map(Number);
  const to = String(value).split("").map(Number);

  useEffect(() => {
    const paint = (p) => {
      reelRefs.current.forEach((el, i) => {
        if (!el) return;
        const pos = lerp(from[i], to[i], p);
        el.style.transform = `translate3d(0, ${-pos * 10}%, 0)`;
      });
    };

    if (!inView) {
      paint(0);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paint(1);
      return;
    }

    let raf = 0;
    let start = 0;
    const run = (now) => {
      if (!start) start = now;
      const t = clamp((now - start - delay) / COUNT_DURATION, 0, 1);
      paint(easeInOutCubic(t));
      if (t < 1) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, delay]);

  return (
    <p
      ref={ref}
      className="flex text-[clamp(38px,10vw,120px)] leading-[1] font-bold tabular-nums whitespace-nowrap text-black"
      aria-label={String(value)}
    >
      {to.map((_, i) => (
        // 한 자리 = 높이 1em 창. 그 안에서 0~9 열이 위아래로 굴러간다
        <span key={i} aria-hidden className="block h-[1em] overflow-hidden">
          <span
            ref={(el) => (reelRefs.current[i] = el)}
            className="block will-change-transform"
            style={{ transform: `translate3d(0, ${-from[i] * 10}%, 0)` }}
          >
            {DIGITS.map((d) => (
              <span key={d} className="block h-[1em]">
                {d}
              </span>
            ))}
          </span>
        </span>
      ))}
    </p>
  );
}

export default function BrandTimeline() {
  return (
    /* 섹션 간격 200 — 흰 섹션은 위쪽에만 주고 아래는 다음 섹션이 책임진다 */
    <section className="w-full bg-white px-[20px] pt-[100px] sm:px-[24px] md:px-[40px] md:pt-[150px] lg:pt-[200px]">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col items-center gap-[40px] font-pretendard md:gap-[80px]">
        {/* Figma 332:1046 — 연도 행 */}
        <div className="flex w-full items-center gap-[clamp(16px,4vw,60px)]">
          {/* Figma 332:1047 / 1086 — Pretendard Bold 120 / lh 120 / 검정
              두 연도 모두 2000 에서 시작해 제 값까지 올라간다 */}
          <CountUpYear value={YEAR_FROM} />

          <Ruler />

          <CountUpYear value={YEAR_TO} delay={220} />
        </div>

        {/* Figma 332:1087 — w 841, gap 24, 가운데 정렬 */}
        <div className="flex w-full max-w-[841px] flex-col items-center gap-[12px] text-center md:gap-[24px]">
          {/* Figma 332:1088 — Pretendard Bold 80 / lh 120 / -2 / 검정 */}
          <h2 className="text-[clamp(22px,5.2vw,80px)] leading-[1.5] font-bold tracking-[-0.025em] text-black">
            <RevealText lines={["맛의 (極)을 향한 고집스러운 발자취"]} delay={120} step={24} />
          </h2>
          {/* Figma 332:1089 — Pretendard Regular 36 / lh 46 / -0.9 / #767676 */}
          <Reveal delay={520} y={18} duration={700}>
            <p className="text-[clamp(15px,2.6vw,36px)] leading-[1.28] font-normal tracking-[-0.025em] text-[#767676]">
              한결같은 고집으로 지켜온 본연의 깊이
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
