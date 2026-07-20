import { Link } from "react-router-dom";
import { DESIGN_W, useWidthScale } from "./useCanvasScale.js";
import Reveal from "./Reveal.jsx";
import { Magnetic } from "./Tilt.jsx";
import { useBreakpoint } from "./useBreakpoint.js";

/**
 * Figma: 푸터 (332:783 / 컴포넌트 70:1778) — 1920 x 347, 배경 검정
 *
 *   상단에 1px 실선(#e5e5ec)
 *   안쪽 1580 폭, py 80, 세로 gap 40
 *     ├ 로고 + 관리자페이지 버튼 (좌우 배치)
 *     └ INFO / TEL / ADRESS 3열(gap 56) + 저작권 (좌우 배치, 하단 정렬)
 */
const INNER_W = 1580;

/**
 * Figma 70:1750 / 1758 / 1769 — 열마다 폭이 다르다.
 *
 * 값은 전부 자리표시자다. Figma 시안에 남아 있던 다른 회사의 실제
 * 사업자번호·전화번호·주소를 그대로 두면 안 되므로 지웠다.
 * 실제 정보를 받으면 이 배열만 바꾸면 된다.
 */
const COLUMNS = [
  {
    title: "INFO",
    width: 295,
    rowGap: 8,
    rows: [
      ["대표 000", "사업자등록번호 000-00-00000"],
      ["통신판매업신고 0000-서울00-0000"],
    ],
  },
  {
    title: "TEL",
    width: 321,
    rowGap: 8,
    rows: [
      ["(대표) 00-0000-0000", "(예약) 00-0000-0000"],
      ["(가맹문의) 00-0000-0000", "(팩스) 00-0000-0000"],
    ],
  },
  {
    title: "ADRESS",
    width: 272,
    rowGap: 12,
    rows: [["주소 000000000 000 0000 00, 0층"]],
  },
];

// Figma 70:1754 등 — Pretendard Light 16 / lh 26 / -0.4 / #999
const BODY_TEXT =
  "text-[16px] leading-[26px] font-light tracking-[-0.4px] whitespace-nowrap text-[#999]";

