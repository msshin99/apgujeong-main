import { useEffect, useMemo, useRef, useState } from "react";
import { ROUTE_LABELS } from "../../lib/seoData.js";
import {
  assignClusterRoutes,
  createCluster,
  deleteCluster,
  loadClusters,
  loadSeoPages,
  SEO_ROUTES,
  updateCluster,
} from "../../lib/seoStore.js";
import {
  Badge,
  Btn,
  Drawer,
  Empty,
  ErrorDialog,
  Field,
  Guide,
  INPUT,
  IconDoc,
  IconPlus,
  PageHead,
  Skeleton,
  Stat,
  useToast,
} from "./ui.jsx";

/**
 * 토픽 클러스터 관리.
 *
 * 새 글을 만드는 화면이 아니다. **이미 있는 페이지들을 묶는** 화면이다.
 * 묶는 이유는 하나 — 어느 페이지가 어느 검색어의 대표(필러)인지 정해 두어야
 * 내부 링크를 그쪽으로 몰아 줄 수 있고, 같은 검색어로 두 페이지가 서로 경쟁하는
 * 자기잠식을 막을 수 있다.
 *
 * 그래서 아래쪽에 "그래서 어디서 어디로 링크가 걸리는가" 를 그려 준다.
 * 묶기만 하고 결과를 못 보면 운영자는 자기가 무엇을 바꿨는지 알 수 없다.
 */

const BLANK = {
  id: null,
  name: "",
  slug: "",
  description: "",
  pillar_route: "/menu",
  keywords: [],
  sort_order: 0,
};

/** 링크로 걸 수 있는 라우트만. `:id` 가 든 템플릿 경로는 실제 주소가 아니다 */
const LINKABLE = SEO_ROUTES.filter((r) => !r.includes(":"));

