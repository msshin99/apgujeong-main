import { useEffect, useRef, useState } from "react";

/**
 * 네이버 지도(Maps JavaScript API v3) 연동.
 *
 * 스크립트는 클라이언트 키가 있어야 로드된다. 키는 소스에 넣지 않고
 * 환경변수로 주입한다 — 프로젝트 루트 .env 파일에:
 *
 *   VITE_NAVER_MAP_CLIENT_ID=발급받은_키
 *
 * 키 파라미터 이름은 발급 시점에 따라 다르다(신규 ncpKeyId / 구 ncpClientId).
 * 지도가 안 뜨면 VITE_NAVER_MAP_KEY_PARAM 으로 바꿔 줄 수 있다.
 *
 * 키가 없으면 지도를 띄우지 않고 fallback(정적 이미지)을 그대로 보여준다.
 */
const CLIENT_ID = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;

/**
 * 키 파라미터 이름은 발급 시점에 따라 다르다(신규 ncpKeyId / 구 ncpClientId).
 * 어느 쪽인지 겉보기로는 알 수 없어서, 강제 지정이 없으면 순서대로 시도한다.
 * 잘못된 이름을 쓰면 스크립트 자체는 200 으로 내려오고 인증 실패 콜백이 따로 오므로
 * navermap_authFailure 를 걸어 두고 판별한다.
 */
const FORCED_PARAM = import.meta.env.VITE_NAVER_MAP_KEY_PARAM;
const KEY_PARAMS = FORCED_PARAM ? [FORCED_PARAM] : ["ncpKeyId", "ncpClientId"];

let loader = null;

/**
 * 인증 실패 신호는 스크립트 onload 뒤에 비동기로 온다. 예전에는 onload 800ms 뒤
 * 무조건 성공으로 확정(latch)했는데, 이게 이 파일의 가장 큰 버그였다.
 *  - 키 파라미터 이름이 틀려도 스크립트는 200 으로 내려오므로 항상 성공 판정 →
 *    ncpClientId 폴백이 영영 실행되지 않는 dead code 였고,
 *  - 800ms 를 넘겨 도착한 인증 실패는 통째로 묻혀 failed 가 false 로 남아
 *    정적 이미지 fallback 대신 빈 회색 박스만 보였다.
 * 그래서 지금은 "SDK 가 실제로 올라왔는가 + 인증 실패 신호가 없었는가"로 판정하고,
 * 늦게 도착한 실패도 구독자에게 흘려보낸다.
 */
let authFailed = false;
const authSubscribers = new Set();

if (typeof window !== "undefined") {
  window.navermap_authFailure = () => {
    authFailed = true;
    authSubscribers.forEach((fn) => fn());
  };
}

/** 인증 실패를 나중에 통보받기 위한 구독. 해제 함수를 돌려준다 */
function onAuthFailure(fn) {
  authSubscribers.add(fn);
  return () => authSubscribers.delete(fn);
}

/** 인증 실패 콜백이 도착할 여유. 이 시간이 지나도 조용하면 정상으로 본다 */
const AUTH_GRACE_MS = 1500;
/** 스크립트가 아예 응답하지 않는 경우의 상한. 성공이 아니라 실패로 끝나야 한다 */
const LOAD_TIMEOUT_MS = 8000;

