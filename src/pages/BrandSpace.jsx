import { useState } from "react";
import Reveal, { RevealText } from "../Reveal.jsx";
import { Magnetic } from "../Tilt.jsx";
import Img from "../Img.jsx";
import { asset } from "../lib/asset.js";

/**
 * Figma: Frame 1707487804 (332:1094) — 1336 x 720, 가로 flex gap 60
 *
 *   왼쪽 332:1095  w 620, 세로 gap 80
 *     ├ 본문 332:1096  gap 56
 *     │   ├ 라벨 + 제목 + 설명 (gap 24 / 16)
 *     │   └ 해시태그 332:1103  gap 8, pill bg #f6f7fb
 *     └ 컨트롤 332:1110  w 281, gap 24 — "1 ▬ 4" + 화살표 버튼 2개
 *   오른쪽 332:1126  656 x 720 사진 (rgba(0,0,0,0.2) 오버레이)
 *
 * 피그마에는 1번 슬라이드만 있고 카운터가 "1 / 4" 이라 4장짜리 슬라이더로 만들었다.
 * 2~4번 문구·사진은 자리표시자다.
 *
 * 예전에는 1200 이상용(사진 656x720 고정)과 1200 미만용(aspect 박스)을 isCompact 로 갈랐다.
 * 두 분기를 CSS 로만 흐르는 **한 벌**로 합친다 — compact 쪽 방식(비율 박스)을 위로 끌어올린다.
 *   · 사진   — 어느 폭에서든 aspect-[656/720] 비율 박스. 데스크톱(1336 컨테이너)에서
 *              좌측 620 + gap 60 을 뺀 나머지 656 을 정확히 채워 피그마와 일치한다.
 *   · 진행바 — TRACK_W(98px) 고정 대신 폭에 따라 단계적으로 주고, scaleX 애니메이션은 그대로.
 * 자석 버튼(Magnetic)은 정밀 포인터에서만 켜지도록 내부에서 이미 판단하므로 폭 분기가 필요 없다.
 */
const SLIDES = [
  {
    id: "space",
    label: "SPACE & MOOD",
    title: ["일상의 휴식이 되는", "味(미)의 공간"],
    desc: ["단순한 식사를 넘어, 미각과 시각이 조화를 이루는 미니멀하고", "세련된 공간에서 깊은 풍미를 경험하세요."],
    tags: ["#미니멀리즘", "#식사경험", "#공간디자인"],
    image: asset("/images/brand/space1.png"),
  },
  // --- 아래 3장은 자리표시자 ---
  {
    id: "fire",
    label: "FIRE & CRAFT",
    title: ["불에서 완성되는", "本(본)연의 맛"],
    desc: ["초고온 화로가 만들어내는 겉바속촉의 정점을,", "숙련된 그릴러의 손끝에서 경험하세요."],
    tags: ["#숯불", "#굽기", "#그릴러"],
    image: asset("/images/brand/g3.png"),
  },
  {
    id: "table",
    label: "TABLE & PAIRING",
    title: ["한 잔이 더해지는", "格(격)의 시간"],
    desc: ["엄선한 와인과 곱창의 만남으로", "익숙한 한 끼를 특별한 자리로 바꿉니다."],
    tags: ["#와인페어링", "#테이블", "#다이닝"],
    image: asset("/images/brand/g4.png"),
  },
  {
    id: "care",
    label: "CARE & SERVICE",
    title: ["끝까지 살피는", "誠(성)의 서비스"],
    desc: ["가장 맛있는 순간에 맞춰 내어드리는", "세심한 응대로 미식의 시간을 완성합니다."],
    tags: ["#환대", "#응대", "#디테일"],
    image: asset("/images/brand/g2.png"),
  },
];

const N = SLIDES.length;

