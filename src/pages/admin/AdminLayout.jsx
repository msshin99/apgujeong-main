import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { supabase, isSupabaseReady } from "../../lib/supabase.js";
import { useSession } from "../../lib/useSession.js";
import { Btn, Field, INPUT, IconDoc, IconMail, IconOut } from "./ui.jsx";

/**
 * 관리자 화면의 공통 뼈대.
 *
 * 넓은 화면에서는 왼쪽 고정 메뉴, 좁은 화면에서는 위쪽 가로 메뉴.
 * 매장 담당자가 쓰는 화면이라 "지금 어디에 있는지" 가 항상 보이도록 했다.
 *
 * 가입 폼은 두지 않는다 — 계정은 Supabase 콘솔에서 직접 만든다.
 */
const NAV = [
  { to: "/admin/notices", label: "공지사항", icon: <IconDoc />, desc: "글 등록·수정" },
  { to: "/admin/inquiries", label: "문의 관리", icon: <IconMail />, desc: "접수된 문의" },
  { to: "/admin/seo", label: "검색 최적화", icon: <IconSearch />, desc: "제목·설명·매장 정보" },
];

/* 아이콘은 ui.jsx 의 선 두께·모서리 처리를 그대로 따른다.
   메뉴에만 쓰이는 하나라 공통 부품으로 빼지 않고 여기 둔다 */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function IconSearch() {
  return (
    <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden>
      <circle cx="9" cy="9" r="5.5" {...stroke} />
      <path d="M13.2 13.2L17 17" {...stroke} />
    </svg>
  );
}

/**
 * 개발 서버에서는 로그인을 건너뛰고 관리자 화면을 바로 연다.
 *
 * import.meta.env.DEV 는 Vite 가 빌드 때 false 로 치환하므로, 배포 번들에는
 * 이 분기와 아래 안내 배너가 **코드째 사라진다.** 실수로 켜진 채 나갈 수 없다.
 *
 * 다만 화면만 열릴 뿐 권한이 생기는 것은 아니다. 실제 데이터는 Supabase 가
 * 토큰을 보고 내주는데 토큰이 없으므로, 문의·공지 목록은 비어 보인다.
 * 진짜 데이터까지 보려면 로그인해야 한다 — 주소에 ?login 을 붙이면 로그인
 * 화면이 나온다.
 */
const DEV_OPEN = import.meta.env.DEV;
const DEV_SESSION = { user: { email: "dev@localhost" } };

const wantsLoginForm = () =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("login");

