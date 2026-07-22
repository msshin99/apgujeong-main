/**
 * 라우트 표 — **라우터를 포함하지 않는** 순수 컴포넌트.
 *
 * 왜 main.jsx 에서 떼어냈나:
 *   main.jsx 는 최상단에서 createRoot(document.getElementById("root")) 를 실행하는
 *   부수효과 모듈이라 Node 에서 import 하는 순간 죽는다. 그런데 빌드 시점 프리렌더
 *   (scripts/prerender.mjs)는 같은 라우트 표를 renderToString 으로 그려야 한다.
 *   그래서 "무엇을 그릴지"(이 파일)와 "어디에 붙일지"(main.jsx)를 갈라 두었다.
 *
 * 규칙:
 *   - 여기에 <BrowserRouter>/<StaticRouter> 를 두지 않는다. 라우터는 바깥이 정한다 —
 *     브라우저는 BrowserRouter, 프리렌더는 StaticRouter 로 감싼다.
 *   - 브라우저 전용 코드를 모듈 최상단에서 실행하지 않는다. window/document 접근은
 *     전부 useEffect 안이어야 한다(SSR 에서는 그 훅이 아예 돌지 않는다).
 *   - ErrorBoundary 도 여기 두지 않는다. 프리렌더가 예외를 삼키면 "문제가 발생했습니다"
 *     화면이 정상 결과인 척 배포되기 때문이다.
 */

import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import App from "./App.jsx";
import ScrollProgress from "./ScrollProgress.jsx";
import CustomCursor from "./CustomCursor.jsx";
import ScrollToTop from "./ScrollToTop.jsx";
import { Brand, Contact, Menu, NoticePage, Stores, WineList } from "./pages/pages.jsx";
import NoticeDetail from "./pages/NoticeDetail.jsx";

/* 관리자 화면은 방문자가 볼 일이 없다. 따로 떼어 두면 일반 방문자가 받지 않는다.
   프리렌더도 /admin/* 은 그리지 않으므로 이 lazy 들은 서버에서 평가되지 않는다 */
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout.jsx"));
const AdminNotices = lazy(() => import("./pages/admin/AdminNotices.jsx"));
const AdminInquiries = lazy(() => import("./pages/admin/AdminInquiries.jsx"));
const AdminSeo = lazy(() => import("./pages/admin/AdminSeo.jsx"));

/** 브랜드 사이트에만 붙는 연출 요소 (관리자 화면에는 넣지 않는다) */
function SiteChrome() {
  return (
    <>
      <ScrollProgress />
      <CustomCursor />
      {/* 스크롤 되돌리기는 방문자용 페이지에서만 필요하다.
          관리자 화면은 목록/상세를 오가는 작업 화면이라 위치가 유지되는 편이 낫다 */}
      <ScrollToTop />
      <Outlet />
    </>
  );
}

/** 관리자 청크를 받는 동안 화면이 비지 않도록 최소한의 표시만 둔다 */
function AdminLoading() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-white font-pretendard text-[14px] leading-[22px] font-light tracking-[-0.35px] text-[#999]">
      불러오는 중...
    </div>
  );
}

/**
 * 하위 화면 전용 경계.
 *
 * AdminLayout 바깥의 Suspense 하나로 합치면, 사이드바에서 공지 <-> 문의를 처음
 * 오갈 때 그 화면의 청크를 받는 동안 레이아웃까지 통째로 사라지고 전체화면
 * "불러오는 중..." 으로 바뀐다. 좌측 메뉴와 헤더는 그대로 두고 본문만 잠깐 비운다.
 */
function AdminPage({ children }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<SiteChrome />}>
        <Route path="/" element={<App />} />
        <Route path="/brand" element={<Brand />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/wine" element={<WineList />} />
        <Route path="/stores" element={<Stores />} />
        <Route path="/notice" element={<NoticePage />} />
        {/* 목록에서 카드를 누르면 글 번호로 들어온다 */}
        <Route path="/notice/:id" element={<NoticeDetail />} />
        <Route path="/contact" element={<Contact />} />
        {/* 없는 주소는 홈으로 */}
        <Route path="*" element={<App />} />
      </Route>

      {/* 관리자. 로그인 여부는 AdminLayout 이 판단한다.
          바깥 경계는 레이아웃 청크용, 안쪽 경계는 화면 전환용이다 */}
      <Route
        path="/admin"
        element={
          <Suspense fallback={<AdminLoading />}>
            <AdminLayout />
          </Suspense>
        }
      >
        <Route index element={<Navigate to="notices" replace />} />
        <Route
          path="notices"
          element={
            <AdminPage>
              <AdminNotices />
            </AdminPage>
          }
        />
        <Route
          path="inquiries"
          element={
            <AdminPage>
              <AdminInquiries />
            </AdminPage>
          }
        />
        <Route
          path="seo"
          element={
            <AdminPage>
              <AdminSeo />
            </AdminPage>
          }
        />
      </Route>
    </Routes>
  );
}
