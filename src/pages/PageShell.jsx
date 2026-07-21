import { Link, useLocation } from "react-router-dom";
import StickyHeader from "../StickyHeader.jsx";
import Footer from "../Footer.jsx";
import { useWidthScale } from "../useCanvasScale.js";
import { useBreakpoint } from "../useBreakpoint.js";
import Reveal, { RevealText } from "../Reveal.jsx";
import FaqSection from "../FaqSection.jsx";
import Img from "../Img.jsx";
import { asset } from "../lib/asset.js";
import useSeo from "../lib/useSeo.js";
import { internalLinksFor } from "../lib/seo.js";

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
const TOP_GAP = 160; // 헤더 아래 여백 (Figma 332:984 y 256 - 헤더 96)
const HERO_H = 560; // Figma 332:988

export default function PageShell({
  label,
  title,
  image = asset("/images/pages/hero.png"),
  /* Figma 에서 사진이 프레임 안에 특정 위치로 잘려 들어간 경우가 있다.
     object-cover 는 기본이 정중앙이라, 그 어긋남만 여기서 보정한다 */
  imagePosition = "center",
  /* 상세 페이지처럼 본문이 곧바로 시작하는 화면은 대표 이미지를 쓰지 않는다.
     제목 블록은 그대로 두어 어느 메뉴에 속한 글인지 알 수 있게 한다 */
  hero = true,
  /* 이 페이지의 메타를 계산할 때 함께 넘길 맥락.
     공지 상세처럼 화면 안에서 받아 온 값이 제목·요약을 이겨야 하는 경우에 쓴다 */
  seoContext,
  children,
}) {
  const scale = useWidthScale();
  const { isCompact } = useBreakpoint();
  const { pathname } = useLocation();

  /* head 동기화. 하위 페이지는 전부 이 껍데기를 거치므로 여기 한 곳이면 된다.
     프리렌더가 만든 head 를 SPA 이동 뒤에도 지금 페이지에 맞게 고쳐 준다 */
  useSeo(pathname, seoContext);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white">
      {/* Figma 332:835 — 하위 페이지 헤더. 흰 배경 + 하단 실선 #e5e5ec, 검은 글씨.
          스크롤해도 따라오도록 화면에 고정한다 */}
      <StickyHeader variant="solid" />

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
            <Img
              src={image}
              alt=""
              /* 하위 페이지마다 첫 화면을 채우는 가장 큰 그림(LCP)이라
                 지연 로딩하지 않고 우선순위를 올려 먼저 받는다 */
              loading="eager"
              fetchPriority="high"
              decoding="async"
              style={{ objectPosition: imagePosition }}
              className={`w-full object-cover ${
                isCompact ? "h-[clamp(220px,46vw,420px)]" : "absolute inset-0 size-full"
              }`}
            />
          </div>
        )}

        {/* 페이지별 본문 */}
        {children}

        {/* head 의 FAQPage 와 같은 문답을 화면에도 그린다.
            마크업에만 있는 Q&A 는 구조화 데이터 정책 위반이라 이 블록이 곧 그 마크업의
            근거다. 본문 바로 뒤·'함께 보기' 앞에 두는 이유 — 페이지 내용을 다 읽은 뒤
            남는 질문에 답하는 자리이고, 그 다음이 다른 페이지로 나가는 길이라야 순서가 맞다 */}
        <FaqSection routePath={pathname} seoContext={seoContext} />

        {/* 같은 주제로 묶인 다른 페이지로 가는 길 */}
        <RelatedLinks routePath={pathname} />
      </main>

      {/* 메인페이지와 같은 푸터 — 모든 하위 페이지에 공통으로 들어간다 */}
      <Footer />
    </div>
  );
}

/**
 * 함께 보기 — 토픽 클러스터가 실제로 하는 일이 보이는 유일한 자리.
 *
 * 클러스터 표를 만들어 둔 이유는 "어느 페이지가 어느 검색어의 대표(필러)인가" 를
 * 정해서 **내부링크를 그쪽으로 몰아 주기 위해서** 다. 그 링크가 화면에 없으면
 * 표는 문서일 뿐 아무 효과가 없다. 그래서 여기서 진짜 <a> 로 그린다 —
 * 클릭으로 만들어지는 링크나 자바스크립트로 붙이는 링크는 크롤러가 따라가지 못한다.
 *
 * Reveal 로 감싸지 않는 것도 같은 이유다. 이 블록은 프리렌더 HTML 에 그대로 남아야 하고,
 * 등장 연출을 위해 opacity 0 으로 시작하는 마크업은 숨긴 텍스트로 오인될 여지가 있다.
 */
function RelatedLinks({ routePath }) {
  const links = internalLinksFor(routePath);
  if (links.length === 0) return null;

  return (
    <nav
      aria-label="함께 보기"
      className="w-full border-t border-solid border-[#e5e5ec] bg-white"
    >
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-[16px] px-[20px] py-[36px] font-pretendard sm:px-[24px] md:gap-[20px] md:px-[40px] md:py-[48px]">
        <h2 className="text-[14px] leading-[22px] font-medium tracking-[-0.35px] text-[#767676] md:text-[15px]">
          함께 보기
        </h2>
        <ul className="flex flex-wrap gap-x-[10px] gap-y-[10px]">
          {links.map((link) => (
            <li key={link.path}>
              <Link
                to={link.path}
                /* 필러(대표 페이지)만 브랜드 빨강으로 한 단계 세게 둔다.
                   전부 빨강이면 강조가 사라지고, 링크가 몰려야 할 곳이 어디인지도 안 보인다 */
                className={`flex items-center gap-[8px] border border-solid px-[16px] py-[10px] text-[14px] leading-[22px] tracking-[-0.35px] transition-colors duration-300 ${
                  link.kind === "pillar"
                    ? "border-[#e61911] font-medium text-[#e61911] hover:bg-[#e61911] hover:text-white"
                    : "border-[#e5e5ec] font-normal text-[#222] hover:border-[#222]"
                }`}
              >
                {link.label}
                <span aria-hidden="true" className="text-[12px] leading-none">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
