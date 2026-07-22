import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  seedPrerenderNotices,
  seededNotices,
  seededNotice,
  publicUrl,
  getNotice,
} from "../notices.js";
import { isSupabaseReady, SUPABASE_URL } from "../rest.js";

/**
 * notices.js 의 순수한 부분 — DB 행을 화면 모양으로 바꾸는 toView 와 id 검증.
 *
 * toView 와 formatDate 는 export 되지 않는다. 일부러 열지 않고,
 * **실제로 그 함수를 통과하는 유일한 동기 경로**인 seedPrerenderNotices →
 * seededNotices 로 검사한다. 이 경로 자체가 프리렌더가 쓰는 길이라
 * 여기가 깨지면 하이드레이션 불일치로 되돌아간다 — 두 마리를 같이 잡는 셈이다.
 *
 * (vitest.config.js 가 Supabase 키를 가짜 값으로 못 박아 두므로
 *  isSupabaseReady 는 어느 컴퓨터에서든 true 다. 아래 첫 테스트가 그 전제를 지킨다.)
 */

describe("테스트 전제", () => {
  it("Supabase 연결 상태가 고정돼 있다", () => {
    /* 이게 false 면 notices.js 가 예비 데이터 경로를 타고,
       아래 getNotice 검사들이 아무것도 검사하지 않게 된다 */
    expect(isSupabaseReady).toBe(true);
    expect(SUPABASE_URL).toBe("https://test.supabase.co");
  });
});

describe("toView — DB 행 → 화면 모양", () => {
  /** 한 건만 심고 그 결과를 돌려준다 */
  const shape = (row) => {
    seedPrerenderNotices([row]);
    return seededNotices()[0];
  };

  beforeEach(() => seedPrerenderNotices([]));

  it("칸을 하나씩 옮기고 id 는 문자열로 맞춘다", () => {
    const view = shape({
      id: 7,
      title: "설 연휴 배송 안내",
      author: "관리자",
      published_at: "2026-04-22",
      views: 128,
      is_public: true,
      is_featured: true,
      image_path: "2026/abc.png",
      body: "첫 문단\n둘째 줄\n\n  둘째 문단  ",
    });

    /* URL 에 그대로 쓰이는 값이라 숫자로 두면 seededNotice 의 비교가 어긋난다 */
    expect(view.id).toBe("7");
    expect(view.tag).toBe("NEWS");
    expect(view.title).toBe("설 연휴 배송 안내");
    expect(view.detailTitle).toBe("설 연휴 배송 안내");
    expect(view.author).toBe("관리자");
    expect(view.views).toBe(128);
    expect(view.isPublic).toBe(true);
    expect(view.isFeatured).toBe(true);
    expect(view.imagePath).toBe("2026/abc.png");
    /* DB 이미지는 원본 그대로 채우므로 잘라내기 값이 없다 */
    expect(view.crop).toBeNull();
  });

  it("본문은 빈 줄로 문단을 나누고 문단 안 줄바꿈은 살린다", () => {
    const view = shape({ id: 1, body: "첫 문단\n둘째 줄\n\n  둘째 문단  \n\n\n셋째" });
    expect(view.body).toEqual(["첫 문단\n둘째 줄", "둘째 문단", "셋째"]);
    /* 편집창이 되돌려 저장할 원본은 다듬지 않은 그대로여야 한다.
       이걸 잃으면 수정할 때마다 운영자가 넣은 줄 간격이 조용히 바뀐다 */
    expect(view.bodyRaw).toBe("첫 문단\n둘째 줄\n\n  둘째 문단  \n\n\n셋째");
  });

  it("body 가 아예 없어도(목록 조회) 터지지 않는다", () => {
    /* 목록 조회는 body 칸을 아예 안 가져온다. 여기가 깨지면 메인·공지 목록이 통째로 죽는다 */
    const view = shape({ id: 1, title: "제목만" });
    expect(view.bodyRaw).toBe("");
    expect(view.body).toEqual([]);
  });

  it("body 가 null 이거나 문자열이 아니어도 안전하다", () => {
    expect(shape({ id: 1, body: null }).body).toEqual([]);
    expect(shape({ id: 1, body: null }).bodyRaw).toBe("");
    /* 문자열이 아닌 값이 오면 bodyRaw 는 비우되 body 는 String() 을 거친다 */
    expect(shape({ id: 1, body: 123 }).bodyRaw).toBe("");
  });

  it("views 가 없으면 0 — 화면에 'null 회' 가 뜨지 않게", () => {
    expect(shape({ id: 1 }).views).toBe(0);
    expect(shape({ id: 1, views: null }).views).toBe(0);
    expect(shape({ id: 1, views: 0 }).views).toBe(0);
  });

  it("is_featured 칸이 없는 프로젝트에서는 false 로 흘려보낸다", () => {
    /* docs/supabase-setup.md 의 2-1 을 안 돌린 프로젝트가 여기로 온다 */
    expect(shape({ id: 1 }).isFeatured).toBe(false);
    expect(shape({ id: 1, is_featured: null }).isFeatured).toBe(false);
    expect(shape({ id: 1, is_featured: 1 }).isFeatured).toBe(true);
  });

  it("이미지 경로는 Storage 공개 URL 이 되고, 없으면 null 이다", () => {
    expect(shape({ id: 1, image_path: "2026/abc.png" }).image).toBe(
      "https://test.supabase.co/storage/v1/object/public/notice-images/2026/abc.png",
    );
    const none = shape({ id: 1, image_path: null });
    expect(none.image).toBeNull();
    expect(none.imagePath).toBeNull();
  });
});

