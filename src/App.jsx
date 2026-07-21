import StickyHeader from "./StickyHeader.jsx";
import HeroTabs from "./HeroTabs.jsx";
import ScatterCards from "./ScatterCards.jsx";
import Masterpiece from "./Masterpiece.jsx";
import DarkStage from "./DarkStage.jsx";
import Collection from "./Collection.jsx";
import Franchise from "./Franchise.jsx";
import Notice from "./Notice.jsx";
import FaqSection from "./FaqSection.jsx";
import Footer from "./Footer.jsx";
import useSeo from "./lib/useSeo.js";

/** 홈 — 전역 요소(진행바·커서·스크롤 복원)는 main.jsx 의 라우터 쪽에 있다 */
export default function App() {
  /* 경로를 useLocation 으로 읽지 않고 "/" 를 못박는다.
     이 컴포넌트는 없는 주소(catch-all)에서도 홈 화면으로 쓰이는데, 그때 pathname 을
     그대로 쓰면 존재하지 않는 주소가 canonical 로 나간다. 보여 주는 내용이 홈이면
     정규 주소도 홈이어야 한다 */
  useSeo("/");

  return (
    <main className="bg-white">
      {/* 히어로 사진 위에 얹혔다가, 내려가면 검은 배경이 깔린다 */}
      <StickyHeader variant="overlay" />
      <HeroTabs />
      <ScatterCards />
      <Masterpiece />
      <DarkStage />
      <Collection />
      <Franchise />
      <Notice />
      {/* head 의 FAQPage 와 같은 문답. 경로도 useSeo 와 똑같이 "/" 로 못박는다 —
          없는 주소(catch-all)에서도 이 화면이 쓰이는데, 그때 보이는 문답과
          마크업의 문답이 갈라지면 안 되기 때문이다 */}
      <FaqSection routePath="/" />
      <Footer />
    </main>
  );
}
