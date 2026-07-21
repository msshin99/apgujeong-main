import { useEffect, useState } from "react";
import { useHydrated } from "./lib/hydrated.js";

/**
 * 분기점
 *   desktop  >= 1200  — 1920 디자인 캔버스를 통째로 축소 (피그마와 픽셀 일치)
 *   tablet   676~1199 — 유동 레이아웃, 다단을 2열로
 *   mobile   376~675  — 유동 레이아웃, 전부 1열
 *   xs       < 376    — 최소 폭, 여백·타이포 한 단계 더 축소
 */
export const BP = { desktop: 1200, tablet: 676, mobile: 376 };

const readName = () => {
  // 서버(프리렌더)에는 창 폭이 없다. 그때는 "desktop" 으로 고정한다 —
  // compact 분기는 같은 문구를 담은 축약 레이아웃일 뿐이고,
  // 1920 캔버스 쪽이 피그마 원본이자 내용이 가장 온전한 분기다.
  // 덕분에 두 번 그려지는 섹션도 정적 HTML 에는 한 번만 실려 중복 본문이 생기지 않는다.
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w >= BP.desktop) return "desktop";
  if (w >= BP.tablet) return "tablet";
  if (w >= BP.mobile) return "mobile";
  return "xs";
};

export function useBreakpoint() {
  const hydrated = useHydrated();
  // 지연 초기값은 그대로 둔다 — 관문이 열리는 순간 name 이 이미 실제 폭이라
  // 재측정이 한 번으로 끝난다. 미루는 것은 값을 **읽는 일**이 아니라 **쓰는 일**이다.
  const [name, setName] = useState(readName);

  useEffect(() => {
    const update = () => setName(readName());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  /* 프리렌더 HTML 은 데스크톱 분기다. 하이드레이션이 끝나기 전에는 실제 폭을 알아도
     쓰지 않는다 — 트리가 어긋나면 React 가 이어받기를 포기하고 통째로 다시 그린다.
     끝나는 순간 main.jsx 의 HydrationGate 가 관문을 열고, 그 갱신은 페인트 전에 반영된다 */
  const effective = hydrated ? name : "desktop";

  return {
    name: effective,
    isDesktop: effective === "desktop",
    isTablet: effective === "tablet",
    isMobile: effective === "mobile" || effective === "xs",
    /** 1200 미만 — 캔버스를 버리고 유동 레이아웃을 쓴다 */
    isCompact: effective !== "desktop",
  };
}

/**
 * 작은 화면에서 무거운 모션을 끄기 위한 판단.
 * 스크롤 연동 정렬·blur(300px) 글로우·패럴랙스처럼 매 프레임 큰 면적을 다시 그리는
 * 효과는 중저가 기기에서 스크롤을 끊기게 만든다.
 *
 * 주의 — 지금은 어디에서도 쓰지 않는다.
 * 각 섹션이 matchMedia("(prefers-reduced-motion: reduce)").matches 를 직접 한 번 읽는 식이라
 * 이 훅이 연결돼 있다고 가정하면 안 된다. (설정을 도중에 바꿔도 반영되지 않는 것도 그 때문)
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
