import { useState } from "react";
import Reveal, { RevealText } from "../Reveal.jsx";
import { useBreakpoint } from "../useBreakpoint.js";
import NaverMap from "./NaverMap.jsx";
import { asset } from "../lib/asset.js";

/**
 * Figma: Frame 2095587772 (332:1522) — 1920 x 1010
 *
 *   헤더 332:1523  x 120 / w 1680
 *   지도 332:1530  1920 x 814 (전체 폭)
 *   검색 패널 332:1531  x 120 / 536 x 694, 흰 배경, p 60, 세로 gap 40
 *     ├ 검색 폼 416 폭, gap 28 / 12
 *     │   ├ 지점명 입력 (bg #f6f7fb) + 돋보기
 *     │   ├ 옵션 셀렉트
 *     │   ├ 브랜드 셀렉트 2개 (gap 8)
 *     │   └ 지점조회 버튼 (bg #e61911)
 *     └ 결과 목록 — 상단 검정 선, 항목마다 하단 #e5e5ec 선
 *         지점명 Bold 20 / lh 30, 주소·전화 Regular 14 / lh 20 / #767676
 *         예약 버튼 2개 (테두리 #e5e5ec)
 */
const PANEL_W = 536;
const MAP_H = 814;

/**
 * 지점 목록 스크롤바.
 * 기본 스크롤바는 폭이 넓고 회색 트랙이 그대로 보여 패널 안에서 튄다.
 * 트랙은 비우고 얇은 알약 모양 손잡이만 남기며, 올리면 진해진다.
 * Firefox 는 의사 요소를 지원하지 않아 scrollbar-width / color 로 따로 맞춘다.
 */
const SCROLLBAR = [
  "[scrollbar-width:thin]",
  "[scrollbar-color:#d9d9de_transparent]",
  "[&::-webkit-scrollbar]:w-[6px]",
  "[&::-webkit-scrollbar-track]:bg-transparent",
  "[&::-webkit-scrollbar-thumb]:rounded-full",
  "[&::-webkit-scrollbar-thumb]:bg-[#d9d9de]",
  "[&::-webkit-scrollbar-thumb]:transition-colors",
  "hover:[&::-webkit-scrollbar-thumb]:bg-[#b9b9c2]",
  "[&::-webkit-scrollbar-thumb:active]:bg-[#8a8a93]",
].join(" ");
const PANEL_TOP = 60; // Figma 332:1531 y - 지도 y
/* 패널이 지도 밖으로 삐져나가지 않도록 높이를 지도 안쪽으로 묶는다.
   위아래 60 씩 여백 → 814 - 120 = 694 (Figma 패널 높이와 일치) */
const PANEL_H = MAP_H - PANEL_TOP * 2;

/**
 * Figma 332:1553 — 원본에는 압구정지점 하나. 나머지는 자리표시자.
 * 좌표도 각 동네의 대략적인 위치라 실제 주소가 정해지면 교체해야 한다.
 */
const STORES = [
  {
    id: "apgujeong",
    name: "압구정지점",
    address: "서울 강남구 압구정로42길 25-8 1층",
    phone: "010-1234-5678",
    // 지오코딩이 되면 주소로 위치를 잡는다. 아래는 실패했을 때 쓰는 근사 좌표
    lat: 37.5272,
    lng: 127.0396,
    reserveUrl:
      "https://map.naver.com/p/search/%EC%95%95%EA%B5%AC%EC%A0%95%EA%B3%B1%EC%B0%BD/place/37069188?placePath=/home?bk_query=%EC%95%95%EA%B5%AC%EC%A0%95%EA%B3%B1%EC%B0%BD&entry=pll&from=map&fromNxList=true&fromPanelNum=2&timestamp=202607201548&locale=ko&svcName=map_pcv5&searchText=%EC%95%95%EA%B5%AC%EC%A0%95%EA%B3%B1%EC%B0%BD&searchType=place&c=15.57,0,0,0,dh",
  },
  {
    id: "seongsu",
    name: "성수동지점",
    address: "서울특별시 성동구 성수동 0000빌딩 101호",
    phone: "010-1234-5678",
    lat: 37.5445,
    lng: 127.0559,
  },
  {
    id: "seogyo",
    name: "서교동지점",
    address: "서울특별시 마포구 서교동 0000빌딩 301호",
    phone: "010-1234-5678",
    lat: 37.5556,
    lng: 126.918,
  },
];

