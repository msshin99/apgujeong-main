import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { NAV } from "./Header.jsx";

/**
 * 스크롤을 따라오는 사이트 공통 헤더. Figma: Frame 2095587723 (335:2374) — 1680 x 96.
 *
 * variant
 *   "overlay" — 홈. 히어로 사진 위에 얹혀 처음에는 투명하고,
 *               사진을 지나 내려가면 검은 배경이 깔린다.
 *   "solid"   — 하위 페이지. 흰 배경 + 아래 실선을 늘 유지한다.
 *
 * 어디까지 내려가든 화면 맨 위에 그대로 붙어 있는다. 바뀌는 것은 배경뿐이다.
 *
 * 예전에는 1200 이상이면 Header 의 1920 캔버스 분기를 transform:scale 로 통째로
 * 줄이고, 1200 미만이면 Header 의 compact 분기로 갈아 끼우는 **두 벌**이었다.
 * 그 방식은 1200~1440 에서 배율(0.63~0.75)이 16px 글자를 10~12px 로 줄여 헤더가
 * 유독 작아 보이다가, 1200 밑으로 내려가는 순간 compact 로 넘어가며 글자가 오히려
 * 커지는 역전을 낳았다. 헤더는 모든 페이지에 걸리므로 이 흔들림이 가장 눈에 띈다.
 *
 * 그래서 캔버스 배율을 버리고 폭에 따라 CSS 로만 흐르는 **한 벌**로 바꾼다.
 *   · max-w-[1680px] mx-auto + 유동 좌우 여백 → 1920 에서 좌우 120px 여백이
 *     예전 캔버스와 그대로 맞는다(1920 사용자는 바뀐 걸 못 느낀다).
 *   · 좁아지면 한 줄(로고·메뉴·버튼)에서 두 줄(로고+버튼 / 메뉴)로 리플로우한다.
 *     타이포는 px 을 브레이크포인트로 키워 배율에 얹히지 않으므로 좁은 화면에서도
 *     14~16px 글자가 그대로 읽힌다.
 *   · 이 저장소는 lg·xl·2xl 이 전부 1200px 이라 그 사이 중간 단이 없다. 한 줄이
 *     온전히 들어갈 폭은 1200 보다 좁으므로, 전환 지점은 arbitrary variant
 *     min-[1000px]: 로 직접 잡아 데스크톱 한 줄을 1200 이전부터 실제 px 로 보여 준다.
 */

/** 이만큼 내려오면 배경을 깐다 */
const SOLID_AT = 40;

function useScrolled() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > SOLID_AT);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return scrolled;
}

