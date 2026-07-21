import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageShell from "./PageShell.jsx";
import Reveal, { RevealText } from "../Reveal.jsx";
import Img from "../Img.jsx";
import { bumpViews, getNotice, seededNotice } from "../lib/notices.js";

/**
 * Figma: Frame 1707486793 (332:1819) — x 320 / 1280 x 672
 *
 *   제목 블록 332:1821  gap 16
 *     ├ 제목  Pretendard Bold 38 / lh 48 / -0.95 / 검정
 *     └ 메타  gap 16, 묶음마다 gap 8 — 라벨 #767676 14/20, 구분선 1x12 #e5e5ec, 값 검정 14/22
 *   본문 332:1836  위아래 실선 #e5e5ec, py 36, 문단 간 24
 *     └ Pretendard Light 16 / lh 24 / -0.4 / #767676
 *   목록으로 332:1845  w 160, bg #e61911, px 20 / py 16, 흰 글씨 Medium 14 / lh 22
 *   본문 ↔ 버튼 gap 60
 */
const CONTENT_W = 1280;

/** 목록 카드 썸네일(544 x 300)과 같은 비율. crop 값이 이 비율을 전제로 계산돼 있다 */
const THUMB_RATIO = 300 / 544;

/** 라벨 | 값 묶음 */
function Meta({ label, value }) {
  return (
    <span className="flex items-center gap-[8px]">
      <span className="text-[13px] leading-[20px] font-normal tracking-[-0.33px] whitespace-nowrap text-[#767676] md:text-[14px] md:tracking-[-0.35px]">
        {label}
      </span>
      <span className="h-[12px] w-px shrink-0 bg-[#e5e5ec]" />
      <span className="text-[13px] leading-[22px] font-normal tracking-[-0.33px] whitespace-nowrap text-black md:text-[14px] md:tracking-[-0.35px]">
        {value}
      </span>
    </span>
  );
}

/**
 * 화면이 쓰는 글 모양(notices.js 의 toView 결과)을 SEO 계약의 이름으로 옮긴다.
 *
 * `seo.js` 는 DB 칼럼 이름(seo_title / published_at / og_path)을 그대로 읽도록 짜여 있다.
 * 프리렌더 스크립트가 Supabase 행을 그대로 넘기기 때문인데, 화면 쪽은 이미 다듬어진
 * 모양을 쓰고 있어 여기서 한 번 맞춰 준다. **양쪽이 같은 함수로 계산되게 하는 것이 목적** 이라
 * 값을 새로 만들지 않고 이름만 바꾼다.
 */
function toSeoNotice(notice) {
  if (!notice) return null;
  return {
    id: notice.id,
    title: notice.detailTitle,
    body: notice.body,
    author: notice.author,
    /* 화면용 날짜는 2026.04.22 인데 schema.org 의 datePublished 는 ISO 여야 한다 */
    published_at: String(notice.date || "").replace(/\./g, "-"),
    /* og:image 는 **항상 공개 URL 일 때만** 쓴다. 저장소 버킷을 비공개로 돌리면
       image 가 만료되는 서명 URL(?token=…)이 되는데, 크롤러는 로그인하지 않으므로
       그런 주소를 내보내면 이미지 오류만 남는다. 물음표가 붙어 있으면 넘기지 않는다 */
    og_path: notice.image && !String(notice.image).includes("?") ? notice.image : "",
  };
}

/**
 * 한 방문에 한 번만 세도록 표시해 두고, 이미 셌으면 false 를 돌려준다.
 * 시크릿 모드나 저장소가 막힌 환경에서는 예외가 나므로 조용히 넘긴다.
 */
function markViewed(id) {
  try {
    const key = `notice-viewed:${id}`;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
  } catch {
    /* 저장소를 못 쓰면 ref 잠금만으로 만족한다 */
  }
  return true;
}

