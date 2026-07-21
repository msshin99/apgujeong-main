import { Children, cloneElement, isValidElement, useEffect, useId, useRef, useState } from "react";

/**
 * 관리자 화면 공통 부품.
 *
 * 쓰는 사람이 개발자가 아니라 매장 담당자라는 전제로 만들었다.
 *  - 버튼은 무엇이 "주 동작"인지 한눈에 보이게 한 화면에 하나만 강조한다
 *  - 결과는 화면 구석의 토스트로 알린다. 폼 안쪽 작은 글씨는 잘 안 읽힌다
 *  - 위험한 동작(삭제)은 색으로 먼저 알리고 한 번 더 묻는다
 */

export const INPUT =
  "w-full rounded-[8px] border border-[#e3e3e8] bg-white px-[14px] py-[11px] text-[14px] leading-[22px] text-[#1a1a1e] outline-none transition-all duration-150 placeholder:text-[#b0b0b8] hover:border-[#c9c9d1] focus:border-[#1a1a1e] focus:ring-[3px] focus:ring-black/5";

/**
 * 라벨 + 설명 + 입력칸 한 묶음.
 *
 * label 이 글자만 감싸고 입력칸을 감싸지 않으면 화면 낭독기는 이 칸의 이름을 읽지 못한다.
 * 그래서 자식 입력칸에 id 를 심고 htmlFor 로 이어 준다.
 * 자식이 여럿이거나 id 를 직접 정해야 하는 칸은 htmlFor 로 받아 쓴다.
 */
export function Field({ label, hint, required, htmlFor, className = "", children }) {
  const autoId = useId();
  const only = Children.count(children) === 1 ? Children.toArray(children)[0] : null;
  const single = isValidElement(only) ? only : null;
  const controlId = htmlFor ?? single?.props.id ?? (single ? autoId : undefined);

  return (
    <div className={`flex flex-col gap-[7px] ${className}`}>
      <label htmlFor={controlId} className="flex items-baseline gap-[6px]">
        <span className="text-[13px] font-semibold tracking-[-0.33px] text-[#1a1a1e]">
          {label}
        </span>
        {required && <span className="text-[13px] text-[#e61911]">*</span>}
        {hint && <span className="text-[12px] font-normal text-[#9a9aa2]">{hint}</span>}
      </label>
      {!htmlFor && single && !single.props.id ? cloneElement(single, { id: autoId }) : children}
    </div>
  );
}

const BTN_BASE =
  "inline-flex shrink-0 items-center justify-center gap-[6px] rounded-[8px] font-medium whitespace-nowrap transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-45";

const BTN_SIZE = {
  sm: "px-[12px] py-[7px] text-[13px]",
  md: "px-[18px] py-[11px] text-[14px]",
  lg: "px-[24px] py-[13px] text-[15px]",
};

const BTN_TONE = {
  primary: "bg-[#e61911] text-white hover:bg-[#c8140d] active:bg-[#ad110b]",
  dark: "bg-[#1a1a1e] text-white hover:bg-black",
  ghost: "border border-[#e3e3e8] bg-white text-[#5a5a63] hover:border-[#1a1a1e] hover:text-[#1a1a1e]",
  danger: "border border-[#e3e3e8] bg-white text-[#5a5a63] hover:border-[#e61911] hover:bg-[#fff5f4] hover:text-[#e61911]",
  quiet: "text-[#8a8a93] hover:bg-[#f2f2f5] hover:text-[#1a1a1e]",
};

export function Btn({ tone = "ghost", size = "md", className = "", ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      className={`${BTN_BASE} ${BTN_SIZE[size]} ${BTN_TONE[tone]} ${className}`}
    />
  );
}

