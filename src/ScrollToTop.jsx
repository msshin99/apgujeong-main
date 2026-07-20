import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** 페이지를 옮길 때마다 스크롤을 맨 위로 되돌린다 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