export default function Footer() {
  const scale = useWidthScale();
  const { isCompact } = useBreakpoint();
  // 안쪽 콘텐츠 높이 = py 80*2 + 로고행 48 + gap 40 + 정보행 99 ≈ 347
  const totalH = 347;

  /* 1200 미만 — 3열을 태블릿 2열 / 모바일 1열로 쌓는다 */
  if (isCompact) {
    return (
      <footer className="w-full border-t border-solid border-[#e5e5ec] bg-black">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-[32px] px-[20px] py-[48px] font-pretendard sm:px-[24px] md:gap-[40px] md:px-[40px] md:py-[64px]">
          <div className="flex flex-wrap items-center justify-between gap-[16px]">
            <a
              href="#top"
              className="text-[22px] leading-[26px] font-bold tracking-[-0.55px] text-white uppercase md:text-[26px] md:leading-[30px]"
            >
              Apgujeong
            </a>
            {/* 실제 관리자 화면으로 연결한다 (예전에는 #admin 이라 아무 데도 가지 않았다) */}
            <Link
              to="/admin"
              className="rounded-[9999px] bg-[#161616] px-[22px] py-[11px] text-[13px] leading-[20px] font-medium tracking-[-0.33px] whitespace-nowrap text-white md:text-[14px]"
            >
              관리자페이지
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-[28px] md:grid-cols-2 md:gap-[32px]">
            {COLUMNS.map((col) => (
              <div key={col.title} className="flex flex-col items-start gap-[10px]">
                <p className="text-[16px] leading-[24px] font-medium tracking-[-0.4px] text-white md:text-[17px]">
                  {col.title}
                </p>
                <div className="flex flex-col items-start gap-[6px]">
                  {col.rows.map((row) => (
                    <div key={row.join()} className="flex flex-wrap items-center gap-[8px]">
                      {row.map((cell, k) => (
                        <div key={cell} className="flex items-center gap-[8px]">
                          {k > 0 && <span className="h-[12px] w-px shrink-0 bg-[#e5e5ec]" />}
                          <p className="text-[14px] leading-[22px] font-light tracking-[-0.35px] text-[#999] md:text-[15px]">
                            {cell}
                          </p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="text-[12px] leading-[20px] font-light tracking-[-0.3px] text-[#999] md:text-[13px]">
            Copyrights ⓒ 0000. All rights reserved.
          </p>
        </div>
      </footer>
    );
  }

  return (
    <footer
      className="relative w-full overflow-hidden bg-black"
      style={{ height: totalH * scale }}
    >
      <div className="flex justify-center">
        <div
          className="origin-top relative shrink-0"
          style={{
            width: DESIGN_W,
            height: totalH,
            transform: `scale(${scale})`,
          }}
        >
          {/* Figma 70:1714 — 상단 1px 실선 */}
          <div className="h-px w-full bg-[#e5e5ec]" />

          {/* Figma 70:1715 — 1580 폭, py 80, 세로 gap 40 */}
          <div
            className="mx-auto flex flex-col items-end gap-[40px] py-[80px] font-pretendard"
            style={{ width: INNER_W }}
          >
            {/* Figma 70:1716 — 로고 + 버튼 */}
            <div className="flex w-full items-center justify-between">
              {/* Figma 70:1775 — Pretendard Bold 28 / lh 28 / -0.7 / 흰색 */}
              <a
                href="#top"
                className="text-[28px] leading-[28px] font-bold tracking-[-0.7px] whitespace-nowrap text-white uppercase"
              >
                Apgujeong
              </a>

              {/* Figma 70:1746 — bg #161616, px 28 / py 12, radius 9999 */}
              <Magnetic strength={0.3}>
                <Link
                  to="/admin"
                  className="flex items-center justify-center rounded-[9999px] bg-[#161616] px-[28px] py-[12px] transition-colors duration-300 hover:bg-[#e61911]"
                >
                  {/* Figma 70:1747 — Pretendard Medium 14 / lh 22 / -0.35 / 흰색 */}
                  <span className="text-[14px] leading-[22px] font-medium tracking-[-0.35px] whitespace-nowrap text-white">
                    관리자페이지
                  </span>
                </Link>
              </Magnetic>
            </div>

            {/* Figma 70:1748 — 정보 열 + 저작권, 하단 정렬 */}
            <div className="flex w-full items-end justify-between">
              {/* Figma 70:1749 — 3열, gap 56 */}
              <div className="flex items-start gap-[56px]">
                {COLUMNS.map((col, colIndex) => (
                  <Reveal
                    key={col.title}
                    className="flex shrink-0 flex-col items-start gap-[12px]"
                    style={{ width: col.width }}
                    delay={colIndex * 120}
                    y={24}
                    duration={800}
                  >
                    {/* Figma 70:1751 — Pretendard Medium 18 / lh 28 / -0.45 / 흰색 */}
                    <p className="w-full text-[18px] leading-[28px] font-medium tracking-[-0.45px] text-white">
                      {col.title}
                    </p>

                    <div
                      className="flex w-full flex-col items-start"
                      style={{ gap: col.rowGap }}
                    >
                      {col.rows.map((row) => (
                        <div
                          key={row.join()}
                          className="flex w-full items-center gap-[8px]"
                        >
                          {row.map((cell, k) => (
                            <div
                              key={cell}
                              className="flex items-center gap-[8px]"
                            >
                              {/* Figma 70:1755 — 항목 사이 세로 구분선 1 x 14 */}
                              {k > 0 && (
                                <span className="h-[14px] w-px shrink-0 bg-[#e5e5ec]" />
                              )}
                              <p className={BODY_TEXT}>{cell}</p>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </Reveal>
                ))}
              </div>

              {/* Figma 70:1774 — Pretendard Light 14 / lh 22 / -0.35 / #999 */}
              <p className="shrink-0 text-[14px] leading-[22px] font-light tracking-[-0.35px] whitespace-nowrap text-[#999]">
                Copyrights ⓒ 0000. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