export default function StickyHeader({ variant = "overlay" }) {
  const scrolled = useScrolled();

  /* fixed 로 띄우면 문서 흐름에서 빠져 그만큼 본문이 위로 밀린다.
     실제 높이를 재서 같은 크기의 자리를 대신 채워 준다.
     이제는 높이가 CSS 로만 정해지므로(배율이 사라짐) ResizeObserver 가 재는 값이
     곧 실제로 그려지는 높이다 — 좁아져 두 줄이 되면 그 늘어난 높이까지 그대로 따라간다. */
  const barRef = useRef(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const solid = variant === "solid";
  const dark = solid; // 흰 배경 위에서는 글씨가 검어야 한다

  const surface = solid
    ? "border-b border-solid border-[#e5e5ec] bg-white"
    : scrolled
      ? "bg-black/80 backdrop-blur-[10px]"
      : "bg-transparent";

  // 홈은 히어로 사진 위라 흰 글씨, 하위 페이지는 흰 배경이라 검은 글씨여야 한다
  const textColor = dark ? "text-[#222]" : "text-white";
  const pill = dark
    ? "bg-black text-white hover:bg-[#333]"
    : "bg-white text-black hover:bg-white/85";

  return (
    <>
      <div
        ref={barRef}
        className={`fixed top-0 left-0 z-[120] w-full px-[20px] transition-colors duration-500 ease-out sm:px-[24px] md:px-[40px] ${surface}`}
      >
        {/* Figma 335:2374 — 1680 폭. 캔버스를 줄이지 않고 컨테이너를 가운데 두므로
            1920 화면에서 좌우 120px 여백(px 40 + auto 80)이 예전 캔버스와 그대로 맞는다 */}
        <div className="mx-auto w-full max-w-[1680px] font-pretendard">
          {/* Figma 335:2375 — 로고 + 내비 + 버튼.
              한 줄(min-[1000px])에서는 로고·메뉴·버튼을 가로로 놓고,
              좁아지면 flex-wrap 으로 [로고+버튼] / [메뉴] 두 줄로 접힌다.
              메뉴에 ml-auto 대신 w-full 을 줘서 좁을 때만 아랫줄로 넘긴다 */}
          <header className="flex flex-wrap items-center gap-x-[16px] gap-y-[10px] py-[16px] min-[1000px]:h-[96px] min-[1000px]:flex-nowrap min-[1000px]:gap-x-[24px] min-[1000px]:gap-y-0 min-[1000px]:py-[24px]">
            {/* Figma 335:2376 — Pretendard Bold 28 / lh 28 / -0.7.
                좁은 화면에서는 20 → md 24 로 한 단계씩 줄인다 */}
            <Link
              to="/"
              className={`text-[20px] leading-[24px] font-bold tracking-[-0.5px] uppercase md:text-[24px] min-[1000px]:text-[28px] min-[1000px]:leading-[28px] min-[1000px]:tracking-[-0.7px] ${textColor}`}
            >
              Apgujeong
            </Link>

            {/* Figma 335:2384 / 332:846 — pill, px 36 / py 12 / radius 999.
                좁은 화면에서는 px 20·py 9·13px(→ md 24·14) 로 줄인다.
                ml-auto 로 늘 오른쪽 끝에 붙어, 좁을 때는 로고와 한 줄을 이룬다 */}
            <Link
              to="/contact"
              className={`order-2 ml-auto flex shrink-0 items-center justify-center rounded-[9999px] px-[20px] py-[9px] text-[13px] leading-[18px] font-medium tracking-[-0.33px] whitespace-nowrap transition-colors duration-300 md:px-[24px] md:text-[14px] min-[1000px]:order-3 min-[1000px]:px-[36px] min-[1000px]:py-[12px] min-[1000px]:text-[16px] min-[1000px]:leading-[24px] min-[1000px]:tracking-[-0.4px] min-[1000px]:uppercase ${pill}`}
            >
              문의하기
            </Link>

            {/* Figma 335:2377 — 내비, gap 48 (Figma 18px 이나 요청에 따라 16px / lh 24 / -0.4).
                좁은 화면에서는 w-full 로 아랫줄에 깔고 가로 스크롤로 넘긴다
                (드로어 시안이 없어 스크롤을 유지한다). 한 줄에서는 로고 오른쪽에 붙는다 */}
            <nav
              className={`-mx-[4px] order-3 flex w-full items-center gap-[20px] overflow-x-auto px-[4px] text-[14px] leading-[20px] font-medium tracking-[-0.35px] [scrollbar-width:none] md:gap-[28px] md:text-[15px] min-[1000px]:order-2 min-[1000px]:mx-0 min-[1000px]:w-auto min-[1000px]:gap-[48px] min-[1000px]:overflow-visible min-[1000px]:px-0 min-[1000px]:text-[16px] min-[1000px]:leading-[24px] min-[1000px]:tracking-[-0.4px] [&::-webkit-scrollbar]:hidden ${textColor}`}
            >
              {NAV.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="shrink-0 whitespace-nowrap transition-opacity duration-300 hover:opacity-70"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
        </div>
      </div>

      {/* 하위 페이지는 헤더 아래에서 본문이 시작하므로 그만큼 자리를 비운다.
          홈은 히어로 사진 위에 얹히는 구조라 자리를 만들지 않는다. */}
      {solid && <div aria-hidden style={{ height }} />}
    </>
  );
}
