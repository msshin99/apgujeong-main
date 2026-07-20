import { useEffect, useState } from "react";

export const DESIGN_W = 1920;
export const DESIGN_H = 1000;

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
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => setScale(Math.min(1, window.innerWidth / DESIGN_W));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return scale;
}

export function useCanvasScale(designH = DESIGN_H) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () =>
      setScale(Math.min(window.innerWidth / DESIGN_W, window.innerHeight / designH));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [designH]);

  return scale;
}
