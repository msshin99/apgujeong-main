import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Reveal, { RevealText } from "../Reveal.jsx";
import Tilt from "../Tilt.jsx";
import { useBreakpoint } from "../useBreakpoint.js";
import { listNotices } from "../lib/notices.js";

/**
 * Figma: Frame 2095587768 (332:1598) — 1680 폭, 공지사항 페이지 목록.
 *
 *   헤더 156 (라벨 30 → 54 → 제목 60 → 16 → 설명 26) → 40 → 카드 그리드
 *   카드 544 x 508, 가로 gap 24 (544*3 + 24*2 = 1680), 세로 gap 48
 *     ├ 썸네일 544 x 300
 *     └ 본문 208 — 흰 배경, 테두리 #e5e5ec, p 28, 내부 gap 32
 *
 * 카드 구성은 메인 페이지 NOTICE 섹션(Notice.jsx)과 완전히 같은 규격이라
 * 치수·타이포를 그대로 옮겨 왔다. 다른 점은 3장이 아니라 12장이라는 것뿐이다.
 */
const THUMB_RATIO = 300 / 544; // 썸네일 비율. 유동 폭에서도 300px 자리를 지킨다

function NoticeCard({ item }) {
  return (
    /* 카드 전체가 상세 페이지로 가는 링크다 */
    <Link
      to={`/notice/${item.id}`}
      className="group flex h-full w-full flex-col items-start"
    >
      {/* Figma 332:1608 — 썸네일 544 x 300 */}
      <div
        className="relative w-full shrink-0 overflow-hidden"
        style={{ paddingTop: `${THUMB_RATIO * 100}%` }}
      >
        {/* crop 은 예비 데이터 전용 값이다. DB 사진은 잘라내기 없이 꽉 채운다 */}
        {item.image ? (
          <img
            src={item.image}
            alt=""
            className={`absolute left-0 max-w-none transition-transform duration-700 ease-out group-hover:scale-[1.04] ${
              item.crop ? "w-full object-cover" : "inset-0 size-full object-cover"
            }`}
            style={item.crop ?? undefined}
          />
        ) : (
          <span className="absolute inset-0 bg-[#f6f7fb]" />
        )}
      </div>

      {/* Figma 332:1609 — 흰 배경, 테두리 #e5e5ec, p 28, 내부 gap 32 */}
      <div className="flex w-full flex-1 flex-col items-start gap-[20px] border border-solid border-[#e5e5ec] bg-white p-[20px] transition-colors duration-300 group-hover:border-[#222] md:gap-[24px] md:p-[24px] lg:gap-[32px] lg:p-[28px]">
        <div className="flex w-full flex-col items-start gap-[10px] lg:gap-[12px]">
          {/* Figma 332:1611 — 점 6px + 라벨, gap 4 */}
          <div className="flex w-full items-center gap-[4px]">
            <span className="size-[6px] shrink-0 rounded-full bg-[#e61911]" />
            {/* Figma 332:1613 — Pretendard Medium 14 / lh 22 / -0.35 / #e61911 */}
            <span className="text-[13px] leading-[20px] font-medium tracking-[-0.33px] text-[#e61911] lg:text-[14px] lg:leading-[22px] lg:tracking-[-0.35px]">
              {item.tag}
            </span>
          </div>

          {/* Figma 332:1614 — Pretendard Medium 20 / lh 30 / -0.5 / #222, 2줄 말줄임 */}
          <p className="line-clamp-2 w-full text-[16px] leading-[24px] font-medium tracking-[-0.4px] break-words text-[#222] transition-colors duration-300 group-hover:text-black md:text-[18px] md:leading-[27px] lg:text-[20px] lg:leading-[30px] lg:tracking-[-0.5px]">
            {item.title}
          </p>
        </div>

        {/* Figma 332:1615 — Pretendard Light 16 / lh 26 / -0.4 / #767676 */}
        <p className="mt-auto w-full text-[14px] leading-[22px] font-light tracking-[-0.35px] text-[#767676] lg:text-[16px] lg:leading-[26px] lg:tracking-[-0.4px]">
          {item.date}
        </p>
      </div>
    </Link>
  );
}

