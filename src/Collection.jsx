import { useEffect, useLayoutEffect, useRef } from "react";
import Reveal, { RevealText } from "./Reveal.jsx";
import { Magnetic } from "./Tilt.jsx";
import Img from "./Img.jsx";
import { asset } from "./lib/asset.js";

/**
 * 홈 "OUR SIGNATURE COLLECTION" 섹션. Figma: Group 1707481198 (332:784).
 *
 *   헤더        332:796  y 64  / w 1680 / gap 24
 *   카드 스트립 332:786  y 223 / 320x420 카드 7장, gap 24 — 무한 가로 드래그
 *   흰 타원 2개 332:795 / 794 — 위·아래에서 띠를 곡선으로 파낸다
 *   슬라이드 버튼 332:801 y 673 / 52 원형 2개, gap 12
 *
 * 예전에는 1920 캔버스를 transform:scale 로 줄이는 데스크톱 트리와, 1200 미만용
 * 유동 트리를 **따로** 들고 있었다. 그 방식은 1200~1440 구간에서 320 카드가 배율을 타
 * 240·200px 로 쪼그라들고, 두 벌의 드래그 물리가 서로 어긋났다.
 *
 * 그래서 캔버스 배율을 버리고 폭에 따라 CSS 로만 흐르는 **한 벌**로 합친다.
 *   · 카드 크기는 브레이크포인트별 고정 px 로 계단식(모바일 220 · 태블릿 260 · 데스크톱 320)
 *   · 드래그·슬라이드의 이동 피치는 캔버스 scale 대신 **실제 렌더된 카드 폭을 DOM 에서 실측**해
 *     구한다(measure). 그래야 배율 없이도 카드 한 장 폭만큼 정확히 넘어간다.
 *   · 곡선 clip-path 띠는 320 데스크톱 카드일 때만 켠다(좁은 화면은 띠가 짧아 어색하다).
 *   · 이 저장소는 lg·xl·2xl 이 전부 1200px 이라 lg: 는 죽는다. 데스크톱 단은 xl:(=1200) 로 준다.
 */
const CARD_W = 320;
const CARD_H = 420;
const CARD_GAP = 24;
const STEP = CARD_W + CARD_GAP; // 344 — 데스크톱 이동 피치(카드+간격)

/**
 * 카드 폭 대비 이동 피치의 비율. 344/320 = 1.075.
 * 태블릿(280/260)·모바일(236/220)도 모두 ≈1.075 라 카드 폭 하나만 실측하면
 * 어느 화면에서든 step = 실측폭 × 이 비율로 정확한 피치가 나온다.
 */
const STEP_RATIO = STEP / CARD_W;

/**
 * 띠의 곡선.
 *
 * 각 카드를 clip-path 사다리꼴로 자른다.
 *   - 카드 안에서는 위·아래 변이 직선(곡선의 현)이라 꺾이는 지점이 없다
 *   - 기울기가 바뀌는 곳은 카드 사이 간격뿐이라 눈에 띄지 않는다
 *   - 이어 붙이면 전체가 부드러운 곡선이 된다
 *
 * 곡선은 Figma 의 흰 타원이 만들던 파임을 포물선으로 근사한다. 이 상수들은 1920 기준
 * 실측 px 이고, 배율을 걷어낸 지금은 실제 화면 px 위에서 그대로 성립한다(1920 에서 픽셀 일치).
 */
const CURVE_HALF_SPAN = 1268; // Figma 타원 반폭
const CUT_DEPTH = 60; // Figma 실측 — 중앙에서 파고드는 깊이

/** 가로 위치 x 에서 위(또는 아래)로 파이는 깊이 */
const cutAt = (x) => {
  const t = Math.min(Math.abs(x) / CURVE_HALF_SPAN, 1);
  return CUT_DEPTH * (1 - t * t);
};

const DAMPING = 0.11; // 작을수록 더 느긋하게 따라온다
const AUTO_SPEED = 0.16; // 초당 흘러가는 칸 수 — 무한 반복 슬라이드

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
 * 한 벌(7장)만 쓰면 주기가 화면 폭과 비슷해서
 * 카드가 반대편으로 넘어가는 순간이 그대로 보인다.
 */
