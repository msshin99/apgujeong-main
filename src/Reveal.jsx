import { useEffect, useRef, useState } from "react";
import { useHydrated } from "./lib/hydrated.js";

/**
 * 스크롤로 화면에 들어올 때 재생되는 등장 모션.
 * 화면을 벗어나면 초기 상태로 되돌아가므로, 다시 내려오면 처음부터 재생된다.
 *
 * 섹션마다 따로 만들면 타이밍이 제각각이 되므로 여기로 모아 쓴다.
 * transform / opacity 만 다루므로 GPU 합성으로 처리된다.
 */
const EASE = "cubic-bezier(0.22,1,0.36,1)";

export function useInView(threshold = 0.2) {
  const ref = useRef(null);
  const hydrated = useHydrated();
  // 서버(프리렌더)와 하이드레이션 첫 렌더는 "보이는" 상태다.
  // opacity:0 인 채로 HTML 이 굳으면 크롤러와 JS 가 죽은 사용자에게 본문이 사라진 것과 같다.
  // 관문이 열린 뒤부터 실제 관찰 결과를 쓰므로 등장 모션은 종전 그대로다.
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 접근성: 모션을 줄이도록 설정한 사용자에게는 바로 드러낸다
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInView(true);
      return;
    }

    // 관찰을 끊지 않는다 — 화면을 벗어나면 초기 상태로 되돌아가고
    // 다시 들어올 때 처음부터 재생된다
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      {
        threshold,
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, hydrated]);
  //             ^^^^^^^^ 관문이 열리며 분기가 갈아끼워질 수 있다.
  //             다시 관찰하지 않으면 사라진 요소를 계속 보게 되어 모션이 끝내 발동하지 않는다.

  return [ref, hydrated ? inView : true];
}

/** 블록 하나를 아래에서 띄워 올린다 */
export default function Reveal({
  children,
  delay = 0,
  y = 32,
  duration = 900,
  threshold = 0.2,
  className = "",
  style,
}) {
  const [ref, inView] = useInView(threshold);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        opacity: inView ? 1 : 0,
        transform: inView ? "translate3d(0,0,0)" : `translate3d(0, ${y}px, 0)`,
        transition: `opacity ${duration}ms ${EASE} ${delay}ms, transform ${duration}ms ${EASE} ${delay}ms`,
        willChange: "transform, opacity",
      }}
    >
      {children}
    </div>
  );
}

/**
 * 큰 제목용 — 글자(또는 단어) 단위로 차례차례 올라온다.
 *
 * lines: 줄 단위 문자열 배열
 * unit : "char" 는 한글 제목처럼 줄바꿈이 없는 문구에, "word" 는 줄바꿈이 일어나는
 *        영문 제목에 쓴다. char 로 쪼개면 단어 중간에서 줄이 바뀔 수 있다.
 */
export function RevealText({
  lines,
  unit = "char",
  delay = 0,
  step = 28,
  y = 48,
  duration = 800,
  threshold = 0.2,
  className = "",
}) {
  const [ref, inView] = useInView(threshold);
  const hydrated = useHydrated();
  let index = 0;

  // 서버(프리렌더)에서는 글자 단위로 쪼개지 않고 줄 그대로 내보낸다.
  // 한 글자마다 <span> 을 두르면 브라우저는 텍스트를 합쳐 읽지만,
  // 단순 추출기는 "압/구/정/곱/창" 처럼 조각난 문자열을 가져간다.
  // 모션은 어차피 브라우저에서만 도니 서버 출력은 읽기 좋은 쪽이 낫다.
  // 이제 브라우저의 하이드레이션 렌더도 이 분기를 탄다 — 그래야 이어받을 DOM 이 같다.
  if (!hydrated) {
    return (
      <span ref={ref} className={className}>
        {lines.map((line, li) => (
          <span key={li} className="block">
            {line}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span ref={ref} className={className}>
      {lines.map((line, li) => {
        const pieces = unit === "word" ? line.split(" ") : Array.from(line);
        return (
          <span key={li} className="block">
            {pieces.map((piece, pi) => {
              const d = delay + index * step;
              index += 1;
              return (
                <span
                  key={pi}
                  className="inline-block"
                  style={{
                    opacity: inView ? 1 : 0,
                    transform: inView
                      ? "translate3d(0,0,0)"
                      : `translate3d(0, ${y}px, 0)`,
                    transition: `opacity ${duration}ms ${EASE} ${d}ms, transform ${duration}ms ${EASE} ${d}ms`,
                    willChange: "transform, opacity",
                  }}
                >
                  {piece === " " || piece === "" ? " " : piece}
                  {/* 단어 단위일 때는 사이 공백을 살려 준다 */}
                  {unit === "word" && pi < pieces.length - 1 ? " " : null}
                </span>
              );
            })}
          </span>
        );
      })}
    </span>
  );
}