export default function NoticeDetail() {
  const { id } = useParams();
  /* 프리렌더는 effect 를 돌리지 않는다. 씨앗이 있으면 첫 렌더부터 완성된 글을 그려서
     정적 HTML 에 본문이 실리게 한다. 브라우저에서는 언제나 null 이라 종전과 같다 */
  const seed = seededNotice(id);
  const [notice, setNotice] = useState(seed);
  const [state, setState] = useState(seed ? "ready" : "loading"); // loading | ready | missing | error

  /* RPC 자체는 익명이고 서버에서 조이는 장치가 없다. 새로고침만 반복해도 숫자가
     부풀고, 개발 중에는 StrictMode 가 effect 를 두 번 돌린다. 막을 수는 없으니
     최소한 우리 쪽에서 글 하나당 한 번만 올리도록 예의만 지킨다 */
  const bumpedRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setState("loading");

    getNotice(id)
      .then((row) => {
        if (!alive) return;
        setNotice(row);
        setState(row ? "ready" : "missing");
        /* 조회수는 글이 실제로 있을 때만. 실패해도 글은 보여야 하므로 기다리지 않는다 */
        if (row && bumpedRef.current !== id && markViewed(id)) {
          bumpedRef.current = id;
          bumpViews(id).catch(() => {});
        }
      })
      .catch((err) => {
        if (!alive) return;
        console.error("[NoticeDetail]", err);
        setState("error");
      });

    return () => {
      alive = false;
    };
  }, [id]);

  if (state === "loading") {
    return (
      <PageShell label="News" title="공지사항" hero={false}>
        <div className="mx-auto w-full max-w-[1280px] animate-pulse px-[20px] pt-[48px] pb-[120px] sm:px-[24px] md:px-[40px] md:pt-[72px]">
          <div className="h-[40px] w-3/5 bg-[#f1f1f4]" />
          <div className="mt-[20px] h-[20px] w-[320px] bg-[#f1f1f4]" />
          <div className="mt-[28px] h-[280px] w-full bg-[#f1f1f4]" />
        </div>
      </PageShell>
    );
  }

  if (state !== "ready") {
    return (
      <PageShell label="News" title="공지사항" hero={false}>
        <div className="flex w-full flex-col items-center gap-[32px] px-[20px] py-[120px] text-center font-pretendard">
          <p className="text-[18px] leading-[26px] font-medium tracking-[-0.45px] text-[#222]">
            {state === "missing"
              ? "요청하신 공지사항을 찾을 수 없습니다."
              : "공지사항을 불러오지 못했습니다."}
          </p>
          <BackButton />
        </div>
      </PageShell>
    );
  }

  return (
    /* 글마다 제목·요약·발행일이 다르므로 그 값을 껍데기로 올려 보낸다.
       head 갱신은 PageShell 안의 useSeo 한 곳에서만 일어난다 — 두 군데서 쓰면
       나중에 실행된 쪽이 이겨서 어느 값이 남는지 예측할 수 없게 된다 */
    <PageShell
      label="News"
      title="공지사항"
      hero={false}
      seoContext={{ notice: toSeoNotice(notice) }}
    >
      <div className="w-full bg-white px-[20px] pt-[48px] pb-[100px] sm:px-[24px] md:px-[40px] md:pt-[72px] md:pb-[150px] lg:pb-[200px]">
        <div
          className="mx-auto flex w-full flex-col items-center gap-[40px] font-pretendard md:gap-[60px]"
          style={{ maxWidth: CONTENT_W }}
        >
          <div className="flex w-full flex-col items-start gap-[16px]">
            {/* Figma 332:1821 — 제목 + 메타 */}
            <div className="flex w-full flex-col items-start gap-[12px] md:gap-[16px]">
              {/* Figma 332:1822 — Pretendard Bold 38 / lh 48 / -0.95 */}
              <h2 className="w-full text-[clamp(22px,4.2vw,38px)] leading-[1.28] font-bold tracking-[-0.025em] break-words text-black">
                <RevealText lines={[notice.detailTitle]} delay={60} step={22} />
              </h2>
              {/* Figma 332:1823 — 메타 3묶음, gap 16 */}
              <Reveal delay={220} y={14} duration={600} className="w-full">
                <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px]">
                  <Meta label="작성자" value={notice.author} />
                  <Meta label="게시일" value={notice.date} />
                  <Meta label="조회수" value={notice.views.toLocaleString()} />
                </div>
              </Reveal>
            </div>

            {/* Figma 332:1836 — 위아래 실선, py 36, 문단 간 24 */}
            <Reveal delay={340} y={20} duration={700} className="w-full">
              <div className="flex w-full flex-col items-start gap-[20px] border-y border-solid border-[#e5e5ec] py-[28px] md:gap-[24px] md:py-[36px]">
                {/* 목록 카드에서 보던 사진을 본문 머리에 그대로 이어 준다.
                    crop 값은 544x300 (비율 1.813) 기준이라 같은 비율의 상자에 넣어야
                    카드에서 보던 구도가 흐트러지지 않는다. */}
                {notice.image && (
                  <div
                    className="relative mb-[8px] w-full overflow-hidden bg-[#f6f7fb] md:mb-[12px]"
                    style={{ paddingTop: `${(THUMB_RATIO * 100).toFixed(2)}%` }}
                  >
                    {/* 예비 데이터는 사다리를, DB 원격 주소는 그대로 지나간다 */}
                    <Img
                      src={notice.image}
                      alt=""
                      className={`absolute left-0 max-w-none object-cover ${
                        notice.crop ? "w-full" : "inset-0 size-full"
                      }`}
                      style={notice.crop ?? undefined}
                    />
                  </div>
                )}

                {notice.body.map((paragraph, i) => (
                  /* 원문의 줄바꿈을 그대로 살린다 — 문단 안 줄바꿈은 24px 행간 그대로 */
                  <p
                    key={i}
                    className="w-full text-[15px] leading-[24px] font-light tracking-[-0.38px] whitespace-pre-line text-[#767676] md:text-[16px] md:tracking-[-0.4px]"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={140} y={20} duration={600}>
            <BackButton />
          </Reveal>
        </div>
      </div>
    </PageShell>
  );
}

/** Figma 332:1845 — w 160, bg #e61911 */
function BackButton() {
  return (
    <Link
      to="/notice"
      className="flex w-[160px] items-center justify-center bg-[#e61911] px-[20px] py-[16px] text-[14px] leading-[22px] font-medium tracking-[-0.35px] whitespace-nowrap text-white transition-colors duration-300 hover:bg-[#c2140e]"
    >
      목록으로
    </Link>
  );
}
