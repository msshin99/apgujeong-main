import PageShell from "./PageShell.jsx";
import BrandTimeline from "./BrandTimeline.jsx";
import BrandGallery from "./BrandGallery.jsx";
import BrandSpace from "./BrandSpace.jsx";
import BrandPerformance from "./BrandPerformance.jsx";
import BrandValue from "./BrandValue.jsx";
import MenuList from "./MenuList.jsx";
import StoreFinder from "./StoreFinder.jsx";
import WineSlider from "./WineSlider.jsx";
import NoticeBoard from "./NoticeBoard.jsx";
import ContactForm from "./ContactForm.jsx";
import { asset } from "../lib/asset.js";

/**
 * 헤더 메뉴에 연결된 하위 페이지들.
 * 공통 뼈대(헤더 + 제목 블록 + 대표 이미지)만 있고, 본문은 시안이 나오면 채운다.
 *
 * 영문 라벨은 Figma 브랜드소개 페이지의 "Overview" 를 기준으로
 * 각 메뉴 성격에 맞춰 붙인 값이다.
 */
export function Brand() {
  return (
    <PageShell label="Overview" title="브랜드 소개">
      <BrandTimeline />
      <BrandGallery />
      <BrandSpace />
      <BrandPerformance />
      <BrandValue />
    </PageShell>
  );
}

export function Menu() {
  return (
    // Figma 332:1146 — 메뉴 페이지 전용 대표 이미지
    <PageShell label="Signature" title="메뉴 소개" image={asset("/images/pages/menu-hero.png")}>
      <MenuList />
    </PageShell>
  );
}

export function WineList() {
  return (
    // Figma 332:1455 — 와인 리스트 페이지 전용 대표 이미지
    <PageShell label="Pairing" title="와인 리스트" image={asset("/images/pages/wine-hero.png")}>
      <WineSlider />
    </PageShell>
  );
}

export function Stores() {
  return (
    // Figma 332:1521 — 지점찾기 페이지 전용 대표 이미지
    <PageShell label="Location" title="지점 찾기" image={asset("/images/pages/stores-hero.png")}>
      <StoreFinder />
    </PageShell>
  );
}

export function NoticePage() {
  return (
    // Figma 332:1597 — 공지사항 페이지 전용 대표 이미지
    <PageShell label="News" title="공지사항" image={asset("/images/pages/notice-hero.png")}>
      <NoticeBoard />
    </PageShell>
  );
}

export function Contact() {
  return (
    /* Figma 332:1737 — 문의하기 페이지 전용 대표 이미지.
       원본은 사진을 세로로 크게 늘려 위쪽 45% 지점을 보여 준다 */
    <PageShell
      label="Contact Us"
      title="문의하기"
      image={asset("/images/pages/contact-hero.png")}
      imagePosition="center 45%"
    >
      <ContactForm />
    </PageShell>
  );
}
