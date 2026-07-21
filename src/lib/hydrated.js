import { useSyncExternalStore } from "react";

/**
 * 하이드레이션 관문.
 *
 * 프리렌더 HTML 은 언제나 데스크톱 분기다(useBreakpoint 의 readName 참고).
 * hydrateRoot 가 그 DOM 을 이어받으려면 **브라우저의 첫 렌더도 반드시 같은 트리**여야 한다.
 * 그래서 창 폭·배율·등장 모션처럼 브라우저에서만 알 수 있는 값은 전부 여기를 거친다 —
 * 하이드레이션 중에는 서버가 본 값을, 커밋이 끝난 뒤에는 진짜 값을 돌려준다.
 *
 * useState + useEffect 로 흉내내지 않고 useSyncExternalStore 를 쓰는 이유:
 * getServerSnapshot 은 SSR 뿐 아니라 **브라우저의 하이드레이션 렌더에서도** 쓰인다.
 * "첫 렌더는 서버 값" 이라는 규칙이 관례가 아니라 React 안에서 보장된다.
 */
let hydrated = false;
const listeners = new Set();

/** main.jsx 의 HydrationGate 만 부른다. 페인트 전(useLayoutEffect)이어야 한다 */
export function markHydrated() {
  if (hydrated) return;
  hydrated = true;
  for (const fn of listeners) fn();
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getSnapshot = () => hydrated;
/* 하이드레이션 렌더에서는 언제나 false — 서버가 그린 트리와 같은 값을 내야 한다 */
const getServerSnapshot = () => false;

export function useHydrated() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
