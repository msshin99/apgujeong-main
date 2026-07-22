import Reveal from "./Reveal.jsx";

/**
 * Figma: 푸터 (332:783 / 컴포넌트 70:1778) — 1920 x 347, 배경 검정
 *
 *   상단에 1px 실선(#e5e5ec)
 *   안쪽 1580 폭, py 80, 세로 gap 40
 *     ├ 로고 (시안에 있던 오른쪽 관리자페이지 버튼은 뺐다)
 *     └ INFO / TEL / ADDRESS 3열(gap 56) + 저작권 (좌우 배치, 하단 정렬)
 *
 * 예전에는 1920 캔버스를 transform:scale 로 통째로 줄이는 데스크톱 트리와,
 * 1200 미만용 유동 트리를 **따로** 들고 있었다. 게다가 바깥 높이(347*scale)와
 * 안쪽 높이(347)를 각각 계산해 두 값이 서로 어긋나기 쉬웠고, 1200~1440 구간에서는
 * 16px 본문이 배율(0.63~0.75)을 타 10~12px 로 그려졌다.
 *
 * 그래서 캔버스 배율과 이중 높이 계산을 버리고, 폭에 따라 CSS 로만 흐르는 **한 벌**로 바꾼다.
 *   · max-w-[1580px] mx-auto 컨테이너 → 1920 에서 좌우 170px 여백이 예전 캔버스와 그대로 맞는다
 *     (1920 사용자는 바뀐 걸 못 느낀다). 유동 좌우 여백은 그보다 좁을 때만 관여한다.
 *   · 3열은 md 2열 그리드로 쌓다가 xl(=1200) 에서 피그마와 같은 가로 3열(gap 56)로 편다.
 *   · 타이포는 px 을 브레이크포인트로 키워 배율에 얹히지 않으므로 좁은 화면에서도 읽힌다.
 */

/** 워드마크는 맨 위로 되돌리는 버튼이다. #top 앵커를 따로 심지 않으려고 직접 올린다 */
const scrollToTop = () => {
  // 접근성: 모션을 줄이도록 설정한 사용자에게는 부드러운 스크롤 대신 즉시 이동한다
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
};

/**
 * Figma 70:1750 / 1758 / 1769 — 열마다 폭이 다르다.
 *
 * wClass 는 데스크톱(가로 3열)에서만 먹는 고정폭이다. 좁은 화면의 그리드에서는
 * xl: 가 꺼져 셀 폭이 열을 지배하므로 아무 영향이 없다. Tailwind 스캐너가
 * 리터럴 문자열로 인식하도록 여기 값을 그대로 적어 둔다.
 *
 * 값은 전부 자리표시자다. Figma 시안에 남아 있던 다른 회사의 실제
 * 사업자번호·전화번호·주소를 그대로 두면 안 되므로 지웠다.
 * 실제 정보를 받으면 이 배열만 바꾸면 된다.
 */
const COLUMNS = [
  {
    title: "INFO",
    wClass: "xl:min-w-[295px]",
    rowGap: 8,
    rows: [
      ["대표 000", "사업자등록번호 000-00-00000"],
      ["통신판매업신고 0000-서울00-0000"],
    ],
  },
  {
    title: "TEL",
    /* min-w 라 자리표시자가 321px 를 넘겨도 한 줄에 다 들어간다(넘치는 대신 열이 넓어진다).
       고정폭이면 (팩스) 가 줄바꿈되며 앞에 구분선만 남는다 */
    wClass: "xl:min-w-[321px]",
    rowGap: 8,
    rows: [
      ["(대표) 00-0000-0000", "(예약) 00-0000-0000"],
      ["(가맹문의) 00-0000-0000", "(팩스) 00-0000-0000"],
    ],
  },
  {
    title: "ADDRESS",
    wClass: "xl:min-w-[272px]",
    rowGap: 12,
    rows: [["주소 000000000 000 0000 00, 0층"]],
  },
];