export default function StoreFinder() {
  const { isCompact } = useBreakpoint();
  const [active, setActive] = useState(0);
  // 같은 지점을 다시 눌러도 지도가 다시 확대되도록 하는 신호
  const [focusKey, setFocusKey] = useState(0);

  const selectStore = (i) => {
    setActive(i);
    setFocusKey((k) => k + 1);
  };

  return (
    <section className="w-full bg-white pt-[100px] pb-[100px] md:pt-[150px] md:pb-[150px] lg:pt-[200px] lg:pb-[200px]">
      {/* Figma 332:1523 — 헤더 */}
      <div className="mx-auto mb-[28px] w-full max-w-[1680px] px-[20px] font-pretendard sm:px-[24px] md:mb-[40px] md:px-[40px]">
        <div className="flex flex-col gap-[12px] md:gap-[20px]">
          <Reveal y={16} duration={600}>
            <p className="text-[15px] leading-[22px] font-medium tracking-[-0.38px] text-[#e61911] md:text-[18px] lg:text-[20px] lg:leading-[30px] lg:tracking-[-0.5px]">
              Location
            </p>
          </Reveal>
          <h2 className="text-[clamp(24px,5.2vw,46px)] leading-[1.3] font-bold tracking-[-0.025em] text-black">
            <RevealText lines={["지점찾기"]} delay={80} step={26} />
          </h2>
          <Reveal delay={300} y={16} duration={600}>
            <p className="text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[16px] lg:text-[18px] lg:leading-[26px] lg:tracking-[-0.45px]">
              진심을 담은 고집이 만들어낸 최상의 풍미와 서비스
            </p>
          </Reveal>
        </div>
      </div>

      {/* Figma 332:1529 — 지도 위에 검색 패널이 얹힌다 */}
      <div className="relative w-full">
        {/* Figma 332:1530 — 1920 x 814 전체 폭 지도.
            네이버 지도로 연동하고, 키가 없거나 로드에 실패하면 정적 이미지로 대체된다 */}
        <div
          className="w-full overflow-hidden bg-[#d9d9d9]"
          // 세로가 짧은 화면에서 지도가 화면을 다 먹지 않도록 뷰포트 높이도 함께 고려한다
          style={{ height: isCompact ? undefined : `min(${MAP_H}px, 78vh)` }}
        >
          <NaverMap
            stores={STORES}
            active={active}
            focusKey={focusKey}
            onSelect={selectStore}
            className={`w-full ${isCompact ? "h-[clamp(280px,60vw,520px)]" : "h-full"}`}
            fallback={
              <img
                src={asset("/images/stores/map.png")}
                alt="지점 위치 지도"
                className={`w-full object-cover ${
                  isCompact ? "h-[clamp(280px,60vw,520px)]" : "h-full"
                }`}
              />
            }
          />
        </div>

        {/* Figma 332:1531 — 검색 패널.
            데스크톱에서는 지도 위 왼쪽에 겹쳐 놓고, 좁은 화면에서는 지도 아래로 내린다 */}
        <div
          className={
            isCompact
              ? "relative z-10 mx-auto mt-[28px] w-[calc(100%-32px)] max-w-[520px] sm:w-[calc(100%-40px)] md:mt-[40px] md:max-w-[720px]"
              : /* 이 래퍼는 지도 전체를 덮는 크기라 그대로 두면 지도의 드래그·휠이 막힌다.
                   포인터 이벤트를 통과시키고, 실제 패널에서만 다시 받는다 */
                "pointer-events-none absolute left-1/2 flex -translate-x-1/2 justify-start"
          }
          style={
            isCompact
              ? undefined
              : {
                  top: PANEL_TOP,
                  width: "min(100%, 1920px)",
                  // 좌우 여백은 다른 섹션과 같은 120, 화면이 좁아지면 함께 줄어든다
                  paddingLeft: "min(120px, 6.25vw)",
                }
          }
        >
          <div
            className={
              isCompact
                ? "flex w-full flex-col gap-[28px] font-pretendard"
                : /* 지도 안쪽으로 높이를 묶고, 넘치는 부분은 아래 목록에서 스크롤된다.
                     래퍼가 pointer-events-none 이므로 여기서 다시 받는다 */
                  "pointer-events-auto flex flex-col gap-[40px] overflow-hidden bg-white p-[40px] font-pretendard xl:p-[60px]"
            }
            style={
              isCompact
                ? undefined
                : {
                    width: `min(${PANEL_W}px, 46vw)`,
                    // 지도 높이가 뷰포트에 맞춰 줄면 패널도 같이 줄어든다
                    height: `min(${PANEL_H}px, calc(78vh - ${PANEL_TOP * 2}px))`,
                  }
            }
          >
            {/* 검색 폼(지점명 입력 / 옵션·브랜드 셀렉트 / 지점조회)은 제거했다.
                비워진 만큼 아래 지점 목록이 패널 전체를 차지한다. */}

            {/* Figma 332:1550 — 결과 목록, 상단 검정 선.
                검색 폼을 걷어냈으므로 패널 높이를 전부 쓰고, 넘치면 안에서 스크롤된다 */}
            <div
              className={
                isCompact
                  ? "flex w-full flex-col gap-[12px]"
                  : `flex w-full flex-col border-t border-solid border-black min-h-0 flex-1 overflow-y-auto pr-[14px] ${SCROLLBAR}`
              }
            >
              {STORES.map((store, i) => (
                /* 예약 링크(a)가 안에 들어가므로 카드 전체를 button 으로 감싸지 않는다.
                   지점 선택은 이름·주소 영역 버튼이 맡는다.

                   모바일에서는 구분선만 있는 목록이 밋밋하고 선택 상태도 알기 어려워
                   테두리가 있는 카드로 바꾸고, 고른 지점만 테두리·배경으로 강조한다. */
                <div
                  key={store.id}
                  aria-current={i === active ? "true" : undefined}
                  className={
                    isCompact
                      ? `flex w-full flex-col items-start gap-[16px] rounded-[14px] border border-solid p-[18px] transition-colors duration-300 ${
                          i === active
                            ? "border-[#222] bg-[#fafafb]"
                            : "border-[#e5e5ec] bg-white"
                        }`
                      : `flex w-full flex-col items-start gap-[20px] border-b border-solid border-[#e5e5ec] py-[24px] transition-opacity duration-300 md:gap-[32px] md:py-[28px] ${
                          i === active ? "" : "opacity-60 hover:opacity-100"
                        }`
                  }
                >
                  <button
                    type="button"
                    onClick={() => selectStore(i)}
                    className="flex w-full flex-col gap-[12px] text-left outline-none md:gap-[16px]"
                  >
                    {/* Figma 332:1553 — Pretendard Bold 20 / lh 30 / -0.5.
                        모바일에서는 선택된 지점에 붉은 점을 찍어 한눈에 보이게 한다 */}
                    <span className="flex w-full items-center gap-[8px]">
                      {isCompact && (
                        <span
                          aria-hidden
                          className={`size-[7px] shrink-0 rounded-full transition-colors duration-300 ${
                            i === active ? "bg-[#e61911]" : "bg-[#d9d9de]"
                          }`}
                        />
                      )}
                      <span className="text-[17px] leading-[26px] font-bold tracking-[-0.43px] text-black md:text-[20px] md:leading-[30px] md:tracking-[-0.5px]">
                        {store.name}
                      </span>
                    </span>

                    <div className="flex w-full flex-col gap-[8px] md:gap-[12px]">
                      <span className="flex items-start gap-[6px]">
                        <img
                          src={asset("/images/stores/pin.svg")}
                          alt=""
                          aria-hidden
                          className="mt-[1px] size-[18px] shrink-0 md:size-[20px]"
                        />
                        <span className="text-[13px] leading-[20px] font-normal tracking-[-0.33px] text-[#767676] md:text-[14px] md:tracking-[-0.35px]">
                          {store.address}
                        </span>
                      </span>
                      <span className="flex items-center gap-[6px]">
                        <img
                          src={asset("/images/stores/phone.svg")}
                          alt=""
                          aria-hidden
                          className="size-[18px] shrink-0 md:size-[20px]"
                        />
                        <span className="text-[13px] leading-[20px] font-normal tracking-[-0.33px] text-[#767676] md:text-[14px] md:tracking-[-0.35px]">
                          {store.phone}
                        </span>
                      </span>
                    </div>
                  </button>

                  {/* Figma 332:1565 — 예약 버튼. 원본은 네이버·카카오 2개였으나 네이버만 남긴다.
                      좁은 화면에서는 링크 없는 지점의 비활성 버튼이 시야만 어지럽혀 아예 감춘다 */}
                  {(store.reserveUrl || !isCompact) && (
                  <div className="flex w-full items-center gap-[12px]">
                    {store.reserveUrl ? (
                      /* hover — 네이버 초록으로 채워지고 살짝 떠오른다.
                         배경을 왼→오른쪽으로 쓸어 채워 클릭 유도가 분명해진다 */
                      <a
                        href={store.reserveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group/naver relative flex w-full items-center justify-center gap-[8px] overflow-hidden border border-solid border-[#e5e5ec] px-[12px] py-[14px] transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-[2px] hover:border-[#03c75a] hover:shadow-[0_8px_20px_rgba(3,199,90,0.22)] md:px-[28px] md:py-[16px]"
                      >
                        <span
                          aria-hidden
                          className="absolute inset-0 origin-left scale-x-0 bg-[#03c75a] transition-transform duration-400 ease-out group-hover/naver:scale-x-100"
                        />
                        <img
                          src={asset("/images/stores/naver.svg")}
                          alt=""
                          aria-hidden
                          className="relative size-[24px] shrink-0 transition-transform duration-300 group-hover/naver:scale-110"
                        />
                        <span className="relative text-[13px] leading-[20px] font-medium tracking-[-0.33px] whitespace-nowrap text-black transition-colors duration-300 group-hover/naver:text-white md:text-[14px] md:tracking-[-0.35px]">
                          네이버 예약하기
                        </span>
                      </a>
                    ) : (
                      // 예약 링크가 아직 없는 지점은 눌리지 않게 둔다
                      <span
                        aria-disabled="true"
                        className="flex w-full cursor-not-allowed items-center justify-center gap-[8px] border border-solid border-[#e5e5ec] px-[12px] py-[14px] opacity-45 md:px-[28px] md:py-[16px]"
                      >
                        <img
                          src={asset("/images/stores/naver.svg")}
                          alt=""
                          aria-hidden
                          className="size-[24px] shrink-0"
                        />
                        <span className="text-[13px] leading-[20px] font-medium tracking-[-0.33px] whitespace-nowrap text-black md:text-[14px] md:tracking-[-0.35px]">
                          네이버 예약하기
                        </span>
                      </span>
                    )}
                  </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
