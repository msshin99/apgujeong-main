import { useState } from "react";
import Reveal, { RevealText } from "../Reveal.jsx";
import { Magnetic } from "../Tilt.jsx";
import { useBreakpoint } from "../useBreakpoint.js";

/**
 * Figma: Frame 1707487843 (332:989)
 *
 *   헤더 332:990  1680 폭, gap 24 / 16
 *   슬라이드 332:997  가로 gap 28
 *     ├ 사진 332:998  642 x 380, radius 16, rgba(0,0,0,0.2) 오버레이
 *     └ 본문 332:999  776 폭, p 40, 세로 gap 80
 *         ├ Point 배지(#e61911) + 소제목, gap 12
 *         ├ 설명
 *         └ 카운터 "1 ▬ 4" + 화살표 버튼
 */
const TRACK_W = 98;
const PHOTO_W = 642;
const PHOTO_H = 380;

/** Figma 332:1003 / 1004 / 1005. 1번만 원본이고 나머지는 자리표시자 */
const SLIDES = [
  {
    id: "origin",
    point: "Point 01",
    title: "철저한 원육 선별",
    desc: "우리의 곱창은 단순히 음식을 넘어, 매일 아침 도축장에서부터 시작되는 엄격한 품질 관리를 통해 완성됩니다. 고객에게 가장 깨끗하고 신선한 한우 곱창만을 선보이겠다는 약속을 지키기 위해 우리는 매일 아침 끊임없이 노력합니다.",
    image: "/images/brand/value1.png",
  },
  {
    id: "aging",
    point: "Point 02",
    title: "시간이 빚는 숙성",
    desc: "특제 과일 효소와 함께 저온에서 천천히 숙성시킵니다. 서두르지 않는 시간이 곱창 본연의 고소함을 끌어올리고, 입안에서 부드럽게 풀리는 식감을 완성합니다.",
    image: "/images/brand/g2.png",
  },
  {
    id: "fire",
    point: "Point 03",
    title: "불을 다루는 기술",
    desc: "초고온 화로 위에서 겉은 바삭하고 속은 촉촉한 순간을 잡아냅니다. 숙련된 그릴러가 굽기의 정점을 판단해 가장 맛있는 상태로 테이블에 올립니다.",
    image: "/images/brand/g3.png",
  },
  {
    id: "service",
    point: "Point 04",
    title: "끝까지 살피는 응대",
    desc: "메뉴를 내어드리는 순간부터 자리를 정리하는 순간까지, 손님의 속도에 맞춰 움직입니다. 세심한 응대가 미식의 시간을 온전하게 만듭니다.",
    image: "/images/brand/g4.png",
  },
];

const N = SLIDES.length;

