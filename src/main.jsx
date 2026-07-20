import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import App from "./App.jsx";
import ScrollProgress from "./ScrollProgress.jsx";
import CustomCursor from "./CustomCursor.jsx";
import ScrollToTop from "./ScrollToTop.jsx";
import { Brand, Contact, Menu, NoticePage, Stores, WineList } from "./pages/pages.jsx";
import NoticeDetail from "./pages/NoticeDetail.jsx";
/* 관리자 화면은 방문자가 볼 일이 없다. 따로 떼어 두면 일반 방문자가 받지 않는다 */
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout.jsx"));
const AdminNotices = lazy(() => import("./pages/admin/AdminNotices.jsx"));
const AdminInquiries = lazy(() => import("./pages/admin/AdminInquiries.jsx"));
import "./index.css";

/** 브랜드 사이트에만 붙는 연출 요소 (관리자 화면에는 넣지 않는다) */
function SiteChrome() {
  return (
    <>
      <ScrollProgress />
      <CustomCursor />
      <Outlet />
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      {/* 페이지가 바뀌어도 유지되는 전역 요소.
          연출용 커서·스크롤 게이지는 브랜드 사이트에서만 쓴다.
          관리자 화면에서는 방해만 되므로 라우트 안쪽에 두어 켜지지 않게 했다 */}
      <ScrollToTop />

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

        {/* 관리자. 로그인 여부는 AdminLayout 이 판단한다 */}
        <Route
          path="/admin"
          element={
            <Suspense fallback={null}>
              <AdminLayout />
            </Suspense>
          }
        >
          <Route index element={<Navigate to="notices" replace />} />
          <Route
            path="notices"
            element={
              <Suspense fallback={null}>
                <AdminNotices />
              </Suspense>
            }
          />
          <Route
            path="inquiries"
            element={
              <Suspense fallback={null}>
                <AdminInquiries />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
