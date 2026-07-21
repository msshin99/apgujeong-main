import { asset } from "./lib/asset.js";

/**
 * <img> 를 그대로 대신하는 컴포넌트.
 *
 * 왜 필요한가:
 *   scripts/optimize-images.mjs 가 원본 한 장마다 AVIF·WebP 사다리를 구워 둔다.
 *   하지만 <img src> 하나로는 브라우저에게 "AVIF 를 읽을 수 있으면 그걸 받고,
 *   상자가 241px 이니 484px 짜리면 충분하다" 를 알려 줄 방법이 없다.
 *   그래서 <picture> + srcset 으로 감싼다.
 *
 * 쓰는 법 — 기존 <img> 를 Img 로 바꾸기만 하면 된다:
 *   <img src={asset("/images/wine/w1.png")} alt="" className="…" />
 *   <Img src={asset("/images/wine/w1.png")} alt="" className="…" />
 *
 *   className·style·loading·decoding·fetchPriority 등은 전부 <img> 로 그대로 넘어간다.
 *   호출부에서 고칠 것이 이름 하나뿐이라 바꾸다 실수할 여지가 없다.
 *
 * 절대 깨지지 않는다:
 *   매니페스트에 없는 주소는 평범한 <img> 로 나간다. 이게 곁다리 기능이 아니라
 *   **필수 동작**이다 —
 *     · 공지 이미지는 Supabase Storage 에서 런타임에 오는 원격 주소라 빌드 때
 *       존재하지도 않는다(NoticeDetail.jsx·Notice.jsx).
 *     · 파이프라인을 아직 안 돌린 개발 서버에서는 매니페스트 파일 자체가 없다.
 *   두 경우 모두 오늘과 똑같이 그려진다.
 */

/* 매니페스트는 빌드가 만들어 내는 파일이라 저장소에 없을 수 있다.
   그래서 평범한 import 를 쓰면 안 된다 — 파일이 없을 때 빌드가 통째로 죽는다.
   glob 은 맞는 파일이 하나도 없으면 그냥 빈 객체를 준다.
   브라우저 번들과 프리렌더(vite.ssrLoadModule) 양쪽에서 똑같이 동작한다 */
const found = import.meta.glob("./generated/*.json", { eager: true, import: "default" });
const MANIFEST = Object.entries(found).find(([k]) => k.endsWith("image-manifest.json"))?.[1] ?? {};

const BASE = import.meta.env.BASE_URL || "/";

/**
 * 화면에 적힌 주소를 매니페스트 열쇠("/images/…")로 되돌린다.
 *
 * 호출부는 asset() 을 거친 주소를 넘긴다. 배포에서는 앞에 저장소 이름이 붙어
 * "/apgujeong-main/images/a.png" 가 되므로 그 접두사를 떼야 찾을 수 있다.
 */
function keyOf(src) {
  if (typeof src !== "string" || !src) return null;
  // 원격 주소(Supabase Storage)·data URI 는 우리 것이 아니다
  if (/^([a-z]+:)?\/\//i.test(src) || src.startsWith("data:")) return null;
  let p = src;
  if (BASE !== "/" && p.startsWith(BASE)) p = `/${p.slice(BASE.length)}`;
  if (!p.startsWith("/")) p = `/${p}`;
  return p;
}

const srcset = (list) => list.map((v) => `${asset(v.src)} ${v.w}w`).join(", ");

export default function Img({
  src,
  alt = "",
  sizes,
  width,
  height,
  className,
  style,
  wrapperClassName,
  wrapperStyle,
  ...rest
}) {
  const entry = MANIFEST[keyOf(src)];

  /* 매니페스트에 없다 → 손대지 않는다. 위 "절대 깨지지 않는다" 참고 */
  if (!entry) {
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
        style={style}
        {...rest}
      />
    );
  }

  /* sizes 를 빠뜨리면 브라우저는 w 서술자를 100vw 로 가정한다. 그러면 241px 짜리
     와인 병 상자에도 제일 큰 장을 받아 가서 사다리를 만든 의미가 사라진다.
     매니페스트가 실측한 상자 최대 폭으로 만들어 둔 값을 기본으로 쓴다 */
  const finalSizes = sizes ?? entry.sizes;

  return (
    /* display:contents — <picture> 가 레이아웃에서 완전히 사라져서 <img> 가
       부모의 직접 자식처럼 배치된다. 이게 있어야 감싸기 전후의 화면이 같다.
       (flex/grid 칸, absolute inset-0, w-full 이 전부 그대로 동작한다) */
    <picture className={wrapperClassName} style={{ display: "contents", ...wrapperStyle }}>
      <source type="image/avif" srcSet={srcset(entry.avif)} sizes={finalSizes} />
      <source type="image/webp" srcSet={srcset(entry.webp)} sizes={finalSizes} />
      <img
        src={asset(entry.fallback)}
        alt={alt}
        /* 원본 비율을 알려 준다. 이미지가 도착하기 전에도 브라우저가 자리를
           미리 잡아 둘 수 있어 글이 밀리지 않는다(CLS).
           호출부가 직접 넘긴 값이 있으면 그쪽을 존중한다 */
        width={width ?? entry.w}
        height={height ?? entry.h}
        className={className}
        style={style}
        {...rest}
      />
    </picture>
  );
}
