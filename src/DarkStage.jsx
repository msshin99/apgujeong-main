import { useEffect, useRef } from "react";
import Heritage from "./Heritage.jsx";
import Unrivaled from "./Unrivaled.jsx";

/**
 * Figma: Group 1707481190 (332:624) — 검은 배경 위에 붉은 블러 원 4개가 깔린 구간.
 *
 * 페이지 좌표(y 3802 을 0 으로 환산):
 *   배경 사각형 332:625  1920 x 4104
 *   콘텐츠 프레임 332:630 x 368 / y 200 / w 1200 / h 3705
 *     ├ Heritage  332:631  y 0
 *     └ Unrivaled 332:669  y 2162
 *   블러 원 332:626~629 — 전부 rgba(230,25,17,0.4) + blur(300px)
 *
 * 예전에는 1920 캔버스를 transform:scale 로 통째로 줄이는 데스크톱 트리와, 1200 미만용
 * 유동 트리(compact)를 **따로** 들고 있었다. 그 방식은 두 벌이 어긋나고, Heritage·Unrivaled
 * 본문이 1200~1440 구간에서 배율(0.63~0.75)을 타 10~12px 로 쪼그라들었다.
 *
 * 그래서 4104px 고정 캔버스를 버리고, 세로로 흐르는 **한 벌**로 합친다.
 *   · 검은 무대는 자식(Heritage·Unrivaled)을 세로로 쌓는 자연 높이 컨테이너가 된다.
 *   · 붉은 블러 원은 절대 좌표(top 200/1090/2173/3082) 대신 무대 높이의 비율(%)로 깔고,
 *     크기·블러는 배율 대신 vw 로 두되 1920 값에서 상한을 건다(min()) — 1920 이상에서
 *     예전 scale 상한(=1)처럼 더 커지지 않는다.
 *   · 콘텐츠 프레임(compact/isCompact)은 없앤다. Heritage·Unrivaled 는 각자 한 벌로 흐른다.
 */

/**
 * 붉은 블러 원.
 * 1920 캔버스 안에 두면 경계에서 잘리므로 무대 직속의 절대 레이어에 둔다.
 * 가로 위치는 화면 좌/우 끝을 기준으로 잡아, 화면이 넓든 좁든 항상 밖으로 흘러나간다.
 *   offset — Figma 좌표를 1920 기준 vw 로 환산(음수 = 화면 밖으로 나간 거리)
 *   top    — 예전 4104 캔버스 안 top 을 무대 높이 대비 %로 환산
 *   width/height — 1920 기준 vw. 상한(px)을 걸어 1920 이상에서는 커지지 않는다
 */
const GLOWS = [
  { id: "a", side: "left", offset: "-21.88vw", top: "4.9%", width: "min(922px, 48.02vw)", height: "min(850.68px, 44.31vw)", drift: 0 },
  { id: "b", side: "right", offset: "-20.63vw", top: "26.6%", width: "min(800px, 41.67vw)", height: "min(806.42px, 42vw)", drift: 1 },
  { id: "c", side: "left", offset: "-19.95vw", top: "53%", width: "min(800px, 41.67vw)", height: "min(806.42px, 42vw)", drift: 2 },
  { id: "d", side: "right", offset: "-16.35vw", top: "75.1%", width: "min(800px, 41.67vw)", height: "min(806.42px, 42vw)", drift: 3 },
];

/* blur(300px) 도 배율 대신 vw 로 둔다(1920 에서 300px, 1280 에서 200px — 예전 scale 과 동일).
   좁아질수록 블러 반경이 함께 줄어 저사양 기기의 페인트 부담도 그만큼 가벼워진다. */
const GLOW_BLUR = "min(300px, 15.63vw)";

// 원마다 다른 주기로 움직여 패턴이 반복돼 보이지 않게 한다.
// 서로 배수 관계가 아니어서 네 원이 같은 배치로 돌아오기까지 아주 오래 걸린다.
const DRIFT_DURATION = [8, 11, 9.5, 12.5];

/** 커서를 따라 글로우가 밀리는 최대 거리(px) — 원마다 깊이를 달리한다 */
const GLOW_PULL = [70, -46, 54, -62];