export default function AdminClusters() {
  const [clusters, setClusters] = useState([]);
  const [pages, setPages] = useState([]);
  const [source, setSource] = useState("db");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [failure, setFailure] = useState(null);
  const fail = (err, context) => setFailure({ err, context });
  const { toast, view: toasts } = useToast();

  const alive = useRef(true);

  const refresh = () =>
    Promise.all([loadClusters(), loadSeoPages()])
      .then(([c, p]) => {
        if (!alive.current) return;
        setClusters(c.rows);
        setPages(p.rows);
        setSource(c.source === "db" && p.source === "db" ? "db" : "static");
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

  /** 클러스터 id → 소속 라우트. 소속은 seo_pages.cluster_id 한 곳에만 적힌다 */
  const routesOf = useMemo(() => {
    const map = new Map();
    for (const page of pages) {
      if (page.cluster_id == null) continue;
      map.set(page.cluster_id, [...(map.get(page.cluster_id) ?? []), page.route]);
    }
    return map;
  }, [pages]);

  const orphanRoutes = pages
    .filter((p) => p.cluster_id == null && p.route !== "/")
    .map((p) => p.route);

  const onDelete = async (cluster) => {
    if (
      !window.confirm(
        `"${cluster.name}"\n\n이 클러스터를 삭제할까요? 페이지는 그대로 남고 소속만 풀립니다.`,
      )
    ) {
      return;
    }
    try {
      await deleteCluster(cluster.id);
      await refresh();
      toast("삭제했습니다.");
    } catch (err) {
      fail(err, "cluster-delete");
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-[16px]">
        <Skeleton className="h-[30px] w-[220px]" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[120px] w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-[20px]">
      <PageHead
        title="토픽 클러스터"
        description="비슷한 검색어를 노리는 페이지들을 묶고, 그중 대표 페이지(필러)를 정합니다."
      >
        <Btn tone="primary" disabled={readOnly} onClick={() => setEditing(BLANK)}>
          <IconPlus />새 클러스터
        </Btn>
      </PageHead>

      {readOnly && (
        <div className="flex flex-col gap-[6px] rounded-[12px] border border-[#f3dfae] bg-[#fdf8ec] px-[18px] py-[14px]">
          <p className="text-[13px] font-semibold text-[#8a6316]">
            아직 읽기 전용입니다 — 저장할 표가 데이터베이스에 없습니다.
          </p>
          <p className="text-[13px] leading-[21px] text-[#96793e]">
            지금 보이는 묶음은 코드에 들어 있는 기본값입니다. 화면에서 고치려면
            docs/seo-setup.md 의 SQL 을 Supabase 에서 한 번 실행해 주세요.
          </p>
        </div>
      )}

      <div className="flex gap-[10px]">
        <Stat label="클러스터" value={clusters.length} suffix="개" />
        <Stat label="관리 중인 페이지" value={pages.length} suffix="개" />
        <Stat
          label="어디에도 안 묶인 페이지"
          value={orphanRoutes.length}
          suffix="개"
          accent={orphanRoutes.length > 0}
          muted={orphanRoutes.length === 0}
        />
      </div>

      <Guide
        id="seo-clusters"
        title="클러스터는 이렇게 씁니다"
        steps={[
          "비슷한 검색 의도를 가진 페이지를 한 묶음으로 넣습니다. (예: 메뉴와 와인은 ‘무엇을 먹을까’ 로 같은 묶음)",
          "묶음마다 대표 페이지(필러)를 하나 정합니다. 내부 링크가 그 페이지로 모여 검색 순위가 그쪽에 쌓입니다.",
          "홈은 어느 묶음에도 넣지 않습니다. 홈은 세 필러를 모두 가리키는 출입구라, 묶어 버리면 브랜드명 검색을 두고 필러와 다투게 됩니다.",
          "아래 ‘내부 링크 지도’ 에서 어느 페이지가 어디로 링크되는지 바로 확인할 수 있습니다.",
        ]}
      />

      {clusters.length === 0 ? (
        <Empty
          icon={<IconDoc />}
          title="아직 클러스터가 없습니다"
          description="오른쪽 위 ‘새 클러스터’ 를 눌러 첫 묶음을 만들어 보세요. 페이지를 묶어야 내부 링크를 어디로 모을지 정할 수 있습니다."
        />
      ) : (
        <ul className="flex flex-col gap-[12px]">
          {clusters.map((c) => {
            const routes = routesOf.get(c.id) ?? [];
            const pillarOutside = !routes.includes(c.pillar_route);
            return (
              <li
                key={c.id}
                className="flex flex-col gap-[12px] rounded-[14px] border border-[#eaeaee] bg-white p-[18px]"
              >
                <div className="flex flex-wrap items-start justify-between gap-[10px]">
                  <div className="flex min-w-0 flex-col gap-[5px]">
                    <div className="flex flex-wrap items-center gap-[8px]">
                      <span className="text-[15px] font-bold tracking-[-0.38px] text-[#1a1a1e]">
                        {c.name}
                      </span>
                      <span className="font-mono text-[12px] text-[#a8a8b0]">{c.slug}</span>
                      <Badge tone="red">필러 {c.pillar_route}</Badge>
                    </div>
                    {c.description && (
                      <p className="max-w-[640px] text-[13px] leading-[20px] text-[#8a8a93]">
                        {c.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-[6px]">
                    <Btn size="sm" disabled={readOnly} onClick={() => setEditing(c)}>
                      수정
                    </Btn>
                    <Btn tone="danger" size="sm" disabled={readOnly} onClick={() => onDelete(c)}>
                      삭제
                    </Btn>
                  </div>
                </div>

                <div className="flex flex-wrap gap-[6px]">
                  {routes.length === 0 ? (
                    <span className="text-[13px] text-[#d1170f]">
                      소속된 페이지가 없습니다. 수정에서 페이지를 골라 주세요.
                    </span>
                  ) : (
                    routes.map((r) => (
                      <span
                        key={r}
                        className={`rounded-[7px] px-[9px] py-[4px] text-[12px] ${
                          r === c.pillar_route
                            ? "bg-[#fff2f1] font-semibold text-[#e61911]"
                            : "bg-[#f2f2f5] text-[#5a5a63]"
                        }`}
                      >
                        {ROUTE_LABELS[r] ?? r}
                        <span className="ml-[5px] font-mono text-[11px] text-[#a8a8b0]">{r}</span>
                      </span>
                    ))
                  )}
                </div>

                {pillarOutside && (
                  <p className="text-[12px] leading-[18px] text-[#d1170f]">
                    대표 페이지({c.pillar_route})가 이 묶음에 들어 있지 않습니다. 링크가 모일
                    자리가 비어 있는 셈이라, 대표 페이지도 소속에 함께 넣어 주세요.
                  </p>
                )}

                {c.keywords?.length > 0 && (
                  <p className="text-[12px] leading-[19px] text-[#a8a8b0]">
                    검색어 {c.keywords.join(" · ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <LinkMap clusters={clusters} routesOf={routesOf} />

      {editing && (
        <ClusterDrawer
          key={editing.id ?? "new"}
          row={editing}
          routes={routesOf.get(editing.id) ?? []}
          takenBy={pages}
          clusters={clusters}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            await refresh();
            setEditing(null);
            toast(message);
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

/**
 * 이 라우트에서 걸어야 할 내부 링크.
 *
 * 순서는 `seo.js` 의 internalLinksFor 와 **같아야 한다** — 실제 페이지에 깔리는 링크는
 * 그 함수가 만들기 때문이다. 여기서 그것을 그대로 부르지 않는 이유는, 그 함수가
 * 코드에 박힌 정적 CLUSTERS 를 보기 때문이다. 이 화면은 운영자가 방금 DB 에 저장한
 * 묶음을 보여 줘야 하므로 같은 규칙을 지금 상태에 적용한다.
 *   (1) 같은 묶음의 필러 → (2) 같은 묶음의 형제 → (3) 다른 묶음의 필러
 */
function linksFor(route, clusters, routesOf, limit = 4) {
  const own = clusters.find((c) => (routesOf.get(c.id) ?? []).includes(route)) ?? null;
  const out = [];
  const seen = new Set([route]);

  const push = (path, kind) => {
    if (!path || seen.has(path) || path.includes(":")) return;
    if (!ROUTE_LABELS[path]) return;
    seen.add(path);
    out.push({ path, label: ROUTE_LABELS[path], kind });
  };

  if (own) {
    push(own.pillar_route, "pillar");
    for (const r of routesOf.get(own.id) ?? []) push(r, "sibling");
  }
  /* 홈처럼 어느 묶음에도 없는 페이지는 세 필러를 모두 가리키는 출입구가 된다 */
  for (const c of clusters) {
    if (c === own) continue;
    push(c.pillar_route, "cross");
  }
  return out.slice(0, limit);
}

const KIND_LABEL = { pillar: "대표", sibling: "형제", cross: "다른 묶음" };

/** 지금 설정대로라면 어느 페이지에서 어디로 링크가 걸리는지 */
function LinkMap({ clusters, routesOf }) {
  return (
    <section className="flex flex-col gap-[14px] rounded-[16px] border border-[#eaeaee] bg-white p-[20px] md:p-[24px]">
      <div className="flex flex-col gap-[4px]">
        <h2 className="text-[16px] font-bold tracking-[-0.4px] text-[#1a1a1e]">내부 링크 지도</h2>
        <p className="text-[13px] leading-[21px] text-[#8a8a93]">
          지금 설정대로라면 각 페이지에서 아래 페이지들로 링크가 걸립니다.
          <span className="text-[#e61911]"> 대표</span> 로 표시된 곳으로 힘이 모입니다.
        </p>
      </div>

      <ul className="flex flex-col gap-[8px]">
        {LINKABLE.map((route) => {
          const links = linksFor(route, clusters, routesOf);
          return (
            <li
              key={route}
              className="flex flex-wrap items-center gap-[10px] rounded-[10px] border border-[#f0f0f3] px-[14px] py-[11px]"
            >
              <span className="flex min-w-[160px] flex-col">
                <span className="text-[13px] font-semibold text-[#1a1a1e]">
                  {ROUTE_LABELS[route] ?? route}
                </span>
                <span className="font-mono text-[11px] text-[#a8a8b0]">{route}</span>
              </span>
              <span className="text-[13px] text-[#c9c9d1]">→</span>
              {links.length === 0 ? (
                <span className="text-[12px] text-[#d1170f]">걸 링크가 없습니다</span>
              ) : (
                <span className="flex flex-wrap gap-[6px]">
                  {links.map((l) => (
                    <span
                      key={l.path}
                      className={`rounded-[7px] px-[9px] py-[4px] text-[12px] ${
                        l.kind === "pillar"
                          ? "bg-[#fff2f1] font-semibold text-[#e61911]"
                          : l.kind === "sibling"
                            ? "bg-[#f2f2f5] text-[#5a5a63]"
                            : "bg-[#f6f6f9] text-[#9a9aa2]"
                      }`}
                    >
                      {l.label}
                      <span className="ml-[5px] text-[11px] opacity-70">{KIND_LABEL[l.kind]}</span>
                    </span>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 클러스터 하나 만들기 / 고치기 */
function ClusterDrawer({ row, routes, takenBy, clusters, onClose, onSaved, onFail }) {
  const [draft, setDraft] = useState(row);
  const [picked, setPicked] = useState(routes);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  const slugBad = draft.slug.trim() !== "" && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(draft.slug.trim());
  const pillarOutside = draft.pillar_route && !picked.includes(draft.pillar_route);

  /** 다른 묶음이 이미 데려간 페이지 — 한 페이지는 한 묶음에만 속한다 */
  const ownerOf = (route) => {
    const page = takenBy.find((p) => p.route === route);
    if (!page || page.cluster_id == null || page.cluster_id === draft.id) return null;
    return clusters.find((c) => c.id === page.cluster_id) ?? null;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = draft.id
        ? await updateCluster(draft.id, draft)
        : await createCluster(draft);
      /* 소속은 topic_clusters 가 아니라 seo_pages.cluster_id 에 적힌다.
         그래서 저장이 두 걸음이다 — 묶음 자체를 저장하고, 그다음 소속을 맞춘다 */
      await assignClusterRoutes(saved.id, picked, routes);
      await onSaved(draft.id ? "클러스터를 수정했습니다." : "클러스터를 만들었습니다.");
    } catch (err) {
      onFail(err, "cluster-save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      width={720}
      onClose={() => !busy && onClose()}
      title={draft.id ? "클러스터 수정" : "새 클러스터"}
      subtitle="페이지를 묶고 대표 페이지를 정합니다"
      footer={
        <>
          <span className="hidden text-[12px] leading-[18px] text-[#9a9aa2] sm:block">
            저장 후 다시 배포해야 내부 링크가 바뀝니다.
          </span>
          <Btn
            tone="primary"
            size="lg"
            type="submit"
            form="cluster-form"
            disabled={busy || slugBad}
            className="ml-auto min-w-[150px]"
          >
            {busy ? "저장 중…" : draft.id ? "수정 저장" : "만들기"}
          </Btn>
        </>
      }
    >
      <form id="cluster-form" onSubmit={onSubmit} className="flex flex-col gap-[18px]">
        <div className="grid gap-[16px] md:grid-cols-2">
          <Field label="이름" required hint="운영자가 알아보는 이름">
            <input
              type="text"
              value={draft.name}
              onChange={set("name")}
              placeholder="곱창 미식"
              required
              maxLength={60}
              className={INPUT}
            />
          </Field>

          <Field label="주소용 이름(slug)" required hint="영문 소문자·숫자·하이픈">
            <input
              type="text"
              value={draft.slug}
              onChange={set("slug")}
              placeholder="gopchang-dining"
              required
              className={`${INPUT} ${slugBad ? "border-[#e61911]" : ""}`}
            />
          </Field>
        </div>
        {slugBad && (
          <p className="text-[12px] text-[#d1170f]">
            영문 소문자·숫자와 하이픈만 쓸 수 있습니다. (예: brand-franchise)
          </p>
        )}

        <Field label="설명" hint="이 묶음이 어떤 방문자를 위한 것인지">
          <textarea
            value={draft.description}
            onChange={set("description")}
            rows={3}
            className={`${INPUT} resize-y leading-[22px]`}
          />
        </Field>

        <Field label="대표 페이지(필러)" required htmlFor="cluster-pillar">
          <select
            id="cluster-pillar"
            value={draft.pillar_route}
            onChange={set("pillar_route")}
            className={INPUT}
          >
            {LINKABLE.map((r) => (
              <option key={r} value={r}>
                {ROUTE_LABELS[r] ?? r} ({r})
              </option>
            ))}
          </select>
        </Field>
        {pillarOutside && (
          <p className="text-[12px] leading-[18px] text-[#b8860b]">
            대표 페이지가 아래 목록에서 선택돼 있지 않습니다. 링크가 모일 자리가 비게 되니
            함께 골라 주세요.
          </p>
        )}

        <div className="flex flex-col gap-[8px]">
          <span className="text-[13px] font-semibold text-[#1a1a1e]">소속 페이지</span>
          <p className="text-[12px] leading-[19px] text-[#9a9aa2]">
            한 페이지는 한 묶음에만 속합니다. 다른 묶음에 있던 페이지를 고르면 그쪽에서
            빠져 이쪽으로 옮겨집니다. 홈은 일부러 넣지 않는 것이 좋습니다.
          </p>
          <div className="grid gap-[6px] sm:grid-cols-2">
            {SEO_ROUTES.map((route) => {
              const owner = ownerOf(route);
              const on = picked.includes(route);
              return (
                <label
                  key={route}
                  className="flex cursor-pointer items-center gap-[10px] rounded-[10px] border border-[#eaeaee] bg-[#fafafb] px-[12px] py-[10px]"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setPicked((list) =>
                        list.includes(route)
                          ? list.filter((r) => r !== route)
                          : [...list, route],
                      )
                    }
                    className="size-[16px] accent-[#e61911]"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[13px] font-medium text-[#1a1a1e]">
                      {ROUTE_LABELS[route] ?? route}
                      <span className="ml-[6px] font-mono text-[11px] text-[#a8a8b0]">
                        {route}
                      </span>
                    </span>
                    {owner && (
                      <span className="text-[11px] text-[#b8860b]">
                        지금은 ‘{owner.name}’ 소속
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <Field label="대표 검색어" hint="쉼표로 구분">
          <ClusterKeywords
            value={draft.keywords}
            onChange={(v) => setDraft((d) => ({ ...d, keywords: v }))}
          />
        </Field>

        <Field label="정렬 순서" hint="작을수록 위에 놓입니다">
          <input
            type="number"
            value={draft.sort_order}
            onChange={(e) => setDraft((d) => ({ ...d, sort_order: e.target.value }))}
            className={`${INPUT} w-[140px]`}
          />
        </Field>
      </form>
    </Drawer>
  );
}

/**
 * 쉼표 목록 입력.
 * 칠 때마다 배열로 쪼개 부모에 올리고 다시 join 해서 내려받으면 뒤 공백이 사라져
 * 커서가 튄다. 보이는 문자열은 이 부품이 직접 들고 있는다.
 */
function ClusterKeywords({ id, value, onChange }) {
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
      placeholder="곱창 프랜차이즈, 곱창집 창업"
      className={INPUT}
    />
  );
}
