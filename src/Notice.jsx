import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DESIGN_W, useWidthScale } from "./useCanvasScale.js";
import Reveal, { RevealText } from "./Reveal.jsx";
import Tilt from "./Tilt.jsx";
import { useBreakpoint } from "./useBreakpoint.js";
import { listFeatured } from "./lib/notices.js";
import { isSupabaseReady } from "./lib/supabase.js";

/**
 * Figma: Frame 2095587710 (332:715) — x 120 / y 10000 / 1680 x 704
 *
 * 세로 flex, gap 40.
 *   헤더 332:716  1680 x 156, gap 24
 *   카드 3장 332:722  544 x 508, 가로 gap 24 (544*3 + 24*2 = 1680)
 *     ├ 썸네일 300
 *     └ 본문 208 — 흰 배경, 테두리 #e5e5ec, p 28, 내부 gap 32
 */
const FRAME_W = 1680;
const SECTION_H = 704;
const CARD_W = 544;
const CARD_GAP = 24;
const THUMB_H = 300;

/** 앞 Franchise 섹션이 하단 200px 를 갖고 있어 여기서는 상단 여백을 주지 않는다 */
const PAD_TOP = 0;
const PAD_BOTTOM = 200;

/**
 * Supabase 연결 전에 쓰는 예비 데이터.
 * crop 은 300px 썸네일 안에 이미지가 놓인 방식을 그대로 옮긴 값.
 */
const PLACEHOLDER = [
  {
    id: "n1",
    tag: "NEWS",
    title:
      "압구정곱창 공지사항텍스트압구정곱창 공지사항텍스트압구정곱창 공지사항텍스트압구정곱창 공지사항텍스트",
    date: "2026.00.00",
    image: "/images/notice/n1.png",
    // Figma 332:724 — h 181.33% / top -48.59%
    crop: { height: "181.33%", top: "-48.59%" },
  },
  {
    id: "n2",
    tag: "NEWS",
    title:
      "압구정곱창 공지사항텍스트압구정곱창 공지사항텍스트압구정곱창 공지사항텍스트압구정곱창 공지사항텍스트",
    date: "2026.00.00",
    image: "/images/notice/n2.png",
    // Figma 332:733 — h 181.33% / top 0.06%
    crop: { height: "181.33%", top: "0.06%" },
  },
  {
    id: "n3",
    tag: "NEWS",
    title:
      "압구정곱창 공지사항텍스트압구정곱창 공지사항텍스트압구정곱창 공지사항텍스트압구정곱창 공지사항텍스트",
    date: "2026.00.00",
    image: "/images/notice/n3.png",
    // Figma 332:742 — h 181.33% / top -7.59%
    crop: { height: "181.33%", top: "-7.59%" },
  },
];

/** 썸네일이 프레임 안에서 위아래로 미세하게 밀리는 폭 */
const PARALLAX = 26;

