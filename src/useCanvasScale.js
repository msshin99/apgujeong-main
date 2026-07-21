import { useEffect, useState } from "react";
import { useHydrated } from "./lib/hydrated.js";

export const DESIGN_W = 1920;
export const DESIGN_H = 1000;

/*
 * 알려진 문제(수정 보류) — 1200~1440px 구간의 본문 축소.
 * 이 구간은 scale 이 0.63~0.75 라 16px 본문이 실제로는 10~12px 로 그려진다.
 * 더 좁히면 1200 미만에서 compact 분기(유동 레이아웃)로 넘어가며 글자가 오히려 커져
 * "창을 줄였는데 글씨가 커지는" 역전이 생긴다.
 * 캔버스 배율과 타이포를 분리해야 풀리는 문제라 지금은 그대로 두기로 했다.
 */

/**
 * 첫 페인트부터 실제 배율로 그리기 위한 초기값. window 가 없으면(SSR) 1 로 둔다.
 *
 * designH 를 주면 가로·세로 모두를 담는 contain 배율이고, 상한이 없다 —
 * 1920 x designH 를 넘는 화면에서는 1 보다 큰 값(확대)이 나온다.
 * 이 상한 유무가 두 훅의 유일한 차이라 계산은 여기 한 곳에 모아 둔다.
 */
const readScale = (designH) => {
  if (typeof window === "undefined") return 1;
  const w = window.innerWidth / DESIGN_W;
  return designH ? Math.min(w, window.innerHeight / designH) : Math.min(1, w);
};

/**
 * 디자인 캔버스(가로 1920 고정)를 화면 안에 contain 시키는 배율.
 * 고정 px(80px, 1680px …)로 작성한 레이아웃을 창 크기에 맞춰 통째로 축소하기 위한 값.
 *
 * @param designH 캔버스 세로. 섹션마다 필요한 높이가 달라 인자로 받는다.
 */
/**
 * 세로로 흐르는(스크롤에 고정되지 않는) 섹션용 배율.
 * 높이는 내용에 따라 늘어나면 되므로 가로 폭만 기준으로 하고, 1920 이상에서는 확대하지 않는다.
 */
export function useWidthScale() {
  const hydrated = useHydrated();
  // 지연 초기값은 그대로 둔다 — 관문이 열리는 순간 실제 배율이 이미 손에 있어야
  // 레이아웃이 한 번만 자리를 잡는다.
  const [scale, setScale] = useState(() => readScale());

  useEffect(() => {
    const update = () => setScale(readScale());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  /* readScale() 은 서버에서 1 이다. 하이드레이션 렌더도 1 을 내야
     style="transform:scale(...)" 가 프리렌더 HTML 과 한 글자도 다르지 않다 */
  return hydrated ? scale : 1;
}

/**
 * 한 화면 안에 contain 시키는 섹션(히어로·카드 정렬)용 배율.
 *
 * 여기는 상한을 걸지 않는다. h-[100dvh] 히어로와 스티키 씬은 화면 한가운데 놓이므로,
 * 1 로 묶으면 2560 x 1440 같은 큰 화면에서 캔버스가 1920 크기로만 그려져
 * 좌우·상하에 빈 띠가 생긴다.
 */
export function useCanvasScale(designH = DESIGN_H) {
  const hydrated = useHydrated();
  // useWidthScale 과 같은 이유로 값 자체는 처음부터 실제 배율로 들고 있는다.
  const [scale, setScale] = useState(() => readScale(designH));

  useEffect(() => {
    const update = () => setScale(readScale(designH));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [designH]);

  return hydrated ? scale : 1; // useWidthScale 과 같은 이유
}