function loadWith(param) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let graceTimer = null;
    const script = document.createElement("script");

    const done = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(graceTimer);
      clearTimeout(hardTimer);
      unsubscribe();
      fn(arg);
    };

    // 유예 시간 안에 인증 실패가 오면 즉시 실패로 끊어 다음 파라미터로 넘어간다
    const unsubscribe = onAuthFailure(() => done(reject, new Error(`인증 실패 (${param})`)));
    const hardTimer = setTimeout(
      () => done(reject, new Error(`응답 없음 (${param})`)),
      LOAD_TIMEOUT_MS,
    );

    // geocoder 서브모듈을 함께 받아 주소 문자열로 좌표를 구한다
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?${param}=${CLIENT_ID}&submodules=geocoder`;
    script.async = true;
    script.onerror = () => done(reject, new Error(`스크립트 로드 실패 (${param})`));
    script.onload = () => {
      graceTimer = setTimeout(() => {
        // 타이머가 아니라 SDK 실재 여부와 인증 실패 신호로 성패를 가른다
        if (authFailed) return done(reject, new Error(`인증 실패 (${param})`));
        if (!window.naver?.maps?.Map) {
          return done(reject, new Error(`SDK 초기화 실패 (${param})`));
        }
        done(resolve);
      }, AUTH_GRACE_MS);
    };
    document.head.appendChild(script);
  }).catch((err) => {
    // 다음 시도가 깨끗한 상태에서 시작하도록 흔적을 지운다
    document.querySelectorAll(`script[src*="${param}=${CLIENT_ID}"]`).forEach((el) => el.remove());
    delete window.naver;
    authFailed = false;
    throw err;
  });
}

function loadScript() {
  if (window.naver?.maps) return Promise.resolve();
  if (loader) return loader;

  authFailed = false;
  const attempt = KEY_PARAMS.reduce(
    (chain, param) => chain.catch(() => loadWith(param)),
    Promise.reject(new Error("시작")),
  );
  // 실패한 promise 를 캐시에 남겨 두면 재마운트해도 영영 재시도되지 않는다
  loader = attempt.catch((err) => {
    loader = null;
    throw err;
  });
  return loader;
}

/**
 * 주소 문자열 → 좌표.
 * 주소를 단일 기준으로 삼아, 좌표를 따로 관리하지 않아도 되게 한다.
 * 지오코딩 API 가 꺼져 있거나 실패하면 null 을 돌려주고 근사 좌표로 대체한다.
 */
function geocode(address) {
  return new Promise((resolve) => {
    const service = window.naver?.maps?.Service;
    if (!service?.geocode) return resolve(null);

    service.geocode({ query: address }, (status, res) => {
      if (status !== service.Status.OK) return resolve(null);
      const found = res?.v2?.addresses?.[0];
      resolve(found ? { lat: Number(found.y), lng: Number(found.x) } : null);
    });
  });
}

const OVERVIEW_ZOOM = 15; // 처음 지도를 열었을 때
const FOCUS_ZOOM = 18; // 지점을 고르면 건물이 보일 만큼 확대

/** 캡처 단계 + preventDefault 가능하도록 non-passive */
const WHEEL_OPTS = { passive: false, capture: true };

export default function NaverMap({
  stores,
  active,
  onSelect,
  focusKey, // 같은 지점을 다시 눌러도 확대되도록 하는 신호
  className,
  style,
  fallback,
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const posRef = useRef([]); // 지오코딩으로 확정된 좌표
  const wheelHostRef = useRef(null);
  const wheelHandlerRef = useRef(null);
  const [failed, setFailed] = useState(!CLIENT_ID);

  // 지도 생성 (한 번만)
  useEffect(() => {
    if (!CLIENT_ID) {
      // 개발 중에만 알린다. 키가 없으면 정적 이미지로 대체된다
      if (import.meta.env.DEV) {
        console.warn("[NaverMap] VITE_NAVER_MAP_CLIENT_ID 가 없어 정적 이미지를 사용합니다.");
      }
      return;
    }

    let cancelled = false;
    /* 로드 중의 인증 실패는 loadScript 안에서 다음 키 파라미터로 넘어가는 신호이므로
       여기서 가로채면 폴백이 죽는다. 구독은 로드가 끝난 뒤에만 건다 */
    let unsubscribe = () => {};

    /* 지도를 걷어 낸다. 언마운트뿐 아니라 "지도가 뜬 뒤 인증 실패" 로 정적 이미지
       fallback 으로 갈아탈 때도 필요하다 — 그 순간 hostRef 의 div 가 DOM 에서
       빠지므로, 정리하지 않으면 지도 인스턴스와 마커, window 에 건 wheel 리스너가
       주인 없이 남는다. 두 번 불려도 안전하도록 각 단계는 비우고 지나간다 */
    const teardown = () => {
      if (wheelHandlerRef.current) {
        // 등록할 때와 같은 옵션(capture)으로 지워야 해제된다
        window.removeEventListener("wheel", wheelHandlerRef.current, WHEEL_OPTS);
      }
      wheelHostRef.current = null;
      wheelHandlerRef.current = null;
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      mapRef.current?.destroy?.();
      mapRef.current = null;
    };
    loadScript()
      .then(async () => {
        if (cancelled || !hostRef.current) return;
        const { naver } = window;

        // 주소로 좌표를 구하고, 실패한 항목만 근사 좌표를 쓴다
        const resolved = await Promise.all(
          stores.map(async (s) => (await geocode(s.address)) ?? { lat: s.lat, lng: s.lng }),
        );
        if (cancelled || !hostRef.current) return;
        posRef.current = resolved;

        /* 로드 성공 직후 ~ 여기까지(지오코딩 왕복 수백 ms)는 구독자가 하나도 없다.
           그 사이 도착한 인증 실패는 모듈 플래그에만 남으므로, 구독을 걸기 전에
           먼저 플래그를 확인해 놓친 신호를 되살린다. 아직 지도를 만들기 전이라
           걷어 낼 것이 없어 teardown 없이 그대로 fallback 으로 넘어간다 */
        if (authFailed) {
          setFailed(true);
          return;
        }

        // 지도가 뜬 뒤 늦게 도착하는 인증 실패도 정적 이미지 fallback 으로 이어져야 한다
        unsubscribe = onAuthFailure(() => {
          if (cancelled) return;
          // 화면을 갈아타기 전에 지도부터 걷어 낸다 (이 효과의 클린업은 언마운트 전까지 안 돈다)
          teardown();
          setFailed(true);
        });

        mapRef.current = new naver.maps.Map(hostRef.current, {
          center: new naver.maps.LatLng(resolved[0].lat, resolved[0].lng),
          zoom: OVERVIEW_ZOOM,
          // 지도 위에 검색 패널이 얹히므로 기본 컨트롤은 오른쪽으로 몰아둔다
          zoomControl: true,
          zoomControlOptions: { position: naver.maps.Position.RIGHT_CENTER },
          // 끌어서 이동
          draggable: true,
          /* 휠 확대는 네이버 기본 기능에 맡긴다.
             직접 zoomBy 를 호출하는 방식은 네이버 내부 핸들러와 경쟁해서 잘 먹지 않았다.
             "Ctrl 일 때만" 조건은 아래에서 일반 휠을 걸러내는 방식으로 만든다. */
          scrollWheel: true,
          pinchZoom: true,
        });

        /* 확대는 네이버가 처리하고, 여기서는 "Ctrl 없이 굴린 휠"만 걸러낸다.
           window 캡처 단계라 네이버 핸들러보다 먼저 잡는다.
           stopPropagation 만 호출하고 preventDefault 는 부르지 않으므로
           네이버는 확대하지 않고 브라우저는 페이지를 정상 스크롤한다. */
        wheelHostRef.current = hostRef.current;
        wheelHandlerRef.current = (e) => {
          if (e.ctrlKey) return; // Ctrl 이면 그대로 흘려보내 네이버가 확대하게 둔다
          const host = wheelHostRef.current;
          if (!host || !host.contains(e.target)) return;
          e.stopPropagation();
        };
        window.addEventListener("wheel", wheelHandlerRef.current, WHEEL_OPTS);

        markersRef.current = stores.map((store, i) => {
          const marker = new naver.maps.Marker({
            map: mapRef.current,
            position: new naver.maps.LatLng(resolved[i].lat, resolved[i].lng),
            title: store.name,
          });
          naver.maps.Event.addListener(marker, "click", () => onSelect?.(i));
          return marker;
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      unsubscribe();
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 선택된 지점으로 이동하면서 확대한다.
     morph 는 중심 이동과 확대를 한 번에 부드럽게 처리한다. */
  useEffect(() => {
    const map = mapRef.current;
    const pos = posRef.current[active] ?? stores[active];
    if (!map || !pos || !window.naver?.maps) return;

    const { naver } = window;
    const latlng = new naver.maps.LatLng(pos.lat, pos.lng);

    if (typeof map.morph === "function") {
      map.morph(latlng, FOCUS_ZOOM);
    } else {
      map.setCenter(latlng);
      map.setZoom(FOCUS_ZOOM);
    }

    // 고른 지점의 마커를 앞으로 빼고 잠깐 튀게 한다
    markersRef.current.forEach((marker, i) => {
      marker.setZIndex(i === active ? 200 : 1);
      marker.setAnimation(i === active ? naver.maps.Animation.BOUNCE : null);
    });
    const stop = setTimeout(() => {
      markersRef.current[active]?.setAnimation(null);
    }, 1600);

    return () => clearTimeout(stop);
  }, [active, focusKey, stores]);

  if (failed) return fallback ?? null;

  return <div ref={hostRef} className={className} style={style} />;
}
