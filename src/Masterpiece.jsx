import { useEffect, useRef, useState } from "react";
import { DESIGN_W, useWidthScale } from "./useCanvasScale.js";
import Reveal, { RevealText } from "./Reveal.jsx";
import { useBreakpoint } from "./useBreakpoint.js";

/**
 * Figma: Frame 1707488296 (332:601) — x 120 / y 2782 / 1680 x 820
 *
 * 세로 flex, gap 40, items-end.
 *   상단 헤더 블록 1680 x 216
 *   하단 스탯 블록 1100 x 564 (우측 정렬 → x 580)
 *
 * 스크롤 모션이 없는 일반 섹션이라 가로 폭만 기준으로 축소한다.
 */
const SECTION_H = 820;

/**
 * 앞 카드 섹션은 1200 캔버스를 화면 높이에 맞춰 넣는데, 그리드가 세로 중앙이라
 * 그리드 아래에 이미 약 200px 의 흰 여백이 남는다.
 * 여기서 다시 상단 패딩을 주면 간격이 두 겹으로 쌓여 400px 가까이 벌어지므로 0 으로 둔다.
 */
const PAD_TOP = 0;
const PAD_BOTTOM = 200;

// 숫자가 0 에서 목표값까지 올라오는 연출
const COUNT_DURATION = 1800; // ms
const COUNT_STAGGER = 180; // ms — 행 사이 시차
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const formatCount = (n) => n.toLocaleString("ko-KR");

/** Figma 332:609 / 614 / 619 */
const STATS = [
  {
    value: 220,
    suffix: "+",
    title: "완벽한 온도의 미학",
    desc: "단순히 굽는 것을 넘어, 곱창 본연의 고소한 풍미와 탱글한 식감을 극대화하기 위해 연구 끝에 찾아낸 최적의 골든 포인트입니다.",
  },
  {
    value: 1200,
    suffix: "+",
    title: "농축된 감칠맛의 깊이",
    desc: "천연 재료만을 사용하여 긴 시간 저온 숙성을 거쳤습니다. 시간이 만들어낸 깊고 진한 감칠맛은 우리 브랜드만이 선사할 수 있는 독보적인 차별점입니다.",
  },
  {
    value: 3000,
    suffix: "+",
    title: "전문 그릴러의 숙련도",
    desc: "전문 그릴러의 섬세한 손길을 거쳐 가장 완벽하게 익은 순간, 고객님의 테이블로 가장 따뜻하고 맛있는 상태로 전달됩니다.",
  },
];

