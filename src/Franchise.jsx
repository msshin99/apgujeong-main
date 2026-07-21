import { useEffect, useRef, useState } from "react";
import { DESIGN_W, useWidthScale } from "./useCanvasScale.js";
import { useBreakpoint } from "./useBreakpoint.js";
import Img from "./Img.jsx";
import { asset } from "./lib/asset.js";

/**
 * Figma: Frame 2095587700 (332:701) — x 122 / y 9092 / 1680 x 708
 *
 * 가로 flex, gap 24, items-center.
 *   왼쪽 패널 332:702  544 x 708, bg #f6f7fb, p 60, 세로 gap 160, 가운데 정렬
 *     ├ "Franchise"      332:703
 *     ├ 지점 목록        332:704  w 169, 세로 gap 56 (칸 간격 92)
 *     └ 편의시설 태그    332:708  가로 gap 32
 *   오른쪽 사진 332:714  1112 x 708
 *
 * 544 + 24 + 1112 = 1680 ✓
 *
 * 지점 목록 위에서 휠을 굴리면 연속값 pos 가 움직이며 이름이 위아래로 흘러간다.
 * 활성/비활성 두 벌을 겹쳐 두고 교차 페이드해서 크기·굵기·색이 한꺼번에 부드럽게 바뀐다.
 * 오른쪽 사진도 같은 pos 로 교차 페이드된다.
 */
const FRAME_W = 1680;
const SECTION_H = 708;
const PANEL_W = 544;
const PHOTO_W = 1112;
const GAP = 24;

/**
 * 앞 Collection 섹션이 이미 하단 200px 를 갖고 있다.
 * 여기서 또 상단 여백을 주면 간격이 두 겹으로 쌓이므로 0 으로 둔다.
 * → 두 섹션 사이 간격은 정확히 200px.
 */
const PAD_TOP = 0;
const PAD_BOTTOM = 200;

const LIST_W = 169;
const LIST_H = 216; // Figma 332:704
const SLOT_H = 92; // 이름 중심 사이 간격 (성수동 16 → 압구정 108 → 서교동 200)

const DAMPING = 0.12;
const WHEEL_THRESHOLD = 60; // 이만큼 굴리면 한 칸 이동
/* 손을 뗀 뒤 이만큼 조용하면 누적을 버린다. 이게 없으면 한참 전에 스쳐 간 굴림이
   남아 있다가 다음 굴림 한 번에 칸이 넘어간다 */
const WHEEL_IDLE_MS = 400;

/**
 * Figma 332:705 / 706 / 707.
 * image 는 임시 — 피그마에 지점별 사진이 없어 기존 에셋을 돌려 썼다.
 */
const BRANCHES = [
  { name: "성수동지점", image: asset("/images/collection/c3.png") },
  { name: "압구정지점", image: asset("/images/franchise/store.png") },
  { name: "서교동지점", image: asset("/images/collection/c5.png") },
];

/**
 * Figma 332:709 ~ 713.
 * 원본에서 "예약 가능"만 검정인 건 hover 상태를 캡처해 둔 것이라,
 * 기본은 전부 #999 이고 마우스를 올린 항목만 검정이 된다.
 */
const TAGS = ["예약 가능", "주차 완비", "테라스 운영", "연중무휴", "단체석"];

const N = BRANCHES.length;
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const lerp = (a, b, t) => a + (b - a) * t;

