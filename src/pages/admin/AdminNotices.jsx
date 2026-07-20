import { useEffect, useRef, useState } from "react";
import {
  createNotice,
  deleteNotice,
  FEATURED_LIMIT,
  listNotices,
  publicUrl,
  updateNotice,
  uploadNoticeImage,
} from "../../lib/notices.js";
import {
  Badge,
  Btn,
  DateField,
  Drawer,
  Empty,
  ErrorDialog,
  Field,
  Guide,
  INPUT,
  IconDoc,
  IconImage,
  IconPlus,
  IconStar,
  PageHead,
  Skeleton,
  Stat,
  useToast,
} from "./ui.jsx";

/**
 * 공지사항 관리.
 *
 * 평소에는 목록만 본다. 글을 쓰거나 고칠 때만 오른쪽 편집 패널이 열린다.
 * 폼을 늘 펼쳐 두면 "지금 뭘 하는 중인지" 가 흐려지고 목록이 좁아진다.
 *
 * 저장하면 곧바로 /notice 목록과 /notice/{id} 상세에 반영된다 —
 * 상세 페이지는 파일이 아니라 id 로 데이터를 찾아 그리기 때문이다.
 */
const today = () => new Date().toISOString().slice(0, 10);

const BLANK = {
  id: null,
  title: "",
  author: "압구정곱창",
  published_at: today(),
  body: "",
  is_public: true,
  image_path: null,
};

