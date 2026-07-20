import { useEffect, useState } from "react";

/**
 * 분기점
 *   desktop  >= 1200  — 1920 디자인 캔버스를 통째로 축소 (피그마와 픽셀 일치)
 *   tablet   676~1199 — 유동 레이아웃, 다단을 2열로
 *   mobile   376~675  — 유동 레이아웃, 전부 1열
 *   xs       < 376    — 최소 폭, 여백·타이포 한 단계 더 축소
 */
export const BP = { desktop: 1200, tablet: 676, mobile: 376 };

const readName = () => {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w >= BP.desktop) return "desktop";
  if (w >= BP.tablet) return "tablet";
  if (w >= BP.mobile) return "mobile";
  return "xs";
};

export function useBreakpoint() {
  // 첫 렌더부터 실제 폭으로 시작한다.
  // "desktop" 으로 시작하면 마운트 직후 분기가 한 번 바뀌는데,
  // 그때 ref 가 새 요소로 갈아끼워져 IntersectionObserver 가 사라진 요소를
  // 계속 관찰하게 된다 → 등장 모션이 끝내 발동하지 않는다.
  const [name, setName] = useState(readName);

  useEffect(() => {
    const update = () => setName(readName());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return {
    name,
    isDesktop: name === "desktop",
    isTablet: name === "tablet",
    isMobile: name === "mobile" || name === "xs",
    /** 1200 미만 — 캔버스를 버리고 유동 레이아웃을 쓴다 */
    isCompact: name !== "desktop",
  };
}

/**
 * 작은 화면에서 무거운 모션을 끄기 위한 판단.
 * 스크롤 연동 정렬·blur(300px) 글로우·패럴랙스처럼 매 프레임 큰 면적을 다시 그리는
 * 효과는 중저가 기기에서 스크롤을 끊기게 만든다.
 */
export function useLightMotion() {
  const { isCompact } = useBreakpoint();
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isCompact || reduce;
}
