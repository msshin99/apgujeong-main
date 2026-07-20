import { useEffect, useMemo, useState } from "react";
import { deleteInquiry, listInquiries, markInquiryRead } from "../../lib/inquiries.js";
import {
  Badge,
  Btn,
  Empty,
  ErrorDialog,
  Guide,
  IconChevron,
  IconClose,
  IconMail,
  PageHead,
  Skeleton,
  Stat,
  useToast,
} from "./ui.jsx";

/**
 * 문의 관리.
 *
 * inquiries 는 RLS 상 로그인한 사람만 읽을 수 있다.
 * 방문자 쪽에서는 insert 만 열려 있어 남의 연락처를 볼 수 없다.
 *
 * 목록에서 한 줄을 누르면 그 자리에서 펼쳐진다. 새 화면으로 넘어가면
 * 여러 건을 훑어볼 때 뒤로가기를 반복해야 한다.
 */
export default function AdminInquiries() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState("all"); // all | unread
  const [failure, setFailure] = useState(null);
  const { toast, view: toasts } = useToast();

  const refresh = () =>
    listInquiries()
      .then(setRows)
      .catch(setFailure)
      .finally(() => setLoading(false));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unread = useMemo(() => rows.filter((r) => !r.is_read).length, [rows]);
  const shown = filter === "unread" ? rows.filter((r) => !r.is_read) : rows;

  /* 이번 달 접수 건수 — 얼마나 들어오고 있는지 감을 잡는 용도 */
  const thisMonth = useMemo(() => {
    const now = new Date();
    return rows.filter((r) => {
      const d = new Date(r.created_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }, [rows]);

  /* 펼쳐서 읽으면 그 자리에서 읽음 처리한다. 따로 버튼을 누르게 하면 잊어버린다 */
  const toggle = (row) => {
    const next = openId === row.id ? null : row.id;
    setOpenId(next);
    if (next && !row.is_read) {
      setRows((list) => list.map((r) => (r.id === row.id ? { ...r, is_read: true } : r)));
      markInquiryRead(row.id, true).catch(() => refresh());
    }
  };

  const setRead = async (row, value) => {
    setRows((list) => list.map((r) => (r.id === row.id ? { ...r, is_read: value } : r)));
    try {
      await markInquiryRead(row.id, value);
    } catch {
      refresh();
    }
  };

  const onDelete = async (row) => {
    if (!window.confirm(`${row.name} 님의 문의를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await deleteInquiry(row.id);
      setOpenId(null);
      await refresh();
      toast("삭제했습니다.");
    } catch (err) {
      setFailure(err);
    }
  };

  const copy = (value, label) => {
    navigator.clipboard?.writeText(value);
    toast(`${label}를 복사했습니다.`);
  };

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-[20px]">
      {/* ── 상단 ── */}
      <PageHead
        title="문의 관리"
        description={
          loading
            ? "불러오는 중…"
            : unread > 0
              ? `확인하지 않은 문의가 ${unread}건 있습니다.`
              : "새로 들어온 문의를 모두 확인했습니다."
        }
      >
        <div className="flex gap-[3px] rounded-[10px] bg-[#eeeef1] p-[3px]">
          <FilterTab active={filter === "all"} onClick={() => setFilter("all")}>
            전체 {rows.length}
          </FilterTab>
          <FilterTab active={filter === "unread"} onClick={() => setFilter("unread")}>
            안 읽음 {unread}
          </FilterTab>
        </div>
      </PageHead>

      <div className="flex gap-[10px]">
        <Stat label="전체 문의" value={rows.length} />
        <Stat label="확인 안 함" value={unread} accent={unread > 0} muted={unread === 0} />
        <Stat label="이번 달" value={thisMonth} />
      </div>

      <Guide
        id="inquiries"
        title="문의는 이렇게 확인합니다"
        steps={[
          "목록에서 문의를 누르면 연락처·이메일·내용 전체가 펼쳐집니다.",
          "펼치는 순간 자동으로 ‘확인함’으로 바뀝니다. 빨간 점이 사라집니다.",
          "‘메일로 답장’을 누르면 메일 프로그램이 열리며 주소가 채워져 있습니다.",
        ]}
      />

      {/* ── 목록 ── */}
      {loading ? (
        <div className="flex flex-col gap-[8px]">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="rounded-[12px] border border-[#eaeaee] bg-white p-[16px]">
              <Skeleton className="h-[16px] w-1/2" />
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Empty
          icon={<IconMail />}
          title={filter === "unread" ? "안 읽은 문의가 없습니다" : "아직 접수된 문의가 없습니다"}
          description={
            filter === "unread"
              ? "새 문의가 들어오면 여기에 표시됩니다."
              : "사이트의 문의하기 페이지에서 접수된 내용이 이곳에 쌓입니다."
          }
        />
      ) : (
        <ul className="flex flex-col gap-[8px]">
          {shown.map((row) => {
            const isOpen = openId === row.id;
            return (
              <li
                key={row.id}
                className={`overflow-hidden rounded-[14px] border bg-white transition-all duration-200 ${
                  isOpen
                    ? "border-[#1a1a1e] shadow-[0_8px_28px_rgba(0,0,0,0.09)]"
                    : "border-[#eaeaee] hover:border-[#d5d5dd] hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(row)}
                  className="flex w-full items-center gap-[14px] px-[20px] py-[18px] text-left"
                >
                  {/* 안 읽은 문의는 점이 은은하게 뛴다 — 스크롤 중에도 눈에 걸린다 */}
                  <span
                    className={`size-[8px] shrink-0 rounded-full ${
                      row.is_read
                        ? "bg-[#dcdce2]"
                        : "animate-pulse bg-[#e61911] shadow-[0_0_0_3px_rgba(230,25,17,0.14)]"
                    }`}
                    title={row.is_read ? "확인함" : "확인 안 함"}
                  />
                  <span
                    className={`w-[100px] shrink-0 truncate text-[15px] tracking-[-0.38px] ${
                      row.is_read ? "text-[#6a6a73]" : "font-semibold text-[#1a1a1e]"
                    }`}
                  >
                    {row.name}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-[14px] ${
                      row.is_read ? "text-[#9a9aa2]" : "text-[#5a5a63]"
                    }`}
                  >
                    {row.message}
                  </span>
                  {!row.is_read && (
                    <span className="hidden shrink-0 rounded-[5px] bg-[#fdeceb] px-[8px] py-[3px] text-[11px] font-medium text-[#d1170f] sm:inline">
                      NEW
                    </span>
                  )}
                  <span className="hidden shrink-0 text-[13px] text-[#a8a8b0] tabular-nums sm:inline">
                    {formatWhen(row.created_at)}
                  </span>
                  {/* 눌러서 펼칠 수 있다는 걸 알려 주는 표시. 열리면 뒤집힌다 */}
                  <span
                    className={`shrink-0 text-[#b0b0b8] transition-transform duration-200 ${
                      isOpen ? "-rotate-180 text-[#1a1a1e]" : ""
                    }`}
                  >
                    <IconChevron />
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-[#f0f0f3] bg-[#fafafb] p-[18px]">
                    <div className="flex flex-col gap-[16px] rounded-[12px] border border-[#eaeaee] bg-white p-[20px]">
                      {/* 보낸 사람 */}
                      <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px] border-b border-[#f2f2f5] pb-[14px]">
                        <span className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-[#f2f2f5] text-[14px] font-bold text-[#6a6a73]">
                          {row.name.slice(0, 1)}
                        </span>
                        <span className="flex flex-col">
                          <span className="text-[15px] font-bold tracking-[-0.38px] text-[#1a1a1e]">
                            {row.name}
                          </span>
                          <span className="text-[12px] text-[#a8a8b0] tabular-nums">
                            {formatWhen(row.created_at, true)} 접수
                          </span>
                        </span>
                        <span className="ml-auto">
                          {row.agree_sms ? (
                            <Badge tone="green">SMS 수신 동의</Badge>
                          ) : (
                            <Badge>SMS 미동의</Badge>
                          )}
                        </span>
                      </div>

                      {/* 연락처 — 눌러서 바로 걸거나 메일을 열 수 있다 */}
                      <div className="grid gap-[8px] sm:grid-cols-2">
                        <Contact
                          icon={<IconPhone />}
                          label="연락처"
                          value={row.phone}
                          href={`tel:${row.phone.replaceAll("-", "")}`}
                          onCopy={() => copy(row.phone, "연락처")}
                        />
                        <Contact
                          icon={<IconMail />}
                          label="이메일"
                          value={row.email}
                          href={`mailto:${row.email}`}
                          onCopy={() => copy(row.email, "이메일")}
                        />
                      </div>

                      {/* 문의 내용 — 왼쪽 색 막대로 인용문처럼 */}
                      <div className="flex flex-col gap-[7px]">
                        <span className="text-[12px] font-semibold text-[#8a8a93]">문의 내용</span>
                        <p className="rounded-[10px] border-l-[3px] border-[#e61911] bg-[#fafafb] px-[16px] py-[14px] text-[14px] leading-[24px] whitespace-pre-line text-[#1a1a1e]">
                          {row.message}
                        </p>
                      </div>

                      {/* 주 동작은 왼쪽, 정리용 동작은 오른쪽 */}
                      <div className="flex flex-wrap items-center gap-[8px] border-t border-[#f2f2f5] pt-[16px]">
                        {/* mailto: 는 컴퓨터에 메일 프로그램이 등록돼 있어야 열린다.
                            등록돼 있지 않으면 눌러도 아무 일이 없어 고장으로 보이므로,
                            브라우저에서 바로 열리는 Gmail 작성창으로 보낸다.
                            받는 사람과 제목이 이미 채워진 상태로 열린다 */}
                        <a
                          href={gmailCompose(row.email, row.name)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-[7px] rounded-[9px] bg-[#1a1a1e] px-[18px] py-[11px] text-[14px] font-medium text-white transition-colors hover:bg-black"
                        >
                          <IconMail />
                          메일 보내기
                        </a>

                        {/* tel: 은 휴대폰·태블릿에서만 뜻이 있다. PC 에서는 아무 일도 일어나지 않아 감춘다 */}
                        {isTouch && (
                          <a
                            href={`tel:${row.phone.replaceAll("-", "")}`}
                            className="inline-flex items-center gap-[7px] rounded-[9px] border border-[#e3e3e8] px-[18px] py-[11px] text-[14px] font-medium text-[#5a5a63] transition-colors hover:border-[#1a1a1e] hover:text-[#1a1a1e]"
                          >
                            <IconPhone />
                            전화 걸기
                          </a>
                        )}

                        <span className="ml-auto flex items-center gap-[6px]">
                          <Btn tone="quiet" size="sm" onClick={() => setRead(row, false)}>
                            안 읽음으로
                          </Btn>
                          <Btn tone="quiet" size="sm" onClick={() => onDelete(row)}>
                            삭제
                          </Btn>
                          <Btn tone="ghost" size="sm" onClick={() => setOpenId(null)}>
                            <IconClose />
                            닫기
                          </Btn>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ErrorDialog error={failure} onClose={() => setFailure(null)} />
      {toasts}
    </div>
  );
}

function FilterTab({ active, children, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      className={`rounded-[7px] px-[14px] py-[7px] text-[13px] font-medium transition-all duration-150 ${
        active ? "bg-white text-[#1a1a1e] shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-[#8a8a93]"
      }`}
    >
      {children}
    </button>
  );
}

/** 연락처 한 칸. 값 자체가 링크라 눌러서 바로 걸거나 메일을 쓸 수 있다 */
function Contact({ icon, label, value, href, onCopy }) {
  return (
    <div className="group/c flex items-center gap-[11px] rounded-[10px] bg-[#fafafb] px-[14px] py-[11px]">
      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px] bg-white text-[#8a8a93]">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[11px] leading-[15px] text-[#a8a8b0]">{label}</span>
        <a
          href={href}
          className="truncate text-[14px] leading-[20px] font-semibold text-[#1a1a1e] underline-offset-2 hover:underline"
        >
          {value}
        </a>
      </span>
      <button
        type="button"
        onClick={onCopy}
        className="ml-auto shrink-0 rounded-[6px] px-[8px] py-[5px] text-[11px] text-[#b0b0b8] opacity-0 transition-all duration-150 group-hover/c:opacity-100 hover:bg-white hover:text-[#1a1a1e]"
      >
        복사
      </button>
    </div>
  );
}

function IconPhone() {
  return (
    <svg viewBox="0 0 20 20" className="size-[16px]" aria-hidden>
      <path
        d="M6.4 3.3H4a1.2 1.2 0 00-1.2 1.3c.3 5.6 4.6 9.9 10.2 10.2A1.2 1.2 0 0014.3 13.6v-2.3l-2.7-.9-1.2 1.5a10 10 0 01-3.7-3.7l1.5-1.2-.9-2.7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 휴대폰·태블릿인지. tel: 링크를 보여 줄지 정하는 데 쓴다 */
const isTouch =
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/**
 * 브라우저에서 바로 열리는 Gmail 작성창.
 * 받는 사람·제목·인사말까지 채워 두어 본문만 이어 쓰면 된다.
 */
function gmailCompose(to, name) {
  const su = encodeURIComponent("[압구정곱창] 문의해 주셔서 감사합니다");
  const body = encodeURIComponent(
    `${name} 님, 안녕하세요.\n압구정곱창입니다.\n\n문의해 주셔서 감사합니다.\n\n`,
  );
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${su}&body=${body}`;
}

/** 오늘 온 문의는 시각만, 그 전은 날짜까지 */
function formatWhen(iso, full = false) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const date = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  if (full) return `${date} ${time}`;
  return new Date().toDateString() === d.toDateString() ? time : date;
}