export default function Footer() {
  return (
    <footer className="w-full border-t border-solid border-[#e5e5ec] bg-black">
      {/* Figma 70:1715 — 안쪽 1580 폭. 캔버스를 줄이지 않고 컨테이너를 가운데 두므로
          1920 화면에서 좌우 170px 여백이 예전 캔버스와 그대로 맞는다.
          py/gap 은 좁은 화면에서 한 단계씩 줄여 붐비지 않게 한다 */}
      <div className="mx-auto flex w-full max-w-[1580px] flex-col gap-[32px] px-[20px] py-[48px] font-pretendard sm:px-[24px] md:gap-[40px] md:px-[40px] md:py-[64px] xl:py-[80px]">
        {/* Figma 70:1716 — 로고.
            오른쪽에 있던 관리자페이지 버튼은 뺐다. 방문자에게 보일 이유가 없고,
            관리자는 /admin 주소로 직접 들어간다 */}
        <div className="flex w-full flex-wrap items-center justify-between gap-[16px]">
          {/* Figma 70:1775 — Pretendard Bold 28 / lh 28 / -0.7 / 흰색 */}
          <button
            type="button"
            onClick={scrollToTop}
            className="cursor-pointer text-[22px] leading-[26px] font-bold tracking-[-0.55px] whitespace-nowrap text-white uppercase md:text-[26px] md:leading-[30px] xl:text-[28px] xl:leading-[28px] xl:tracking-[-0.7px]"
          >
            Apgujeong
          </button>
        </div>

        {/* Figma 70:1748 — 정보 열 + 저작권.
            좁을 때는 세로로 쌓고, xl 에서 피그마처럼 좌우로 벌려 하단 정렬한다 */}
        <div className="flex w-full flex-col gap-[28px] xl:flex-row xl:items-end xl:justify-between">
          {/* Figma 70:1749 — 3열. 1열 → md 2열 그리드 → xl 가로 3열(gap 56) */}
          <div className="grid grid-cols-1 gap-[28px] md:grid-cols-2 md:gap-[32px] xl:flex xl:items-start xl:gap-[56px]">
            {COLUMNS.map((col, colIndex) => (
              <Reveal
                key={col.title}
                className={`flex flex-col items-start gap-[10px] md:gap-[12px] ${col.wClass}`}
                delay={colIndex * 120}
                y={24}
                duration={800}
              >
                {/* Figma 70:1751 — Pretendard Medium 18 / lh 28 / -0.45 / 흰색 */}
                <p className="text-[16px] leading-[24px] font-medium tracking-[-0.4px] text-white md:text-[17px] xl:text-[18px] xl:leading-[28px] xl:tracking-[-0.45px]">
                  {col.title}
                </p>

                <div
                  className="flex w-full flex-col items-start"
                  style={{ gap: col.rowGap }}
                >
                  {col.rows.map((row) => (
                    /* 좁은 화면에서는 항목을 세로로 쌓고, xl 에서만 한 줄에 나란히 둔다.
                       flex-wrap 으로 흘리면 폭이 모자랄 때 (팩스) 가 다음 줄로 넘어가면서
                       앞의 구분선만 덩그러니 남는다 */
                    <div
                      key={row.join()}
                      className="flex flex-col items-start gap-[8px] xl:flex-row xl:items-center"
                    >
                      {row.map((cell, k) => (
                        <div key={cell} className="flex items-center gap-[8px]">
                          {/* Figma 70:1755 — 항목 사이 세로 구분선 1 x 14.
                              한 줄에 나란히 있을 때(xl)만 의미가 있어 그 아래선 숨긴다 */}
                          {k > 0 && (
                            <span className="hidden h-[14px] w-px shrink-0 bg-[#e5e5ec] xl:block" />
                          )}
                          {/* Figma 70:1754 — Pretendard Light 16 / lh 26 / -0.4 / #999 */}
                          <p className="text-[14px] leading-[22px] font-light tracking-[-0.35px] text-[#999] md:text-[15px] xl:text-[16px] xl:leading-[26px] xl:tracking-[-0.4px] xl:whitespace-nowrap">
                            {cell}
                          </p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </Reveal>
            ))}
          </div>

          {/* Figma 70:1774 — Pretendard Light 14 / lh 22 / -0.35 / #999 */}
          <p className="text-[12px] leading-[20px] font-light tracking-[-0.3px] text-[#999] md:text-[13px] xl:shrink-0 xl:text-[14px] xl:leading-[22px] xl:tracking-[-0.35px] xl:whitespace-nowrap">
            Copyrights ⓒ 0000. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
