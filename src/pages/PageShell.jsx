import Header from "../Header.jsx";
import Footer from "../Footer.jsx";
import { DESIGN_W, useWidthScale } from "../useCanvasScale.js";
import { useBreakpoint } from "../useBreakpoint.js";
import Reveal, { RevealText } from "../Reveal.jsx";

/**
 * 하위 페이지 공통 뼈대.
 *
 * Figma: Frame 2095587738 (332:984) — 1920 x 752, 세로 gap 60
 *   제목 블록 332:985  gap 16, 가운데 정렬
 *     ├ 영문 라벨  Pretendard Medium 20 / lh 28 / -0.5 / #e61911
 *     └ 국문 제목  Pretendard Bold 72 / lh 88 / -1.8 / #222
 *   대표 이미지 332:988  1920 x 560 (전체 폭)
 *
 * 홈은 헤더가 히어로 사진 위에 얹히지만 하위 페이지에는 사진이 없으므로
 * 검은 바 위에 같은 헤더를 올린다.
 */
const HEADER_H = 96; // Figma 335:2374
const TOP_GAP = 160; // 헤더 아래 여백 (Figma 332:984 y 256 - 헤더 96)
const HERO_H = 560; // Figma 332:988

export default function PageShell({
  label,
  title,
  image = "/images/pages/hero.png",
  /* Figma 에서 사진이 프레임 안에 특정 위치로 잘려 들어간 경우가 있다.
     object-cover 는 기본이 정중앙이라, 그 어긋남만 여기서 보정한다 */
  imagePosition = "center",
  /* 상세 페이지처럼 본문이 곧바로 시작하는 화면은 대표 이미지를 쓰지 않는다.
     제목 블록은 그대로 두어 어느 메뉴에 속한 글인지 알 수 있게 한다 */
  hero = true,
  children,
}) {
  const scale = useWidthScale();
  const { isCompact } = useBreakpoint();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white">
      {/* Figma 332:835 — 하위 페이지 헤더. 흰 배경 + 하단 실선 #e5e5ec, 검은 글씨 */}
      <div className="w-full border-b border-solid border-[#e5e5ec] bg-white">
        {isCompact ? (
          <div className="px-[20px] sm:px-[24px] md:px-[40px]">
            <Header compact dark />
          </div>
        ) : (
          // scale 은 레이아웃 높이를 바꾸지 않으므로 검은 바 높이를 직접 계산해 준다
          <div
            className="flex w-full justify-center overflow-hidden"
            style={{ height: HEADER_H * scale }}
          >
            <div
              className="origin-top shrink-0"
              style={{ width: DESIGN_W, transform: `scale(${scale})` }}
            >
              <div className="mx-[120px]">
                <Header dark />
              </div>
            </div>
          </div>
        )}
      </div>

      <main className="flex-1">
        {/* Figma 332:985 — 제목 블록 */}
        <div
          className="flex w-full flex-col items-center gap-[16px] px-[20px] text-center font-pretendard sm:px-[24px] md:px-[40px]"
          style={{ paddingTop: isCompact ? 56 : TOP_GAP * scale }}
        >
          <Reveal y={16} duration={600}>
            <p className="text-[15px] leading-[22px] font-medium tracking-[-0.38px] text-[#e61911] md:text-[18px] md:leading-[26px] lg:text-[20px] lg:leading-[28px] lg:tracking-[-0.5px]">
              {label}
            </p>
          </Reveal>
          {/* Figma 332:987 — Pretendard Bold 72 / lh 88 / -1.8 / #222 */}
          <h1 className="text-[clamp(30px,6.4vw,72px)] leading-[1.22] font-bold tracking-[-0.025em] text-[#222]">
            <RevealText lines={[title]} delay={80} step={26} />
          </h1>
        </div>

        {/* Figma 332:988 — 전체 폭 대표 이미지 */}
        {hero && (
          <div
            className="relative mt-[36px] w-full overflow-hidden bg-[#d9d9d9] md:mt-[48px]"
            style={{ height: isCompact ? undefined : HERO_H * scale }}
          >
            <img
              src={image}
              alt=""
              style={{ objectPosition: imagePosition }}
              className={`w-full object-cover ${
                isCompact ? "h-[clamp(220px,46vw,420px)]" : "absolute inset-0 size-full"
              }`}
            />
          </div>
        )}

        {/* 페이지별 본문 */}
        {children}
      </main>

      {/* 메인페이지와 같은 푸터 — 모든 하위 페이지에 공통으로 들어간다 */}
      <Footer />
    </div>
  );
}
