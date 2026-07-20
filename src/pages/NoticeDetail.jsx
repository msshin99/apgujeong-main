import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageShell from "./PageShell.jsx";
import Reveal, { RevealText } from "../Reveal.jsx";
import { bumpViews, getNotice } from "../lib/notices.js";

/**
 * Figma: Frame 1707486793 (332:1819) — x 320 / 1280 x 672
 *
 *   제목 블록 332:1821  gap 16
 *     ├ 제목  Pretendard Bold 38 / lh 48 / -0.95 / 검정
 *     └ 메타  gap 16, 묶음마다 gap 8 — 라벨 #767676 14/20, 구분선 1x12 #e5e5ec, 값 검정 14/22
 *   본문 332:1836  위아래 실선 #e5e5ec, py 36, 문단 간 24
 *     └ Pretendard Light 16 / lh 24 / -0.4 / #767676
 *   목록으로 332:1845  w 160, bg #e61911, px 20 / py 16, 흰 글씨 Medium 14 / lh 22
 *   본문 ↔ 버튼 gap 60
 */
const CONTENT_W = 1280;

/** 목록 카드 썸네일(544 x 300)과 같은 비율. crop 값이 이 비율을 전제로 계산돼 있다 */
const THUMB_RATIO = 300 / 544;

/** 라벨 | 값 묶음 */
function Meta({ label, value }) {
  return (
    <span className="flex items-center gap-[8px]">
      <span className="text-[13px] leading-[20px] font-normal tracking-[-0.33px] whitespace-nowrap text-[#767676] md:text-[14px] md:tracking-[-0.35px]">
        {label}
      </span>
      <span className="h-[12px] w-px shrink-0 bg-[#e5e5ec]" />
      <span className="text-[13px] leading-[22px] font-normal tracking-[-0.33px] whitespace-nowrap text-black md:text-[14px] md:tracking-[-0.35px]">
        {value}
      </span>
    </span>
  );
}

export default function NoticeDetail() {
  const { id } = useParams();
  const [notice, setNotice] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | missing | error

  useEffect(() => {
    let alive = true;
    setState("loading");

    getNotice(id)
      .then((row) => {
        if (!alive) return;
        setNotice(row);
        setState(row ? "ready" : "missing");
        /* 조회수는 글이 실제로 있을 때만. 실패해도 글은 보여야 하므로 기다리지 않는다 */
        if (row) bumpViews(id).catch(() => {});
      })
      .catch((err) => {
        if (!alive) return;
        console.error("[NoticeDetail]", err);
        setState("error");
      });

    return () => {
      alive = false;
    };
  }, [id]);

  if (state === "loading") {
    return (
      <PageShell label="News" title="공지사항" hero={false}>
        <div className="mx-auto w-full max-w-[1280px] animate-pulse px-[20px] pt-[48px] pb-[120px] sm:px-[24px] md:px-[40px] md:pt-[72px]">
          <div className="h-[40px] w-3/5 bg-[#f1f1f4]" />
          <div className="mt-[20px] h-[20px] w-[320px] bg-[#f1f1f4]" />
          <div className="mt-[28px] h-[280px] w-full bg-[#f1f1f4]" />
        </div>
      </PageShell>
    );
  }

  if (state !== "ready") {
    return (
      <PageShell label="News" title="공지사항" hero={false}>
        <div className="flex w-full flex-col items-center gap-[32px] px-[20px] py-[120px] text-center font-pretendard">
          <p className="text-[18px] leading-[26px] font-medium tracking-[-0.45px] text-[#222]">
            {state === "missing"
              ? "요청하신 공지사항을 찾을 수 없습니다."
              : "공지사항을 불러오지 못했습니다."}
          </p>
          <BackButton />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell label="News" title="공지사항" hero={false}>
      <div className="w-full bg-white px-[20px] pt-[48px] pb-[100px] sm:px-[24px] md:px-[40px] md:pt-[72px] md:pb-[150px] lg:pb-[200px]">
        <div
          className="mx-auto flex w-full flex-col items-center gap-[40px] font-pretendard md:gap-[60px]"
          style={{ maxWidth: CONTENT_W }}
        >
          <div className="flex w-full flex-col items-start gap-[16px]">
            {/* Figma 332:1821 — 제목 + 메타 */}
            <div className="flex w-full flex-col items-start gap-[12px] md:gap-[16px]">
              {/* Figma 332:1822 — Pretendard Bold 38 / lh 48 / -0.95 */}
              <h2 className="w-full text-[clamp(22px,4.2vw,38px)] leading-[1.28] font-bold tracking-[-0.025em] break-words text-black">
                <RevealText lines={[notice.detailTitle]} delay={60} step={22} />
              </h2>
              {/* Figma 332:1823 — 메타 3묶음, gap 16 */}
              <Reveal delay={220} y={14} duration={600} className="w-full">
                <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px]">
                  <Meta label="작성자" value={notice.author} />
                  <Meta label="게시일" value={notice.date} />
                  <Meta label="조회수" value={notice.views.toLocaleString()} />
                </div>
              </Reveal>
            </div>

            {/* Figma 332:1836 — 위아래 실선, py 36, 문단 간 24 */}
            <Reveal delay={340} y={20} duration={700} className="w-full">
              <div className="flex w-full flex-col items-start gap-[20px] border-y border-solid border-[#e5e5ec] py-[28px] md:gap-[24px] md:py-[36px]">
                {/* 목록 카드에서 보던 사진을 본문 머리에 그대로 이어 준다.
                    crop 값은 544x300 (비율 1.813) 기준이라 같은 비율의 상자에 넣어야
                    카드에서 보던 구도가 흐트러지지 않는다. */}
                {notice.image && (
                  <div
                    className="relative mb-[8px] w-full overflow-hidden bg-[#f6f7fb] md:mb-[12px]"
                    style={{ paddingTop: `${(THUMB_RATIO * 100).toFixed(2)}%` }}
                  >
                    <img
                      src={notice.image}
                      alt=""
                      className={`absolute left-0 max-w-none object-cover ${
                        notice.crop ? "w-full" : "inset-0 size-full"
                      }`}
                      style={notice.crop ?? undefined}
                    />
                  </div>
                )}

                {notice.body.map((paragraph, i) => (
                  /* 원문의 줄바꿈을 그대로 살린다 — 문단 안 줄바꿈은 24px 행간 그대로 */
                  <p
                    key={i}
                    className="w-full text-[15px] leading-[24px] font-light tracking-[-0.38px] whitespace-pre-line text-[#767676] md:text-[16px] md:tracking-[-0.4px]"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={140} y={20} duration={600}>
            <BackButton />
          </Reveal>
        </div>
      </div>
    </PageShell>
  );
}

/** Figma 332:1845 — w 160, bg #e61911 */
function BackButton() {
  return (
    <Link
      to="/notice"
      className="flex w-[160px] items-center justify-center bg-[#e61911] px-[20px] py-[16px] text-[14px] leading-[22px] font-medium tracking-[-0.35px] whitespace-nowrap text-white transition-colors duration-300 hover:bg-[#c2140e]"
    >
      목록으로
    </Link>
  );
}
