import { useEffect, useRef } from "react";

/**
 * 마우스에 반응하는 인터랙션 두 가지.
 *
 * 둘 다 감쇠 보간으로 커서를 따라가고, 벗어나면 원래 자리로 되돌아온다.
 * 마우스가 없는 환경(터치)과 모션을 줄인 설정에서는 아무것도 하지 않는다.
 */
// 함수 "선언" 으로 두는 것이 중요하다. 호출은 전부 useEffect 안에서만 일어나므로
// 프리렌더(Node)에서는 실행되지 않고, 두 컴포넌트 모두 children 을 그대로 감싸 내보낸다.
// 기울기·이동은 ref 로 style.transform 을 직접 쓰는 방식이라 서버 출력에는 흔적이 남지 않는다.
const canHover = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: fine)").matches &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 커서 방향으로 기울어지는 3D 틸트 */
export default function Tilt({
  children,
  max = 12, // 최대 기울기(deg)
  perspective = 900,
  damping = 0.18,
  className = "",
  style,
}) {
  const hostRef = useRef(null);
  const innerRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    const inner = innerRef.current;
    if (!host || !inner || !canHover()) return;

    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let raf = 0;

    const tick = () => {
      cur.x += (target.x - cur.x) * damping;
      cur.y += (target.y - cur.y) * damping;
      inner.style.transform = `rotateX(${cur.y.toFixed(3)}deg) rotateY(${cur.x.toFixed(3)}deg)`;
      if (
        Math.abs(target.x - cur.x) < 0.01 &&
        Math.abs(target.y - cur.y) < 0.01
      ) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onMove = (e) => {
      const r = host.getBoundingClientRect();
      // 중심을 0 으로 두고 -0.5 ~ 0.5
      target.x = ((e.clientX - r.left) / r.width - 0.5) * max * 2;
      target.y = -((e.clientY - r.top) / r.height - 0.5) * max * 2;
      start();
    };
    const onLeave = () => {
      target.x = 0;
      target.y = 0;
      start();
    };

    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [max, damping]);

  return (
    <div ref={hostRef} className={className} style={{ perspective, ...style }}>
      <div
        ref={innerRef}
        className="will-change-transform"
        style={{ transformStyle: "preserve-3d" }}
      >
        {children}
      </div>
    </div>
  );
}

/** 커서가 가까이 오면 끌려오는 자석 버튼 */
export function Magnetic({ children, strength = 0.35, className = "", style }) {
  const hostRef = useRef(null);
  const innerRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    const inner = innerRef.current;
    if (!host || !inner || !canHover()) return;

    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let raf = 0;

    const tick = () => {
      cur.x += (target.x - cur.x) * 0.2;
      cur.y += (target.y - cur.y) * 0.2;
      inner.style.transform = `translate3d(${cur.x.toFixed(2)}px, ${cur.y.toFixed(2)}px, 0)`;
      if (
        Math.abs(target.x - cur.x) < 0.05 &&
        Math.abs(target.y - cur.y) < 0.05
      ) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onMove = (e) => {
      const r = host.getBoundingClientRect();
      target.x = (e.clientX - (r.left + r.width / 2)) * strength;
      target.y = (e.clientY - (r.top + r.height / 2)) * strength;
      start();
    };
    const onLeave = () => {
      target.x = 0;
      target.y = 0;
      start();
    };

    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [strength]);

  return (
    <div ref={hostRef} className={className} style={style}>
      <div ref={innerRef} className="will-change-transform">
        {children}
      </div>
    </div>
  );
}
