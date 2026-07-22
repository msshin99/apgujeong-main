import { useCallback, useEffect, useRef, useState } from "react";
import Reveal, { RevealText } from "../Reveal.jsx";
import Img from "../Img.jsx";
import { asset } from "../lib/asset.js";

/**
 * Figma: Frame 332:1457 — 와인 리스트 페이지의 커버플로우 슬라이드.
 *
 *   헤더(gap 20 / 내부 12) → 40 → 슬라이드 → 16 → 이름·가격 → 48 → 화살표
 *
 *   가운데 카드 402 x 540, 양옆 카드 300 x 403.
 *   가운데-이웃 사이 32, 이웃끼리 12.
 *   두 카드의 비율이 402/540 = 300/403 으로 같아서
 *   width/height 를 애니메이션하지 않고 scale 하나로 전환할 수 있다(레이아웃 리플로우 없음).
 */
const CENTER_W = 402;
const CENTER_H = 540;
const SIDE_W = 300;
const CENTER_GAP = 32;
const SIDE_GAP = 12;

/** 300/402 — 옆 카드는 가운데 카드를 이만큼 줄인 것과 정확히 같다 */
const SIDE_SCALE = SIDE_W / CENTER_W;

/** 가운데에서 n번째 카드의 중심까지 거리(px) */
function offsetOf(n) {
  if (n === 0) return 0;
  const step = CENTER_W / 2 + CENTER_GAP + SIDE_W / 2; // 383
  return Math.sign(n) * (step + (Math.abs(n) - 1) * (SIDE_W + SIDE_GAP)); // +312씩
}

/**
 * 가운데를 기준으로 좌우 5장씩, 총 11개 슬롯(HALF*2+1)을 그린다.
 * 눈에 보이는 것은 좌우 3장까지(3번째는 opacityOf 로 반쯤 흐려지며 화면 밖으로 잘린다)이고,
 * 4~5번째는 투명도 0 인 대기석이다.
 *
 * 카드를 "슬롯"이 아니라 "와인"에 묶어야 한 칸씩 옆으로 밀려나는 움직임이 나온다.
 * 슬롯에 묶으면 자리는 그대로인 채 사진만 갈리므로 툭툭 끊겨 보인다.
 * 대신 양 끝에서는 카드가 새로 생기고 사라지는데, 그 자리를 투명도 0 으로 두어
 * 생성·소멸이 보이지 않게 감춘다.
 */
const HALF = 5;
const SLOTS = Array.from({ length: HALF * 2 + 1 }, (_, i) => i - HALF); // 길이 11

/** 슬롯 위치별 투명도 — 4번째부터는 대기석이라 보이지 않는다 */
function opacityOf(n) {
  const a = Math.abs(n);
  if (a <= 2) return 1;
  if (a === 3) return 0.55;
  return 0;
}

const mod = (n, m) => ((n % m) + m) % m;

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const DURATION = 700;

/** 드래그로 다음 장으로 넘어가는 최소 거리 */
const DRAG_THRESHOLD = 60;

/**
 * 와인 목록. 사진은 Figma 에셋 5장을 그대로 받아 왔다.
 * 슬롯이 11개(가운데 + 좌우 5장)라 5장이 순환하며 가장자리(잘리는 자리)에서 반복되는데,
 * 이는 Figma 시안도 동일하게 같은 사진을 재사용한 구성이다.
 */
const WINES = [
  {
    en: "Woodstock Collett Lane",
    ko: "우드스톡 콜렛레인 까버네쇼비뇽",
    price: "130,000원",
    image: asset("/images/wine/w4.png"),
  },
  {
    en: "Moët & Chandon Ice Impérial",
    ko: "모엣 샹동 아이스 앵페리얼",
    price: "150,000원",
    image: asset("/images/wine/w1.png"),
  },
  {
    en: "Jacob's Creek Sparkling Rosé",
    ko: "제이콥스 크릭 스파클링 로제",
    price: "90,000원",
    image: asset("/images/wine/w2.png"),
  },
  {
    en: "Dom Pérignon Luminous",
    ko: "돔 페리뇽 루미너스",
    price: "480,000원",
    image: asset("/images/wine/w3.png"),
  },
  {
    en: "Bottega Gold Prosecco",
    ko: "보테가 골드 프로세코",
    price: "120,000원",
    image: asset("/images/wine/w5.png"),
  },
];

