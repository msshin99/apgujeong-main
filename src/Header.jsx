import { Link } from "react-router-dom";

/**
 * Figma: Frame 2095587723 (335:2374) — x 120 / y 0 / 1680 x 96
 *
 * 1200 이상에서는 1920 캔버스 기준 고정 px 를 그대로 쓴다.
 * 1200 미만에서는 유동 폭으로 바뀌고, 메뉴는 가로 스크롤로 넘긴다
 * (드로어 메뉴는 피그마에 시안이 없어 만들지 않았다).
 */
export const NAV = [
  { label: "브랜드소개", to: "/brand" },
  { label: "메뉴소개", to: "/menu" },
  { label: "와인리스트", to: "/wine" },
  { label: "지점찾기", to: "/stores" },
  { label: "공지사항", to: "/notice" },
];

/**
 * dark = true 면 밝은 배경 위에 놓이는 버전.
 * 홈은 히어로 사진 위라 흰 글씨지만, 하위 페이지는 흰 배경이라 검은 글씨여야 한다.
 */
export default function Header({ compact = false, dark = false }) {
  const textColor = dark ? "text-[#222]" : "text-white";
  const pill = dark
    ? "bg-black text-white hover:bg-[#333]"
    : "bg-white text-black hover:bg-white/85";

  if (compact) {
    return (
      <header className="flex w-full flex-col gap-[10px] py-[16px]">
        <div className="flex w-full items-center justify-between gap-[16px]">
          <Link
            to="/"
            className={`font-pretendard text-[20px] leading-[24px] font-bold tracking-[-0.5px] uppercase md:text-[24px] ${textColor}`}
          >
            Apgujeong
          </Link>
          <Link
            to="/contact"
            className={`shrink-0 rounded-[9999px] px-[20px] py-[9px] font-pretendard text-[13px] leading-[18px] font-medium tracking-[-0.33px] transition-colors duration-300 md:px-[24px] md:text-[14px] ${pill}`}
          >
            문의하기
          </Link>
        </div>

        {/* 좁은 화면에서는 메뉴를 가로로 밀어서 본다 */}
        <nav className="-mx-[4px] flex items-center gap-[20px] overflow-x-auto px-[4px] font-pretendard text-[14px] leading-[20px] font-medium tracking-[-0.35px] [scrollbar-width:none] md:gap-[28px] md:text-[15px] [&::-webkit-scrollbar]:hidden">
          {NAV.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={`shrink-0 whitespace-nowrap ${textColor}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
    );
  }

  return (
    <header className="flex h-[96px] w-[1680px] items-center justify-between py-[24px]">
      {/* Figma 335:2375 / 332:837 — 로고 + 내비, gap 24
          Figma 원본은 items-start 지만, 그건 로고(lh 28)와 메뉴(lh 26)의 차이가
          2px 일 때만 중앙처럼 보이는 값이다. 메뉴를 16px(lh 24)로 줄이면서
          차이가 4px 로 벌어지므로 items-center 로 고정해 항상 중심선을 맞춘다. */}
      <div className={`flex shrink-0 items-center gap-[24px] whitespace-nowrap ${textColor}`}>
        {/* Figma 335:2376 / 332:838 — Pretendard Bold 28px / lh 28 / tracking -0.7 */}
        <Link
          to="/"
          className="font-pretendard text-[28px] leading-[28px] font-bold tracking-[-0.7px] uppercase"
        >
          Apgujeong
        </Link>

        {/* Figma 335:2377 — gap 48, Pretendard Medium
            (Figma 원본은 18px / lh 26 / tracking -0.45 이나 요청에 따라 16px 로 조정.
             tracking 은 동일 비율인 -0.025em = -0.4px, lh 는 24px 로 맞춤) */}
        <nav className="flex items-center gap-[48px] font-pretendard text-[16px] leading-[24px] font-medium tracking-[-0.4px]">
          {NAV.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="transition-opacity duration-300 hover:opacity-70"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Figma 335:2384 / 332:846 — pill, px 36 / py 12 / radius 999.
          내비 안에 있던 "문의하기" 항목만 빼고, 오른쪽 버튼은 모든 페이지에 둔다.
          홈은 흰 배경 + 검은 글씨, 하위 페이지는 검은 배경 + 흰 글씨 */}
      <Link
        to="/contact"
        className={`flex shrink-0 items-center justify-center rounded-[9999px] px-[36px] py-[12px] font-pretendard text-[16px] leading-[24px] font-medium tracking-[-0.4px] uppercase whitespace-nowrap transition-colors duration-300 ${pill}`}
      >
        문의하기
      </Link>
    </header>
  );
}
