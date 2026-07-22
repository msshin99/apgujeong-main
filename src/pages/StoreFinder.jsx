import { useState } from "react";
import Reveal, { RevealText } from "../Reveal.jsx";
import NaverMap from "./NaverMap.jsx";
import Img from "../Img.jsx";
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
 *
 * 이 파일은 1200px 을 경계로 두 트리(isCompact)를 따로 그렸었다.
 * 캔버스 축소가 아니라 이미 vh/clamp 로 유동적이었고, 레이아웃만 JS 로 갈아 끼웠다.
 * 그 12군데 분기를 반응형 CSS(xl: = 1200px 경계) 하나로 합친다.
 *   - xl 미만: 지도는 clamp 높이, 검색 패널은 지도 아래로 쌓인다.
 *   - xl 이상(데스크톱): 지도는 min(814px, 78vh) 박스를 채우고, 패널이 그 위에 얹힌다.
 * Figma 원본 픽셀(지도 814 / 패널 536 x 694 / 위 여백 60)은 xl 값으로 그대로 박아 둔다.
 * ※ Tailwind JIT 는 소스의 리터럴 클래스만 훑으므로 이 값들은 상수 보간이 아니라
 *    임의값 클래스로 직접 적어야 한다(예전 style={{...}} 은 인라인이라 상수를 썼다).
 */

