import { StrictMode, useLayoutEffect } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import ErrorBoundary from "./ErrorBoundary.jsx";
import AppRoutes from "./routes.jsx";
import { markHydrated } from "./lib/hydrated.js";
import "./index.css";

/**
 * 브라우저 진입점. 라우트 표 자체는 routes.jsx 가 들고 있다 —
 * 그 파일은 빌드 시점 프리렌더(scripts/prerender.mjs)가 renderToString 으로
 * 그대로 그려야 해서, 루트를 만드는 이 파일과 반드시 분리되어야 한다.
 *
 * hydrateRoot 로 프리렌더 결과를 **이어받는다.**
 * 이 사이트는 화면 폭에 따라 마크업이 아예 다르고 프리렌더에는 window 가 없어
 * 언제나 데스크톱 쪽이 나오는데, 그 차이는 src/lib/hydrated.js 의 관문이 흡수한다 —
 * 관문이 열리기 전에는 useBreakpoint·useCanvasScale·Reveal 이 전부 서버와 같은 값을 낸다.
 */
function HydrationGate() {
  /* 관문은 반드시 **페인트 전**에 열어야 한다. useEffect(패시브)는 페인트 뒤에 돌아
     좁은 화면에서 데스크톱 캔버스가 한 프레임 번쩍인다. useLayoutEffect 안에서 일어난
     갱신은 같은 커밋 주기에 동기로 흘러나가 화면에 나오지 않는다.
     트리의 **맨 뒤**에 둔다 — layout effect 는 트리 순서로 도니, 각 섹션이 서버 값으로
     한 번 측정을 마친 뒤에 관문이 열려야 재측정이 한 번으로 끝난다 */
  useLayoutEffect(() => markHydrated(), []);
  return null; // DOM 을 만들지 않으므로 하이드레이션 트리에 영향이 없다
}

const container = document.getElementById("root");
const app = (
  <StrictMode>
    {/* GitHub Pages 프로젝트 사이트에서는 주소가 /저장소이름/ 아래에서 시작한다.
        BASE_URL 은 vite 가 base 설정에서 만들어 주는 값이라 로컬에서는 "/" 다. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      {/* 렌더 도중 예외가 나도 백지 대신 안내가 보이도록 라우트 전체를 감싼다 */}
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
      <HydrationGate />
    </BrowserRouter>
  </StrictMode>
);

/* dist/404.html(모르는 주소·관리자 화면)과 개발 서버는 프리렌더하지 않은 빈 껍데기다.
   빈 컨테이너에 hydrateRoot 를 걸면 React 가 서버 HTML 이 없다고 판단해 통째로
   다시 그리면서 콘솔을 오류로 덮는다. 내용이 있을 때만 이어받는다 */
if (container.firstChild) hydrateRoot(container, app);
else createRoot(container).render(app);