export default function Notice() {
  const scale = useWidthScale();
  const { isCompact } = useBreakpoint();
  const totalH = SECTION_H + PAD_TOP + PAD_BOTTOM;

  /* 관리자가 "메인 노출" 로 고른 3건.
     DB 가 연결돼 있으면 결과가 비어 있어도 그대로 따른다. 예비 데이터로 덮으면
     "등록했는데 왜 안 바뀌지" 하는 상황에서 원인을 알 수 없게 된다.
     연결 자체가 안 돼 있을 때만 예비 데이터를 쓴다. */
  const [notices, setNotices] = useState(isSupabaseReady ? null : PLACEHOLDER);

  useEffect(() => {
    if (!isSupabaseReady) return;

    let alive = true;
    listFeatured()
      .then((rows) => {
        if (!alive) return;
        setNotices(rows);
        if (import.meta.env.DEV && rows.length === 0) {
          console.warn(
            "[Notice] 메인에 실을 공지가 없습니다. " +
              "관리자 페이지에서 공지를 등록하고 ‘공개’ 상태인지 확인해 주세요.",
          );
        }
      })
      .catch((err) => {
        if (!alive) return;
        console.error("[Notice] 공지를 불러오지 못했습니다.", err);
        setNotices([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const sectionRef = useRef(null);
  const parallaxRefs = useRef([]);

  useEffect(() => {
    // 1200 미만에서는 패럴랙스를 끈다 (스크롤 중 매 프레임 이미지 이동은 부담)
    if (isCompact) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // 섹션이 화면을 지나가는 동안 -1 → 1
      const p =
        (rect.top + rect.height / 2 - window.innerHeight / 2) /
        (window.innerHeight || 1);
      const y = Math.max(-1, Math.min(1, p)) * PARALLAX;
      parallaxRefs.current.forEach((node, i) => {
        if (!node) return;
        // 카드마다 깊이를 달리해 층이 나뉘어 보이게 한다
        node.style.transform = `translate3d(0, ${y * (1 - i * 0.25)}px, 0)`;
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [isCompact]);

  /* 1200 미만 — 3열을 태블릿 2열 / 모바일 1열로. 틸트·패럴랙스는 끈다 */
  if (isCompact) {
    return (
      <section className="w-full bg-white px-[20px] pb-[80px] sm:px-[24px] md:px-[40px] md:pb-[120px]">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-[32px] font-pretendard md:gap-[40px]">
          <div className="flex flex-col gap-[14px]">
            <Reveal y={16} duration={600}>
              <p className="text-[15px] leading-[22px] font-medium tracking-[-0.38px] text-[#e61911] md:text-[18px] md:leading-[26px]">
                NOTICE
              </p>
            </Reveal>
            <h2 className="text-[clamp(24px,5.4vw,38px)] leading-[1.32] font-bold tracking-[-0.03em] text-black">
              <RevealText lines={["우리의 공지사항입니다."]} delay={80} step={22} />
            </h2>
            <Reveal delay={320} y={16} duration={600}>
              <p className="text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[16px] md:leading-[24px]">
                진심을 담은 고집이 만들어낸 최상의 풍미와 서비스
              </p>
            </Reveal>
          </div>

          <div className="grid grid-cols-1 gap-[24px] md:grid-cols-2">
            {(notices ?? []).map((item, i) => (
              <Reveal key={item.id} delay={i * 120} y={32}>
                <Link to={`/notice/${item.id}`} className="flex h-full w-full flex-col">
                  <div className="relative w-full overflow-hidden pt-[55%]">
                    {item.image && (
                      <img
                        src={item.image}
                        alt=""
                        className={`absolute left-0 max-w-none object-cover ${
                          item.crop ? "w-full" : "inset-0 size-full"
                        }`}
                        style={item.crop ?? undefined}
                      />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-[20px] border border-solid border-[#e5e5ec] bg-white p-[20px] md:gap-[24px] md:p-[24px]">
                    <div className="flex flex-col gap-[10px]">
                      <div className="flex items-center gap-[4px]">
                        <span className="size-[6px] shrink-0 rounded-full bg-[#e61911]" />
                        <span className="text-[13px] leading-[20px] font-medium tracking-[-0.33px] text-[#e61911] md:text-[14px]">
                          {item.tag}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[16px] leading-[24px] font-medium tracking-[-0.4px] break-words text-[#222] md:text-[18px] md:leading-[27px]">
                        {item.title}
                      </p>
                    </div>
                    <p className="mt-auto text-[14px] leading-[22px] font-light tracking-[-0.35px] text-[#767676] md:text-[15px]">
                      {item.date}
                    </p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden bg-white"
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
          {/* Figma 332:715 — 1680 폭, 세로 gap 40 */}
          <div
            className="mx-auto flex flex-col items-start gap-[40px] font-pretendard"
            style={{ width: FRAME_W, marginTop: PAD_TOP }}
          >
            {/* Figma 332:717 — 헤더, gap 24 */}
            <div className="flex w-full flex-col items-start gap-[24px]">
              {/* Figma 332:718 — Pretendard Medium 20 / lh 30 / -0.5 / #e61911 */}
              <Reveal y={20} duration={700}>
                <p className="text-[20px] leading-[30px] font-medium tracking-[-0.5px] whitespace-nowrap text-[#e61911]">
                  NOTICE
                </p>
              </Reveal>

              {/* Figma 332:719 — w 666, gap 16 */}
              <div className="flex w-[666px] flex-col items-start gap-[16px]">
                {/* Figma 332:720 — Pretendard Bold 46 / lh 60 / -1.15 / 검정 */}
                <h2 className="text-[46px] leading-[60px] font-bold tracking-[-1.15px] whitespace-nowrap text-black uppercase">
                  <RevealText lines={["우리의 공지사항입니다."]} delay={120} />
                </h2>
                {/* Figma 332:721 — Pretendard Regular 18 / lh 26 / -0.45 / #767676 */}
                <Reveal className="w-full" delay={420} y={20} duration={700}>
                  <p className="w-full text-[18px] leading-[26px] font-normal tracking-[-0.45px] text-[#767676]">
                    진심을 담은 고집이 만들어낸 최상의 풍미와 서비스
                  </p>
                </Reveal>
              </div>
            </div>

            {/* Figma 332:722 — 카드 3장, 가로 gap 24 */}
            <div className="flex w-full items-center" style={{ gap: CARD_GAP }}>
              {(notices ?? []).map((item, cardIndex) => (
                <Reveal
                  key={item.id}
                  className="shrink-0"
                  style={{ width: CARD_W }}
                  delay={cardIndex * 140}
                  y={44}
                >
                  {/* 커서 방향으로 미세하게 기울어진다 */}
                  <Tilt max={6} perspective={1400}>
                    <Link
                      to={`/notice/${item.id}`}
                      className="group flex w-full cursor-pointer flex-col items-start"
                    >
                      {/* Figma 332:724 — 썸네일 544 x 300 */}
                      <div
                        className="relative w-full shrink-0 overflow-hidden"
                        style={{ height: THUMB_H }}
                      >
                        {/* 스크롤에 따라 프레임 안에서 미세하게 밀리는 층 */}
                        <div
                          ref={(el) => (parallaxRefs.current[cardIndex] = el)}
                          className="absolute inset-0 will-change-transform"
                        >
                          {item.image && (
                            <img
                              src={item.image}
                              alt=""
                              className={`absolute left-0 max-w-none object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] ${
                                item.crop ? "w-full" : "inset-0 size-full"
                              }`}
                              style={item.crop ?? undefined}
                            />
                          )}
                        </div>
                      </div>

                      {/* Figma 332:725 — 흰 배경, 테두리 #e5e5ec, p 28, 내부 gap 32 */}
                      <div className="flex w-full flex-col items-start gap-[32px] border border-solid border-[#e5e5ec] bg-white p-[28px]">
                        <div className="flex w-full flex-col items-start gap-[12px]">
                          {/* Figma 332:727 — 점 6px + 라벨, gap 4 */}
                          <div className="flex w-full items-center gap-[4px]">
                            <span className="size-[6px] shrink-0 rounded-full bg-[#e61911]" />
                            {/* Figma 332:729 — Pretendard Medium 14 / lh 22 / -0.35 / #e61911 */}
                            <span className="text-[14px] leading-[22px] font-medium tracking-[-0.35px] text-[#e61911]">
                              {item.tag}
                            </span>
                          </div>

                          {/* Figma 332:730 — Pretendard Medium 20 / lh 30 / -0.5 / #222, 2줄 말줄임 */}
                          <p className="line-clamp-2 w-full text-[20px] leading-[30px] font-medium tracking-[-0.5px] break-words text-[#222] transition-colors duration-300 group-hover:text-black">
                            {item.title}
                          </p>
                        </div>

                        {/* Figma 332:731 — Pretendard Light 16 / lh 26 / -0.4 / #767676 */}
                        <p className="w-full text-[16px] leading-[26px] font-light tracking-[-0.4px] text-[#767676]">
                          {item.date}
                        </p>
                      </div>
                    </Link>
                  </Tilt>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