export default function Franchise() {
  const scale = useWidthScale();
  const { isCompact } = useBreakpoint();
  const totalH = SECTION_H + PAD_TOP + PAD_BOTTOM;
  // 선택된 지점은 여기 한 곳에만 둔다 — 두 분기가 같은 값을 읽어야
  // 1200 경계를 넘나들어도 고른 지점이 그대로 남는다. 초기값은 Figma 기본 — 압구정지점
  const [activeIdx, setActiveIdx] = useState(1);

  const listRef = useRef(null);
  const rowRefs = useRef([]); // { wrap, bold, plain }
  const photoRefs = useRef([]);
  // 아래 두 ref 는 activeIdx 를 매 프레임 보간하기 위한 사본일 뿐, 진실은 activeIdx 다
  const target = useRef(activeIdx);
  const pos = useRef(activeIdx);
  const raf = useRef(0);
  const wheelAcc = useRef(0);
  const wheelDir = useRef(0);
  const wheelAt = useRef(0);

  const draw = (p) => {
    BRANCHES.forEach((_, i) => {
      const d = i - p;
      // 중앙에 가까울수록 1 — 활성 정도
      const t = clamp(1 - Math.abs(d), 0, 1);

      const row = rowRefs.current[i];
      if (row?.wrap) {
        row.wrap.style.transform = `translate3d(0, ${d * SLOT_H}px, 0)`;
        // 목록 밖으로 나간 이름은 서서히 사라진다
        row.wrap.style.opacity = String(clamp(1.6 - Math.abs(d), 0, 1));
      }
      // Figma 332:706 — Bold 40 / lh 40 / -1 / 검정
      if (row?.bold) {
        row.bold.style.opacity = String(t);
        row.bold.style.transform = `scale(${lerp(0.86, 1, t)})`;
      }
      // Figma 332:705 / 707 — Regular 24 / lh 32 / -0.6 / #999
      if (row?.plain) {
        row.plain.style.opacity = String(1 - t);
        row.plain.style.transform = `scale(${lerp(1, 1.16, t)})`;
      }

      const photo = photoRefs.current[i];
      if (photo) photo.style.opacity = String(t);
    });
  };

  const tick = () => {
    const diff = target.current - pos.current;
    if (Math.abs(diff) < 0.0005) {
      pos.current = target.current;
      draw(pos.current);
      raf.current = 0;
      return;
    }
    pos.current += diff * DAMPING;
    draw(pos.current);
    raf.current = requestAnimationFrame(tick);
  };

  const moveTo = (i) => {
    const next = clamp(i, 0, N - 1);
    setActiveIdx(next);
    target.current = next;
    // 보간 루프는 목록이 실제로 그려지는 데스크톱 분기에서만 돌린다
    if (!isCompact && !raf.current) raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    // 1200 미만에서는 휠 피커 대신 탭으로 고른다 (모바일에서 휠 가로채기는 부적절)
    if (isCompact) return;

    // 좁은 화면에서 고르고 넓혔을 수 있으니 현재 선택을 이어받아 그린다
    target.current = activeIdx;
    pos.current = activeIdx;
    draw(pos.current);

    const el = listRef.current;
    if (!el) return;

    // 목록 위에서만 휠을 가로챈다. preventDefault 를 쓰려면 passive 가 아니어야 한다
    const onWheel = (e) => {
      const dir = Math.sign(e.deltaY);
      // 끝에 닿았으면 더 고를 게 없으니 페이지 스크롤에 그대로 넘긴다
      if (
        dir === 0 ||
        (dir > 0 && target.current === N - 1) ||
        (dir < 0 && target.current === 0)
      ) {
        wheelAcc.current = 0;
        return;
      }

      /* 목록 위에서 굴린 휠은 지점 선택으로 쓴다. 취소는 지금 결정해야 한다 —
         preventDefault 는 소급되지 않으므로, 문턱을 넘은 이벤트에서만 부르면
         트랙패드(한 번에 3~10px)에서는 60 이 차기까지 열 번 넘게 페이지가 이미
         스크롤돼 섹션이 화면 밖으로 밀려난다. 문턱은 "몇 번 굴려야 한 칸인가" 이지
         "언제부터 가로챌 것인가" 가 아니다 */
      e.preventDefault();

      /* 방향이 바뀌거나 한참 만에 다시 굴리면 앞의 누적은 다른 동작이다.
         남겨 두면 그냥 지나가려던 굴림이 엉뚱한 지점 선택으로 튄다 */
      const now = e.timeStamp || performance.now();
      if (dir !== wheelDir.current || now - wheelAt.current > WHEEL_IDLE_MS) {
        wheelAcc.current = 0;
      }
      wheelDir.current = dir;
      wheelAt.current = now;

      wheelAcc.current += e.deltaY;
      if (Math.abs(wheelAcc.current) < WHEEL_THRESHOLD) return;

      moveTo(target.current + Math.sign(wheelAcc.current));
      wheelAcc.current = 0;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (raf.current) cancelAnimationFrame(raf.current);
      // 분기가 바뀌어도 다음 moveTo 가 루프를 다시 시작할 수 있게 비운다
      raf.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompact]);

  /* 1200 미만 — 좌우 배치를 상하로 쌓고, 지점 선택은 탭으로 */
  if (isCompact) {
    return (
      <section className="w-full bg-white pb-[80px] md:pb-[120px]">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col px-[20px] sm:px-[24px] md:px-[40px]">
          <div className="flex flex-col items-center gap-[28px] bg-[#f6f7fb] px-[20px] py-[40px] text-center md:gap-[36px] md:px-[40px] md:py-[56px]">
            <p className="text-[15px] leading-[22px] font-medium tracking-[-0.38px] text-[#e61911] md:text-[18px] md:leading-[26px]">
              Franchise
            </p>

            {/* 지점 선택 — 가로 탭 */}
            <div className="flex w-full items-center justify-center gap-[8px] overflow-x-auto [scrollbar-width:none] md:gap-[16px] [&::-webkit-scrollbar]:hidden">
              {BRANCHES.map((b, i) => {
                const on = i === activeIdx;
                return (
                  <button
                    key={b.name}
                    type="button"
                    onClick={() => moveTo(i)}
                    aria-current={on ? "true" : undefined}
                    className={`shrink-0 rounded-[9999px] px-[16px] py-[9px] font-pretendard whitespace-nowrap transition-colors duration-300 md:px-[20px] md:py-[11px] ${
                      on
                        ? "bg-black text-[16px] leading-[22px] font-bold tracking-[-0.4px] text-white md:text-[18px]"
                        : "text-[15px] leading-[22px] font-normal tracking-[-0.38px] text-[#999] md:text-[17px]"
                    }`}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>

            {/* 편의시설 태그 */}
            <div className="flex flex-wrap items-center justify-center gap-x-[18px] gap-y-[8px]">
              {TAGS.map((tag) => (
                <span
                  key={tag}
                  className="text-[14px] leading-[22px] font-medium tracking-[-0.35px] text-[#999] md:text-[16px]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* 사진 — 패널 아래 */}
          <div className="relative w-full overflow-hidden bg-[#d9d9d9] pt-[68%] md:pt-[56%]">
            {BRANCHES.map((b, i) => (
              <Img
                key={b.name}
                src={b.image}
                alt={`${b.name} 외관`}
                // 첫 화면 한참 아래라 눈에 들어올 때 받아도 늦지 않다
                loading="lazy"
                decoding="async"
                className="absolute inset-0 size-full object-cover transition-opacity duration-700"
                style={{ opacity: i === activeIdx ? 1 : 0 }}
              />
            ))}
          </div>
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
          {/* Figma 332:701 — 1680 폭, 가로 gap 24 */}
          <div
            className="mx-auto flex items-center font-pretendard"
            style={{
              width: FRAME_W,
              gap: GAP,
              marginTop: PAD_TOP,
              height: SECTION_H,
            }}
          >
            {/* Figma 332:702 — 544 x 708, bg #f6f7fb, p 60, 세로 gap 160 */}
            <div
              className="flex shrink-0 flex-col items-center gap-[160px] bg-[#f6f7fb] p-[60px] text-center"
              style={{ width: PANEL_W, height: SECTION_H }}
            >
              {/* Figma 332:703 — Pretendard Medium 18 / lh 26 / -0.45 / #e61911 */}
              <p className="w-full text-[18px] leading-[26px] font-medium tracking-[-0.45px] text-[#e61911]">
                Franchise
              </p>

              {/* Figma 332:704 — 휠로 굴리는 지점 목록 */}
              <div
                ref={listRef}
                className="relative overflow-hidden"
                style={{ width: LIST_W, height: LIST_H }}
              >
                {BRANCHES.map((b, i) => (
                  <div
                    key={b.name}
                    ref={(el) => {
                      rowRefs.current[i] = {
                        ...(rowRefs.current[i] || {}),
                        wrap: el,
                      };
                    }}
                    className="absolute inset-x-0 will-change-transform"
                    style={{ top: LIST_H / 2 - 20, height: 40 }}
                  >
                    <button
                      type="button"
                      onClick={() => moveTo(i)}
                      className="relative block h-[40px] w-full outline-none focus-visible:underline focus-visible:underline-offset-8"
                    >
                      {/* 활성 — Bold 40 */}
                      <span
                        ref={(el) => {
                          rowRefs.current[i] = {
                            ...(rowRefs.current[i] || {}),
                            bold: el,
                          };
                        }}
                        className="absolute inset-0 flex items-center justify-center text-[40px] leading-[40px] font-bold tracking-[-1px] whitespace-nowrap text-black"
                      >
                        {b.name}
                      </span>
                      {/* 비활성 — Regular 24 */}
                      <span
                        ref={(el) => {
                          rowRefs.current[i] = {
                            ...(rowRefs.current[i] || {}),
                            plain: el,
                          };
                        }}
                        className="absolute inset-0 flex items-center justify-center text-[24px] leading-[32px] font-normal tracking-[-0.6px] whitespace-nowrap text-[#999]"
                      >
                        {b.name}
                      </span>
                    </button>
                  </div>
                ))}
              </div>

              {/* Figma 332:708 — 가로 gap 32, Medium 18 / lh 26 / -0.45 */}
              <div className="flex items-center gap-[32px] whitespace-nowrap">
                {TAGS.map((tag) => (
                  <span
                    key={tag}
                    className="cursor-default text-[18px] leading-[26px] font-medium tracking-[-0.45px] text-[#999] transition-colors duration-200 hover:text-black"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Figma 332:714 — 1112 x 708. 지점에 맞춰 교차 페이드 */}
            <div
              className="relative shrink-0 overflow-hidden bg-[#d9d9d9]"
              style={{ width: PHOTO_W, height: SECTION_H }}
            >
              {BRANCHES.map((b, i) => (
                <Img
                  key={b.name}
                  /* React 19 에서는 ref 도 평범한 prop 이라 Img 의 ...rest 를 타고
                     안쪽 <img> 로 그대로 넘어간다. 켄번즈 재생 제어가 그대로 산다 */
                  ref={(el) => (photoRefs.current[i] = el)}
                  src={b.image}
                  alt={`${b.name} 외관`}
                  // 지점 사진 3장이 합쳐 수 MB 라 첫 화면 로딩을 밀어내지 않게 미룬다
                  loading="lazy"
                  decoding="async"
                  // 아주 느린 켄번즈 — 사진이 멈춰 있지 않고 미세하게 살아 움직인다
                  className="franchise-kenburns absolute inset-0 size-full max-w-none object-cover opacity-0"
                  style={{ animationDelay: `${i * -6}s` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .franchise-kenburns {
          animation: franchiseKenBurns 24s ease-in-out infinite alternate;
        }
        @keyframes franchiseKenBurns {
          from { transform: scale(1) translate3d(0, 0, 0); }
          to   { transform: scale(1.08) translate3d(-1.5%, -1%, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .franchise-kenburns { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