export default function BrandValue() {
  const { isCompact } = useBreakpoint();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];

  const move = (dir) => setIndex((v) => (v + dir + N) % N);

  return (
    /* 앞이 검은 블록이라 위에도 200 을 준다.
       마지막 섹션이므로 아래는 푸터와의 간격 200. */
    <section className="w-full bg-white px-[20px] pt-[100px] pb-[100px] sm:px-[24px] md:px-[40px] md:pt-[150px] md:pb-[150px] lg:pt-[200px] lg:pb-[200px]">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-[32px] font-pretendard md:gap-[40px]">
        {/* Figma 332:991 — 헤더 */}
        <div className="flex w-full max-w-[666px] flex-col items-start gap-[14px] lg:gap-[24px]">
          {/* Figma 332:992 — Pretendard Medium 20 / lh 30 / -0.5 / #e61911 */}
          <Reveal y={16} duration={600}>
            <p className="text-[15px] leading-[22px] font-medium tracking-[-0.38px] text-[#e61911] md:text-[18px] lg:text-[20px] lg:leading-[30px] lg:tracking-[-0.5px]">
              CORE VALUE
            </p>
          </Reveal>
          {/* Figma 332:994 — Pretendard Bold 46 / lh 60 / -1.15 / 검정 */}
          <h2 className="text-[clamp(24px,5.2vw,46px)] leading-[1.3] font-bold tracking-[-0.025em] text-black">
            <RevealText lines={["브랜드가 약속하는 최상의 맛과 가치"]} delay={80} step={22} />
          </h2>
          {/* Figma 332:995 — Pretendard Regular 18 / lh 26 / -0.45 / #767676 */}
          <Reveal delay={360} y={16} duration={600}>
            <p className="text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[16px] lg:text-[18px] lg:leading-[26px] lg:tracking-[-0.45px]">
              정직한 식재료와 장인의 손길로 완성되는 프리미엄 곱창의 표준을 제시합니다.
            </p>
          </Reveal>
        </div>

        {/* Figma 332:997 — 사진 + 본문, gap 28 */}
        <div className="flex w-full flex-col gap-[20px] lg:flex-row lg:items-center lg:gap-[28px]">
          {/* Figma 332:998 — 642 x 380, radius 16 */}
          <div
            className="relative w-full shrink-0 overflow-hidden rounded-[16px] bg-[#d9d9d9]"
            style={{
              width: isCompact ? undefined : PHOTO_W,
              height: isCompact ? undefined : PHOTO_H,
              aspectRatio: isCompact ? `${PHOTO_W} / ${PHOTO_H}` : undefined,
            }}
          >
            {SLIDES.map((s, i) => (
              <img
                key={s.id}
                src={s.image}
                alt=""
                className="absolute inset-0 size-full object-cover transition-opacity duration-700 ease-out"
                style={{ opacity: i === index ? 1 : 0 }}
              />
            ))}
            {/* Figma — fill rgba(0,0,0,0.2) */}
            <div aria-hidden className="absolute inset-0 bg-[rgba(0,0,0,0.2)]" />
          </div>

          {/* Figma 332:999 — 776 폭, p 40, 세로 gap 80 */}
          <div className="flex w-full flex-col items-start gap-[32px] lg:w-[776px] lg:shrink-0 lg:gap-[80px] lg:p-[40px]">
            <div className="flex w-full flex-col items-start gap-[14px] lg:gap-[20px]">
              {/* Figma 332:1001 — 배지 + 소제목, gap 12 */}
              <div className="flex flex-wrap items-center gap-[12px]">
                {/* Figma 332:1002 — bg #e61911, px 22 / py 8, radius 999 */}
                <span className="rounded-[999px] bg-[#e61911] px-[18px] py-[6px] text-[14px] leading-[22px] font-medium tracking-[-0.35px] whitespace-nowrap text-white md:px-[22px] md:py-[8px] md:text-[16px] md:leading-[24px] md:tracking-[-0.4px]">
                  {slide.point}
                </span>
                {/* Figma 332:1004 — Pretendard Bold 28 / lh 36 / -0.7 / #222 */}
                <p className="text-[20px] leading-[28px] font-bold tracking-[-0.5px] text-[#222] md:text-[24px] lg:text-[28px] lg:leading-[36px] lg:tracking-[-0.7px]">
                  {slide.title}
                </p>
              </div>

              {/* Figma 332:1005 — Pretendard Regular 18 / lh 26 / -0.45 / #767676 */}
              <p
                key={slide.id}
                className="w-full text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[16px] md:leading-[24px] lg:text-[18px] lg:leading-[26px] lg:tracking-[-0.45px]"
              >
                {slide.desc}
              </p>
            </div>

            {/* Figma 332:1006 — 카운터 + 버튼, gap 24 */}
            <div className="flex items-center gap-[24px]">
              <div className="flex items-center gap-[12px]">
                <p className="text-[16px] leading-[24px] font-medium tracking-[-0.4px] text-[#222]">
                  {index + 1}
                </p>
                <div
                  className="h-[2px] overflow-hidden rounded-[9999px] bg-[#f6f7fb]"
                  style={{ width: TRACK_W }}
                >
                  <div
                    className="h-full origin-left rounded-[9999px] bg-[#222] transition-transform duration-500 ease-out"
                    style={{ width: TRACK_W, transform: `scaleX(${(index + 1) / N})` }}
                  />
                </div>
                <p className="text-[16px] leading-[24px] font-medium tracking-[-0.4px] text-[#999]">
                  {N}
                </p>
              </div>

              <div className="flex items-center gap-[12px]">
                {[
                  { dir: -1, label: "이전 항목", rotate: 180 },
                  { dir: 1, label: "다음 항목", rotate: 0 },
                ].map((btn) => {
                  const button = (
                    <button
                      type="button"
                      aria-label={btn.label}
                      onClick={() => move(btn.dir)}
                      className="group flex size-[44px] items-center justify-center rounded-[9999px] border border-solid border-[#e5e5ec] bg-white transition-colors duration-300 hover:border-[#222] hover:bg-[#222] md:size-[52px]"
                    >
                      <img
                        src="/images/collection/arrow.svg"
                        alt=""
                        aria-hidden
                        className="size-[20px] transition-[filter] duration-300 group-hover:invert md:size-[22px]"
                        style={{ transform: `rotate(${btn.rotate}deg)` }}
                      />
                    </button>
                  );
                  return isCompact ? (
                    <div key={btn.dir}>{button}</div>
                  ) : (
                    <Magnetic key={btn.dir} strength={0.4}>
                      {button}
                    </Magnetic>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