export default function NoticeBoard() {
  const { isCompact } = useBreakpoint();
  const [notices, setNotices] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error

  useEffect(() => {
    let alive = true;
    listNotices()
      .then((rows) => {
        if (!alive) return;
        setNotices(rows);
        setState("ready");
      })
      .catch((err) => {
        if (!alive) return;
        console.error("[NoticeBoard]", err);
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="w-full bg-white px-[20px] pt-[100px] pb-[100px] sm:px-[24px] md:px-[40px] md:pt-[150px] md:pb-[150px] lg:pt-[200px] lg:pb-[200px]">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-[28px] font-pretendard md:gap-[40px]">
        {/* Figma 332:1600 — 헤더 */}
        <div className="flex w-full flex-col gap-[12px] md:gap-[16px]">
          <Reveal y={16} duration={600}>
            <p className="text-[15px] leading-[22px] font-medium tracking-[-0.38px] text-[#e61911] md:text-[18px] lg:text-[20px] lg:leading-[30px] lg:tracking-[-0.5px]">
              Notice
            </p>
          </Reveal>
          {/* Figma 332:1603 — Pretendard Bold 46 / lh 60 */}
          <h2 className="text-[clamp(24px,5.2vw,46px)] leading-[1.3] font-bold tracking-[-0.025em] text-black">
            <RevealText lines={["공지사항"]} delay={80} step={26} />
          </h2>
          {/* Figma 332:1604 — Pretendard Regular 18 / lh 26 / -0.45 / #767676 */}
          <Reveal delay={300} y={16} duration={600}>
            <p className="text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[16px] lg:text-[18px] lg:leading-[26px] lg:tracking-[-0.45px]">
              진심을 담은 고집이 만들어낸 최상의 풍미와 서비스
            </p>
          </Reveal>
        </div>

        {/* Figma 332:1605 — 3열 그리드, 가로 24 / 세로 48 */}
        {state === "loading" ? (
          /* 뼈대를 카드와 같은 자리에 깔아 두면 목록이 뜰 때 화면이 튀지 않는다 */
          <div className="grid w-full grid-cols-1 gap-x-[24px] gap-y-[32px] md:grid-cols-2 md:gap-y-[40px] lg:grid-cols-3 lg:gap-y-[48px]">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex w-full animate-pulse flex-col">
                <div
                  className="w-full bg-[#f1f1f4]"
                  style={{ paddingTop: `${THUMB_RATIO * 100}%` }}
                />
                <div className="flex flex-col gap-[12px] border border-[#e5e5ec] p-[28px]">
                  <div className="h-[16px] w-[72px] bg-[#f1f1f4]" />
                  <div className="h-[20px] w-full bg-[#f1f1f4]" />
                  <div className="h-[20px] w-3/4 bg-[#f1f1f4]" />
                  <div className="mt-[12px] h-[16px] w-[96px] bg-[#f1f1f4]" />
                </div>
              </div>
            ))}
          </div>
        ) : state === "error" ? (
          <p className="py-[80px] text-center text-[16px] leading-[26px] text-[#767676]">
            공지사항을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        ) : notices.length === 0 ? (
          <p className="py-[80px] text-center text-[16px] leading-[26px] text-[#767676]">
            등록된 공지사항이 없습니다.
          </p>
        ) : (
          <div className="grid w-full grid-cols-1 gap-x-[24px] gap-y-[32px] md:grid-cols-2 md:gap-y-[40px] lg:grid-cols-3 lg:gap-y-[48px]">
            {notices.map((item, i) => (
              /* 한 줄 단위로 시차를 준다. 전체에 순번을 매기면
                 마지막 카드가 나타나기까지 지나치게 오래 걸린다 */
              <Reveal key={item.id} delay={(i % 3) * 120} y={36}>
                {isCompact ? (
                  <NoticeCard item={item} />
                ) : (
                  <Tilt max={6} perspective={1400}>
                    <NoticeCard item={item} />
                  </Tilt>
                )}
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
