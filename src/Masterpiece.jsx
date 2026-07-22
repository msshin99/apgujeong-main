import { useEffect, useRef, useState } from "react";
import Reveal, { RevealText } from "./Reveal.jsx";

/**
 * 홈 "THE ART OF MASTERPIECE" 섹션. Figma: Frame 1707488296 (332:601) — 1680 x 820.
 *   세로 flex, gap 40, items-end.
 *     상단 헤더 블록 1680 x 216 (좌측 정렬)
 *     하단 스탯 블록 1100 x 564 (우측 정렬 → 1680 안에서 오른쪽에 붙는다)
 *
 * 예전에는 1920 캔버스를 transform:scale 로 통째로 줄이는 데스크톱 트리와,
 * 1200 미만용 유동 트리를 **따로** 들고 있었다. 그 방식은 두 벌이 서로 어긋나고,
 * 1200~1440 구간에서 16px 본문이 배율(0.63~0.75)을 타 10~12px 로 그려지는 문제가 있었다.
 *
 * 그래서 이 컴포넌트는 캔버스 배율을 버리고, 폭에 따라 CSS 로만 흐르는 **한 벌**로 바꾼다.
 *   · max-w-[1680px] mx-auto 컨테이너 + 유동 좌우 여백 → 1920 에서 좌우 120px 여백,
 *     스탯 블록은 xl 에서 max-w-[1100px] self-end 로 오른쪽에 붙여 피그마와 맞춘다.
 *   · 스탯은 절대좌표 대신 세로 리스트(행마다 숫자 + 텍스트)로 리플로우한다.
 *     좁으면 숫자를 텍스트 위로 세우고, md 부터 가로로 눕힌다.
 *   · 타이포는 px 을 브레이크포인트로 키워 배율에 얹히지 않으므로 좁은 화면에서도 읽힌다.
 *     이 저장소는 lg·xl·2xl 이 전부 1200px 이라 lg: 스텝은 xl 에 먹혀 죽는다.
 *     676~1199 구간이 한 단계로 평평해지지 않게 min-[900px]: 로 중간 단을 직접 넣는다.
 */

/**
 * 앞 카드 섹션 아래로 이어지는 리듬. 예전 캔버스는 하단 200px 여백(PAD_BOTTOM)을 뒀는데,
 * 상단 패딩은 앞 섹션 여백과 두 겹으로 쌓이던 문제가 있어 0 이었다(PAD_TOP).
 * 그 의도를 유동 패딩으로 옮긴다 — 상단은 주지 않고, 하단만 브레이크포인트로 키운다.
 */

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
    // 단일 트리라 statsRef 는 교체되지 않는다 — 마운트 시 한 번만 붙인다
  }, []);

  return (
    <section className="w-full bg-white px-[20px] pb-[80px] sm:px-[24px] md:px-[40px] md:pb-[120px] xl:pb-[200px]">
      {/* Figma 332:601 — 1680 폭. 캔버스를 줄이지 않고 컨테이너를 가운데 두므로
          1920 화면에서 좌우 120px 여백이 예전 캔버스와 그대로 맞는다.
          세로 gap 40 / items-end 이던 배치는 헤더는 전폭, 스탯은 xl 에서 오른쪽에 붙인다 */}
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-[48px] font-pretendard md:gap-[56px] xl:gap-[40px]">
        {/* Figma 332:602 / 603 — 헤더, gap 24 (좁은 화면에서는 한 단계씩 줄인다) */}
        <div className="flex flex-col items-start gap-[14px] md:gap-[20px] xl:gap-[24px]">
          {/* Figma 332:604 — Pretendard Medium 20 / lh 30 / -0.5 / #e61911 */}
          <Reveal y={20} duration={700}>
            <p className="text-[15px] leading-[22px] font-medium tracking-[-0.5px] text-[#e61911] md:text-[18px] md:leading-[26px] xl:text-[20px] xl:leading-[30px]">
              THE ART OF MASTERPIECE
            </p>
          </Reveal>

          {/* Figma 332:605 — 데스크톱에서 w 666, gap 16 */}
          <div className="flex flex-col items-start gap-[8px] md:gap-[12px] xl:max-w-[666px] xl:gap-[16px]">
            {/* Figma 332:606 — Pretendard Bold 46 / lh 60 / -1.15 / 검정 / 2줄 */}
            {/* 676~1199 구간이 한 단으로 평평해지지 않게 min-[900px]: 로 중간 단을 넣는다 */}
            <h2 className="text-[28px] leading-[1.28] font-bold tracking-[-0.03em] text-black uppercase md:text-[34px] min-[900px]:text-[40px] xl:text-[46px] xl:leading-[60px] xl:tracking-[-1.15px] xl:whitespace-nowrap">
              <RevealText
                lines={["압구정곱창,", "그 이상의 가치를 굽다"]}
                delay={120}
              />
            </h2>
            {/* Figma 332:607 — Pretendard Regular 18 / lh 26 / -0.45 / #767676 */}
            <Reveal className="w-full" delay={420} y={20} duration={700}>
              <p className="w-full text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[16px] md:leading-[24px] xl:text-[18px] xl:leading-[26px] xl:tracking-[-0.45px]">
                진심을 담은 고집이 만들어낸 최상의 풍미와 서비스
              </p>
            </Reveal>
          </div>
        </div>

        {/* Figma 332:608 — w 1100, 우측 정렬. 스탯을 세로 리스트로 흐르게 한다.
            xl 에서 max-w-[1100px] self-end 로 예전처럼 오른쪽에 붙인다 */}
        <div
          ref={statsRef}
          className="flex w-full flex-col xl:max-w-[1100px] xl:self-end"
        >
          {STATS.map((stat, statIndex) => (
            <div
              key={stat.value}
              // Figma 332:609 — 데스크톱 gap 120 / py 48. 좁으면 숫자를 위로 세우고 간격을 줄인다.
              // 하단 실선은 애니메이션을 위해 별도 요소로 뺐다
              className="relative flex w-full flex-col gap-[12px] py-[28px] md:flex-row md:items-center md:gap-[48px] md:py-[36px] xl:gap-[120px] xl:py-[48px]"
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
                className="shrink-0 text-[40px] leading-[1.1] font-bold tabular-nums text-black md:w-[200px] md:text-[48px] min-[900px]:text-[52px] xl:w-[300px] xl:text-[60px] xl:leading-[60px]"
              >
                {`0${stat.suffix}`}
              </p>

              {/* Figma 332:611 — w 515, gap 16 */}
              <div className="flex flex-col items-start gap-[8px] md:flex-1 xl:gap-[16px]">
                {/* Figma 332:612 — Pretendard Medium 20 / lh 28 / -0.5 / 검정 */}
                <p className="w-full text-[16px] leading-[24px] font-medium tracking-[-0.4px] text-black md:text-[18px] md:leading-[26px] xl:text-[20px] xl:leading-[28px] xl:tracking-[-0.5px]">
                  {stat.title}
                </p>
                {/* Figma 332:613 — Pretendard Regular 16 / lh 24 / #767676 */}
                <p className="w-full text-[14px] leading-[22px] font-normal text-[#767676] md:text-[15px] md:leading-[23px] xl:text-[16px] xl:leading-[24px]">
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
    </section>
  );
}