export default function BrandSpace() {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];

  const move = (dir) => setIndex((v) => (v + dir + N) % N);

  /* Figma 332:1112 — "1 ▬ 4" 진행 표시.
     트랙은 폭에 따라 단계적으로(데스크톱 상한 = 피그마 98px), 채움 막대는 w-full 로 두고
     scaleX 로 (현재+1)/N 만큼 좌측 기준으로 늘린다 — 폭이 바뀌어도 비율 그대로 따라간다. */
  const counter = (
    <div className="flex items-center gap-[12px]">
      <p className="text-[16px] leading-[24px] font-medium tracking-[-0.4px] text-[#222]">
        {index + 1}
      </p>
      <div className="h-[2px] w-[72px] overflow-hidden rounded-[9999px] bg-[#f6f7fb] md:w-[98px]">
        <div
          className="h-full w-full origin-left rounded-[9999px] bg-[#222] transition-transform duration-500 ease-out"
          style={{ transform: `scaleX(${(index + 1) / N})` }}
        />
      </div>
      <p className="text-[16px] leading-[24px] font-medium tracking-[-0.4px] text-[#999]">{N}</p>
    </div>
  );

  /* Figma 332:1117 — 화살표 버튼 2개. Magnetic 은 정밀 포인터가 아닐 때 children 을
     그대로 감싸 내보내므로, 어느 폭에서든 그대로 써도 터치 환경에서 아무 일도 하지 않는다. */
  const buttons = (
    <div className="flex items-center gap-[12px]">
      {[
        { dir: -1, label: "이전 슬라이드", rotate: 180 },
        { dir: 1, label: "다음 슬라이드", rotate: 0 },
      ].map((btn) => (
        <Magnetic key={btn.dir} strength={0.4}>
          <button
            type="button"
            aria-label={btn.label}
            onClick={() => move(btn.dir)}
            className="group flex size-[44px] items-center justify-center rounded-[9999px] border border-solid border-[#e5e5ec] bg-white transition-colors duration-300 hover:border-[#222] hover:bg-[#222] md:size-[52px]"
          >
            <img
              src={asset("/images/collection/arrow.svg")}
              alt=""
              aria-hidden
              className="size-[20px] transition-[filter] duration-300 group-hover:invert md:size-[22px]"
              style={{ transform: `rotate(${btn.rotate}deg)` }}
            />
          </button>
        </Magnetic>
      ))}
    </div>
  );

  return (
    /* 다음이 검은 블록이라 아래에도 200 을 준다.
       컬러 블록의 안쪽 여백만으로는 사진이 검정과 맞붙어 보인다. */
    <section className="w-full bg-white px-[20px] pt-[100px] pb-[100px] sm:px-[24px] md:px-[40px] md:pt-[150px] md:pb-[150px] xl:pt-[200px] xl:pb-[200px]">
      <div className="mx-auto flex w-full max-w-[1336px] flex-col items-start gap-[40px] font-pretendard xl:flex-row xl:items-center xl:gap-[60px]">
        {/* Figma 332:1095 — 왼쪽 본문 */}
        <div className="flex w-full flex-col items-start gap-[40px] xl:w-[620px] xl:shrink-0 xl:gap-[80px]">
          <div className="flex w-full flex-col items-start gap-[28px] xl:gap-[56px]">
            <div className="flex w-full flex-col items-start gap-[16px] xl:gap-[24px]">
              {/* Figma 332:1099 — Pretendard Medium 20 / lh 30 / -0.5 / #e61911 */}
              <Reveal y={16} duration={600}>
                <p className="text-[15px] leading-[22px] font-medium tracking-[-0.38px] text-[#e61911] md:text-[18px] xl:text-[20px] xl:leading-[30px] xl:tracking-[-0.5px]">
                  {slide.label}
                </p>
              </Reveal>

              <div className="flex w-full flex-col items-start gap-[12px] xl:gap-[16px]">
                {/* Figma 332:1101 — Pretendard Bold 46 / lh 60 / -1.15 / 검정.
                    clamp 로 폭에 따라 유동, 데스크톱 상한은 피그마 46px 그대로. */}
                <h2
                  key={`${slide.id}-title`}
                  className="text-[clamp(24px,5.2vw,46px)] leading-[1.3] font-bold tracking-[-0.025em] text-black"
                >
                  <RevealText lines={slide.title} delay={60} step={22} />
                </h2>
                {/* Figma 332:1102 — Pretendard Regular 18 / lh 26 / -0.45 / #767676 */}
                <p
                  key={`${slide.id}-desc`}
                  className="text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[16px] xl:text-[18px] xl:leading-[26px] xl:tracking-[-0.45px]"
                >
                  {slide.desc.map((line, i) => (
                    <span key={i} className="block">
                      {line}
                    </span>
                  ))}
                </p>
              </div>
            </div>

            {/* Figma 332:1103 — 해시태그 pill, gap 8 */}
            <div className="flex flex-wrap items-center gap-[8px]">
              {slide.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-[999px] bg-[#f6f7fb] px-[18px] py-[10px] text-[14px] leading-[22px] font-medium tracking-[-0.35px] whitespace-nowrap text-[#767676] transition-colors duration-300 hover:bg-[#ececf2] hover:text-[#222] md:px-[24px] md:py-[12px] md:text-[16px] md:leading-[24px] md:tracking-[-0.4px]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Figma 332:1110 — 카운터 + 버튼, gap 24 */}
          <div className="flex items-center gap-[24px]">
            {counter}
            {buttons}
          </div>
        </div>

        {/* Figma 332:1126 — 656 x 720 사진. 어느 폭에서든 같은 비율 박스로 흐르고,
            데스크톱(flex-row)에서는 좌측 620 + gap 60 을 뺀 나머지를 채워 피그마 656 과 맞는다.
            슬라이드끼리 교차 페이드. */}
        <div className="relative w-full overflow-hidden bg-[#d9d9d9] aspect-[656/720] xl:min-w-0 xl:flex-1">
          {SLIDES.map((s, i) => (
            // 네 장이 항상 붙어 있어야 교차 페이드가 되므로 언마운트는 하지 않는다.
            // 대신 첫 장만 먼저 받고 나머지는 미뤄서 초기 로딩을 가볍게 한다
            <Img
              key={s.id}
              src={s.image}
              alt=""
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className="absolute inset-0 size-full object-cover transition-opacity duration-700 ease-out"
              style={{ opacity: i === index ? 1 : 0 }}
            />
          ))}
          {/* Figma — fill rgba(0,0,0,0.2) */}
          <div aria-hidden className="absolute inset-0 bg-[rgba(0,0,0,0.2)]" />
        </div>
      </div>
    </section>
  );
}
