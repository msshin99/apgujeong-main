import HeroTabs from "./HeroTabs.jsx";
import ScatterCards from "./ScatterCards.jsx";
import Masterpiece from "./Masterpiece.jsx";
import DarkStage from "./DarkStage.jsx";
import Collection from "./Collection.jsx";
import Franchise from "./Franchise.jsx";
import Notice from "./Notice.jsx";
import Footer from "./Footer.jsx";

/** 홈 — 전역 요소(진행바·커서·스크롤 복원)는 main.jsx 의 라우터 쪽에 있다 */
export default function App() {
  return (
    <main className="bg-white">
      <HeroTabs />
      <ScatterCards />
      <Masterpiece />
      <DarkStage />
      <Collection />
      <Franchise />
      <Notice />
      <Footer />
    </main>
  );
}
