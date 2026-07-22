import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Reveal, { RevealText } from "./Reveal.jsx";
import Tilt from "./Tilt.jsx";
import Img from "./Img.jsx";
import { FEATURED_LIMIT, listFeatured, seededNotices } from "./lib/notices.js";
import { isSupabaseReady } from "./lib/supabase.js";
import { NOTICES as FALLBACK } from "./pages/noticeData.js";

/**
 * 홈 "NOTICE" 섹션. Figma: Frame 2095587710 (332:715) — 1680 x 704.
 *   헤더 332:716 (gap 24) + 카드 3장 332:722 (544 x 508, 가로 gap 24 → 544*3+24*2=1680)
 *     ├ 썸네일 544 x 300
 *     └ 본문 — 흰 배경, 테두리 #e5e5ec, p 28, 내부 gap 32
 *
 * 예전에는 1920 캔버스를 transform:scale 로 통째로 줄이는 데스크톱 트리와,
 * 1200 미만용 유동 트리를 **따로** 들고 있었다. 그 방식은 두 벌이 서로 어긋나고,
 * 1200~1440 구간에서 16px 본문이 배율(0.63~0.75)을 타 10~12px 로 그려지다가
 * 1200 밑으로 내려가면 유동 트리로 넘어가며 글자가 오히려 커지는 역전을 낳았다.
 *
 * 그래서 이 컴포넌트는 캔버스 배율을 버리고, 폭에 따라 CSS 로만 흐르는 **한 벌**로 바꾼다.
 *   · max-w-[1680px] mx-auto 컨테이너 + 유동 좌우 여백 → 1920 에서 좌우 120px 여백,
 *     카드 (1680-48)/3 = 544 로 피그마와 그대로 맞는다(1920 사용자는 바뀐 걸 못 느낀다).
 *   · grid-cols-1 → md 2열 → lg 3열 로 리플로우. 타이포는 px 을 브레이크포인트로 키워
 *     배율에 얹히지 않으므로 좁은 화면에서도 14~16px 본문이 읽힌다.
 */

/**
 * Supabase 연결 전에 쓰는 예비 데이터.
 *
 * 여기서 따로 적어 두면 id 가 목록·상세(noticeData.js)와 어긋나 카드를 눌렀을 때
 * "찾을 수 없습니다" 로 빠진다. 그래서 같은 원본에서 앞 3건을 그대로 잘라 쓴다.
 * crop(Figma 332:724 / 332:733 / 332:742) 도 원본이 들고 있다.
 */
const PLACEHOLDER = FALLBACK.slice(0, FEATURED_LIMIT);

/** 썸네일이 프레임 안에서 위아래로 미세하게 밀리는 폭 */
const PARALLAX = 26;