export default function AdminLayout() {
  const { session, loading } = useSession();

  if (!isSupabaseReady) {
    return (
      <Centered>
        <p className="text-[15px] font-semibold text-[#1a1a1e]">
          아직 데이터베이스가 연결되지 않았습니다.
        </p>
        <p className="text-[13px] leading-[21px] text-[#8a8a93]">
          .env 파일의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 확인해 주세요.
        </p>
      </Centered>
    );
  }

  if (loading) {
    return (
      <Centered>
        <span className="size-[22px] animate-spin rounded-full border-[2.5px] border-[#e3e3e8] border-t-[#1a1a1e]" />
      </Centered>
    );
  }

  /* 개발 서버에서는 세션이 없어도 화면을 연다 (?login 이 붙으면 로그인 화면 유지) */
  const devOpen = DEV_OPEN && !session && !wantsLoginForm();
  const current = session ?? (devOpen ? DEV_SESSION : null);
  if (!current) return <LoginForm />;

  return (
    <div className="min-h-[100dvh] bg-[#f7f7f9] font-pretendard text-[#1a1a1e]">
      {devOpen && (
        <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-[10px] gap-y-[2px] bg-[#e61911] px-[16px] py-[7px] text-center text-[12px] leading-[18px] font-medium text-white">
          <span>개발 모드 — 로그인 없이 열었습니다. 배포본에는 이 동작이 들어가지 않습니다.</span>
          <span className="text-white/75">
            권한이 없어 목록은 비어 보입니다.{" "}
            <a href="?login" className="underline underline-offset-2">
              로그인하기
            </a>
          </span>
        </div>
      )}
      {/* ── 넓은 화면: 왼쪽 고정 메뉴 ── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-[#eaeaee] bg-white lg:flex">
        <div className="flex items-center gap-[10px] px-[22px] py-[24px]">
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[#1a1a1e] text-[14px] font-bold text-white">
            A
          </span>
          <span className="flex min-w-0 flex-col">
            <Link
              to="/"
              className="truncate text-[15px] leading-[20px] font-bold tracking-[-0.38px] uppercase"
            >
              Apgujeong
            </Link>
            <span className="text-[11px] text-[#9a9aa2]">사이트 관리</span>
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-[3px] px-[14px]">
          <span className="px-[12px] pt-[6px] pb-[8px] text-[11px] font-semibold tracking-[0.4px] text-[#b0b0b8] uppercase">
            Menu
          </span>
          {NAV.map((item) => (
            <SideLink key={item.to} {...item} />
          ))}
        </nav>

        <div className="m-[14px] flex flex-col gap-[11px] rounded-[12px] bg-[#f6f6f9] p-[14px]">
          <div className="flex items-center gap-[9px]">
            <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-white text-[12px] font-bold text-[#6a6a73]">
              {current.user.email?.[0]?.toUpperCase() ?? "A"}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[11px] leading-[15px] text-[#9a9aa2]">로그인 계정</span>
              <span className="truncate text-[12px] leading-[17px] font-medium">
                {current.user.email}
              </span>
            </span>
          </div>
          <div className="flex gap-[6px]">
            {/* 사이트가 도메인 뿌리에 있지 않을 수 있다. "/" 로 열면 하위 경로 배포에서
                엉뚱한 곳으로 간다 — 빌드가 알고 있는 기준 경로를 쓴다 */}
            <Btn
              tone="ghost"
              size="sm"
              className="flex-1"
              onClick={() => window.open(import.meta.env.BASE_URL, "_blank")}
            >
              사이트 보기
            </Btn>
            <Btn tone="ghost" size="sm" onClick={() => supabase.auth.signOut()} aria-label="로그아웃">
              <IconOut />
            </Btn>
          </div>
        </div>
      </aside>

      {/* ── 좁은 화면: 위쪽 가로 메뉴 ── */}
      <header className="sticky top-0 z-30 flex flex-col gap-[10px] border-b border-[#eaeaee] bg-white px-[20px] pt-[14px] pb-[10px] lg:hidden">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-[17px] font-bold tracking-[-0.43px] uppercase">
            Apgujeong
          </Link>
          <Btn tone="quiet" size="sm" onClick={() => supabase.auth.signOut()}>
            로그아웃
          </Btn>
        </div>
        {/* 메뉴가 셋이라 한 줄에 고르게 들어간다. 두 칸씩 접으면 마지막 칸만
            덩그러니 남아 빈자리가 생기므로 칸 수를 메뉴 수에 맞춘다 */}
        <nav className="grid grid-cols-3 gap-[6px]">
          {NAV.map((item) => (
            <TopLink key={item.to} {...item} />
          ))}
        </nav>
      </header>

      <main className="px-[16px] py-[22px] sm:px-[24px] md:px-[36px] md:py-[40px] lg:pl-[288px]">
        <Outlet />
      </main>
    </div>
  );
}

function SideLink({ to, label, icon, desc }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-[11px] rounded-[10px] px-[12px] py-[10px] transition-all duration-200 ${
          isActive
            ? "bg-[#1a1a1e] text-white shadow-[0_4px_12px_rgba(26,26,30,0.18)]"
            : "text-[#5a5a63] hover:bg-[#f4f4f7]"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? "text-white" : "text-[#9a9aa2]"}>{icon}</span>
          <span className="flex flex-col">
            <span className="text-[14px] font-semibold tracking-[-0.35px]">{label}</span>
            <span className={`text-[11px] ${isActive ? "text-white/60" : "text-[#a8a8b0]"}`}>
              {desc}
            </span>
          </span>
        </>
      )}
    </NavLink>
  );
}

function TopLink({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-1 items-center justify-center gap-[6px] rounded-[8px] py-[9px] text-[13px] font-semibold transition-colors duration-150 ${
          isActive ? "bg-[#1a1a1e] text-white" : "bg-[#f4f4f7] text-[#6a6a73]"
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

function Centered({ children }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-[8px] bg-[#f7f7f9] px-[20px] text-center font-pretendard">
      {children}
    </div>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");

    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);

    /* Supabase 는 아이디가 틀렸는지 비밀번호가 틀렸는지 알려 주지 않는다.
       (구분해 주면 어느 이메일이 가입돼 있는지 알아낼 수 있어서다) */
    if (err) setError("이메일 또는 비밀번호가 올바르지 않습니다.");
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f7f7f9] px-[20px] font-pretendard text-[#1a1a1e]">
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-[400px] flex-col gap-[22px] rounded-[16px] bg-white p-[32px] shadow-[0_2px_10px_rgba(0,0,0,0.04),0_16px_48px_rgba(0,0,0,0.06)] md:p-[40px]"
      >
        <div className="flex flex-col gap-[6px]">
          <span className="text-[19px] font-bold tracking-[-0.48px] uppercase">Apgujeong</span>
          <h1 className="text-[15px] font-medium text-[#8a8a93]">사이트 관리자 로그인</h1>
        </div>

        <div className="flex flex-col gap-[14px]">
          <Field label="이메일">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              autoComplete="username"
              required
              className={INPUT}
            />
          </Field>
          <Field label="비밀번호">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              className={INPUT}
            />
          </Field>
        </div>

        {error && (
          <p className="rounded-[8px] bg-[#fdeceb] px-[14px] py-[10px] text-[13px] leading-[20px] text-[#d1170f]">
            {error}
          </p>
        )}

        <Btn tone="primary" size="lg" type="submit" disabled={busy} className="w-full">
          {busy ? "확인 중…" : "로그인"}
        </Btn>

        <Link
          to="/"
          className="text-center text-[13px] text-[#9a9aa2] transition-colors hover:text-[#1a1a1e]"
        >
          사이트로 돌아가기
        </Link>
      </form>
    </div>
  );
}
