import { useEffect, useId, useMemo, useRef, useState } from "react";
import { isReal, resolveMeta } from "../../lib/seo.js";
import { findCluster, ROUTE_LABELS } from "../../lib/seoData.js";
import {
  loadSeoPages,
  loadSeoSettings,
  saveSeoPage,
  saveSeoSettings,
  SCHEMA_TYPES,
  seoImageUrl,
  uploadSeoImage,
} from "../../lib/seoStore.js";
import {
  Badge,
  Btn,
  Drawer,
  ErrorDialog,
  Field,
  INPUT,
  IconImage,
  IconPlus,
  PageHead,
  Skeleton,
  Stat,
  useToast,
} from "./ui.jsx";

/**
 * 검색 최적화(SEO) 관리.
 *
 * 두 부분이다.
 *   1) 사이트 기본 설정 — 사이트명·제목 템플릿·기본 설명·조직 정보처럼 전 페이지에 깔리는 값
 *   2) 페이지별 SEO — 라우트마다의 제목·설명·키워드·FAQ
 *
 * 토픽 클러스터는 여기서 손대지 않는다. 어느 페이지가 어느 묶음에 속하는지는 한 번
 * 정하면 바뀌지 않는 정보 구조라, 운영자가 고칠 값이 아니라 코드(seoData.js 의
 * CLUSTERS)에 박아 둔다. 목록의 클러스터 이름은 그래서 **읽기 전용 안내**다.
 *
 * 여기서 고친 값은 **다시 빌드해야** 사이트에 반영된다. 메타 정보는 방문자의
 * 브라우저가 아니라 크롤러가 읽는 것이라, 빌드 시점에 HTML 에 박혀야 의미가 있다.
 * 그래서 화면 곳곳에서 "저장 후 다시 배포" 를 반복해 알린다 — 저장만 하고
 * 아무 일도 안 일어나는 것처럼 보이는 것이 이 화면에서 가장 흔한 오해다.
 *
 * 마이그레이션(docs/seo-setup.md) 을 아직 안 돌렸으면 표가 없다. 그때는 화면을
 * 죽이지 않고 코드에 박힌 정적 값(seoData.js)을 **읽기 전용** 으로 보여 준다.
 */

/* 검색결과에서 잘리기 시작하는 대략의 경계. 픽셀 폭 기준이라 정확한 값은 없지만,
   한글은 이 근처에서 말줄임이 붙는다. 넘겨도 오류는 아니므로 막지 않고 알리기만 한다 */
const TITLE_LIMIT = 60;
const DESC_LIMIT = 155;

/** 주소는 다섯 칸이 모두 있어야 PostalAddress 로 나간다. 부분 주소는 넣지 않는다 */
const ADDRESS_KEYS = [
  "org_street",
  "org_locality",
  "org_region",
  "org_postal_code",
  "org_country",
];

const WEEK = [
  { v: "Mo", ko: "월" },
  { v: "Tu", ko: "화" },
  { v: "We", ko: "수" },
  { v: "Th", ko: "목" },
  { v: "Fr", ko: "금" },
  { v: "Sa", ko: "토" },
  { v: "Su", ko: "일" },
];