export default function DarkStage() {
  const sectionRef = useRef(null);
  const pullRefs = useRef([]);

  /* 마우스를 움직이면 붉은 글로우가 시차를 두고 끌려온다.
     글로우 자체는 CSS 키프레임으로 떠다니므로, 감싸는 층에 transform 을 준다.
     좌표는 배율이 아니라 무대(host)의 실제 사각형에서 읽으므로 캔버스가 없어도 그대로 성립한다.
     터치(pointer:coarse)·모션 최소화에서는 아예 붙지 않는다 — 좁은 화면 판단이 따로 필요 없다. */
  useEffect(() => {
    const host = sectionRef.current;
    if (!host) return;
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
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden bg-[#000000] py-[80px] md:py-[120px] xl:py-[200px]"
    >
      {/* Figma 332:626~629 — 붉은 블러 원. 무대 전체를 덮는 절대 레이어에 깔고
          화면 좌/우 끝을 기준으로 배치한다. 바깥 층은 커서를 따라 밀리고,
          안쪽 층은 CSS 로 계속 떠다닌다 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {GLOWS.map((g, i) => (
          <div
            key={g.id}
            ref={(el) => (pullRefs.current[i] = el)}
            className="absolute will-change-transform"
            style={{
              top: g.top,
              width: g.width,
              height: g.height,
              [g.side]: g.offset,
            }}
          >
            <div
              className="dark-glow size-full rounded-[9999px] will-change-transform"
              style={{
                background: "rgba(230,25,17,0.4)",
                filter: `blur(${GLOW_BLUR})`,
                animation: `stageGlowDrift${g.drift} ${DRIFT_DURATION[g.drift]}s ease-in-out infinite`,
              }}
            />
          </div>
        ))}
      </div>

      {/* Figma 332:630 — 콘텐츠 프레임(예전 1200 폭). 캔버스를 줄이지 않고 컨테이너를
          가운데 두므로 1920 에서 예전 프레임 위치와 맞는다. z-10 으로 글로우 위에 얹는다.
          1200 이상에서는 좌우 여백을 없애 1200px Unrivaled 원반이 잘리지 않게 한다 */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1200px] flex-col gap-[96px] px-[20px] sm:px-[24px] md:gap-[140px] md:px-[40px] xl:gap-[160px] xl:px-0">
        <Heritage />
        <Unrivaled />
      </div>

      {/* 제자리에서 떠도는 움직임.
          키프레임을 4단계로 쪼개 궤적이 한 방향 왕복이 아니라 불규칙한 곡선을 그리게 한다.
          이동량을 %로 두면 원 크기에 비례하므로 화면 폭이 바뀌어도 느낌이 같다.
          @keyframes 이름은 전역이라 GlowBackdrop 과 겹치지 않게 접두어를 붙였다. */}
      <style>{`
        @keyframes stageGlowDrift0 {
          0%   { transform: translate3d(0, 0, 0) scale(1); opacity: 0.85; }
          20%  { transform: translate3d(48%, -26%, 0) scale(1.45); opacity: 1; }
          40%  { transform: translate3d(22%, 34%, 0) scale(0.72); opacity: 0.7; }
          60%  { transform: translate3d(-34%, 12%, 0) scale(1.34); opacity: 1; }
          80%  { transform: translate3d(-12%, -30%, 0) scale(0.85); opacity: 0.8; }
          100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.85; }
        }
        @keyframes stageGlowDrift1 {
          0%   { transform: translate3d(0, 0, 0) scale(1.12); opacity: 1; }
          20%  { transform: translate3d(-40%, 36%, 0) scale(0.7); opacity: 0.72; }
          40%  { transform: translate3d(-54%, -18%, 0) scale(1.5); opacity: 1; }
          60%  { transform: translate3d(16%, -34%, 0) scale(0.88); opacity: 0.8; }
          80%  { transform: translate3d(30%, 20%, 0) scale(1.28); opacity: 0.95; }
          100% { transform: translate3d(0, 0, 0) scale(1.12); opacity: 1; }
        }
        @keyframes stageGlowDrift2 {
          0%   { transform: translate3d(0, 0, 0) scale(0.9); opacity: 0.78; }
          20%  { transform: translate3d(38%, 40%, 0) scale(1.42); opacity: 1; }
          40%  { transform: translate3d(56%, -14%, 0) scale(0.74); opacity: 0.7; }
          60%  { transform: translate3d(-20%, -36%, 0) scale(1.36); opacity: 1; }
          80%  { transform: translate3d(-42%, 10%, 0) scale(0.92); opacity: 0.85; }
          100% { transform: translate3d(0, 0, 0) scale(0.9); opacity: 0.78; }
        }
        @keyframes stageGlowDrift3 {
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
