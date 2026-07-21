import { useEffect, useState } from "react";
import { normalizeRoute, resolveMeta } from "./lib/seo.js";
import { loadSeoPages } from "./lib/seoStore.js";

/**
 * 자주 묻는 질문 — **JSON-LD 의 FAQPage 와 같은 데이터로 그리는 화면 블록.**
 *
 * 왜 필요한가:
 *   구글의 FAQ 구조화 데이터 정책은 "마크업의 질문과 답이 그 페이지에서 사람에게도
 *   보여야 한다" 를 요구한다. 마크업만 있고 본문에 없는 문답은 리치 결과가 안 나오는
 *   정도로 끝나지 않고 수동 조치 사유다. seoData.js 의 주석도 같은 말을 하고 있다 —
 *   "faq 를 채운 라우트는 화면에도 같은 문답이 보여야 한다".
 *   실제로는 홈의 문답 네 개 중 세 개가 어느 섹션에도 없었다. 그 구멍을 메우는 것이
 *   이 컴포넌트의 유일한 목적이다.
 *
 * 그래서 **문구를 여기서 다시 적지 않는다.** head 를 만드는 것과 똑같이
 * `resolveMeta(route).faq` 를 부른다. 화면용 문구를 따로 두면 언젠가 한쪽만 고쳐지고,
 * 그때는 크롤러가 읽은 답과 사람이 읽는 답이 달라진다 — 고치려던 문제로 되돌아간다.
 * 읽기 불편한 문장이 있어도 여기서 다듬지 않는다. 고칠 곳은 seoData.js(또는 관리자 화면)다.
 *
 * 레이아웃은 1920 캔버스(useWidthScale)를 쓰지 않는다.
 *   이 블록에는 Figma 좌표로 박힌 도형이 없고 길이가 제각각인 **글만** 있다.
 *   캔버스 배율을 걸면 폭이 좁을 때 본문까지 같이 줄어들어 읽기가 나빠진다.
 *   그래서 /brand 섹션들이 쓰는 방식 — max-w + 반응형 좌우 여백 — 을 따른다.
 *
 * Reveal 로 감싸지 않는 것도 의도다. RelatedLinks 와 같은 이유로,
 * 이 블록은 프리렌더 HTML 에 그대로 보여야 하고 opacity 0 으로 시작하는 마크업은
 * 숨긴 텍스트로 오인될 여지가 있다.
 */

/* ============================================================
 * DB override 겹치기
 * ============================================================ */

/**
 * 관리자 화면에서 문답을 고치면 head 의 JSON-LD 는 useSeo 가 DB 값으로 갈아 끼운다.
 * 이 블록만 정적 원본을 보고 있으면 **바로 그 순간 둘이 갈라진다.** 그래서 같은 표를 읽는다.
 *
 * useSeo 의 overlay 와 규칙을 맞춘다 — 문서당 한 번만 읽고, `source: "static"` 이면
 * 겹치지 않는다(그 값은 resolveMeta 가 이미 쓰고 있는 원본과 같다).
 * 지금은 useSeo 가 자기 overlay 를 내보내지 않아 요청이 한 번 더 나간다.
 * 나중에 그쪽에서 공유 가능한 형태로 빼면 이 블록은 지우고 그것을 쓰면 된다.
 * @type {Promise<Map<string, object>|null>|null}
 */
let pagesPromise = null;
let dbPages = null;

function ensureDbPages() {
  if (pagesPromise) return pagesPromise;
  pagesPromise = loadSeoPages()
    .then((p) => {
      dbPages = p?.source === "db" ? new Map(p.rows.map((r) => [r.route, r])) : null;
      return dbPages;
    })
    .catch(() => {
      /* SEO 표가 없거나(마이그레이션 전) 네트워크가 막혀도 화면은 멀쩡해야 한다.
         정적 원본으로 이미 올바른 문답이 그려져 있으므로 조용히 넘어간다 */
      return dbPages;
    });
  return pagesPromise;
}