export default function AdminSeo() {
  const [tab, setTab] = useState("site");
  const [settings, setSettings] = useState(null);
  const [pages, setPages] = useState([]);
  /* "db" 가 아니면 마이그레이션 전이라 저장할 곳이 없다 */
  const [source, setSource] = useState("db");
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState(null);
  const fail = (err, context) => setFailure({ err, context });
  const { toast, view: toasts } = useToast();

  const alive = useRef(true);

  const refresh = () =>
    Promise.all([loadSeoSettings(), loadSeoPages()])
      .then(([s, p]) => {
        if (!alive.current) return;
        setSettings(s.row);
        setPages(p.rows);
        /* 둘 중 하나라도 정적이면 전체를 읽기 전용으로 본다.
           일부만 저장되는 상태가 가장 헷갈리기 때문이다 */
        setSource(s.source === "db" && p.source === "db" ? "db" : "static");
      })
      .catch((err) => alive.current && fail(err, "list"))
      .finally(() => alive.current && setLoading(false));

  useEffect(() => {
    alive.current = true;
    refresh();
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readOnly = source !== "db";

  if (loading || !settings) {
    return (
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-[16px]">
        <Skeleton className="h-[30px] w-[220px]" />
        <Skeleton className="h-[64px] w-full" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[68px] w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-[20px]">
      <PageHead
        title="검색 최적화"
      />

      {readOnly && <ReadOnlyNotice />}

      <div className="flex gap-[6px] rounded-[10px] bg-[#eeeef1] p-[4px]">
        <TabBtn active={tab === "site"} onClick={() => setTab("site")}>
          사이트 기본 설정
        </TabBtn>
        <TabBtn active={tab === "pages"} onClick={() => setTab("pages")}>
          페이지별 SEO
        </TabBtn>
      </div>

      {tab === "site" ? (
        <SiteSettings
          row={settings}
          readOnly={readOnly}
          onSaved={(saved) => {
            setSettings(saved);
            toast("사이트 기본 설정을 저장했습니다. 다시 배포하면 반영됩니다.");
          }}
          onFail={fail}
        />
      ) : (
        <PageMetaList
          rows={pages}
          settings={settings}
          readOnly={readOnly}
          onSaved={(saved) => {
            setPages((list) => list.map((r) => (r.route === saved.route ? saved : r)));
            toast("페이지 SEO 를 저장했습니다. 다시 배포하면 반영됩니다.");
          }}
          onFail={fail}
        />
      )}

      <ErrorDialog
        error={failure?.err}
        context={failure?.context}
        onClose={() => setFailure(null)}
      />
      {toasts}
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-[8px] py-[9px] text-[13px] font-semibold tracking-[-0.33px] transition-colors duration-150 ${
        active ? "bg-white text-[#1a1a1e] shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-[#8a8a93]"
      }`}
    >
      {children}
    </button>
  );
}

/** 마이그레이션 전 안내. 화면을 막지 않고 "지금 보이는 값이 어디서 왔는지" 만 알린다 */
function ReadOnlyNotice() {
  return (
    <div className="flex flex-col gap-[6px] rounded-[12px] border border-[#f3dfae] bg-[#fdf8ec] px-[18px] py-[14px]">
      <p className="text-[13px] font-semibold text-[#8a6316]">
        아직 읽기 전용입니다 — 저장할 표가 데이터베이스에 없습니다.
      </p>
      <p className="text-[13px] leading-[21px] text-[#96793e]">
        지금 보이는 값은 코드에 들어 있는 기본값입니다. 사이트는 이 값으로 정상 동작하고
        있으니 급한 문제는 아닙니다. 화면에서 직접 고치려면 docs/seo-setup.md 의 SQL 을
        Supabase 에서 한 번 실행해 주세요.
      </p>
    </div>
  );
}

/* ============================================================
 * 1. 사이트 기본 설정
 * ============================================================ */

function SiteSettings({ row, readOnly, onSaved, onFail }) {
  const [draft, setDraft] = useState(row);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  useEffect(() => setDraft(row), [row]);

  /* 주소 다섯 칸과 전화가 **전부 진짜 값** 일 때만 Restaurant 스키마가 켜진다.
     isReal 은 빈 값뿐 아니라 0000 · 010-1234-5678 같은 자리표시자도 걸러 낸다 —
     운영자가 "미정" 이라고 적어 넣는 경로를 여기서 미리 보여 주기 위해 같은 함수를 쓴다 */
  const addressReady = ADDRESS_KEYS.every((k) => isReal(draft[k]));
  const phoneReady = isReal(draft.org_phone);
  const restaurantOn = addressReady && phoneReady;

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await saveSeoSettings(draft);
      onSaved(saved);
    } catch (err) {
      onFail(err, "seo-settings");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-[16px]">
      <Section
        title="기본 정보"
      >
        <div className="grid gap-[16px] md:grid-cols-2">
          <Field label="사이트 이름">
            <input
              type="text"
              value={draft.site_name}
              onChange={set("site_name")}
              placeholder="압구정곱창"
              className={INPUT}
            />
          </Field>

          <Field label="사이트 주소">
            <input
              type="url"
              value={draft.site_url}
              onChange={set("site_url")}
              placeholder="https://example.com"
              className={INPUT}
            />
          </Field>

          <Field label="제목 템플릿">
            <input
              type="text"
              value={draft.title_template}
              onChange={set("title_template")}
              placeholder="%s | 압구정곱창"
              className={INPUT}
            />
          </Field>

          <Field label="홈 제목">
            <input
              type="text"
              value={draft.default_title}
              onChange={set("default_title")}
              className={INPUT}
            />
          </Field>
        </div>

        <Field
          label="기본 설명"
          className="mt-[16px]"
        >
          <textarea
            value={draft.default_description}
            onChange={set("default_description")}
            rows={3}
            className={`${INPUT} resize-y leading-[23px]`}
          />
        </Field>
        <Counter value={draft.default_description} limit={DESC_LIMIT} />

        <div className="mt-[16px] grid gap-[16px] md:grid-cols-2">
          <ImageField
            label="기본 공유 이미지"
            value={draft.default_og_path}
            onChange={(v) => setDraft((d) => ({ ...d, default_og_path: v }))}
            onFail={onFail}
          />

          <div className="flex flex-col gap-[16px]">
            <Field label="언어">
              <input
                type="text"
                value={draft.locale}
                onChange={set("locale")}
                placeholder="ko_KR"
                className={INPUT}
              />
            </Field>

            <Field label="기본 색인 규칙" htmlFor="seo-robots-default">
              <select
                id="seo-robots-default"
                value={draft.robots_default}
                onChange={set("robots_default")}
                className={INPUT}
              >
                <option value="index,follow">색인 허용 · 링크 따라가기 (권장)</option>
                <option value="index,nofollow">색인 허용 · 링크 따라가지 않기</option>
                <option value="noindex,follow">색인 안 함 · 링크 따라가기</option>
                <option value="noindex,nofollow">색인 안 함 · 링크 따라가지 않기</option>
              </select>
            </Field>
          </div>
        </div>
      </Section>

      {/* ── 조직 · 사업자 정보 (NAP) ── */}
      <Section
        title="매장 정보 (상호 · 주소 · 전화)"
      >
        <div
          className={`flex flex-col gap-[7px] rounded-[12px] border px-[16px] py-[13px] ${
            restaurantOn
              ? "border-[#c9e7d3] bg-[#f2fbf5]"
              : "border-[#e4e9f5] bg-[#f4f7fd]"
          }`}
        >
          <p className="flex items-center gap-[8px] text-[13px] font-semibold">
            <span className={restaurantOn ? "text-[#1c8a45]" : "text-[#22449a]"}>
              매장 스키마(Restaurant)
            </span>
            {restaurantOn ? <Badge tone="green">켜짐</Badge> : <Badge>꺼짐</Badge>}
          </p>
          <p
            className={`text-[13px] leading-[21px] ${
              restaurantOn ? "text-[#2f7a4c]" : "text-[#4a5a80]"
            }`}
          >
            {restaurantOn
              ? "주소 다섯 칸과 전화번호가 모두 채워졌습니다."
              : "주소 다섯 칸(도로명·시군구·시도·우편번호·국가)과 전화번호가 모두 채워져야 켜집니다."}
          </p>
        </div>

        <div className="mt-[16px] grid gap-[16px] md:grid-cols-2">
          <Field label="상호 (사업자등록증)">
            <input type="text" value={draft.org_legal_name} onChange={set("org_legal_name")} className={INPUT} />
          </Field>
          <Field label="영문 · 약칭">
            <input type="text" value={draft.org_alternate_name} onChange={set("org_alternate_name")} className={INPUT} />
          </Field>

          <Field label="대표 전화">
            <input
              type="tel"
              value={draft.org_phone}
              onChange={set("org_phone")}
              placeholder="아직 확정 전이면 비워 두세요"
              className={INPUT}
            />
          </Field>
          <Field label="대표 이메일">
            <input type="email" value={draft.org_email} onChange={set("org_email")} className={INPUT} />
          </Field>

          <Field label="도로명 주소 + 상세" className="md:col-span-2">
            <input
              type="text"
              value={draft.org_street}
              onChange={set("org_street")}
              placeholder="예: 압구정로42길 25-8 1층"
              className={INPUT}
            />
          </Field>

          <Field label="시 / 군 / 구">
            <input type="text" value={draft.org_locality} onChange={set("org_locality")} className={INPUT} />
          </Field>
          <Field label="시 / 도">
            <input type="text" value={draft.org_region} onChange={set("org_region")} className={INPUT} />
          </Field>
          <Field label="우편번호">
            <input type="text" value={draft.org_postal_code} onChange={set("org_postal_code")} className={INPUT} />
          </Field>
          <Field label="국가 코드">
            <input type="text" value={draft.org_country} onChange={set("org_country")} placeholder="KR" className={INPUT} />
          </Field>

          <Field label="사업자등록번호">
            <input type="text" value={draft.org_biz_number} onChange={set("org_biz_number")} className={INPUT} />
          </Field>
          <Field label="가격대">
            <input type="text" value={draft.org_price_range} onChange={set("org_price_range")} className={INPUT} />
          </Field>
          <Field label="설립일">
            <input
              type="text"
              value={draft.org_founding_date ?? ""}
              onChange={set("org_founding_date")}
              placeholder="2005-01-01"
              className={INPUT}
            />
          </Field>
        </div>

        <HoursEditor
          value={draft.org_opening_hours}
          onChange={(v) => setDraft((d) => ({ ...d, org_opening_hours: v }))}
        />
      </Section>

      <Section
        title="외부 프로필 링크"
      >
        <UrlListField
          value={draft.same_as}
          onChange={(v) => setDraft((d) => ({ ...d, same_as: v }))}
        />
      </Section>

      <div className="sticky bottom-[16px] flex items-center gap-[12px] rounded-[14px] border border-[#eaeaee] bg-white px-[18px] py-[14px] shadow-[0_6px_20px_rgba(0,0,0,0.07)]">
        <span className="text-[12px] leading-[18px] text-[#9a9aa2]">
          저장한 뒤 사이트를 다시 배포해야 검색엔진에 반영됩니다.
        </span>
        <Btn
          tone="primary"
          size="lg"
          type="submit"
          disabled={busy || readOnly}
          className="ml-auto min-w-[150px]"
        >
          {busy ? "저장 중…" : "설정 저장"}
        </Btn>
      </div>
    </form>
  );
}

/** 영업시간 — days/opens/closes 가 다 있는 줄만 실제로 나간다 */
function HoursEditor({ value, onChange }) {
  const rows = Array.isArray(value) ? value : [];

  const patch = (i, next) => onChange(rows.map((r, at) => (at === i ? next : r)));
  const toggleDay = (i, day) => {
    const days = Array.isArray(rows[i].days) ? rows[i].days : [];
    patch(i, {
      ...rows[i],
      days: days.includes(day) ? days.filter((d) => d !== day) : [...days, day],
    });
  };

  return (
    <div className="mt-[18px] flex flex-col gap-[10px]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#1a1a1e]">영업시간</span>
        <Btn
          size="sm"
          onClick={() => onChange([...rows, { days: [], opens: "", closes: "" }])}
        >
          <IconPlus />줄 추가
        </Btn>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-[#e0e0e6] px-[14px] py-[13px] text-[13px] leading-[20px] text-[#9a9aa2]">
          아직 없습니다. 요일과 시간이 모두 채워진 줄만 검색엔진에 나갑니다.
        </p>
      ) : (
        rows.map((r, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center gap-[10px] rounded-[10px] border border-[#eaeaee] bg-[#fafafb] px-[14px] py-[11px]"
          >
            <div className="flex gap-[4px]">
              {WEEK.map((d) => {
                const on = (r.days ?? []).includes(d.v);
                return (
                  <button
                    key={d.v}
                    type="button"
                    onClick={() => toggleDay(i, d.v)}
                    aria-pressed={on}
                    className={`size-[30px] rounded-[7px] text-[12px] font-medium transition-colors duration-150 ${
                      on ? "bg-[#1a1a1e] text-white" : "bg-white text-[#8a8a93] hover:bg-[#f2f2f5]"
                    }`}
                  >
                    {d.ko}
                  </button>
                );
              })}
            </div>
            <input
              type="time"
              value={r.opens ?? ""}
              onChange={(e) => patch(i, { ...r, opens: e.target.value })}
              aria-label="여는 시각"
              className={`${INPUT} w-[124px]`}
            />
            <span className="text-[13px] text-[#b0b0b8]">–</span>
            <input
              type="time"
              value={r.closes ?? ""}
              onChange={(e) => patch(i, { ...r, closes: e.target.value })}
              aria-label="닫는 시각"
              className={`${INPUT} w-[124px]`}
            />
            <Btn
              tone="danger"
              size="sm"
              className="ml-auto"
              onClick={() => onChange(rows.filter((_, at) => at !== i))}
            >
              삭제
            </Btn>
          </div>
        ))
      )}
    </div>
  );
}

/** http(s) 로 시작하는 주소만 저장된다. 상대경로 하나가 섞이면 전체가 거절당한다 */
function UrlListField({ value, onChange }) {
  const rows = Array.isArray(value) ? value : [];

  return (
    <div className="flex flex-col gap-[10px]">
      {rows.map((url, i) => {
        const bad = url.trim() !== "" && !/^https?:\/\//.test(url.trim());
        return (
          <div key={i} className="flex flex-col gap-[5px]">
            <div className="flex gap-[8px]">
              <input
                type="url"
                value={url}
                onChange={(e) => onChange(rows.map((v, at) => (at === i ? e.target.value : v)))}
                placeholder="https://map.naver.com/p/entry/place/…"
                aria-label={`외부 링크 ${i + 1}`}
                className={`${INPUT} ${bad ? "border-[#e61911]" : ""}`}
              />
              <Btn tone="danger" onClick={() => onChange(rows.filter((_, at) => at !== i))}>
                삭제
              </Btn>
            </div>
            {bad && (
              <p className="text-[12px] text-[#d1170f]">
                https:// 로 시작해야 저장됩니다.
              </p>
            )}
          </div>
        );
      })}
      <Btn size="sm" className="self-start" onClick={() => onChange([...rows, ""])}>
        <IconPlus />링크 추가
      </Btn>
    </div>
  );
}

/* ============================================================
 * 2. 페이지별 SEO
 * ============================================================ */

function PageMetaList({ rows, settings, readOnly, onSaved, onFail }) {
  const [editing, setEditing] = useState(null);

  /* 목록과 편집 창이 같은 계산을 봐야 한다. 여기서 한 번 계산해 둔다 */
  const metas = useMemo(
    () =>
      rows.map((row) => ({
        row,
        meta: resolveMeta(row.route, { dbPage: row, dbSettings: settings }),
      })),
    [rows, settings],
  );

  /**
   * 같은 제목을 쓰는 라우트 찾기.
   *
   * 제목이 겹치면 구글은 둘 중 하나만 골라 보여 주고, 나머지는 사실상 사라진다.
   * 설명 누락과 함께 실제로 순위를 깎아 먹는 두 가지 실수라 목록에서 바로 보여 준다.
   */
  const duplicateTitles = useMemo(() => {
    const seen = new Map();
    for (const { row, meta } of metas) {
      const key = meta.title.trim();
      if (!key) continue;
      seen.set(key, [...(seen.get(key) ?? []), row.route]);
    }
    return new Set(
      [...seen.entries()].filter(([, routes]) => routes.length > 1).map(([key]) => key),
    );
  }, [metas]);

  const issuesOf = (row, meta) => {
    const out = [];
    if (!String(row.description ?? "").trim()) {
      out.push("설명이 비어 있어 사이트 기본 설명이 그대로 쓰입니다");
    } else if (meta.description.length > DESC_LIMIT) {
      out.push(`설명이 ${meta.description.length}자라 검색결과에서 잘립니다`);
    }
    if (duplicateTitles.has(meta.title.trim())) {
      out.push("다른 페이지와 제목이 같습니다");
    } else if (meta.title.length > TITLE_LIMIT) {
      out.push(`제목이 ${meta.title.length}자라 검색결과에서 잘립니다`);
    }
    if (row.robots_index === false) out.push("검색에 노출되지 않도록 설정돼 있습니다");
    return out;
  };

  const withIssues = metas.filter(({ row, meta }) => issuesOf(row, meta).length > 0).length;

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex gap-[10px]">
        <Stat label="관리 중인 페이지" value={rows.length} suffix="개" />
        <Stat
          label="살펴볼 항목"
          value={withIssues}
          suffix="개"
          accent={withIssues > 0}
          muted={withIssues === 0}
        />
      </div>

      <ul className="flex flex-col gap-[10px]">
        {metas.map(({ row, meta }) => {
          const issues = issuesOf(row, meta);
          /* 소속은 코드(seoData.js)가 정한다. 여기서는 "이 페이지가 어느 묶음의
             내부링크를 받는지" 를 알려 주기만 한다 — 고칠 수 있는 값이 아니다 */
          const cluster = findCluster(row.route);
          return (
            <li
              key={row.route}
              className="flex flex-col gap-[10px] rounded-[14px] border border-[#eaeaee] bg-white p-[16px] transition-all duration-200 hover:border-[#d5d5dd] hover:shadow-[0_6px_20px_rgba(0,0,0,0.05)] md:flex-row md:items-center"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
                <div className="flex flex-wrap items-center gap-[8px]">
                  <span className="text-[14px] font-semibold tracking-[-0.35px] text-[#1a1a1e]">
                    {ROUTE_LABELS[row.route] ?? row.route}
                  </span>
                  <span className="font-mono text-[12px] text-[#a8a8b0]">{row.route}</span>
                  {cluster && <Badge>{cluster.name}</Badge>}
                  {row.robots_index === false && <Badge tone="red">미색인</Badge>}
                  {row.faq?.length > 0 && <Badge tone="green">FAQ {row.faq.length}</Badge>}
                </div>
                <p className="truncate text-[13px] text-[#5a5a63]">{meta.title}</p>
                <p className="truncate text-[12px] leading-[18px] text-[#a8a8b0]">
                  {meta.description}
                </p>
                {issues.length > 0 && (
                  <ul className="flex flex-col gap-[3px]">
                    {issues.map((text) => (
                      <li key={text} className="text-[12px] leading-[18px] text-[#d1170f]">
                        · {text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Btn className="shrink-0" onClick={() => setEditing(row)}>
                편집
              </Btn>
            </li>
          );
        })}
      </ul>

      {editing && (
        <PageDrawer
          key={editing.route}
          row={editing}
          settings={settings}
          readOnly={readOnly}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            onSaved(saved);
            setEditing(null);
          }}
          onFail={onFail}
        />
      )}
    </div>
  );
}

/**
 * 한 라우트의 편집 창.
 *
 * 초안(draft)을 DB 와 같은 snake_case 로 들고 있는 이유는, 그 값을 그대로
 * resolveMeta 에 넘겨 미리보기를 그리기 위해서다. 화면에 보이는 미리보기와
 * 실제로 나갈 값이 같은 함수를 거치므로 어긋날 수가 없다.
 */
function PageDrawer({ row, settings, readOnly, onClose, onSaved, onFail }) {
  const [draft, setDraft] = useState(row);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  const meta = resolveMeta(draft.route, { dbPage: draft, dbSettings: settings });
  const isNoticeTemplate = draft.route === "/notice/:id";

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onSaved(await saveSeoPage(draft.route, draft));
    } catch (err) {
      onFail(err, "seo-page");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      width={1080}
      onClose={() => !busy && onClose()}
      title={`${ROUTE_LABELS[draft.route] ?? draft.route} SEO`}
      subtitle={`${draft.route} · 저장 후 다시 배포해야 반영됩니다`}
      footer={
        <>
          <span className="hidden text-[12px] leading-[18px] text-[#9a9aa2] sm:block">
            {draft.robots_index === false
              ? "이 페이지는 검색결과에 나오지 않도록 설정돼 있습니다."
              : "저장하면 다음 배포부터 이 문구가 검색결과에 쓰입니다."}
          </span>
          <Btn
            tone="primary"
            size="lg"
            type="submit"
            form="seo-page-form"
            disabled={busy || readOnly}
            className="ml-auto min-w-[150px]"
          >
            {busy ? "저장 중…" : "저장"}
          </Btn>
        </>
      }
    >
      <form id="seo-page-form" onSubmit={onSubmit} className="flex flex-col gap-[22px]">
        {isNoticeTemplate && (
          <p className="rounded-[10px] bg-[#f4f7fd] px-[16px] py-[13px] text-[13px] leading-[21px] text-[#4a5a80]">
            이 줄은 개별 공지글의 <b>기본값</b>입니다. 공지 하나하나의 제목·설명은
            공지사항 관리에서 정하고, 거기가 비어 있을 때만 여기 값이 쓰입니다.
          </p>
        )}

        <div className="grid gap-[24px] lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* ── 왼쪽: 입력 ── */}
          <div className="flex flex-col gap-[18px]">
            <div className="flex flex-col gap-[7px]">
              <Field label="제목">
                <input type="text" value={draft.title} onChange={set("title")} className={INPUT} />
              </Field>
              <Counter value={draft.title} limit={TITLE_LIMIT} />
            </div>

            <div className="flex flex-col gap-[7px]">
              <Field label="설명">
                <textarea
                  value={draft.description}
                  onChange={set("description")}
                  rows={4}
                  className={`${INPUT} resize-y leading-[23px]`}
                />
              </Field>
              <Counter value={draft.description} limit={DESC_LIMIT} />
              {!String(draft.description ?? "").trim() && (
                <p className="text-[12px] leading-[18px] text-[#d1170f]">
                  비워 두면 사이트 기본 설명이 그대로 쓰입니다. 모든 페이지가 같은 설명을
                  갖게 되어 검색결과에서 서로 구분되지 않습니다.
                </p>
              )}
            </div>

            <Field label="대표 검색어">
              <input
                type="text"
                value={draft.primary_keyword}
                onChange={set("primary_keyword")}
                placeholder="예: 한우 곱창"
                className={INPUT}
              />
            </Field>

            <Field label="키워드">
              <TagsField
                value={draft.keywords}
                onChange={(v) => setDraft((d) => ({ ...d, keywords: v }))}
              />
            </Field>

            <FaqEditor
              value={draft.faq}
              onChange={(v) => setDraft((d) => ({ ...d, faq: v }))}
            />
          </div>

          {/* ── 오른쪽: 미리보기와 부가 설정 ── */}
          <div className="flex flex-col gap-[18px]">
            <SearchPreview meta={meta} settings={settings} />

            <ImageField
              label="공유 이미지"
              value={draft.og_path}
              onChange={(v) => setDraft((d) => ({ ...d, og_path: v }))}
              onFail={onFail}
            />

            <Field label="대표 주소(canonical)">
              <input
                type="url"
                value={draft.canonical_url ?? ""}
                onChange={set("canonical_url")}
                placeholder="자동"
                className={INPUT}
              />
            </Field>

            <div className="flex flex-col gap-[10px]">
              <span className="text-[13px] font-semibold text-[#1a1a1e]">검색 노출</span>
              <Toggle
                label="검색결과에 노출"
                checked={draft.robots_index !== false}
                onChange={(v) => setDraft((d) => ({ ...d, robots_index: v }))}
              />
              <Toggle
                label="페이지 안의 링크 따라가기"
                checked={draft.robots_follow !== false}
                onChange={(v) => setDraft((d) => ({ ...d, robots_follow: v }))}
              />
            </div>

            <Field
              label="스키마 유형"
              htmlFor="seo-schema"
            >
              <select
                id="seo-schema"
                value={draft.schema_type ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, schema_type: e.target.value || null }))
                }
                className={INPUT}
              >
                <option value="">자동 ({meta.schemaType})</option>
                {SCHEMA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="운영 메모">
              <textarea
                value={draft.admin_note}
                onChange={set("admin_note")}
                rows={2}
                className={`${INPUT} resize-y`}
              />
            </Field>
          </div>
        </div>
      </form>
    </Drawer>
  );
}

/* ────────── 작은 부품들 ────────── */

function Section({ title, desc, children }) {
  return (
    <section className="flex flex-col gap-[14px] rounded-[16px] border border-[#eaeaee] bg-white p-[20px] md:p-[24px]">
      <div className="flex flex-col gap-[4px]">
        <h2 className="text-[16px] font-bold tracking-[-0.4px] text-[#1a1a1e]">{title}</h2>
        {desc && <p className="text-[13px] leading-[21px] text-[#8a8a93]">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * 글자 수 표시.
 * 막지 않고 알리기만 한다 — 넘겨도 오류는 아니고, 잘리는 것을 감수할 때도 있다.
 */
function Counter({ value, limit }) {
  const n = String(value ?? "").trim().length;
  const over = n > limit;
  const near = !over && n > limit - 10;
  return (
    <p
      className={`text-[12px] tabular-nums ${
        over ? "text-[#d1170f]" : near ? "text-[#b8860b]" : "text-[#a8a8b0]"
      }`}
    >
      {n} / {limit}자{over && " · 검색결과에서 잘립니다"}
    </p>
  );
}

/** 구글 검색결과처럼 보여 준다. 숫자보다 이쪽이 "어떻게 보일지" 를 훨씬 잘 알려 준다 */
function SearchPreview({ meta, settings }) {
  const shown = (text, limit) =>
    text.length > limit ? `${text.slice(0, limit)}…` : text;

  return (
    <div className="flex flex-col gap-[10px] rounded-[12px] border border-[#eaeaee] bg-[#fafafb] p-[16px]">
      <span className="text-[12px] font-semibold text-[#8a8a93]">검색결과 미리보기</span>
      <div className="flex flex-col gap-[3px] rounded-[10px] bg-white p-[14px]">
        <span className="truncate text-[12px] leading-[18px] text-[#5f6368]">
          {meta.canonical || `${settings.site_name || "압구정곱창"} · 사이트 주소 미설정`}
        </span>
        <span className="text-[17px] leading-[24px] text-[#1a0dab]">
          {shown(meta.title, TITLE_LIMIT) || "(제목 없음)"}
        </span>
        <span className="text-[13px] leading-[20px] text-[#4d5156]">
          {shown(meta.description, DESC_LIMIT) || "(설명 없음)"}
        </span>
      </div>
      {!meta.canonical && (
        <p className="text-[12px] leading-[18px] text-[#b8860b]">
          사이트 주소가 비어 있어 대표 주소(canonical)가 나가지 않습니다. ‘사이트 기본
          설정’ 에서 채워 주세요.
        </p>
      )}
    </div>
  );
}

/**
 * 쉼표로 구분하는 목록 입력.
 *
 * 글자를 칠 때마다 배열로 쪼개 부모에 올리면, 부모가 다시 join 한 문자열이 내려와
 * "곱창, " 의 뒤 공백이 사라지고 커서가 튄다. 그래서 화면에 보이는 문자열은
 * 이 부품이 직접 들고, 부모에게는 쪼갠 결과만 알린다.
 * (다른 라우트를 열면 편집 창 자체가 key 로 새로 만들어져 초기값이 다시 잡힌다)
 */
function TagsField({ id, value, onChange }) {
  const [text, setText] = useState(() => (Array.isArray(value) ? value : []).join(", "));

  return (
    <input
      id={id}
      type="text"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }}
      placeholder="한우 곱창, 곱창 맛집, 압구정 곱창"
      className={INPUT}
    />
  );
}

/** FAQ 편집 — 질문·답변이 **둘 다** 있는 항목만 실제로 나간다 */
function FaqEditor({ value, onChange }) {
  const rows = Array.isArray(value) ? value : [];
  const patch = (i, next) => onChange(rows.map((r, at) => (at === i ? next : r)));

  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#1a1a1e]">
          자주 묻는 질문 <span className="font-normal text-[#9a9aa2]">최대 20개</span>
        </span>
        <Btn size="sm" onClick={() => onChange([...rows, { q: "", a: "" }])}>
          <IconPlus />문답 추가
        </Btn>
      </div>

      <p className="rounded-[10px] bg-[#fdf8ec] px-[14px] py-[11px] text-[12px] leading-[19px] text-[#96793e]">
        여기 적은 문답은 <b>페이지 화면에도 똑같이 보여야 합니다.</b> 검색엔진에만 보이고
        페이지에는 없는 FAQ 는 정책 위반이라 페널티를 받습니다.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-[#e0e0e6] px-[14px] py-[13px] text-[13px] leading-[20px] text-[#9a9aa2]">
          아직 없습니다. 질문과 답변이 모두 채워진 항목만 검색엔진에 나갑니다.
        </p>
      ) : (
        rows.map((r, i) => (
          <div
            key={i}
            className="flex flex-col gap-[8px] rounded-[10px] border border-[#eaeaee] bg-[#fafafb] p-[12px]"
          >
            <div className="flex items-center gap-[8px]">
              <span className="text-[12px] font-semibold text-[#8a8a93]">Q{i + 1}</span>
              <Btn
                tone="danger"
                size="sm"
                className="ml-auto"
                onClick={() => onChange(rows.filter((_, at) => at !== i))}
              >
                삭제
              </Btn>
            </div>
            <input
              type="text"
              value={r.q ?? ""}
              onChange={(e) => patch(i, { ...r, q: e.target.value })}
              placeholder="질문"
              aria-label={`질문 ${i + 1}`}
              className={INPUT}
            />
            <textarea
              value={r.a ?? ""}
              onChange={(e) => patch(i, { ...r, a: e.target.value })}
              rows={3}
              placeholder="답변"
              aria-label={`답변 ${i + 1}`}
              className={`${INPUT} resize-y leading-[22px]`}
            />
          </div>
        ))
      )}
    </div>
  );
}

/** 켜고 끄는 스위치. 공지 관리의 ‘사이트에 공개’ 와 같은 모양으로 맞췄다 */
function Toggle({ label, desc, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-[10px] rounded-[10px] border border-[#eaeaee] bg-[#fafafb] px-[14px] py-[12px]">
      <span className="flex flex-col">
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="text-[12px] leading-[17px] text-[#9a9aa2]">{desc}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="relative h-[26px] w-[46px] shrink-0 rounded-full bg-[#d9d9e0] transition-colors duration-200 peer-checked:bg-[#e61911] peer-checked:[&>span]:translate-x-[20px]">
        <span className="absolute top-[3px] left-[3px] size-[20px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform duration-200" />
      </span>
    </label>
  );
}

/** OG 이미지 — 올리거나, 이미 있는 경로를 직접 적는다 */
function ImageField({ label, hint, value, onChange, onFail }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  /* 이 부품은 한 화면에 두 번 나올 수 있다. id 를 고정 문자열로 두면
     라벨이 엉뚱한 칸을 가리켜 낭독기가 잘못 읽는다 */
  const inputId = useId();
  const url = seoImageUrl(value);

  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadSeoImage(file));
    } catch (err) {
      onFail(err, "seo-image");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Field label={label} hint={hint} htmlFor={inputId}>
      <div className="flex flex-col gap-[8px]">
        <div className="flex aspect-[1200/630] w-full items-center justify-center overflow-hidden rounded-[10px] border border-dashed border-[#dcdce2] bg-[#fafafb]">
          {url ? (
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-[6px] text-[#b0b0b8]">
              <IconImage />
              <span className="text-[12px] text-[#9a9aa2]">아직 없습니다</span>
            </span>
          )}
        </div>
        <input
          id={inputId}
          type="text"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/images/og-default.png"
          className={INPUT}
        />
        <div className="flex gap-[8px]">
          <Btn size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "올리는 중…" : "이미지 업로드"}
          </Btn>
          {value && (
            <Btn tone="quiet" size="sm" onClick={() => onChange("")}>
              비우기
            </Btn>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={(e) => pick(e.target.files?.[0])}
          className="hidden"
        />
      </div>
    </Field>
  );
}