export default function Masterpiece() {
  const scale = useWidthScale();
  const { isCompact } = useBreakpoint();
  const totalH = SECTION_H + PAD_TOP + PAD_BOTTOM;

  const statsRef = useRef(null);
  const countRefs = useRef([]);
  const [rowsShown, setRowsShown] = useState(false);

  useEffect(() => {
    const host = statsRef.current;
    if (!host) return;

    const write = (el, n, suffix) => {
      if (el) el.textContent = formatCount(n) + suffix;
    };

    // 접근성: 모션을 줄이도록 설정한 사용자에게는 최종값을 바로 표시
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      STATS.forEach((s, i) => write(countRefs.current[i], s.value, s.suffix));
      setRowsShown(true);
      return;
    }

    let raf = 0;
    let start = 0;

    const tick = (now) => {
      if (!start) start = now;
      const elapsed = now - start;
      let running = false;

      STATS.forEach((s, i) => {
        const t = Math.min(
          Math.max((elapsed - i * COUNT_STAGGER) / COUNT_DURATION, 0),
          1,
        );
        write(
          countRefs.current[i],
          Math.round(s.value * easeOutCubic(t)),
          s.suffix,
        );
        if (t < 1) running = true;
      });

      raf = running ? requestAnimationFrame(tick) : 0;
    };

    // 관찰을 끊지 않는다 — 벗어나면 0 으로 되돌리고 다시 들어올 때 처음부터 센다
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRowsShown(true); // 구분선·텍스트 등장과 숫자 카운트를 같이 시작
          start = 0; // 경과 시간 초기화 → 0 부터 다시 카운트
          if (!raf) raf = requestAnimationFrame(tick);
          return;
        }
        setRowsShown(false);
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        STATS.forEach((s, i) => write(countRefs.current[i], 0, s.suffix));
      },
      { threshold: 0.3 },
    );
    io.observe(host);

    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
    // 분기가 바뀌면 statsRef 가 새 요소로 교체되므로 옵저버를 다시 붙인다
  }, [isCompact]);

  /* 1200 미만 — 우측 정렬 스탯 블록을 전체 폭으로 펴고, 숫자를 텍스트 위로 올린다 */
  if (isCompact) {
    return (
      <section className="w-full bg-white px-[20px] pb-[80px] sm:px-[24px] md:px-[40px] md:pb-[120px]">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-[48px] font-pretendard md:gap-[64px]">
          <div className="flex flex-col gap-[16px]">
            <Reveal y={16} duration={600}>
              <p className="text-[15px] leading-[22px] font-medium tracking-[-0.38px] text-[#e61911] md:text-[18px] md:leading-[26px]">
                THE ART OF MASTERPIECE
              </p>
            </Reveal>
            <h2 className="text-[clamp(24px,5.4vw,38px)] leading-[1.32] font-bold tracking-[-0.03em] text-black">
              <RevealText lines={["압구정곱창,", "그 이상의 가치를 굽다"]} delay={80} step={22} />
            </h2>
            <Reveal delay={320} y={16} duration={600}>
              <p className="text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[16px] md:leading-[24px]">
                진심을 담은 고집이 만들어낸 최상의 풍미와 서비스
              </p>
            </Reveal>
          </div>

          <div ref={statsRef} className="flex w-full flex-col">
            {STATS.map((stat, statIndex) => (
              <div
                key={stat.value}
                className="relative flex w-full flex-col gap-[12px] py-[28px] md:flex-row md:items-center md:gap-[48px] md:py-[36px]"
                style={{
                  opacity: rowsShown ? 1 : 0,
                  transform: rowsShown ? "translate3d(0,0,0)" : "translate3d(0,20px,0)",
                  transition:
                    `opacity 800ms cubic-bezier(0.22,1,0.36,1) ${statIndex * 160}ms,` +
                    ` transform 800ms cubic-bezier(0.22,1,0.36,1) ${statIndex * 160}ms`,
                }}
              >
                <p
                  ref={(el) => (countRefs.current[statIndex] = el)}
                  className="shrink-0 text-[clamp(32px,8vw,48px)] leading-[1.1] font-bold tabular-nums text-black md:w-[200px]"
                >
                  {`0${stat.suffix}`}
                </p>
                <div className="flex flex-col gap-[8px] md:flex-1">
                  <p className="text-[17px] leading-[25px] font-medium tracking-[-0.43px] text-black md:text-[18px]">
                    {stat.title}
                  </p>
                  <p className="text-[14px] leading-[22px] font-normal text-[#767676] md:text-[15px]">
                    {stat.desc}
                  </p>
                </div>
                <span
                  aria-hidden
                  className="absolute bottom-0 left-0 h-px w-full origin-left bg-[#e5e5ec]"
                  style={{
                    transform: rowsShown ? "scaleX(1)" : "scaleX(0)",
                    transition: `transform 1000ms cubic-bezier(0.22,1,0.36,1) ${statIndex * 160}ms`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="relative w-full overflow-hidden bg-white"
      style={{ height: totalH * scale }}
    >
      {/* 화면이 1920 보다 넓으면 배율이 1 로 고정되므로, 캔버스를 가로 중앙에 둔다.
          origin-top(= center top) 이라 1920 보다 좁을 때도 중심을 유지하며 축소된다. */}
      <div className="flex justify-center">
        <div
          className="origin-top shrink-0"
          style={{
            width: DESIGN_W,
            height: totalH,
            transform: `scale(${scale})`,
          }}
        >
          {/* Figma 332:601 — 좌우 120 여백 안의 1680 폭, 세로 gap 40 / items-end */}
          <div
            className="mx-[120px] flex flex-col items-end gap-[40px] font-pretendard"
            style={{ paddingTop: PAD_TOP, width: 1680 }}
          >
            {/* Figma 332:602 / 603 — 헤더, gap 24 */}
            <div className="flex w-full flex-col items-start gap-[24px]">
              {/* Figma 332:604 — Pretendard Medium 20 / lh 30 / -0.5 / #e61911 */}
              <Reveal y={20} duration={700}>
                <p className="text-[20px] leading-[30px] font-medium tracking-[-0.5px] text-[#e61911]">
                  THE ART OF MASTERPIECE
                </p>
              </Reveal>

              {/* Figma 332:605 — w 666, gap 16 */}
              <div className="flex w-[666px] flex-col items-start gap-[16px]">
                {/* Figma 332:606 — Pretendard Bold 46 / lh 60 / -1.15 / 검정 / 2줄 */}
                <h2 className="text-[46px] leading-[60px] font-bold tracking-[-1.15px] whitespace-nowrap text-black uppercase">
                  <RevealText
                    lines={["압구정곱창,", "그 이상의 가치를 굽다"]}
                    delay={120}
                  />
                </h2>
                {/* Figma 332:607 — Pretendard Regular 18 / lh 26 / -0.45 / #767676 */}
                <Reveal className="w-full" delay={420} y={20} duration={700}>
                  <p className="w-full text-[18px] leading-[26px] font-normal tracking-[-0.45px] text-[#767676]">
                    진심을 담은 고집이 만들어낸 최상의 풍미와 서비스
                  </p>
                </Reveal>
              </div>
            </div>

            {/* Figma 332:608 — w 1100, 우측 정렬 */}
            <div
              ref={statsRef}
              className="flex w-[1100px] flex-col items-start"
            >
              {STATS.map((stat, statIndex) => (
                <div
                  key={stat.value}
                  // Figma 332:609 — gap 120 / py 48. 하단 실선은 애니메이션을 위해 별도 요소로 뺐다
                  className="relative flex w-full items-center gap-[120px] py-[48px]"
                  style={{
                    // 텍스트는 숫자 카운트와 함께 살짝 떠오른다
                    opacity: rowsShown ? 1 : 0,
                    transform: rowsShown
                      ? "translate3d(0,0,0)"
                      : "translate3d(0,24px,0)",
                    transition:
                      `opacity 800ms cubic-bezier(0.22,1,0.36,1) ${statIndex * 180}ms,` +
                      ` transform 800ms cubic-bezier(0.22,1,0.36,1) ${statIndex * 180}ms`,
                  }}
                >
                  {/* Figma 332:610 — Inter Bold 60 / lh 60 / 검정 / w 300
                    (Inter 대신 Pretendard — 라틴 글리프가 Inter 기반이라 숫자는 동일하다)
                    화면에 들어오면 0 에서 목표값까지 올라간다. 값은 ref 로 직접 쓴다 */}
                  <p
                    ref={(el) => (countRefs.current[statIndex] = el)}
                    className="w-[300px] shrink-0 text-[60px] leading-[60px] font-bold tabular-nums text-black"
                  >
                    {`0${stat.suffix}`}
                  </p>

                  {/* Figma 332:611 — w 515, gap 16 */}
                  <div className="flex w-[515px] shrink-0 flex-col items-start gap-[16px]">
                    {/* Figma 332:612 — Pretendard Medium 20 / lh 28 / -0.5 / 검정 */}
                    <p className="w-full text-[20px] leading-[28px] font-medium tracking-[-0.5px] text-black">
                      {stat.title}
                    </p>
                    {/* Figma 332:613 — Pretendard Regular 16 / lh 24 / #767676 */}
                    <p className="w-full text-[16px] leading-[24px] font-normal text-[#767676]">
                      {stat.desc}
                    </p>
                  </div>

                  {/* 하단 실선 #e5e5ec — 왼쪽에서 오른쪽으로 그어진다 */}
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-0 h-px w-full origin-left bg-[#e5e5ec]"
                    style={{
                      transform: rowsShown ? "scaleX(1)" : "scaleX(0)",
                      transition: `transform 1000ms cubic-bezier(0.22,1,0.36,1) ${statIndex * 180}ms`,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