/**
 * 이 라우트의 FAQ 를 화면에 그린다. 문답이 없으면 아무것도 그리지 않는다.
 *
 * @param {object} props
 * @param {string} props.routePath      - 라우트 경로("/", "/menu"). useSeo 에 넘기는 값과 같아야 한다
 * @param {object} [props.seoContext]   - useSeo 에 넘기는 것과 같은 맥락(공지 상세의 글 등)
 */
export default function FaqSection({ routePath, seoContext }) {
  /* DB override 가 도착하면 한 번 더 그린다. SSR(renderToString)과 하이드레이션
     첫 렌더에서는 false 라 양쪽이 정적 원본으로 같다 — 마크업이 어긋나지 않는다 */
  const [overlayReady, setOverlayReady] = useState(false);
  useEffect(() => {
    let alive = true;
    ensureDbPages().then(() => {
      if (alive) setOverlayReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const route = normalizeRoute(routePath);
  const given = seoContext ?? {};
  /* 우선순위(DB → 정적 → 기본값)는 resolveMeta 가 이미 알고 있다. 여기서 다시 정하지 않는다 */
  const meta = resolveMeta(route, {
    ...given,
    dbPage: given.dbPage ?? (overlayReady ? (dbPages?.get(route) ?? null) : null),
  });
  const items = meta.faq;

  /* 문답이 없는 라우트(/notice, 공지 상세)에는 빈 제목만 남는 껍데기를 두지 않는다 */
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="faq-heading"
      className="w-full border-t border-solid border-[#e5e5ec] bg-white"
    >
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-[20px] px-[20px] py-[48px] font-pretendard sm:px-[24px] md:gap-[28px] md:px-[40px] md:py-[72px]">
        {/* 브랜드 빨강은 이 라벨 한 곳에만. 다른 섹션의 영문 라벨과 같은 규칙이다 */}
        <p className="text-[13px] leading-[20px] font-medium tracking-[-0.33px] text-[#e61911] md:text-[15px] md:leading-[22px]">
          FAQ
        </p>
        <h2
          id="faq-heading"
          className="text-[clamp(22px,3.6vw,34px)] leading-[1.32] font-bold tracking-[-0.025em] text-[#222]"
        >
          자주 묻는 질문
        </h2>

        <ul className="flex w-full flex-col border-t border-solid border-[#e5e5ec]">
          {items.map((item, i) => (
            <li key={item.q} className="border-b border-solid border-[#e5e5ec]">
              {/*
                네이티브 <details> 를 쓴다. 열림 상태를 자바스크립트로 들고 있지 않으므로
                renderToString 결과에 답 문장이 **그대로 들어간다** — 접힌 상태에서도
                텍스트가 DOM 에 있는 것이 FAQ 정책과 크롤러가 요구하는 조건이다.
                조건부 렌더로 답을 트리에서 빼면 그 조건이 깨진다.
                열고 닫기·키보드 조작·aria-expanded 는 브라우저가 알아서 한다.
              */}
              <details open={i === 0} className="group w-full">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-[16px] py-[18px] transition-colors duration-300 hover:text-[#e61911] md:py-[22px] [&::-webkit-details-marker]:hidden">
                  <h3 className="text-[15px] leading-[24px] font-medium tracking-[-0.38px] text-[#222] group-hover:text-inherit md:text-[17px] md:leading-[26px] lg:text-[18px]">
                    {item.q}
                  </h3>
                  {/* 열리면 45도 돌아 ×가 된다. 상태 표시는 <details> 가 이미 하고 있어
                      이 기호는 장식이므로 접근성 트리에서 뺀다 */}
                  <span
                    aria-hidden="true"
                    className="mt-[2px] shrink-0 text-[18px] leading-[20px] font-light text-[#999] transition-transform duration-300 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="pb-[20px] text-[14px] leading-[23px] font-normal tracking-[-0.35px] whitespace-pre-line text-[#767676] md:pb-[24px] md:text-[16px] md:leading-[26px]">
                  {item.a}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
