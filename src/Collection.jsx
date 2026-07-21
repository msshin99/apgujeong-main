import { useEffect, useLayoutEffect, useRef } from "react";
import { DESIGN_W, useWidthScale } from "./useCanvasScale.js";
import Reveal, { RevealText } from "./Reveal.jsx";
import { Magnetic } from "./Tilt.jsx";
import { useBreakpoint } from "./useBreakpoint.js";
import Img from "./Img.jsx";
import { asset } from "./lib/asset.js";

/**
 * Figma: Group 1707481198 (332:784) — 2536 x 866 (페이지 y 8106 기준)
 *
 *   헤더        332:796  y 64  / w 1680 / gap 24
 *   카드 스트립 332:786  y 223 / 320x420 카드 7장, gap 24
 *   흰 타원 2개 332:795 / 794 — 2536 x 283, 위(y 0) · 아래(y 583)
 *   슬라이드 버튼 332:801 y 673 / 52 원형 2개, gap 12
 *
 * 핵심: 카드는 회전도 원근도 없는 평범한 420 높이 사각형이다.
 * 사다리꼴처럼 보이는 건 위아래 흰 타원이 카드의 왼쪽과 오른쪽을
 * 서로 다른 높이로 잘라내기 때문이고, 띠 전체가 부드러운 곡선을 이룬다.
 * (3D 회전을 주면 끝이 각지고 카드 사이가 벌어져 오히려 어긋난다)
 */
const CARD_W = 320;
const CARD_H = 420;
const CARD_GAP = 24;
const STEP = CARD_W + CARD_GAP; // 344

const STRIP_TOP = 223; // Figma 8328.98 - 8106

/**
 * 띠의 곡선.
 *
 * Figma 의 스트립(332:786)만 따로 렌더링해 보면, 카드는 잘려 있지 않고
 * 저마다 조금씩 "회전한 온전한 사각형"이다. 네 변이 모두 직선이라 모서리가 깔끔하다.
 * 흰 타원으로 곡선을 파내면 카드 안에서 곡선이 꺾이며 각진 모서리가 생긴다.
 *
 * 그래서 각 카드를 clip-path 사다리꼴로 자른다.
 *   - 카드 안에서는 위·아래 변이 직선(곡선의 현)이라 꺾이는 지점이 없다
 *   - 기울기가 바뀌는 곳은 카드 사이 24px 간격뿐이라 눈에 띄지 않는다
 *   - 이어 붙이면 전체가 부드러운 곡선이 된다
 *
 * 곡선은 Figma 의 흰 타원(2536 x 283)이 만들던 파임을 포물선으로 근사한다.
 * 타원식을 그대로 쓰면 |x| > 1037 구간이 평평해져 그 경계가 카드 안에서 꺾인다.
 */
const CURVE_HALF_SPAN = 1268; // Figma 타원 반폭
const CUT_DEPTH = 60; // Figma 실측 — 중앙에서 파고드는 깊이

/** 가로 위치 x 에서 위(또는 아래)로 파이는 깊이 */
const cutAt = (x) => {
  const t = Math.min(Math.abs(x) / CURVE_HALF_SPAN, 1);
  return CUT_DEPTH * (1 - t * t);
};

const HEADER_TOP = 64; // Figma 8170 - 8106
const NAV_TOP = 673; // Figma 8779 - 8106

const SECTION_H = 866;
const PAD_TOP = 200; // Figma 상 앞 구간(y 7906)과의 간격
const PAD_BOTTOM = 200;

const DAMPING = 0.11; // 작을수록 더 느긋하게 따라온다
const AUTO_SPEED = 0.16; // 초당 흘러가는 칸 수 — 무한 반복 슬라이드
const DRAG_AREA_W = 4000; // 드래그를 받는 판의 폭 (화면보다 넓게)

const CARDS = [
  { id: "c1", image: asset("/images/collection/c1.png") },
  { id: "c2", image: asset("/images/collection/c2.png") },
  { id: "c3", image: asset("/images/collection/c3.png") },
  { id: "c4", image: asset("/images/collection/c4.png") },
  { id: "c5", image: asset("/images/collection/c5.png") },
  { id: "c6", image: asset("/images/collection/c6.png") },
  { id: "c7", image: asset("/images/collection/c7.png") },
];