const ITEMS = [...CARDS, ...CARDS];
const N = ITEMS.length; // 14
const HALF = N / 2; // 7 — 순환 이음매는 중심에서 멀어 화면 밖이다

/** 연속 거리값을 -N/2 ~ N/2 로 접는다 */
const wrapOffset = (v) => {
  const d = ((v % N) + N) % N;
  return d > HALF ? d - N : d;
};

export default function Collection() {
  const cardRefs = useRef([]);
  const target = useRef(0); // 목표 위치(칸 단위)
  const pos = useRef(0); // 실제로 그려지는 위치
  const raf = useRef(0);
  const lastTime = useRef(0);
  const drag = useRef(null); // { startX, startTarget, moved }
  const autoOn = useRef(true);

  /* 카드 치수는 배율이 아니라 실제 렌더 결과에서 온다. rAF 루프가 첫 렌더의 클로저를
     계속 쓰므로 값은 ref 에 담아 두고 measure() 로 갱신한다.
     초기값은 데스크톱(SSR·첫 페인트 기준) — 마운트 직후 실측이 덮어쓴다. */
  const dims = useRef({ w: CARD_W, h: CARD_H, step: STEP, curve: true });

  /* 캔버스 scale 을 걷어낸 자리 — 실제 렌더된 카드의 폭·높이를 DOM 에서 읽어
     이동 피치(step)와 곡선 클립에 쓴다. 브레이크포인트를 넘어 카드 CSS 크기가 바뀌면
     resize 에서 다시 부른다. */
  const measure = () => {
    const el = cardRefs.current[0];
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return;
    dims.current = {
      w,
      h,
      step: w * STEP_RATIO, // 배율 대신 실측폭에서 피치를 유도 → 카드 한 장만큼 정확히 이동
      curve: w >= CARD_W, // 곡선 띠는 320 데스크톱 카드에서만
    };
  };

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

  /* 첫 페인트 전에 실측하고 한 번 그린다. 그러지 않으면 14 장이 left-1/2 에 그대로 겹쳐
     보이는 한 프레임이 생긴다(transform 이 아직 안 붙은 상태). */
  useLayoutEffect(() => {
    measure();
    draw(pos.current);
  }, []);

  useEffect(() => {
    // 접근성: 모션을 줄이도록 설정한 사용자에게는 자동 흐름을 끈다
    autoOn.current = !window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches;

    raf.current = requestAnimationFrame(tick);

    /* 창 폭이 브레이크포인트를 넘으면 카드 CSS 크기가 바뀐다 → 피치·클립을 다시 실측하고
       즉시 다시 그린다. 모션 최소화로 루프가 멈춰 있을 수 있으므로(tick 참고) 다음 프레임에
       기댈 수 없다 — 여기서 직접 그린다. 예전 분기 전환용 useLayoutEffect 를 대체한다. */
    const onResize = () => {
      measure();
      draw(pos.current);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
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
    // 화면 픽셀 → 칸 단위. step 이 이미 실측 px 라 배율 곱셈이 필요 없다.
    const unit = dims.current.step;
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

  return (
    <section className="w-full overflow-hidden bg-white py-[80px] md:py-[120px] xl:py-[160px]">
      {/* Figma 332:796 — 헤더. 캔버스를 줄이지 않고 컨테이너를 가운데 두므로
          1920 에서 좌우 여백이 예전 캔버스와 맞는다. 데스크톱은 w 1680, 본문은 w 666 로 조인다 */}
      <div className="mx-auto flex w-full max-w-[1120px] flex-col items-center gap-[14px] px-[20px] text-center font-pretendard sm:px-[24px] md:gap-[20px] md:px-[40px] xl:max-w-[1680px] xl:gap-[24px]">
        {/* Figma 332:797 — Pretendard Medium 20 / lh 30 / -0.5 / #e61911 */}
        <Reveal className="w-full" y={20} duration={700}>
          <p className="w-full text-[15px] leading-[22px] font-medium tracking-[-0.38px] text-[#e61911] md:text-[18px] md:leading-[26px] xl:text-[20px] xl:leading-[30px] xl:tracking-[-0.5px]">
            OUR SIGNATURE COLLECTION
          </p>
        </Reveal>

        {/* Figma 332:798 — 데스크톱에서 w 666, gap 16 */}
        <div className="flex flex-col items-center gap-[8px] md:gap-[12px] xl:max-w-[666px] xl:gap-[16px]">
          {/* Figma 332:799 — Pretendard Bold 46 / lh 60 / -1.15 / 검정 */}
          <h2 className="text-[clamp(24px,5.4vw,38px)] leading-[1.32] font-bold tracking-[-0.03em] text-black uppercase xl:text-[46px] xl:leading-[60px] xl:tracking-[-1.15px] xl:whitespace-nowrap">
            <RevealText lines={["완성된 미식, 그 특별한 기록"]} delay={120} />
          </h2>
          {/* Figma 332:800 — Pretendard Regular 18 / lh 26 / -0.45 / #767676 */}
          <Reveal className="w-full" delay={420} y={20} duration={700}>
            <p className="w-full text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[16px] md:leading-[24px] xl:text-[18px] xl:leading-[26px] xl:tracking-[-0.45px]">
              가장 고귀한 식재료로 빚어낸, 오직 우리만이 선보일 수 있는 시그니처
              메뉴 라인업입니다.
            </p>
          </Reveal>
        </div>
      </div>

      {/* Figma 332:786 — 카드 스트립. 회전 없이 가로로만 흐르며 화면 밖으로 넘쳐 섹션이 잘라낸다.
          컨테이너 밖(전폭)에 두어 카드가 좌우로 흘러나갈 수 있게 한다.
          높이는 카드 높이와 같게 계단식으로 고정한다(모바일 289 · 태블릿 341 · 데스크톱 420). */}
      <div
        className="relative mt-[40px] h-[289px] w-full cursor-grab touch-pan-y select-none active:cursor-grabbing md:mt-[56px] md:h-[341px] xl:mt-[72px] xl:h-[420px]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {ITEMS.map((card, i) => (
          <div
            key={`${card.id}-${i}`}
            ref={(el) => (cardRefs.current[i] = el)}
            /* 카드 크기는 계단식 고정 px, 좌우 정렬은 left-1/2 + 음수 마진(= -폭/2)로 중앙 고정.
               실제 이동은 draw() 가 translate3d 로 얹는다. */
            className="group absolute top-0 left-1/2 -ml-[110px] h-[289px] w-[220px] overflow-hidden bg-[#d9d9d9] will-change-transform md:-ml-[130px] md:h-[341px] md:w-[260px] xl:-ml-[160px] xl:h-[420px] xl:w-[320px]"
          >
            <Img
              src={card.image}
              alt=""
              draggable={false}
              loading="lazy"
              decoding="async"
              /* 호버 연출(밝기·확대)은 데스크톱에서만 — 좁은 화면은 예전 유동 트리처럼 담백하게 둔다 */
              className="pointer-events-none absolute inset-0 size-full max-w-none object-cover xl:brightness-90 xl:transition-[transform,filter] xl:duration-700 xl:ease-out xl:group-hover:scale-[1.08] xl:group-hover:brightness-110"
            />
          </div>
        ))}
      </div>

      {/* Figma 332:801 — 슬라이드 버튼 2개, gap 12. Magnetic 은 pointer:fine 에서만 동작해
          터치 화면에서는 그냥 감싸기만 한다(no-op) → 한 벌로 합쳐도 안전하다. */}
      <div className="mt-[32px] flex items-center justify-center gap-[12px] md:mt-[40px] xl:mt-[56px]">
        {[
          { dir: -1, label: "이전 메뉴", rotate: 180 },
          { dir: 1, label: "다음 메뉴", rotate: 0 },
        ].map((btn) => (
          // 커서가 가까이 오면 버튼이 끌려온다(데스크톱 전용, 터치에선 no-op)
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
                loading="lazy"
                decoding="async"
                className="size-[20px] transition-[filter] duration-300 group-hover:invert md:size-[22px]"
                style={{ transform: `rotate(${btn.rotate}deg)` }}
              />
            </button>
          </Magnetic>
        ))}
      </div>
    </section>
  );
}