describe("formatDate — 2026-04-22 → 2026.04.22", () => {
  const dateOf = (published_at) => {
    seedPrerenderNotices([{ id: 1, published_at }]);
    return seededNotices()[0].date;
  };

  it("날짜만 남기고 점으로 잇는다", () => {
    expect(dateOf("2026-04-22")).toBe("2026.04.22");
  });

  it("타임스탬프에서도 앞 10자만 쓴다 — 시간대 변환을 하지 않는다", () => {
    /* Date 객체를 거치면 UTC 변환 때문에 하루가 밀린다. 문자열 자르기가 의도다 */
    expect(dateOf("2026-04-22T23:30:00+09:00")).toBe("2026.04.22");
    expect(dateOf("2026-01-01T00:00:00Z")).toBe("2026.01.01");
  });

  it("값이 없으면 빈 문자열", () => {
    expect(dateOf(null)).toBe("");
    expect(dateOf(undefined)).toBe("");
    expect(dateOf("")).toBe("");
  });
});

describe("프리렌더 씨앗", () => {
  beforeEach(() => seedPrerenderNotices([]));

  it("shaped 목록은 toView 를 거치지 않고 id 만 문자열로 맞춘다", () => {
    seedPrerenderNotices([{ id: 3, title: "예비 데이터", body: ["이미 문단 배열"] }], {
      shaped: true,
    });
    const view = seededNotices()[0];
    expect(view.id).toBe("3");
    /* 이미 화면 모양이므로 body 를 다시 쪼개면 안 된다 */
    expect(view.body).toEqual(["이미 문단 배열"]);
    expect(view.isPublic).toBe(true);
  });

  it("seededNotice 는 문자열·숫자 id 를 모두 받아 같은 글을 찾는다", () => {
    seedPrerenderNotices([{ id: 7, title: "설 연휴 배송 안내" }]);
    expect(seededNotice("7").title).toBe("설 연휴 배송 안내");
    expect(seededNotice(7).title).toBe("설 연휴 배송 안내");
    expect(seededNotice(99)).toBeNull();
  });

  it("배열이 아닌 값을 심어도 빈 목록이 된다", () => {
    seedPrerenderNotices(null);
    expect(seededNotices()).toEqual([]);
  });
});

describe("publicUrl", () => {
  it("경로 조각마다 인코딩하되 슬래시는 구분자로 살린다", () => {
    expect(publicUrl("2026/한글 이름.png")).toBe(
      "https://test.supabase.co/storage/v1/object/public/notice-images/2026/" +
        encodeURIComponent("한글 이름.png"),
    );
  });

  it("경로가 없으면 null", () => {
    expect(publicUrl(null)).toBeNull();
    expect(publicUrl("")).toBeNull();
  });
});

describe("getNotice — 숫자가 아닌 id 는 네트워크를 타기 전에 막는다", () => {
  let fetchSpy;

  beforeEach(() => {
    /* id 칸은 bigint 라 /notice/abc 가 그대로 넘어가면 Postgres 형변환 오류가 나고,
       화면에는 '찾을 수 없습니다' 대신 '불러오지 못했습니다' 가 뜬다.
       그래서 "요청 자체가 나가지 않는 것" 을 검사한다 — null 반환만으로는
       가드가 사라져도 (네트워크 오류로) 통과해 버릴 수 있다 */
    fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) }),
    );
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each(["abc", "", "12abc", "1.5", "-1", " 12 ", "1;drop", "0"])(
    "%j 는 요청 없이 null 을 돌려준다",
    async (id) => {
      await expect(getNotice(id)).resolves.toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("null·undefined 도 막힌다", async () => {
    await expect(getNotice(null)).resolves.toBeNull();
    await expect(getNotice(undefined)).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("정상 id 는 통과해 조회로 이어진다 — 가드가 전부를 막는 것이 아니다", async () => {
    await getNotice("12");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("/notices?");
    expect(url).toContain("id=eq.12");
  });

  it("없는 글은 null 이고 오류를 던지지 않는다", async () => {
    await expect(getNotice("99999")).resolves.toBeNull();
  });
});