/**
 * 같은 목록을 두 벌 이어 붙여 순환 주기를 화면보다 훨씬 길게 만든다.
 * 한 벌(7장 = 2408px)만 쓰면 주기가 화면 폭과 비슷해서
 * 카드가 반대편으로 넘어가는 순간이 그대로 보인다.
 */
const ITEMS = [...CARDS, ...CARDS];
const N = ITEMS.length; // 14
const HALF = N / 2; // 7 — 순환 이음매는 중심에서 2408px, 화면 밖이다

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

/** 연속 거리값을 -N/2 ~ N/2 로 접는다 */
const wrapOffset = (v) => {
  const d = ((v % N) + N) % N;
  return d > HALF ? d - N : d;
};

export default function Collection() {
  const scale = useWidthScale();
  const { isCompact, isMobile } = useBreakpoint();
  const totalH = SECTION_H + PAD_TOP + PAD_BOTTOM;

  const cardRefs = useRef([]);
  const target = useRef(0); // 목표 위치(칸 단위)
  const pos = useRef(0); // 실제로 그려지는 위치
  const raf = useRef(0);
  const lastTime = useRef(0);
  const drag = useRef(null); // { startX, startTarget, moved }
  const autoOn = useRef(true);

  /* 카드 치수는 분기점마다 다르다. rAF 루프가 첫 렌더의 클로저를 계속 쓰므로
     값은 ref 에 담아 두고 매 렌더 갱신한다. */
  const dims = useRef(null);
  dims.current = isMobile
    ? { w: 220, h: 289, step: 236, curve: false }
    : isCompact
      ? { w: 260, h: 341, step: 280, curve: false }
      : { w: CARD_W, h: CARD_H, step: STEP, curve: true };

  /** 연속 위치 p 에 맞춰 카드를 배치하고, 띠 곡선에 맞춰 사다리꼴로 자른다 */
  const draw = (p) => {
    const { w, h, step, curve } = dims.current;
    ITEMS.forEach((_, i) => {
      const el = cardRefs.current[i];
      if (!el) return;

      const cx = wrapOffset(i - p) * step;
      el.style.transform = `translate3d(${cx}px, 0, 0)`;

      if (!curve) {
        // 좁은 화면에서는 띠가 짧아 곡선이 어색하고, 매 프레임 clip 계산도 부담이다
        el.style.clipPath = "none";
        return;
      }
      // 카드 좌우 끝에서의 파임 깊이 → 위·아래 변이 각각 직선이 된다
      const l = cutAt(cx - w / 2);
      const r = cutAt(cx + w / 2);
      el.style.clipPath =
        `polygon(0px ${l}px, ${w}px ${r}px,` + ` ${w}px ${h - r}px, 0px ${h - l}px)`;
    });
  };

  /**
   *   target 은 매 프레임 AUTO_SPEED 만큼 자동으로 흘러간다 (무한 반복)
   *   pos 는 target 을 감쇠 보간으로 따라간다 → 버튼·드래그가 끼어들어도 부드럽다
   * 드래그 중에는 자동 흐름을 멈추고 손가락 위치를 그대로 따른다.
   *
   * 자동 흐름이 꺼진 상태(모션 최소화)에서 목표까지 다 따라잡았으면 루프를 쉬게 한다.
   * 14장의 transform·clip-path 를 아무 변화 없이 매 프레임 다시 계산할 이유가 없다.
   * 버튼·드래그가 들어오면 start() 로 되살린다.
   */
  const tick = (now) => {
    const dt = lastTime.current
      ? Math.min((now - lastTime.current) / 1000, 0.1)
      : 0;
    lastTime.current = now;

    if (autoOn.current && !drag.current) target.current += AUTO_SPEED * dt;

    const diff = target.current - pos.current;
    if (drag.current) {
      pos.current = target.current; // 드래그 중에는 지연 없이 손을 따라간다
    } else if (!autoOn.current && Math.abs(diff) < 0.0005) {
      pos.current = target.current;
      draw(pos.current);
      raf.current = 0;
      lastTime.current = 0; // 다음 재개 때 dt 가 크게 튀지 않도록
      return;
    } else {
      pos.current += diff * DAMPING;
    }

    draw(pos.current);
    raf.current = requestAnimationFrame(tick);
  };

  const start = () => {
    if (!raf.current) raf.current = requestAnimationFrame(tick);
  };

  /* 분기가 바뀌면 카드 DOM 이 통째로 새로 만들어져 인라인 transform·clipPath 가 없다.
     루프는 모션 최소화 설정에서 스스로 멈춰 있을 수 있으므로(tick 참고) 다음 프레임이
     대신 그려 주리라 기대할 수 없다 — 여기서 직접 다시 배치한다.
     페인트 전에 끝내야 14 장이 화면 가운데 겹쳐 보이는 한 프레임이 생기지 않는다. */
  useLayoutEffect(() => {
    draw(pos.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompact, isMobile]);

  useEffect(() => {
    // 접근성: 모션을 줄이도록 설정한 사용자에게는 자동 흐름을 끈다
    autoOn.current = !window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches;

    draw(pos.current);
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
      lastTime.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 버튼 — 목표만 옮기고 실제 이동은 감쇠 보간이 맡는다
  const move = (dir) => {
    target.current += dir;
    start();
  };

  /* 마우스·터치 드래그 */
  const onPointerDown = (e) => {
    drag.current = {
      startX: e.clientX,
      startTarget: target.current,
      moved: false,
    };
    start();
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 3) d.moved = true;
    // 화면 픽셀 → 캔버스 좌표 → 칸 단위
    const unit = dims.current.step * (isCompact ? 1 : scale || 1);
    target.current = d.startTarget - dx / unit;
  };

  const endDrag = (e) => {
    if (!drag.current) return;
    // 놓으면 가장 가까운 칸에 맞춰 정렬
    target.current = Math.round(target.current);
    drag.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  /* 1200 미만 — 캔버스를 버리고 유동 레이아웃.
     슬라이드·드래그는 그대로 두되 카드를 줄이고 곡선 클리핑은 끈다. */
  if (isCompact) {
    const { w, h } = dims.current;
    return (
      <section className="w-full overflow-hidden bg-white py-[80px] md:py-[120px]">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col items-center gap-[14px] px-[20px] text-center sm:px-[24px] md:px-[40px]">
          <Reveal y={16} duration={600}>
            <p className="text-[15px] leading-[22px] font-medium tracking-[-0.38px] text-[#e61911] md:text-[18px] md:leading-[26px]">
              OUR SIGNATURE COLLECTION
            </p>
          </Reveal>
          <h2 className="text-[clamp(24px,5.4vw,38px)] leading-[1.32] font-bold tracking-[-0.03em] text-black">
            <RevealText lines={["완성된 미식, 그 특별한 기록"]} delay={80} step={22} />
          </h2>
          <Reveal delay={320} y={16} duration={600}>
            <p className="text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[16px] md:leading-[24px]">
              가장 고귀한 식재료로 빚어낸, 오직 우리만이 선보일 수 있는 시그니처 메뉴 라인업입니다.
            </p>
          </Reveal>
        </div>

        {/* 카드 스트립 — 화면 밖으로 흘러나간다 */}
        <div
          className="relative mt-[40px] w-full cursor-grab touch-pan-y select-none active:cursor-grabbing md:mt-[56px]"
          style={{ height: h }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {ITEMS.map((card, i) => (
            <div
              key={`${card.id}-${i}`}
              ref={(el) => (cardRefs.current[i] = el)}
              className="absolute top-0 left-1/2 overflow-hidden bg-[#d9d9d9] will-change-transform"
              style={{ width: w, height: h, marginLeft: -w / 2 }}
            >
              <Img
                src={card.image}
                alt=""
                draggable={false}
                loading="lazy"
                decoding="async"
                className="pointer-events-none absolute inset-0 size-full max-w-none object-cover"
              />
            </div>
          ))}
        </div>

        <div className="mt-[32px] flex items-center justify-center gap-[12px] md:mt-[40px]">
          {[
            { dir: -1, label: "이전 메뉴", rotate: 180 },
            { dir: 1, label: "다음 메뉴", rotate: 0 },
          ].map((btn) => (
            <button
              key={btn.dir}
              type="button"
              aria-label={btn.label}
              onClick={() => move(btn.dir)}
              className="flex size-[44px] items-center justify-center rounded-[9999px] border border-solid border-[#e5e5ec] bg-white md:size-[52px]"
            >
              <img
                src={asset("/images/collection/arrow.svg")}
                alt=""
                aria-hidden
                loading="lazy"
                decoding="async"
                className="size-[20px] md:size-[22px]"
                style={{ transform: `rotate(${btn.rotate}deg)` }}
              />
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
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
          <div
            className="relative"
            style={{ marginTop: PAD_TOP, height: SECTION_H }}
          >
            {/* Figma 332:786 — 카드 스트립. 회전 없이 가로로만 흐른다.
                드래그를 받기 위해 화면 전체 폭의 판을 깔고 그 위에 카드를 얹는다 */}
            <div
              className="absolute left-1/2 -translate-x-1/2 cursor-grab touch-pan-y select-none active:cursor-grabbing"
              style={{ top: STRIP_TOP, height: CARD_H, width: DRAG_AREA_W }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {ITEMS.map((card, i) => (
                <div
                  key={`${card.id}-${i}`}
                  ref={(el) => (cardRefs.current[i] = el)}
                  className="group absolute top-0 left-1/2 overflow-hidden bg-[#d9d9d9] will-change-transform"
                  style={{
                    width: CARD_W,
                    height: CARD_H,
                    marginLeft: -CARD_W / 2,
                  }}
                >
                  <Img
                    src={card.image}
                    alt=""
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                    className="pointer-events-none absolute inset-0 size-full max-w-none object-cover brightness-90 transition-[transform,filter] duration-700 ease-out group-hover:scale-[1.08] group-hover:brightness-110"
                  />
                </div>
              ))}
            </div>

            {/* Figma 332:796 — 헤더, w 1680 / gap 24 / 가운데 정렬 */}
            <div
              className="absolute left-1/2 z-[210] flex w-[1680px] -translate-x-1/2 flex-col items-center gap-[24px] text-center font-pretendard"
              style={{ top: HEADER_TOP }}
            >
              {/* Figma 332:797 — Pretendard Medium 20 / lh 30 / -0.5 / #e61911 */}
              <Reveal className="w-full" y={20} duration={700}>
                <p className="w-full text-[20px] leading-[30px] font-medium tracking-[-0.5px] text-[#e61911]">
                  OUR SIGNATURE COLLECTION
                </p>
              </Reveal>

              {/* Figma 332:798 — w 666, gap 16 */}
              <div className="flex w-[666px] flex-col items-center gap-[16px]">
                {/* Figma 332:799 — Pretendard Bold 46 / lh 60 / -1.15 / 검정 */}
                <h2 className="text-[46px] leading-[60px] font-bold tracking-[-1.15px] whitespace-nowrap text-black uppercase">
                  <RevealText
                    lines={["완성된 미식, 그 특별한 기록"]}
                    delay={120}
                  />
                </h2>
                {/* Figma 332:800 — Pretendard Regular 18 / lh 26 / -0.45 / #767676 */}
                <Reveal className="w-full" delay={420} y={20} duration={700}>
                  <p className="w-full text-[18px] leading-[26px] font-normal tracking-[-0.45px] text-[#767676]">
                    가장 고귀한 식재료로 빚어낸, 오직 우리만이 선보일 수 있는
                    시그니처 메뉴 라인업입니다.
                  </p>
                </Reveal>
              </div>
            </div>

            {/* Figma 332:801 — 슬라이드 버튼 52 x 2, gap 12 */}
            <div
              className="absolute left-1/2 z-[210] flex -translate-x-1/2 items-center gap-[12px]"
              style={{ top: NAV_TOP }}
            >
              {[
                { dir: -1, label: "이전 메뉴", rotate: 180 },
                { dir: 1, label: "다음 메뉴", rotate: 0 },
              ].map((btn) => (
                // 커서가 가까이 오면 버튼이 끌려온다
                <Magnetic key={btn.dir} strength={0.4}>
                  <button
                    type="button"
                    aria-label={btn.label}
                    onClick={() => move(btn.dir)}
                    className="group flex size-[52px] items-center justify-center rounded-[9999px] border border-solid border-[#e5e5ec] bg-white transition-colors duration-300 hover:border-[#222] hover:bg-[#222]"
                  >
                    <img
                      src={asset("/images/collection/arrow.svg")}
                      alt=""
                      aria-hidden
                      loading="lazy"
                      decoding="async"
                      className="size-[22px] transition-[filter] duration-300 group-hover:invert"
                      style={{ transform: `rotate(${btn.rotate}deg)` }}
                    />
                  </button>
                </Magnetic>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