/**
 * 지점 목록 스크롤바.
 * 기본 스크롤바는 폭이 넓고 회색 트랙이 그대로 보여 패널 안에서 튄다.
 * 트랙은 비우고 얇은 알약 모양 손잡이만 남기며, 올리면 진해진다.
 * Firefox 는 의사 요소를 지원하지 않아 scrollbar-width / color 로 따로 맞춘다.
 * (xl 미만에는 스크롤 컨테이너 자체가 없어 이 클래스는 그냥 무해하게 놀아난다)
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
            <RevealText lines={["지점 찾기"]} delay={80} step={26} />
          </h2>
          <Reveal delay={300} y={16} duration={600}>
            <p className="text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[16px] lg:text-[18px] lg:leading-[26px] lg:tracking-[-0.45px]">
              진심을 담은 고집이 만들어낸 최상의 풍미와 서비스
            </p>
          </Reveal>
        </div>
      </div>

      {/* Figma 332:1529 — 데스크톱에서는 지도 위에 검색 패널이 얹히고,
          좁은 화면에서는 패널이 지도 아래로 흘러 쌓인다. relative 는 두 경우 모두
          쓰인다(xl 이상에서 패널의 absolute 기준, 미만에서는 그냥 무해). */}
      <div className="relative w-full">
        {/* Figma 332:1530 — 전체 폭 지도. 네이버 지도로 연동하고, 키가 없거나 로드에
            실패하면 정적 이미지로 대체된다. 지도(또는 대체 이미지)는 이 박스를 h-full 로
            그대로 채우므로, 높이 전환은 박스 한 곳에서만 반응형으로 처리한다.
              · xl 미만: clamp(280px,60vw,520px)
              · xl 이상: min(814px, 78vh) — 세로가 짧은 화면에서 지도가 화면을 다 먹지 않게 함
            (814 = Figma 지도 높이) */}
        <div className="h-[clamp(280px,60vw,520px)] w-full overflow-hidden bg-[#d9d9d9] xl:h-[min(814px,78vh)]">
          <NaverMap
            stores={STORES}
            active={active}
            focusKey={focusKey}
            onSelect={selectStore}
            className="h-full w-full"
            fallback={
              <Img
                src={asset("/images/stores/map.png")}
                alt="지점 위치 지도"
                /* 지도는 대표 이미지 아래라 첫 화면에 걸리지 않는다 */
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            }
          />
        </div>

        {/* Figma 332:1531 — 검색 패널.
            xl 미만: 지도 아래 보통 흐름에 쌓인다(relative, 좌우 여백·최대폭 제한).
            xl 이상: 지도 전체를 덮는 래퍼를 절대배치로 얹는다. 래퍼가 지도를 덮으면
              드래그·휠이 막히므로 pointer-events-none 으로 통과시키고, 실제 패널에서만
              다시 받는다. 좌우 여백 120(=다른 섹션과 같은 값), 폭은 1920 로 캡한다. */}
        <div
          className={[
            "relative z-10 mx-auto mt-[28px] w-[calc(100%-32px)] max-w-[520px]",
            "sm:w-[calc(100%-40px)] md:mt-[40px] md:max-w-[720px]",
            "xl:pointer-events-none xl:absolute xl:top-[60px] xl:left-1/2 xl:mx-0 xl:mt-0",
            "xl:flex xl:w-[min(100%,1920px)] xl:max-w-none xl:-translate-x-1/2 xl:justify-start xl:pl-[min(120px,6.25vw)]",
          ].join(" ")}
        >
          {/* xl 이상에서만 흰 패널이 되어 지도 위에 뜬다. 지도 안쪽으로 높이를 묶고
              (min(694px, 78vh-120px)), 넘치는 부분은 아래 목록에서 스크롤된다.
              래퍼가 pointer-events-none 이므로 여기서 다시 받는다.
              (536 = Figma 패널 폭, 694 = 패널 높이, 120 = 위아래 여백 60*2) */}
          <div className="flex w-full flex-col gap-[28px] font-pretendard xl:pointer-events-auto xl:h-[min(694px,calc(78vh_-_120px))] xl:w-[min(536px,46vw)] xl:gap-[40px] xl:overflow-hidden xl:bg-white xl:p-[60px]">
            {/* 검색 폼(지점명 입력 / 옵션·브랜드 셀렉트 / 지점조회)은 제거했다.
                비워진 만큼 아래 지점 목록이 패널 전체를 차지한다. */}

            {/* Figma 332:1550 — 결과 목록.
                xl 이상: 상단 검정 선 + 패널 높이를 전부 쓰고 넘치면 안에서 스크롤.
                xl 미만: 카드 사이 gap-12 로만 벌린 보통 목록. */}
            <div
              className={`flex w-full flex-col gap-[12px] xl:min-h-0 xl:flex-1 xl:gap-0 xl:overflow-y-auto xl:border-t xl:border-solid xl:border-black xl:pr-[14px] ${SCROLLBAR}`}
            >
              {STORES.map((store, i) => (
                /* 예약 링크(a)가 안에 들어가므로 카드 전체를 button 으로 감싸지 않는다.
                   지점 선택은 이름·주소 영역 버튼이 맡는다.

                   좁은 화면에서는 구분선만 있는 목록이 밋밋하고 선택 상태도 알기 어려워
                   테두리가 있는 카드로 보여 주고 고른 지점만 테두리·배경으로 강조한다.
                   xl 이상에서는 원본대로 하단 구분선 목록이 되고, 안 고른 지점은 흐려진다.
                   그래서 전환 속성도 xl 미만은 색(transition-colors), 이상은 투명도
                   (transition-opacity)로 다르다. */
                <div
                  key={store.id}
                  aria-current={i === active ? "true" : undefined}
                  className={`flex w-full flex-col items-start gap-[16px] rounded-[14px] border border-solid p-[18px] transition-colors duration-300 xl:gap-[32px] xl:rounded-none xl:border-x-0 xl:border-t-0 xl:border-[#e5e5ec] xl:px-0 xl:py-[28px] xl:transition-opacity ${
                    i === active
                      ? "border-[#222] bg-[#fafafb] xl:bg-transparent"
                      : "border-[#e5e5ec] bg-white opacity-100 xl:bg-transparent xl:opacity-60 xl:hover:opacity-100"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectStore(i)}
                    className="flex w-full flex-col gap-[12px] text-left outline-none md:gap-[16px]"
                  >
                    {/* Figma 332:1553 — Pretendard Bold 20 / lh 30 / -0.5.
                        좁은 화면에서는 선택된 지점에 붉은 점을 찍어 한눈에 보이게 하고,
                        xl 이상에서는 점을 숨긴다(원본 목록에는 점이 없다). */}
                    <span className="flex w-full items-center gap-[8px]">
                      <span
                        aria-hidden
                        className={`size-[7px] shrink-0 rounded-full transition-colors duration-300 xl:hidden ${
                          i === active ? "bg-[#e61911]" : "bg-[#d9d9de]"
                        }`}
                      />
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
                      예약 링크가 있는 지점(압구정)은 항상 보인다.
                      링크 없는 자리표시자 지점은 xl 이상에서만 비활성 버튼을 보이고,
                      좁은 화면에서는 시야를 어지럽히지 않도록 감춘다(hidden xl:flex). */}
                  <div
                    className={`w-full items-center gap-[12px] ${
                      store.reserveUrl ? "flex" : "hidden xl:flex"
                    }`}
                  >
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
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
