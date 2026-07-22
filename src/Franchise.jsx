import { useEffect, useRef, useState } from "react";
import Img from "./Img.jsx";
import { asset } from "./lib/asset.js";

/**
 * Figma: Frame 2095587700 (332:701) — x 122 / y 9092 / 1680 x 708
 *
 * 하나의 반응형 트리로 통합했다. (canvas scale + isCompact 두 벌 → 한 벌)
 *   ≥1200(xl): 가로 flex, gap 24, 왼쪽 패널 544 + 오른쪽 사진(flex-1). Figma 원본 그대로.
 *     ├ 왼쪽 패널 332:702  544 x 708, bg #f6f7fb, p 60, 세로 gap 160, 가운데 정렬
 *     │   ├ "Franchise"      332:703
 *     │   ├ 지점 목록        332:704  169 x 216, 세로 gap 56 (칸 간격 92)
 *     │   └ 편의시설 태그    332:708  가로 gap 32
 *     └ 오른쪽 사진 332:714  1112 x 708
 *   <1200: 패널을 위, 사진을 아래로 쌓는다. 여백·타이포만 단계적으로 줄인다.
 *
 * 지점 목록 위에서 휠을 굴리면 연속값 pos 가 움직이며 이름이 위아래로 흘러간다.
 * 활성/비활성 두 벌을 겹쳐 두고 교차 페이드해서 크기·굵기·색이 한꺼번에 부드럽게 바뀐다.
 * 오른쪽 사진도 같은 pos 로 교차 페이드된다.
 *
 * ── 통합에서 지킨 인터랙션 안무 ──
 * 스크럽 박스는 모든 폭에서 169 x 216 고정으로 둔다. draw() 의 SLOT_H(92)는
 * 캔버스 배율이 아니라 이 박스의 DOM 좌표에서 도는 값이라, 박스를 원래 크기로
 * 유지하면 배율을 걷어내도 92/216 비율이 그대로 살아 안무가 한 픽셀도 안 틀린다.
 * (박스를 폭마다 다른 크기로 줄였다면 SLOT_H 를 DOM 높이에서 재계산해야 했을 것)
 * 휠 핸들러는 e.deltaY·문턱·누적만 쓰고 배율/좌표에 의존하지 않아 그대로 옮겼다.
 */
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
  // 선택된 지점은 여기 한 곳에만 둔다 — 통합 후 상태가 하나뿐이라
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
    // 목록은 이제 모든 폭에서 그려지므로 보간 루프도 항상 돌린다
    if (!raf.current) raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    // 마운트 시 현재 선택으로 초기 상태를 그린다 (통합 후 분기 전환이 없어 한 번만)
    target.current = activeIdx;
    pos.current = activeIdx;
    draw(pos.current);

    const el = listRef.current;
    if (!el) return;

    // 목록 위에서만 휠을 가로챈다. preventDefault 를 쓰려면 passive 가 아니어야 한다.
    // (모바일은 터치 스크롤이라 wheel 이 안 뜨므로 이 핸들러가 페이지 스크롤을 먹지 않는다)
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
      raf.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="relative w-full overflow-hidden bg-white pb-[80px] md:pb-[120px] xl:pb-[200px]">
      {/* Figma 332:701 — ≥1200 은 1680 폭 가로 gap 24, 그 아래는 세로로 쌓는다 */}
      <div className="mx-auto flex w-full max-w-[1680px] flex-col px-[20px] font-pretendard sm:px-[24px] md:px-[40px] xl:flex-row xl:items-stretch xl:gap-[24px] xl:px-0">
        {/* Figma 332:702 — 544 x 708, bg #f6f7fb, p 60, 세로 gap 160 */}
        <div className="flex flex-col items-center gap-[28px] bg-[#f6f7fb] px-[20px] py-[40px] text-center md:gap-[36px] md:px-[40px] md:py-[56px] xl:h-[708px] xl:w-[544px] xl:shrink-0 xl:gap-[160px] xl:px-[60px] xl:py-[60px]">
          {/* Figma 332:703 — Pretendard Medium 18 / lh 26 / -0.45 / #e61911 */}
          <p className="w-full text-[15px] leading-[22px] font-medium tracking-[-0.38px] text-[#e61911] md:text-[18px] md:leading-[26px] md:tracking-[-0.45px]">
            Franchise
          </p>

          {/* Figma 332:704 — 휠로 굴리는 지점 목록. 모든 폭에서 169 x 216 고정 (안무 보존) */}
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
                  aria-current={i === activeIdx ? "true" : undefined}
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

          {/* Figma 332:708 — 가로 gap 32, Medium 18 / lh 26 / -0.45. 좁으면 줄바꿈 */}
          <div className="flex flex-wrap items-center justify-center gap-x-[18px] gap-y-[8px] xl:flex-nowrap xl:gap-[32px] xl:whitespace-nowrap">
            {TAGS.map((tag) => (
              <span
                key={tag}
                className="cursor-default text-[14px] leading-[22px] font-medium tracking-[-0.35px] text-[#999] transition-colors duration-200 hover:text-black md:text-[16px] xl:text-[18px] xl:leading-[26px] xl:tracking-[-0.45px]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Figma 332:714 — 1112 x 708. 지점에 맞춰 교차 페이드.
            좁은 폭: padding-top 으로 종횡비 상자, ≥1200: 708 고정 + flex-1 */}
        <div className="relative overflow-hidden bg-[#d9d9d9] pt-[68%] md:pt-[56%] xl:h-[708px] xl:min-w-0 xl:flex-1 xl:pt-0">
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
              // 아주 느린 켄번즈 — 사진이 멈춰 있지 않고 미세하게 살아 움직인다.
              // opacity 는 draw() 가 pos 에 맞춰 제어한다 (초기 opacity-0)
              className="franchise-kenburns absolute inset-0 size-full max-w-none object-cover opacity-0"
              style={{ animationDelay: `${i * -6}s` }}
            />
          ))}
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
