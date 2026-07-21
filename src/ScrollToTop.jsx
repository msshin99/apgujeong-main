import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * 페이지를 옮길 때 스크롤을 맨 위로 되돌린다.
 *
 * 단 뒤로/앞으로(POP)는 건드리지 않는다. 브라우저가 원래 보던 위치를
 * 되살려 주는데 여기서 맨 위로 밀어 버리면 그 복원이 통째로 무효가 된다.
 *
 * 이 컴포넌트는 SiteChrome 안(방문자용 라우트 아래)에 둔다. 관리자 화면은
 * 목록과 상세를 오가는 작업 화면이라 스크롤이 유지되는 편이 편하다.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") return;
    window.scrollTo(0, 0);
  }, [pathname, navigationType]);

  return null;
}