/** Figma 332:1495 — 52px 원형 버튼. 화살표는 22px 셰브론 */
function ArrowButton({ dir, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      /* 키보드로 넘길 때 지금 어느 화살표에 있는지 보이도록 초점 테두리를 남긴다 */
      className="group flex size-[46px] items-center justify-center rounded-full border border-[#e5e5ec] bg-white transition-colors duration-300 hover:border-[#e61911] hover:bg-[#e61911] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e61911] md:size-[52px]"
    >
      <svg
        viewBox="0 0 22 22"
        aria-hidden
        className={`size-[20px] transition-transform duration-300 md:size-[22px] ${
          dir === "prev" ? "rotate-180 group-hover:-translate-x-[2px]" : "group-hover:translate-x-[2px]"
        }`}
      >
        <path
          d="M7.33333 18.3333L14.6667 11L7.33333 3.66667"
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-[#999999] transition-colors duration-300 group-hover:stroke-white"
        />
      </svg>
    </button>
  );
}

export default function WineSlider() {
  /* 0..N-1 로 접지 않고 계속 늘어나는 값. 접으면 끝에서 되감길 때
     카드가 반대편으로 순간이동해 버린다. */
  const [pos, setPos] = useState(0);
  const active = mod(pos, WINES.length);

  /* 시안은 1560 폭을 기준으로 그려져 있다. 좁은 화면에서는 통째로 축소해
     카드 사이 여백 비율이 무너지지 않게 한다(비율이 같으니 겹칠 일이 없다). */
  const stageRef = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setScale(Math.min(1, Math.max(0.48, w / 1560)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const move = useCallback((delta) => {
    setPos((p) => p + delta);
  }, []);

  // 좌우 방향키로도 넘길 수 있게 한다
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") move(-1);
      else if (e.key === "ArrowRight") move(1);
    };
    const el = stageRef.current;
    el?.addEventListener("keydown", onKey);
    return () => el?.removeEventListener("keydown", onKey);
  }, [move]);

  /* 드래그. 화면 밖으로 나가도 끝까지 따라오도록 포인터를 캡처한다 */
  const dragRef = useRef(null);
  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    dragRef.current = { x: e.clientX, done: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || d.done) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) < DRAG_THRESHOLD * scale) return;
    d.done = true; // 한 번 끌 때 한 장만
    move(dx < 0 ? 1 : -1);
  };
  const endDrag = (e) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const current = WINES[active];

  return (
    <div className="w-full overflow-hidden bg-white px-[20px] pt-[100px] pb-[100px] sm:px-[24px] md:px-[40px] md:pt-[150px] md:pb-[150px] lg:pt-[200px] lg:pb-[200px]">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col items-center gap-[28px] font-pretendard md:gap-[40px]">
        {/* Figma 332:1458 — 헤더 */}
        <div className="flex w-full flex-col items-center gap-[12px] text-center md:gap-[20px]">
          <Reveal y={16} duration={600}>
            <p className="text-[15px] leading-[22px] font-medium tracking-[-0.38px] text-[#e61911] md:text-[18px] lg:text-[20px] lg:leading-[30px] lg:tracking-[-0.5px]">
              Premium Wine
            </p>
          </Reveal>
          <div className="flex w-full flex-col items-center gap-[8px] md:gap-[12px]">
            {/* Figma 332:1461 — Pretendard Bold 46 / lh 60 / -1.15 / uppercase */}
            <h2 className="text-[clamp(26px,5.6vw,46px)] leading-[1.3] font-bold tracking-[-0.025em] text-black uppercase">
              <RevealText lines={["Premium Wine"]} delay={80} step={26} />
            </h2>
            <Reveal delay={300} y={16} duration={600}>
              <p className="text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[16px] lg:text-[18px] lg:leading-[26px] lg:tracking-[-0.45px]">
                진심을 담은 고집이 만들어낸 최상의 풍미와 서비스
              </p>
            </Reveal>
          </div>
        </div>

        {/* Figma 332:1463 — 슬라이드 + 캡션 + 화살표 */}
        <div className="flex w-full flex-col items-center gap-[28px] md:gap-[48px]">
          <div className="flex w-full flex-col items-center gap-[16px]">
            {/* 무대: 카드는 모두 402x540 한 크기이고 scale 로만 크기가 갈린다 */}
            <div
              ref={stageRef}
              tabIndex={0}
              role="group"
              aria-roledescription="carousel"
              aria-label="프리미엄 와인"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              /* 탭으로 가장 먼저 닿는 곳이자 좌우 방향키가 실제로 걸린 곳이다.
                 화살표 버튼과 같은 초점 테두리를 줘 지금 여기 있다는 걸 보이게 한다 */
              className="relative w-full cursor-grab touch-pan-y select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e61911] active:cursor-grabbing"
              style={{ height: CENTER_H * scale }}
            >
              {SLOTS.map((slot) => {
                /* key 를 슬롯이 아니라 이 카드가 맡은 와인 순번(seat)에 건다.
                   그래야 pos 가 1 늘었을 때 같은 DOM 이 살아남아 옆자리로 미끄러진다. */
                const seat = pos + slot;
                const wine = WINES[mod(seat, WINES.length)];
                const isCenter = slot === 0;
                const k = (isCenter ? 1 : SIDE_SCALE) * scale;

                return (
                  <div
                    key={seat}
                    aria-hidden={!isCenter}
                    className="absolute top-1/2 left-1/2"
                    style={{
                      width: CENTER_W,
                      height: CENTER_H,
                      // translate(-50%,-50%) 이후의 translateX 는 scale 영향을 받지 않는다
                      transform: `translate(-50%, -50%) translateX(${offsetOf(slot) * scale}px) scale(${k})`,
                      transition: `transform ${DURATION}ms ${EASE}, opacity ${DURATION}ms ${EASE}`,
                      opacity: opacityOf(slot),
                      zIndex: 10 - Math.abs(slot),
                      willChange: "transform",
                    }}
                  >
                    <div className="flex size-full items-center justify-center overflow-hidden bg-[#f6f7fb]">
                      <Img
                        src={wine.image}
                        alt={isCenter ? wine.ko : ""}
                        draggable={false}
                        /* 슬라이드는 대표 이미지 아래라 첫 화면에 보이지 않는다.
                           같은 사진 5장이 슬롯 11개에 반복되므로 한 번 받으면 나머지는 캐시로 붙는다 */
                        loading="lazy"
                        decoding="async"
                        /* 누끼 사진이라 box-shadow 대신 실루엣을 따라가는 drop-shadow 를 쓴다.
                           가운데로 올라온 병만 그림자가 짙어져 앞으로 나온 느낌을 준다. */
                        className="max-h-[80%] w-auto max-w-[60%] object-contain"
                        style={{
                          filter: `drop-shadow(16px 12px 10px rgba(0,0,0,${isCenter ? 0.2 : 0.12}))`,
                          transition: `filter ${DURATION}ms ${EASE}`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Figma 332:1489 — 캡션. 장이 바뀔 때 아래에서 올라오며 교체된다 */}
            <div className="flex w-full flex-col items-center gap-[12px] text-center md:gap-[16px]">
              <div
                key={active}
                className="flex flex-col items-center gap-[4px]"
                style={{ animation: `wine-caption ${DURATION}ms ${EASE} both` }}
              >
                <p className="text-[19px] leading-[28px] font-semibold tracking-[-0.48px] text-black md:text-[24px] md:leading-[34px] md:tracking-[-0.6px]">
                  {current.en}
                </p>
                <p className="text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[16px] md:leading-[24px] md:tracking-[-0.4px]">
                  {current.ko}
                </p>
                <p className="mt-[8px] text-[16px] leading-[24px] font-medium tracking-[-0.4px] text-[#e61911] md:mt-[12px] md:text-[18px] md:leading-[26px] md:tracking-[-0.45px]">
                  {current.price}
                </p>
              </div>
            </div>
          </div>

          {/* Figma 332:1494 — 화살표 + (좁은 화면에서는) 현재 위치 표시.
             위치 표시는 isCompact(1200 미만) 분기를 CSS 로 옮긴 것 —
             항상 DOM 에 있고 min-[1200px] 부터 display:none 이라
             프리렌더/하이드레이션 트리가 어긋나지 않는다. */}
          <div className="flex items-center gap-[12px]">
            <ArrowButton dir="prev" label="이전 슬라이드" onClick={() => move(-1)} />
            <span className="min-w-[52px] text-center text-[14px] font-medium tracking-[-0.35px] text-[#767676] tabular-nums min-[1200px]:hidden">
              {active + 1} / {WINES.length}
            </span>
            <ArrowButton dir="next" label="다음 슬라이드" onClick={() => move(1)} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes wine-caption {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}