/** 공개 / 비공개 같은 상태 표시 */
export function Badge({ tone = "gray", children }) {
  const tones = {
    gray: "bg-[#f2f2f5] text-[#6a6a73]",
    green: "bg-[#e9f7ee] text-[#1c8a45]",
    red: "bg-[#fdeceb] text-[#d1170f]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-[5px] px-[7px] py-[2px] text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** 목록이 비었을 때 */
export function Empty({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center gap-[12px] rounded-[16px] border border-dashed border-[#e0e0e6] bg-white px-[24px] py-[80px] text-center">
      {icon && (
        <div className="mb-[2px] flex size-[52px] items-center justify-center rounded-full bg-[#f4f4f7] text-[#b6b6be]">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-semibold text-[#1a1a1e]">{title}</p>
      {description && (
        <p className="max-w-[320px] text-[13px] leading-[21px] text-[#8a8a93]">{description}</p>
      )}
      {action && <div className="mt-[8px]">{action}</div>}
    </div>
  );
}

/**
 * 상단 요약 카드.
 * 숫자를 크게 앞세워 "지금 상태" 를 한눈에 보게 한다.
 * accent 를 주면 챙겨야 할 숫자(미확인 문의 등)를 브랜드 색으로 강조한다.
 */
export function Stat({ label, value, suffix = "건", accent = false, muted = false }) {
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col gap-[5px] rounded-[14px] border px-[18px] py-[15px] transition-colors duration-200 ${
        accent ? "border-[#f6cdcb] bg-[#fff6f5]" : "border-[#eaeaee] bg-white"
      }`}
    >
      <span
        className={`text-[12px] font-medium tracking-[-0.3px] ${
          accent ? "text-[#d1170f]" : "text-[#9a9aa2]"
        }`}
      >
        {label}
      </span>
      <span className="flex items-baseline gap-[3px]">
        <span
          className={`text-[24px] leading-[30px] font-bold tracking-[-0.6px] tabular-nums ${
            accent ? "text-[#e61911]" : muted ? "text-[#b0b0b8]" : "text-[#1a1a1e]"
          }`}
        >
          {value}
        </span>
        <span className="text-[12px] font-medium text-[#b0b0b8]">{suffix}</span>
      </span>
    </div>
  );
}

/**
 * 처음 쓰는 사람을 위한 안내 띠.
 *
 * 익숙해지면 거슬리므로 닫을 수 있게 하고, 닫은 사실을 이 브라우저에 기억한다.
 * (계정이 아니라 브라우저 단위다. 다른 기기에서는 다시 보인다 — 그래도 무방한 안내다)
 */
export function Guide({ id, title, steps }) {
  const key = `admin-guide-${id}`;
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(key) !== "hidden";
  });

  if (!open) return null;

  return (
    <div className="flex items-start gap-[14px] rounded-[14px] border border-[#e4e9f5] bg-[#f4f7fd] px-[18px] py-[15px]">
      <span className="mt-[1px] flex size-[24px] shrink-0 items-center justify-center rounded-full bg-[#2f6bd8] text-[13px] font-bold text-white">
        ?
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
        <p className="text-[13px] font-semibold tracking-[-0.33px] text-[#22449a]">{title}</p>
        <ol className="flex flex-col gap-[5px]">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-[8px] text-[13px] leading-[20px] text-[#4a5a80]">
              <span className="mt-[3px] flex size-[16px] shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[#2f6bd8]">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <button
        type="button"
        onClick={() => {
          window.localStorage.setItem(key, "hidden");
          setOpen(false);
        }}
        className="shrink-0 rounded-[6px] px-[8px] py-[5px] text-[12px] text-[#7286ad] transition-colors hover:bg-white hover:text-[#22449a]"
      >
        다시 보지 않기
      </button>
    </div>
  );
}

/** 페이지 제목 줄 */
export function PageHead({ title, description, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-[12px]">
      <div className="flex flex-col gap-[5px]">
        <h1 className="text-[23px] leading-[30px] font-bold tracking-[-0.58px] text-[#1a1a1e]">
          {title}
        </h1>
        {description && <p className="text-[13px] text-[#8a8a93]">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** 불러오는 중 자리표시 */
export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-[6px] bg-[#f0f0f3] ${className}`} />;
}

/**
 * 화면 아래쪽에 잠깐 떠오르는 알림.
 * useToast() 로 만들고, 반환된 toast(메시지, 종류) 를 부르면 된다.
 */
export function useToast() {
  const [items, setItems] = useState([]);
  /* 저장 직후 화면을 떠나면 아직 안 끝난 타이머가 사라진 화면의 상태를 건드린다.
     띄워 둔 타이머를 모아 두었다가 화면이 사라질 때 모두 걷어 낸다 */
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const toast = (text, tone = "ok") => {
    const id = Math.random().toString(36).slice(2);
    setItems((list) => [...list, { id, text, tone }]);
    const timer = setTimeout(() => {
      timers.current = timers.current.filter((t) => t !== timer);
      setItems((list) => list.filter((t) => t.id !== id));
    }, 3200);
    timers.current.push(timer);
  };

  const view = (
    <div className="pointer-events-none fixed inset-x-0 bottom-[24px] z-[200] flex flex-col items-center gap-[8px] px-[20px]">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-[8px] rounded-[10px] px-[16px] py-[11px] text-[13px] font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] ${
            t.tone === "error" ? "bg-[#d1170f]" : "bg-[#1a1a1e]"
          }`}
          style={{ animation: "admin-toast 220ms cubic-bezier(0.22,1,0.36,1)" }}
        >
          {t.tone === "error" ? <IconAlert /> : <IconCheck />}
          {t.text}
        </div>
      ))}
      <style>{`
        @keyframes admin-toast {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );

  return { toast, view };
}

/* 창 안에서 Tab 으로 갈 수 있는 것들 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * 지금 열려 있는 창들. 나중에 열린 것이 뒤에 온다.
 *
 * 창은 하나만 열린다는 보장이 없다 — 저장에 실패하면 편집 창이 열린 채로
 * 그 위에 ErrorDialog(이것도 Drawer 다)가 뜬다. 두 창이 각자 window 에서 Tab 을
 * 가로채면, 아래 창은 "포커스가 내 밖에 있다"며 자기 첫 칸으로 끌어가고 위 창도
 * 똑같이 해서, 결국 Tab 이 제자리를 맴돌아 '확인' 버튼까지 갈 수가 없다.
 * 그래서 맨 위 창만 키를 처리한다.
 */
const MODAL_STACK = [];

/**
 * 화면 한가운데 뜨는 편집 창.
 *
 * 글쓰기처럼 한 번에 하나만 하는 작업은 시선이 가운데 모이는 편이 집중하기 좋다.
 * 배경을 눌러도, Esc 를 눌러도 닫힌다.
 * 열려 있는 동안 Tab 은 창 안에서만 돌고, 닫으면 열었던 자리로 포커스를 되돌린다.
 */
export function Drawer({ open, title, subtitle, onClose, children, footer, width = 560 }) {
  const panelRef = useRef(null);
  /* onClose 는 대개 그 자리에서 만든 함수라 그릴 때마다 새것이 된다.
     그대로 의존성에 넣으면 글자를 칠 때마다 아래 효과가 다시 걸려 포커스가 튄다 */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // 열려 있는 동안 뒤 배경이 스크롤되면 어지럽다
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    /* 창을 연 버튼을 기억해 둔다. 닫은 뒤 포커스가 문서 맨 앞으로 튀면
       키보드만 쓰는 사람은 방금까지 있던 자리를 잃는다 */
    const opener = document.activeElement;
    panelRef.current?.focus();

    /* 맨 위에 있는 동안에만 키를 처리한다는 표시 */
    const token = {};
    MODAL_STACK.push(token);

    const onKey = (e) => {
      if (MODAL_STACK[MODAL_STACK.length - 1] !== token) return;
      if (e.key === "Escape") {
        closeRef.current();
        return;
      }
      /* Tab 이 창 밖으로 새어 나가면 가려진 뒤 화면을 더듬게 된다. 안에서 돌게 가둔다 */
      if (e.key !== "Tab" || !panelRef.current) return;
      const list = Array.from(panelRef.current.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (list.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      const inside = panelRef.current.contains(active);
      if (e.shiftKey && (!inside || active === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      const at = MODAL_STACK.indexOf(token);
      if (at !== -1) MODAL_STACK.splice(at, 1);
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[2px]"
        style={{ animation: "admin-fade 200ms ease-out" }}
      />
      <div className="pointer-events-none fixed inset-0 z-[110] flex items-center justify-center p-[16px] md:p-[32px]">
        <section
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          style={{ maxWidth: width, animation: "admin-pop 260ms cubic-bezier(0.22,1,0.36,1)" }}
          className="pointer-events-auto flex max-h-full w-full flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_24px_70px_rgba(0,0,0,0.22)] outline-none"
        >
          <style>{`
            @keyframes admin-fade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes admin-pop {
              from { opacity: 0; transform: translateY(14px) scale(0.985); }
              to   { opacity: 1; transform: none; }
            }
          `}</style>
        <header className="flex shrink-0 items-start justify-between gap-[16px] border-b border-[#eeeef1] px-[28px] py-[20px]">
          <div className="flex flex-col gap-[3px]">
            <h2 className="text-[18px] font-bold tracking-[-0.45px] text-[#1a1a1e]">{title}</h2>
            {subtitle && <p className="text-[12px] text-[#9a9aa2]">{subtitle}</p>}
          </div>
          <Btn tone="quiet" size="sm" onClick={onClose} aria-label="닫기">
            <IconClose />
            닫기
          </Btn>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-[28px] py-[24px]">{children}</div>

          {footer && (
            <footer className="flex shrink-0 items-center gap-[10px] border-t border-[#eeeef1] bg-[#fafafb] px-[28px] py-[18px]">
              {footer}
            </footer>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * 날짜 선택.
 *
 * <input type="date"> 는 달력을 브라우저가 그린다. 크롬·사파리·파이어폭스가
 * 저마다 다르게 생겼고 한국어 요일 표기나 색도 맞출 수 없어서 직접 만들었다.
 * 값은 "YYYY-MM-DD" 문자열로 주고받는다.
 */
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function DateField({ id, value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = parseISO(value) ?? new Date();
  const [cursor, setCursor] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    // 열 때마다 선택된 달로 되돌린다. 엉뚱한 달을 보던 채로 다시 열리면 헷갈린다
    const d = parseISO(value) ?? new Date();
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));

    const onDown = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, value]);

  const days = buildMonth(cursor);
  const todayISO = toISO(new Date());
  const pick = (d) => {
    onChange(toISO(d));
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${INPUT} flex items-center justify-between gap-[8px] text-left ${
          open ? "border-[#1a1a1e] ring-[3px] ring-black/5" : ""
        }`}
      >
        <span className="tabular-nums">{formatKo(value)}</span>
        <IconCalendar />
      </button>

      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 z-50 w-[292px] rounded-[14px] border border-[#eaeaee] bg-white p-[14px] shadow-[0_12px_36px_rgba(0,0,0,0.14)]">
          {/* 달 이동 */}
          <div className="mb-[10px] flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCursor(shiftMonth(cursor, -1))}
              aria-label="이전 달"
              className="flex size-[30px] items-center justify-center rounded-[8px] text-[#8a8a93] transition-colors hover:bg-[#f2f2f5] hover:text-[#1a1a1e]"
            >
              <span className="rotate-90">
                <IconChevron />
              </span>
            </button>
            <span className="text-[14px] font-semibold tracking-[-0.35px] tabular-nums">
              {cursor.getFullYear()}년 {cursor.getMonth() + 1}월
            </span>
            <button
              type="button"
              onClick={() => setCursor(shiftMonth(cursor, 1))}
              aria-label="다음 달"
              className="flex size-[30px] items-center justify-center rounded-[8px] text-[#8a8a93] transition-colors hover:bg-[#f2f2f5] hover:text-[#1a1a1e]"
            >
              <span className="-rotate-90">
                <IconChevron />
              </span>
            </button>
          </div>

          <div className="mb-[4px] grid grid-cols-7">
            {WEEKDAYS.map((w, i) => (
              <span
                key={w}
                className={`flex h-[26px] items-center justify-center text-[11px] font-medium ${
                  i === 0 ? "text-[#e08079]" : i === 6 ? "text-[#7f9ad4]" : "text-[#a8a8b0]"
                }`}
              >
                {w}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-[2px]">
            {days.map(({ date, outside }) => {
              const iso = toISO(date);
              const isSelected = iso === value;
              const isToday = iso === todayISO;
              const dow = date.getDay();
              return (
                <button
                  key={iso + (outside ? "-o" : "")}
                  type="button"
                  onClick={() => pick(date)}
                  className={`relative flex h-[34px] items-center justify-center rounded-[8px] text-[13px] tabular-nums transition-colors duration-100 ${
                    isSelected
                      ? "bg-[#1a1a1e] font-semibold text-white"
                      : outside
                        ? "text-[#d5d5dd] hover:bg-[#f6f6f9]"
                        : `hover:bg-[#f2f2f5] ${
                            dow === 0
                              ? "text-[#e05046]"
                              : dow === 6
                                ? "text-[#4a72c4]"
                                : "text-[#3a3a42]"
                          }`
                  }`}
                >
                  {date.getDate()}
                  {isToday && !isSelected && (
                    <span className="absolute bottom-[4px] size-[3px] rounded-full bg-[#e61911]" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-[10px] flex justify-between border-t border-[#f0f0f3] pt-[10px]">
            <button
              type="button"
              onClick={() => pick(new Date())}
              className="rounded-[7px] px-[10px] py-[6px] text-[12px] font-medium text-[#e61911] transition-colors hover:bg-[#fff5f4]"
            >
              오늘로 설정
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-[7px] px-[10px] py-[6px] text-[12px] text-[#8a8a93] transition-colors hover:bg-[#f2f2f5]"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function parseISO(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toISO(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatKo(s) {
  const d = parseISO(s);
  if (!d) return "날짜 선택";
  return `${s.replaceAll("-", ".")} (${WEEKDAYS[d.getDay()]})`;
}

function shiftMonth(d, delta) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

/** 앞뒤 달을 채워 항상 6주(42칸)를 만든다. 달마다 높이가 달라지면 화면이 튄다 */
function buildMonth(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return { date, outside: date.getMonth() !== cursor.getMonth() };
  });
}

/**
 * 오류를 한국어로 풀어 준다.
 *
 * Supabase 가 돌려주는 메시지는 Postgres 원문(영어)이라 쓰는 사람이 알아볼 수 없다.
 * 자주 나오는 것들만 골라 "무엇이 잘못됐는지 / 어떻게 고치는지" 로 바꿔 준다.
 * 모르는 오류는 원문을 그대로 보여 준다 — 숨기면 물어볼 근거조차 사라진다.
 */
export function explainError(err, context) {
  const code = err?.code ?? "";
  const message = String(err?.message ?? err ?? "");

  // 42703 — 없는 칸을 쓰려 했다
  if (code === "42703" || /column .* does not exist/i.test(message)) {
    const column = message.match(/column "?([\w.]+)"?/i)?.[1] ?? "필요한 칸";
    return {
      title: "데이터베이스에 필요한 칸이 아직 없습니다",
      summary: `이 기능은 공지 표에 '${column}' 이라는 칸이 있어야 동작합니다. 아직 만들어지지 않았습니다.`,
      steps: [
        "Supabase 대시보드에 로그인합니다.",
        "왼쪽 메뉴에서 SQL Editor → New query 를 엽니다.",
        "아래 SQL 을 붙여넣고 Run 을 누릅니다.",
        "‘Success. No rows returned’ 가 뜨면 이 화면을 새로고침합니다.",
      ],
      sql: `alter table public.notices\n  add column if not exists is_featured boolean not null default false;\n\ncreate index if not exists notices_featured_idx\n  on public.notices (is_featured) where is_featured;`,
      raw: message,
    };
  }

  // RLS 정책에 막혔다
  if (code === "42501" || /row-level security/i.test(message)) {
    return {
      title: "이 작업을 할 권한이 없습니다",
      summary:
        "로그인이 풀렸거나, 데이터베이스의 접근 규칙(RLS)이 이 동작을 막고 있습니다.",
      steps: [
        "오른쪽 위에서 로그아웃한 뒤 다시 로그인해 보세요.",
        "그래도 같으면 Supabase 의 notices 표에 관리자용 정책이 걸려 있는지 확인해야 합니다.",
      ],
      raw: message,
    };
  }

  // 로그인 만료
  if (code === "PGRST301" || /jwt|token/i.test(message)) {
    return {
      title: "로그인이 만료되었습니다",
      summary: "보안을 위해 일정 시간이 지나면 로그인이 자동으로 풀립니다.",
      steps: ["로그아웃 후 다시 로그인해 주세요.", "작성 중이던 내용은 복구되지 않으니 미리 복사해 두세요."],
      raw: message,
    };
  }

  // 네트워크
  if (/fetch|network|Failed to fetch/i.test(message)) {
    return {
      title: "서버에 연결하지 못했습니다",
      summary: "인터넷 연결이 끊겼거나 데이터베이스가 잠시 응답하지 않습니다.",
      steps: ["인터넷 연결을 확인해 주세요.", "잠시 후 다시 시도해 주세요."],
      raw: message,
    };
  }

  // 메인 노출(별 버튼)에서 난 오류라면 이 기능의 규칙부터 짚어 준다
  if (context === "featured") {
    return {
      title: "메인 노출을 바꾸지 못했습니다",
      summary:
        "메인 페이지 공지 자리는 3칸입니다. 등록된 공지가 3개보다 적으면 굳이 고르지 않아도 최신 글로 자동으로 채워지기 때문에, 공지 수가 부족한 상태에서는 이 버튼이 제 역할을 하지 못합니다.",
      steps: [
        "공지를 3개 이상 등록한 뒤 다시 눌러 보세요.",
        "공지가 충분한데도 같은 오류가 나면, 아래 ‘오류 원문 보기’ 를 펼쳐 그 내용을 개발자에게 전달해 주세요.",
      ],
      raw: message,
      openRaw: true,
    };
  }

  return {
    title: "작업을 완료하지 못했습니다",
    summary: "예상하지 못한 오류입니다. 아래 원문을 개발자에게 전달해 주세요.",
    steps: ["잠시 후 다시 시도해 보세요.", "계속 같은 오류가 나면 아래 내용을 그대로 전달해 주세요."],
    raw: message,
    /* 무슨 오류인지 모를 때는 원문을 접어 두면 안 된다.
       물어볼 근거가 화면에 보이지 않으면 결국 아무도 원인을 알 수 없다 */
    openRaw: true,
  };
}

/** explainError 결과를 보여 주는 팝업 */
export function ErrorDialog({ error, context, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!error) return null;

  const info = explainError(error, context);

  const copy = (text) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Drawer
      open
      width={560}
      onClose={onClose}
      title={info.title}
      subtitle="아래 순서대로 하시면 해결됩니다"
      footer={
        <Btn tone="dark" size="md" className="ml-auto min-w-[120px]" onClick={onClose}>
          확인
        </Btn>
      }
    >
      <div className="flex flex-col gap-[18px]">
        <p className="rounded-[10px] bg-[#fff5f4] px-[16px] py-[14px] text-[14px] leading-[23px] text-[#a3120c]">
          {info.summary}
        </p>

        <div className="flex flex-col gap-[8px]">
          <span className="text-[13px] font-semibold text-[#1a1a1e]">해결 방법</span>
          <ol className="flex flex-col gap-[7px]">
            {info.steps.map((step, i) => (
              <li key={i} className="flex gap-[9px] text-[13px] leading-[21px] text-[#5a5a63]">
                <span className="mt-[2px] flex size-[17px] shrink-0 items-center justify-center rounded-full bg-[#f2f2f5] text-[10px] font-bold text-[#6a6a73]">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {info.sql && (
          <div className="flex flex-col gap-[8px]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#1a1a1e]">붙여넣을 SQL</span>
              <Btn tone="ghost" size="sm" onClick={() => copy(info.sql)}>
                {copied ? "복사했습니다" : "복사"}
              </Btn>
            </div>
            <pre className="overflow-x-auto rounded-[10px] bg-[#1a1a1e] px-[16px] py-[14px] text-[12px] leading-[20px] text-[#e8e8ec]">
              {info.sql}
            </pre>
          </div>
        )}

        <details open={info.openRaw} className="rounded-[10px] border border-[#eaeaee] px-[14px] py-[11px]">
          <summary className="flex cursor-pointer items-center justify-between text-[12px] text-[#9a9aa2] select-none">
            오류 원문 보기 (개발자 전달용)
          </summary>
          <p className="mt-[8px] font-mono text-[11px] leading-[18px] break-all text-[#6a6a73]">
            {info.raw || "(내용 없음)"}
          </p>
          <Btn tone="ghost" size="sm" className="mt-[10px]" onClick={() => copy(info.raw)}>
            {copied ? "복사했습니다" : "원문 복사"}
          </Btn>
        </details>
      </div>
    </Drawer>
  );
}

/* ────────── 아이콘 (외부 라이브러리 없이 필요한 것만) ────────── */

export function IconCalendar() {
  return (
    <svg viewBox="0 0 20 20" className="size-[17px] text-[#9a9aa2]" aria-hidden>
      <rect x="3" y="4.5" width="14" height="12.5" rx="2" {...stroke} />
      <path d="M3 8.5h14M7 2.8v3.2M13 2.8v3.2" {...stroke} />
    </svg>
  );
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function IconClose() {
  return (
    <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" {...stroke} />
    </svg>
  );
}

export function IconCheck() {
  return (
    <svg viewBox="0 0 20 20" className="size-[16px]" aria-hidden>
      <path d="M4 10.5l4 4 8-9" {...stroke} />
    </svg>
  );
}

export function IconAlert() {
  return (
    <svg viewBox="0 0 20 20" className="size-[16px]" aria-hidden>
      <path d="M10 6v5M10 14h.01M10 2.5l8 14H2l8-14z" {...stroke} />
    </svg>
  );
}

export function IconChevron() {
  return (
    <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden>
      <path d="M6 8l4 4 4-4" {...stroke} />
    </svg>
  );
}

export function IconStar({ filled }) {
  return (
    <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden>
      <path
        d="M10 2.6l2.3 4.7 5.2.8-3.8 3.7.9 5.1-4.6-2.4-4.6 2.4.9-5.1L2.5 8.1l5.2-.8L10 2.6z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconPlus() {
  return (
    <svg viewBox="0 0 20 20" className="size-[16px]" aria-hidden>
      <path d="M10 4v12M4 10h12" {...stroke} />
    </svg>
  );
}

export function IconDoc() {
  return (
    <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden>
      <path d="M11.5 2.5H5.5a1 1 0 00-1 1v13a1 1 0 001 1h9a1 1 0 001-1V6.5l-4-4z" {...stroke} />
      <path d="M11.5 2.5v4h4M7 11h6M7 14h4" {...stroke} />
    </svg>
  );
}

export function IconMail() {
  return (
    <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" {...stroke} />
      <path d="M3 5.5l7 5 7-5" {...stroke} />
    </svg>
  );
}

export function IconImage() {
  return (
    <svg viewBox="0 0 20 20" className="size-[28px]" aria-hidden>
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" {...stroke} />
      <circle cx="7" cy="8" r="1.3" {...stroke} />
      <path d="M3 14l4.5-4 3.5 3 2.5-2 3.5 3.5" {...stroke} />
    </svg>
  );
}

export function IconOut() {
  return (
    <svg viewBox="0 0 20 20" className="size-[16px]" aria-hidden>
      <path d="M12 14v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1h7a1 1 0 011 1v2" {...stroke} />
      <path d="M8 10h9m0 0l-3-3m3 3l-3 3" {...stroke} />
    </svg>
  );
}
