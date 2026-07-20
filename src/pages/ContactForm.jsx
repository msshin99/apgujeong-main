import { useEffect, useRef, useState } from "react";
import Reveal, { RevealText } from "../Reveal.jsx";
import { isSupabaseReady } from "../lib/supabase.js";
import { submitInquiry } from "../lib/inquiries.js";

/**
 * Figma: Frame 2095587771 (332:1738) — x 270 / 1380 폭
 *
 *   제목 "문의자 정보"  Pretendard Bold 38 / lh 48
 *   폼 332:1742  상단 실선 #222, p 40, 행 간격 40
 *     (시안의 "주민등록번호" 행은 뺐다 — 수집할 이유가 없는 정보다)
 *     ├ 라벨 w 200 — Medium 18 / lh 26 / -0.45 / #222, 필수 표시 * 는 #ff7048
 *     └ 입력 w 740 — bg #f6f7f8, p 24, Regular 18 / lh 26, placeholder #767676
 *   연락처 행은 224 짜리 3칸을 "-" 로 잇는다
 *   문의사항 행은 높이 240
 *   동의 체크박스 22px, 두 줄 간격 12
 *   제출 버튼 w 160, bg #e61911
 */
const LABEL_W = 200;
const FIELD_W = 740;

/** 휴대폰 앞자리 */
const PHONE_PREFIXES = ["010", "011", "016", "017", "018", "019"];

const FIELD_BOX =
  "w-full bg-[#f6f7f8] px-[18px] py-[16px] text-[16px] leading-[26px] font-normal tracking-[-0.4px] text-[#222] outline-none transition-shadow duration-200 placeholder:text-[#767676] focus:shadow-[inset_0_0_0_1px_#222] md:px-[24px] md:py-[24px] md:text-[18px] md:tracking-[-0.45px]";

/** Figma 332:1744 — 라벨 + 필수 표시 */
function Label({ children, required, top }) {
  return (
    <div
      className={`flex shrink-0 items-center gap-[4px] text-[16px] leading-[26px] font-medium tracking-[-0.4px] whitespace-nowrap md:text-[18px] md:tracking-[-0.45px] ${
        top ? "md:self-start md:pt-[24px]" : ""
      }`}
      style={{ width: LABEL_W }}
    >
      <span className="text-[#222]">{children}</span>
      {required && <span className="text-[#ff7048]">*</span>}
    </div>
  );
}

/** 라벨 + 입력 한 줄. 좁은 화면에서는 라벨이 위로 올라간다 */
function Row({ label, required, top, children }) {
  return (
    <div className="flex w-full flex-col gap-[10px] md:flex-row md:items-center md:gap-0">
      <Label required={required} top={top}>
        {label}
      </Label>
      <div className="w-full md:shrink-0" style={{ maxWidth: FIELD_W }}>
        {children}
      </div>
    </div>
  );
}

/**
 * 휴대폰 앞자리 선택.
 *
 * <select> 는 펼쳐진 목록이 OS 가 그리는 영역이라 배경·글꼴·간격을 시안에 맞출 수 없다.
 * 그래서 div 로 직접 만든다. 대신 select 가 공짜로 주던 것들을 손으로 갖춰 준다 —
 * 키보드 조작(↑↓/Enter/Esc), 바깥 클릭으로 닫기, 스크린리더용 role.
 */
function PhoneSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const step = (delta) => {
    const i = PHONE_PREFIXES.indexOf(value);
    const next = PHONE_PREFIXES[(i + delta + PHONE_PREFIXES.length) % PHONE_PREFIXES.length];
    onChange(next);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      open ? step(1) : setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      open ? step(-1) : setOpen(true);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((v) => !v);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <div
        role="combobox"
        tabIndex={0}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="휴대폰 앞자리"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        className={`${FIELD_BOX} flex cursor-pointer items-center justify-between gap-[8px] ${
          open ? "shadow-[inset_0_0_0_1px_#222]" : ""
        }`}
      >
        <span>{value}</span>
        {/* Figma 332:1765 — 24px 셰브론. 열리면 뒤집힌다 */}
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={`size-[20px] shrink-0 transition-transform duration-300 md:size-[24px] ${
            open ? "-rotate-180" : ""
          }`}
        >
          <path
            d="M7 10L12 15L17 10"
            fill="none"
            stroke="#222"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* 목록. 닫힐 때도 사라지는 게 보이도록 항상 두고 투명도·위치로만 감춘다.
          입력칸에 바로 붙이고 안쪽 위아래 여백도 두지 않는다 */}
      <ul
        role="listbox"
        aria-label="휴대폰 앞자리"
        className={`absolute top-full right-0 left-0 z-20 overflow-hidden border border-[#e5e5ec] bg-white shadow-[0_12px_30px_rgba(0,0,0,0.12)] transition-all duration-200 ease-out ${
          open
            ? "visible translate-y-0 opacity-100"
            : "invisible -translate-y-[6px] opacity-0"
        }`}
      >
        {PHONE_PREFIXES.map((p) => (
          <li
            key={p}
            role="option"
            aria-selected={p === value}
            onClick={() => {
              onChange(p);
              setOpen(false);
            }}
            className={`cursor-pointer px-[18px] py-[10px] text-[16px] leading-[26px] tracking-[-0.4px] transition-colors duration-150 md:px-[24px] md:text-[18px] md:tracking-[-0.45px] ${
              p === value
                ? "bg-[#f6f7f8] font-medium text-[#e61911]"
                : "text-[#222] hover:bg-[#f6f7f8]"
            }`}
          >
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Figma 332:1791 — 22px 체크박스. 기본 체크박스는 색을 못 맞춰 직접 그린다 */
function Check({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-[8px] select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        className={`flex size-[22px] shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-200 peer-focus-visible:shadow-[0_0_0_2px_rgba(230,25,17,0.35)] ${
          checked ? "border-[#e61911] bg-[#e61911]" : "border-[#d9d9de] bg-white"
        }`}
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-[14px]">
          <path
            d="M5 12.5L10 17.5L19 7.5"
            fill="none"
            stroke="white"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              opacity: checked ? 1 : 0,
              transition: "opacity 160ms ease-out",
            }}
          />
        </svg>
      </span>
      <span className="text-[13px] leading-[20px] font-normal tracking-[-0.33px] text-[#222] md:text-[14px] md:tracking-[-0.35px]">
        {children}
      </span>
    </label>
  );
}

const EMPTY = {
  name: "",
  phone1: "010",
  phone2: "",
  phone3: "",
  email: "",
  message: "",
};

export default function ContactForm() {
  const [form, setForm] = useState(EMPTY);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeSms, setAgreeSms] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  /** idle | sending | sent | error */
  const [status, setStatus] = useState("idle");

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (status === "sending") return;

    /* 봇이 채우고 가는 미끼 칸. 사람에게는 보이지 않으므로 값이 있으면 스팸이다.
       조용히 성공한 척해서 봇이 다시 시도하지 않게 한다. */
    if (honeypot) {
      setStatus("sent");
      return;
    }

    const payload = {
      name: form.name.trim(),
      phone: [form.phone1, form.phone2, form.phone3].join("-"),
      email: form.email.trim(),
      message: form.message.trim(),
      agreeSms,
    };

    if (!isSupabaseReady) {
      // 아직 연결 전. 화면 흐름은 확인할 수 있게 둔다
      if (import.meta.env.DEV) {
        console.warn("[ContactForm] Supabase 미설정 — 전송을 건너뜁니다.", payload);
      }
      setStatus("sent");
      return;
    }

    setStatus("sending");
    try {
      await submitInquiry(payload);
      setStatus("sent");
      setForm(EMPTY);
      setAgreePrivacy(false);
      setAgreeSms(false);
    } catch (err) {
      if (import.meta.env.DEV) console.error("[ContactForm]", err);
      setStatus("error");
    }
  };

  return (
    <div className="w-full bg-white px-[20px] pt-[100px] pb-[100px] sm:px-[24px] md:px-[40px] md:pt-[150px] md:pb-[150px] lg:pt-[200px] lg:pb-[200px]">
      <form
        onSubmit={onSubmit}
        className="mx-auto flex w-full max-w-[1380px] flex-col items-center gap-[40px] font-pretendard md:gap-[60px]"
      >
        <div className="flex w-full flex-col gap-[24px] md:gap-[36px]">
          {/* Figma 332:1741 — Pretendard Bold 38 / lh 48 */}
          <h2 className="text-[clamp(22px,4.2vw,38px)] leading-[1.28] font-bold tracking-[-0.025em] text-black">
            <RevealText lines={["문의자 정보"]} delay={60} step={22} />
          </h2>

          {/* Figma 332:1742 — 상단 실선 #222, p 40, 행 간격 40 */}
          <Reveal y={20} duration={700} delay={200} className="w-full">
            <div className="flex w-full flex-col gap-[24px] border-t border-solid border-[#222] px-0 py-[28px] md:gap-[40px] md:p-[40px]">
              <Row label="성함" required>
                <input
                  type="text"
                  value={form.name}
                  onChange={set("name")}
                  placeholder="이름을 입력해주세요"
                  required
                  className={FIELD_BOX}
                />
              </Row>

              {/* Figma 332:1761 — 224 짜리 3칸을 "-" 로 잇는다 */}
              <Row label="연락처" required>
                <div className="flex w-full items-center gap-[8px] md:gap-[13px]">
                  <PhoneSelect
                    value={form.phone1}
                    onChange={(v) => setForm((f) => ({ ...f, phone1: v }))}
                  />
                  <span className="shrink-0 text-[16px] leading-[26px] text-[#222] md:text-[18px]">
                    -
                  </span>
                  <input
                    type="text"
                    value={form.phone2}
                    onChange={set("phone2")}
                    inputMode="numeric"
                    maxLength={4}
                    required
                    aria-label="연락처 가운데 자리"
                    className={FIELD_BOX}
                  />
                  <span className="shrink-0 text-[16px] leading-[26px] text-[#222] md:text-[18px]">
                    -
                  </span>
                  <input
                    type="text"
                    value={form.phone3}
                    onChange={set("phone3")}
                    inputMode="numeric"
                    maxLength={4}
                    required
                    aria-label="연락처 끝자리"
                    className={FIELD_BOX}
                  />
                </div>
              </Row>

              <Row label="이메일" required>
                <input
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  placeholder="이메일을 입력해주세요"
                  required
                  className={FIELD_BOX}
                />
              </Row>

              {/* 봇 잡는 미끼 칸. 화면에서도 스크린리더에서도 감춘다 */}
              <input
                type="text"
                name="company"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="absolute -left-[9999px] size-0 opacity-0"
              />

              {/* Figma 332:1788 — 높이 240 */}
              <Row label="문의사항" required top>
                <textarea
                  value={form.message}
                  onChange={set("message")}
                  placeholder="문의하실 내용을 입력해주세요"
                  required
                  className={`${FIELD_BOX} h-[180px] resize-none md:h-[240px]`}
                />
              </Row>
            </div>
          </Reveal>

          {/* Figma 332:1790 — 동의 체크박스 2줄, 간격 12 */}
          <Reveal y={16} duration={600} delay={320}>
            <div className="flex flex-col gap-[12px]">
              <Check checked={agreePrivacy} onChange={setAgreePrivacy}>
                개인정보 수집 및 이용에 동의합니다.
              </Check>
              <Check checked={agreeSms} onChange={setAgreeSms}>
                SMS 수신을 동의합니다.
              </Check>
            </div>
          </Reveal>
        </div>

        {/* Figma 332:1801 — w 160, bg #e61911.
            시안의 문구는 "목록으로" 지만 이 자리는 폼 제출 버튼이라 "문의하기" 로 둔다 */}
        <Reveal y={20} duration={600} delay={120}>
          <div className="flex flex-col items-center gap-[16px]">
            <button
              type="submit"
              disabled={!agreePrivacy || status === "sending"}
              className="flex w-[160px] items-center justify-center bg-[#e61911] px-[20px] py-[16px] text-[14px] leading-[22px] font-medium tracking-[-0.35px] whitespace-nowrap text-white transition-colors duration-300 hover:bg-[#c2140e] disabled:cursor-not-allowed disabled:bg-[#d9d9de]"
            >
              {status === "sending" ? "보내는 중…" : "문의하기"}
            </button>
            {/* 왜 눌리지 않는지 알 수 없으면 답답하므로 이유를 적어 준다 */}
            {!agreePrivacy && status !== "sent" && (
              <p className="text-[13px] leading-[20px] tracking-[-0.33px] text-[#767676]">
                개인정보 수집 및 이용에 동의해 주세요.
              </p>
            )}
            {status === "sent" && (
              <p className="text-[14px] leading-[22px] font-medium tracking-[-0.35px] text-[#e61911]">
                문의가 접수되었습니다. 빠르게 연락드리겠습니다.
              </p>
            )}
            {status === "error" && (
              <p className="text-center text-[14px] leading-[22px] font-medium tracking-[-0.35px] text-[#e61911]">
                전송에 실패했습니다. 잠시 후 다시 시도해 주세요.
              </p>
            )}
          </div>
        </Reveal>
      </form>
    </div>
  );
}