export default function AdminNotices() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(BLANK);
  const [file, setFile] = useState(null); // 새로 고른 이미지 (아직 업로드 전)
  const [preview, setPreview] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  /* 실패한 이유를 한글로 풀어 보여 줄 팝업. 토스트는 스쳐 지나가 원인을 놓친다.
     어느 동작에서 실패했는지(context)를 함께 담아 설명을 그 기능에 맞춘다 */
  const [failure, setFailure] = useState(null);
  const fail = (err, context) => setFailure({ err, context });
  const fileRef = useRef(null);
  const { toast, view: toasts } = useToast();

  const refresh = () =>
    listNotices({ includeHidden: true })
      .then(setRows)
      .catch((err) => fail(err, "list"))
      .finally(() => setLoading(false));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 미리보기 URL 은 브라우저 메모리를 잡고 있으므로 바뀔 때마다 풀어 준다 */
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const set = (key) => (e) =>
    setDraft((d) => ({
      ...d,
      [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  const openNew = () => {
    setDraft(BLANK);
    setFile(null);
    setOpen(true);
  };

  const openEdit = (row) => {
    setDraft({
      id: row.id,
      title: row.title,
      author: row.author,
      /* 화면에는 2026.04.22 로 보이지만 date 입력칸은 2026-04-22 를 요구한다 */
      published_at: row.date.replaceAll(".", "-"),
      body: row.body.join("\n\n"),
      is_public: row.isPublic,
      image_path: row.imagePath,
    });
    setFile(null);
    setOpen(true);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);

    try {
      let imagePath = draft.image_path;
      if (file) imagePath = await uploadNoticeImage(file);

      const fields = {
        title: draft.title.trim(),
        author: draft.author.trim() || "압구정곱창",
        published_at: draft.published_at,
        body: draft.body,
        is_public: draft.is_public,
        image_path: imagePath,
      };

      if (draft.id) await updateNotice(draft.id, fields);
      else await createNotice(fields);

      await refresh();
      setOpen(false);
      toast(draft.id ? "공지를 수정했습니다." : "공지를 등록했습니다.");
    } catch (err) {
      fail(err, "save");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (row) => {
    if (!window.confirm(`"${row.title}"\n\n이 공지를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await deleteNotice(row.id, row.imagePath);
      await refresh();
      toast("삭제했습니다.");
    } catch (err) {
      fail(err, "delete");
    }
  };

  /* 목록에서 공개 여부만 빠르게 바꾼다 */
  const togglePublic = async (row) => {
    setRows((list) =>
      list.map((r) => (r.id === row.id ? { ...r, isPublic: !r.isPublic } : r)),
    );
    try {
      await updateNotice(row.id, { is_public: !row.isPublic });
      toast(row.isPublic ? "비공개로 바꿨습니다." : "사이트에 공개했습니다.");
    } catch (err) {
      await refresh();
      fail(err, "public");
    }
  };

  /**
   * 메인 페이지에 실을 글 고르기.
   * 자리는 3개뿐이라, 다 찼는데 또 고르면 이유를 알려 주고 막는다.
   */
  const featured = rows.filter((r) => r.isFeatured);

  const toggleFeatured = async (row) => {
    if (!row.isFeatured && featured.length >= FEATURED_LIMIT) {
      toast(`메인에는 ${FEATURED_LIMIT}개까지만 넣을 수 있습니다. 먼저 하나를 빼 주세요.`, "error");
      return;
    }
    if (!row.isFeatured && !row.isPublic) {
      toast("비공개 글은 메인에 넣을 수 없습니다. 먼저 공개해 주세요.", "error");
      return;
    }

    setRows((list) =>
      list.map((r) => (r.id === row.id ? { ...r, isFeatured: !r.isFeatured } : r)),
    );
    try {
      await updateNotice(row.id, { is_featured: !row.isFeatured });
      toast(row.isFeatured ? "메인에서 내렸습니다." : "메인에 올렸습니다.");
    } catch (err) {
      await refresh();
      fail(err, "featured");
    }
  };

  const currentImage = preview ?? publicUrl(draft.image_path);
  const publicCount = rows.filter((r) => r.isPublic).length;

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-[20px]">
      {/* ── 상단 ── */}
      <PageHead
        title="공지사항"
        description="여기서 등록한 글이 사이트의 공지사항 페이지에 그대로 올라갑니다."
      >
        <Btn tone="primary" onClick={openNew}>
          <IconPlus />새 공지 작성
        </Btn>
      </PageHead>

      <div className="flex gap-[10px]">
        <Stat label="전체 공지" value={rows.length} suffix="개" />
        <Stat label="공개 중" value={publicCount} suffix="개" />
        <Stat
          label={`메인 노출 (최대 ${FEATURED_LIMIT})`}
          value={featured.length}
          suffix="개"
          muted={featured.length === 0}
        />
      </div>

      <Guide
        id="notices"
        title="공지는 이렇게 올립니다"
        steps={[
          "오른쪽 위 ‘새 공지 작성’을 누르면 작성 창이 열립니다.",
          "제목·대표 이미지·본문을 채우고 ‘등록하기’를 누릅니다. 본문은 빈 줄로 문단이 나뉩니다.",
          `목록에서 별을 누르면 그 글이 메인 페이지에 실립니다. 자리는 ${FEATURED_LIMIT}개까지입니다.`,
          "잠시 내리고 싶으면 ‘숨기기’를 누르세요. 글은 남고 방문자에게만 보이지 않습니다.",
        ]}
      />

      {/* ── 목록 ── */}
      {loading ? (
        <div className="flex flex-col gap-[10px]">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-[14px] rounded-[12px] border border-[#eaeaee] bg-white p-[14px]"
            >
              <Skeleton className="size-[64px] shrink-0" />
              <div className="flex flex-1 flex-col gap-[8px]">
                <Skeleton className="h-[16px] w-2/3" />
                <Skeleton className="h-[13px] w-[160px]" />
              </div>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        /* 버튼은 위 제목 줄에 이미 있다. 여기까지 두면 같은 화면에 두 번 나온다 */
        <Empty
          icon={<IconDoc />}
          title="아직 등록된 공지가 없습니다"
          description="오른쪽 위 ‘새 공지 작성’을 누르면 첫 글을 쓸 수 있습니다. 저장하는 즉시 사이트의 공지사항 페이지에 나타납니다."
        />
      ) : (
        <ul className="flex flex-col gap-[10px]">
          {rows.map((row) => (
            <li
              key={row.id}
              onDoubleClick={() => openEdit(row)}
              className="group flex items-center gap-[16px] rounded-[14px] border border-[#eaeaee] bg-white p-[14px] transition-all duration-200 hover:-translate-y-[1px] hover:border-[#d5d5dd] hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)]"
            >
              {/* 사이트 카드와 같은 544:300 비율로 보여 어떻게 잘리는지 바로 안다 */}
              <div className="relative aspect-[544/300] w-[116px] shrink-0 overflow-hidden rounded-[10px] bg-[#f2f2f5]">
                {row.image ? (
                  <img
                    src={row.image}
                    alt=""
                    className={`size-full object-cover transition-all duration-300 group-hover:scale-[1.04] ${
                      row.isPublic ? "" : "grayscale"
                    }`}
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-[#c9c9d1]">
                    <IconImage />
                  </span>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
                <div className="flex items-center gap-[8px]">
                  <p
                    className={`truncate text-[15px] leading-[22px] font-semibold tracking-[-0.38px] ${
                      row.isPublic ? "text-[#1a1a1e]" : "text-[#9a9aa2]"
                    }`}
                  >
                    {row.title}
                  </p>
                  {row.isPublic ? <Badge tone="green">공개</Badge> : <Badge>비공개</Badge>}
                  {row.isFeatured && <Badge tone="red">메인 노출</Badge>}
                </div>

                {/* 본문 첫 줄을 곁들이면 제목만으로 구분이 안 될 때 알아보기 쉽다 */}
                {row.body[0] && (
                  <p className="truncate text-[12px] leading-[18px] text-[#a8a8b0]">
                    {row.body[0]}
                  </p>
                )}

                <p className="flex flex-wrap items-center gap-x-[9px] text-[12px] text-[#9a9aa2]">
                  <span className="tabular-nums">{row.date}</span>
                  <span className="text-[#e0e0e6]">·</span>
                  <span>{row.author}</span>
                  <span className="text-[#e0e0e6]">·</span>
                  <span className="tabular-nums">조회 {row.views}</span>
                </p>
              </div>

              {/* 평소엔 옅게, 마우스를 올리면 또렷해진다 — 목록이 버튼으로 시끄러워지지 않는다 */}
              <div className="flex shrink-0 items-center gap-[6px] opacity-70 transition-opacity duration-200 group-hover:opacity-100">
                {/* 별 = 메인 페이지 노출. 자리가 3개뿐이라 채워진 개수가 한눈에 보여야 한다 */}
                <button
                  type="button"
                  onClick={() => toggleFeatured(row)}
                  title={row.isFeatured ? "메인에서 내리기" : "메인에 올리기"}
                  className={`flex size-[34px] items-center justify-center rounded-[8px] transition-colors duration-150 ${
                    row.isFeatured
                      ? "bg-[#fff2f1] text-[#e61911]"
                      : "text-[#c9c9d1] hover:bg-[#f2f2f5] hover:text-[#8a8a93]"
                  }`}
                >
                  <IconStar filled={row.isFeatured} />
                </button>
                <Btn tone="quiet" size="sm" onClick={() => togglePublic(row)}>
                  {row.isPublic ? "숨기기" : "공개하기"}
                </Btn>
                <Btn tone="ghost" size="sm" onClick={() => openEdit(row)}>
                  수정
                </Btn>
                <Btn tone="danger" size="sm" onClick={() => onDelete(row)}>
                  삭제
                </Btn>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ── 편집 패널 ── */}
      <Drawer
        open={open}
        width={1180}
        onClose={() => !busy && setOpen(false)}
        title={draft.id ? "공지 수정" : "새 공지 작성"}
        subtitle={
          draft.id
            ? `글 번호 ${draft.id} · 저장하면 사이트에 바로 반영됩니다`
            : "저장하면 공지사항 페이지에 바로 나타납니다"
        }
        footer={
          /* 헤더의 X 가 곧 "취소" 다. 아래에 또 두면 같은 동작이 두 번 나온다.
             여기는 저장 하나만 두고, 왼쪽에는 저장 후 무슨 일이 생기는지 적는다 */
          <>
            <span className="hidden text-[12px] leading-[18px] text-[#9a9aa2] sm:block">
              {draft.is_public
                ? "저장하면 사이트 공지사항 페이지에 바로 올라갑니다."
                : "비공개 상태로 저장됩니다. 방문자에게는 보이지 않습니다."}
            </span>
            <Btn
              tone="primary"
              size="lg"
              type="submit"
              form="notice-form"
              disabled={busy}
              className="ml-auto min-w-[160px]"
            >
              {busy ? "저장 중…" : draft.id ? "수정 저장" : "등록하기"}
            </Btn>
          </>
        }
      >
        <form id="notice-form" onSubmit={onSubmit} className="flex flex-col gap-[20px]">
          <Field label="제목" required>
            <input
              type="text"
              value={draft.title}
              onChange={set("title")}
              placeholder="예: 설 연휴 영업 안내"
              required
              className={`${INPUT} text-[16px] font-medium`}
            />
          </Field>

          {/* 넓은 창에서는 글 내용과 부가 설정을 좌우로 나눈다 */}
          <div className="grid gap-[24px] md:grid-cols-[minmax(0,1fr)_320px]">
            <Field label="본문" required hint="빈 줄(엔터 두 번)로 문단이 나뉩니다">
              <textarea
                value={draft.body}
                onChange={set("body")}
                rows={20}
                placeholder={
                  "안녕하세요. 항상 저희 압구정곱창을 찾아 주셔서 감사합니다.\n\n설 연휴 기간 영업 시간을 안내드립니다.\n\n감사합니다."
                }
                required
                className={`${INPUT} h-full min-h-[380px] resize-y leading-[25px]`}
              />
            </Field>

            <div className="flex flex-col gap-[18px]">
              <Field label="게시일" required>
                <DateField
                  value={draft.published_at}
                  onChange={(v) => setDraft((d) => ({ ...d, published_at: v }))}
                />
              </Field>

              <Field label="작성자">
                <input type="text" value={draft.author} onChange={set("author")} className={INPUT} />
              </Field>

              <Field label="대표 이미지" hint="목록·상세에 함께 쓰입니다">
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped?.type.startsWith("image/")) setFile(dropped);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-[10px] rounded-[10px] border border-dashed p-[14px] transition-colors duration-150 ${
                dragging
                  ? "border-[#e61911] bg-[#fff5f4]"
                  : "border-[#dcdce2] bg-[#fafafb] hover:border-[#1a1a1e]"
              }`}
            >
                  {currentImage ? (
                    <>
                      <img
                        src={currentImage}
                        alt=""
                        className="aspect-[544/300] w-full rounded-[6px] bg-white object-cover"
                      />
                      <span className="text-[12px] text-[#8a8a93]">
                        클릭하거나 끌어다 놓아 교체
                      </span>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-[7px] py-[22px] text-[#b0b0b8]">
                      <IconImage />
                      <span className="text-[13px] text-[#8a8a93]">
                        끌어다 놓거나 클릭해서 선택
                      </span>
                      <span className="text-[11px] text-[#b0b0b8]">권장 1088 × 600</span>
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                {(file || draft.image_path) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setDraft((d) => ({ ...d, image_path: null }));
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="self-start text-[12px] text-[#9a9aa2] underline-offset-2 transition-colors hover:text-[#e61911] hover:underline"
                  >
                    이미지 제거
                  </button>
                )}
              </Field>

              {/* 공개 여부는 켜고 끄는 스위치가 직관적이다 */}
              <label className="flex cursor-pointer items-center justify-between gap-[10px] rounded-[10px] border border-[#eaeaee] bg-[#fafafb] px-[14px] py-[12px]">
                <span className="flex flex-col">
                  <span className="text-[13px] font-semibold">사이트에 공개</span>
                  <span className="text-[12px] leading-[17px] text-[#9a9aa2]">
                    끄면 저장만 되고 방문자에게는 보이지 않습니다
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={draft.is_public}
                  onChange={set("is_public")}
                  className="peer sr-only"
                />
                {/* 손잡이는 input 의 형제가 아니라 자손이라, peer-checked 를 트랙에서 걸어 내려보낸다 */}
                <span className="relative h-[26px] w-[46px] shrink-0 rounded-full bg-[#d9d9e0] transition-colors duration-200 peer-checked:bg-[#e61911] peer-checked:[&>span]:translate-x-[20px]">
                  <span className="absolute top-[3px] left-[3px] size-[20px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform duration-200" />
                </span>
              </label>
            </div>
          </div>
        </form>
      </Drawer>

      <ErrorDialog
        error={failure?.err}
        context={failure?.context}
        onClose={() => setFailure(null)}
      />
      {toasts}
    </div>
  );
}