export default function Notice() {
  /* 관리자가 "메인 노출" 로 고른 3건.
     DB 가 연결돼 있으면 결과가 비어 있어도 그대로 따른다. 예비 데이터로 덮으면
     "등록했는데 왜 안 바뀌지" 하는 상황에서 원인을 알 수 없게 된다.
     연결 자체가 안 돼 있을 때만 예비 데이터를 쓴다. */
  /* 프리렌더는 effect 를 돌리지 않으므로 DB 가 연결된 빌드에서는 이 자리가 통째로
     비어 버린다. 빌드가 심어 둔 목록이 있으면 그 앞 3건으로 첫 렌더를 채운다 —
     is_featured 순서까지 재현하지는 않지만, 크롤러에게 빈 칸을 보이는 것보다 낫다.
     브라우저에서는 seededNotices() 가 언제나 null 이라 종전 동작 그대로다 */
  const seed = seededNotices();
  const [notices, setNotices] = useState(
    seed ? seed.slice(0, FEATURED_LIMIT) : isSupabaseReady ? null : PLACEHOLDER,
  );
  /* 못 불러온 것과 한 건도 없는 것은 다르다. 구분하지 않으면 네트워크·RLS 오류가
     "등록된 공지사항이 없습니다" 로 둔갑해 원인을 정반대로 읽게 된다 */
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isSupabaseReady) return;

    let alive = true;
    listFeatured()
      .then((rows) => {
        if (!alive) return;
        setFailed(false);
        setNotices(rows);
        if (import.meta.env.DEV && rows.length === 0) {
          console.warn(
            "[Notice] 메인에 실을 공지가 없습니다. " +
              "관리자 페이지에서 공지를 등록하고 ‘공개’ 상태인지 확인해 주세요.",
          );
        }
      })
      .catch((err) => {
        if (!alive) return;
        console.error("[Notice] 공지를 불러오지 못했습니다.", err);
        setFailed(true);
        setNotices([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const sectionRef = useRef(null);
  const parallaxRefs = useRef([]);

  useEffect(() => {
    /* 패럴랙스는 스크롤 위치에 맞춰 매 프레임 transform 을 다시 쓰는 JS 효과라
       CSS 로 대체할 방법이 없다. 다만 "좁은 화면(1200 미만)에서는 끈다" 는 판단만은
       폭을 읽어야 하므로, useBreakpoint 훅 대신 matchMedia 로 이 한 곳에서 직접 본다.
       (훅을 되살리면 이 컴포넌트가 다시 폭에 의존하게 되어 단일 트리의 취지가 흐려진다) */
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const wide = window.matchMedia("(min-width: 1200px)");
    let raf = 0;

    const clear = () => {
      parallaxRefs.current.forEach((node) => {
        if (node) node.style.transform = "";
      });
    };
    const update = () => {
      raf = 0;
      // 좁아지면 이동을 끄고 자리를 원위치로 되돌린다
      if (!wide.matches) return clear();
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // 섹션이 화면을 지나가는 동안 -1 → 1
      const p =
        (rect.top + rect.height / 2 - window.innerHeight / 2) /
        (window.innerHeight || 1);
      const y = Math.max(-1, Math.min(1, p)) * PARALLAX;
      parallaxRefs.current.forEach((node, i) => {
        if (!node) return;
        // 카드마다 깊이를 달리해 층이 나뉘어 보이게 한다
        node.style.transform = `translate3d(0, ${y * (1 - i * 0.25)}px, 0)`;
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // 1200 경계를 넘나들 때도 즉시 켜고/끈다
    wide.addEventListener("change", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      wide.removeEventListener("change", onScroll);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="w-full overflow-hidden bg-white px-[20px] pb-[80px] sm:px-[24px] md:px-[40px] md:pb-[120px] xl:pb-[200px]"
    >
      {/* Figma 332:715 — 1680 폭. 캔버스를 줄이지 않고 컨테이너를 가운데 두므로
          1920 화면에서 좌우 120px 여백이 예전 캔버스와 그대로 맞는다 */}
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-[32px] font-pretendard md:gap-[40px]">
        {/* Figma 332:717 — 헤더, gap 24 (좁은 화면에서는 한 단계씩 줄인다) */}
        <div className="flex flex-col items-start gap-[14px] md:gap-[20px] xl:gap-[24px]">
          {/* Figma 332:718 — Pretendard Medium 20 / lh 30 / -0.5 / #e61911 */}
          <Reveal y={20} duration={700}>
            <p className="text-[15px] leading-[22px] font-medium tracking-[-0.5px] whitespace-nowrap text-[#e61911] md:text-[18px] md:leading-[26px] xl:text-[20px] xl:leading-[30px]">
              NOTICE
            </p>
          </Reveal>

          {/* Figma 332:719 — 데스크톱에서 w 666, gap 16 */}
          <div className="flex flex-col items-start gap-[8px] md:gap-[12px] xl:max-w-[666px] xl:gap-[16px]">
            {/* Figma 332:720 — Pretendard Bold 46 / lh 60 / -1.15 / 검정 */}
            {/* 이 저장소는 lg·xl·2xl 이 전부 1200px 이라 lg: 스텝은 xl 에 먹혀 죽는다.
                676~1199 구간이 한 단계로 평평해지지 않게 min-[900px]: 로 중간 단을 직접 넣는다 */}
            <h2 className="text-[28px] leading-[1.28] font-bold tracking-[-0.03em] text-black uppercase md:text-[34px] min-[900px]:text-[40px] xl:text-[46px] xl:leading-[60px] xl:tracking-[-1.15px] xl:whitespace-nowrap">
              <RevealText lines={["우리의 공지사항입니다."]} delay={120} />
            </h2>
            {/* Figma 332:721 — Pretendard Regular 18 / lh 26 / -0.45 / #767676 */}
            <Reveal className="w-full" delay={420} y={20} duration={700}>
              <p className="text-[14px] leading-[22px] font-normal tracking-[-0.35px] text-[#767676] md:text-[16px] md:leading-[24px] xl:text-[18px] xl:leading-[26px] xl:tracking-[-0.45px]">
                진심을 담은 고집이 만들어낸 최상의 풍미와 서비스
              </p>
            </Reveal>
          </div>
        </div>

        {/* Figma 332:722 — 카드 3장. 1열 → md 2열 → lg 3열, gap 24 */}
        {notices?.length === 0 && <EmptyNotice failed={failed} />}
        <div className="grid grid-cols-1 gap-[24px] md:grid-cols-2 lg:grid-cols-3">
          {(notices ?? []).map((item, cardIndex) => (
            <Reveal key={item.id} delay={cardIndex * 140} y={44}>
              {/* 커서 방향으로 미세하게 기울어진다. 터치·모션 축소 환경에서는
                  Tilt 가 스스로 아무 일도 하지 않으므로 좁은 화면에서도 그대로 둔다 */}
              <Tilt max={6} perspective={1400}>
                <Link
                  to={`/notice/${item.id}`}
                  className="group flex w-full cursor-pointer flex-col items-start"
                >
                  {/* Figma 332:724 — 썸네일 544 x 300. 고정 높이 대신 비율로 잡아
                      카드가 좁아져도 300/544 비율이 유지된다 */}
                  <div className="relative aspect-[544/300] w-full shrink-0 overflow-hidden">
                    {/* 스크롤에 따라 프레임 안에서 미세하게 밀리는 층 */}
                    <div
                      ref={(el) => (parallaxRefs.current[cardIndex] = el)}
                      className="absolute inset-0 will-change-transform"
                    >
                      {/* 사진이 없는 글도 있다. 목록(NoticeBoard)과 같게 빈 판을 깔아
                          썸네일 자리가 비어 보이지 않도록 한다 */}
                      {item.image ? (
                        /* 예비 데이터는 사다리를, DB 원격 주소는 평범한 <img> 를 탄다 */
                        <Img
                          src={item.image}
                          alt=""
                          loading="lazy"
                          className={`absolute left-0 max-w-none object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] ${
                            item.crop ? "w-full" : "inset-0 size-full"
                          }`}
                          style={item.crop ?? undefined}
                        />
                      ) : (
                        <span className="absolute inset-0 bg-[#f6f7fb]" />
                      )}
                    </div>
                  </div>

                  {/* Figma 332:725 — 흰 배경, 테두리 #e5e5ec, p 28, 내부 gap 32 */}
                  <div className="flex w-full flex-col items-start gap-[20px] border border-solid border-[#e5e5ec] bg-white p-[20px] md:gap-[24px] md:p-[24px] xl:gap-[32px] xl:p-[28px]">
                    <div className="flex w-full flex-col items-start gap-[10px] xl:gap-[12px]">
                      {/* Figma 332:727 — 점 6px + 라벨, gap 4 */}
                      <div className="flex w-full items-center gap-[4px]">
                        <span className="size-[6px] shrink-0 rounded-full bg-[#e61911]" />
                        {/* Figma 332:729 — Pretendard Medium 14 / lh 22 / -0.35 / #e61911 */}
                        <span className="text-[13px] leading-[20px] font-medium tracking-[-0.35px] text-[#e61911] md:text-[14px] md:leading-[22px]">
                          {item.tag}
                        </span>
                      </div>

                      {/* Figma 332:730 — Pretendard Medium 20 / lh 30 / -0.5 / #222, 2줄 말줄임 */}
                      <p className="line-clamp-2 w-full text-[16px] leading-[24px] font-medium tracking-[-0.4px] break-words text-[#222] transition-colors duration-300 group-hover:text-black md:text-[18px] md:leading-[27px] xl:text-[20px] xl:leading-[30px] xl:tracking-[-0.5px]">
                        {item.title}
                      </p>
                    </div>

                    {/* Figma 332:731 — Pretendard Light 16 / lh 26 / -0.4 / #767676 */}
                    <p className="w-full text-[14px] leading-[22px] font-light tracking-[-0.4px] text-[#767676] md:text-[15px] xl:text-[16px] xl:leading-[26px]">
                      {item.date}
                    </p>
                  </div>
                </Link>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * 실을 공지가 한 건도 없을 때.
 *
 * 콘솔 경고는 개발 중에만 보이므로 실제 운영자는 "왜 안 뜨지" 하고 끝난다.
 * 방문자에게는 그냥 비어 있다는 안내로, 운영자에게는 자리가 남아 있다는 신호로
 * 읽히도록 목록 페이지(NoticeBoard)와 같은 문구를 쓴다.
 *
 * 못 불러온 경우도 목록이 비지만 뜻은 정반대다. 목록 페이지와 같이 문구를 나눈다.
 */
function EmptyNotice({ failed }) {
  return (
    <p className="w-full py-[60px] text-center text-[16px] leading-[26px] font-light tracking-[-0.4px] text-[#767676]">
      {failed
        ? "공지사항을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
        : "등록된 공지사항이 없습니다."}
    </p>
  );
}
