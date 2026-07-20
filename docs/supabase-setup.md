# Supabase 설정 — 처음부터

공지사항과 문의를 Supabase 한 곳에서 관리한다.

- **공지사항** — 관리자 페이지에서 등록하면 `/notice` 목록과 `/notice/{id}` 상세가 자동으로 생긴다
- **문의하기** — 방문자가 남긴 문의를 관리자 페이지에서 확인한다
- **이미지** — Supabase Storage 에 올린다

작업 순서는 아래 1 → 6 이다. 1~3 은 브라우저에서 하는 설정이고, 4 부터는 코드다.

---

## 0. 용어 정리 (기억 되살리기)

| 이름 | 뜻 |
|---|---|
| **프로젝트** | Supabase 에서 만드는 단위. DB + 인증 + 파일저장소가 한 묶음이다 |
| **anon key** | 브라우저에 노출되는 공개 키. **이게 유출돼도 안전해야 정상**이다 |
| **service_role key** | 모든 권한을 가진 키. **절대 프론트엔드에 넣지 않는다** |
| **RLS** | Row Level Security. 테이블별로 "누가 무엇을 할 수 있는지" 거는 규칙 |
| **정책(Policy)** | RLS 안의 개별 규칙. `select` / `insert` / `update` / `delete` 별로 따로 만든다 |

**RLS 가 이 구조의 핵심이다.** anon key 는 브라우저에 그대로 노출되므로, 누구나 그 키로
DB 에 요청을 보낼 수 있다. "문의 테이블은 쓰기만 되고 읽기는 안 된다" 같은 규칙을
DB 쪽에 걸어야 다른 사람 연락처가 새어 나가지 않는다. 프론트엔드 코드로 막는 건 의미가 없다.

---

## 1. 프로젝트 만들기

1. [supabase.com](https://supabase.com) → **Start your project** → GitHub 등으로 로그인
2. **New project**
   - Name: `apgujeong`
   - Database Password: 아무거나 강한 걸로. **어딘가 적어 둔다** (나중에 DB 직접 접속할 때 필요)
   - Region: **Northeast Asia (Seoul)** ← 한국 방문자 응답속도
   - Plan: Free
3. 2분쯤 기다리면 준비된다.

### 키 확인

좌측 하단 **Project Settings → API** 에서 두 값을 복사한다.

- **Project URL** — `https://xxxxxxxxxxxx.supabase.co`
- **anon public** — `eyJhbGci...` 로 시작하는 긴 문자열

> 같은 화면의 `service_role` 키는 쓰지 않는다. 복사해서 어딘가 붙여넣지도 말 것.

---

## 2. 테이블 · 정책 · 저장소 만들기

좌측 메뉴 **SQL Editor → New query** 에 아래를 통째로 붙여넣고 **Run**.
한 번에 다 만들어진다.

```sql
-- ────────────────────────────────────────────
-- 공지사항
-- ────────────────────────────────────────────
create table public.notices (
  id            bigint generated always as identity primary key,
  title         text        not null,
  author        text        not null default '압구정곱창',
  published_at  date        not null default current_date,
  image_path    text,                       -- Storage 안의 경로. 예: 2026/abc.png
  body          text        not null default '',
  views         integer     not null default 0,
  is_public     boolean     not null default true,
  created_at    timestamptz not null default now()
);

-- 목록은 최신순으로 자주 읽으므로 인덱스를 걸어 둔다
create index notices_published_idx on public.notices (published_at desc, id desc);

alter table public.notices enable row level security;

-- 공개된 글은 로그인 없이도 읽힌다
create policy "공개 공지 읽기" on public.notices
  for select using (is_public = true);

-- 관리자는 비공개 글까지 전부 본다
create policy "관리자 전체 읽기" on public.notices
  for select to authenticated using (true);

create policy "관리자 등록" on public.notices
  for insert to authenticated with check (true);

create policy "관리자 수정" on public.notices
  for update to authenticated using (true) with check (true);

create policy "관리자 삭제" on public.notices
  for delete to authenticated using (true);

-- 조회수만은 로그인 없이 올려야 한다.
-- update 정책을 익명에게 열면 제목까지 바꿀 수 있으므로, 함수 하나만 열어 준다.
create function public.increment_notice_views(notice_id bigint)
returns void
language sql
security definer            -- 함수 소유자 권한으로 실행 → RLS 를 우회한다
set search_path = public
as $$
  update public.notices set views = views + 1 where id = notice_id;
$$;

grant execute on function public.increment_notice_views(bigint) to anon, authenticated;


-- ────────────────────────────────────────────
-- 문의하기
-- ────────────────────────────────────────────
create table public.inquiries (
  id          bigint generated always as identity primary key,
  name        text        not null,
  phone       text        not null,
  email       text        not null,
  message     text        not null,
  agree_sms   boolean     not null default false,
  is_read     boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index inquiries_created_idx on public.inquiries (created_at desc);

alter table public.inquiries enable row level security;

-- 누구나 남길 수는 있지만
create policy "문의 남기기" on public.inquiries
  for insert to anon, authenticated with check (true);

-- 읽는 건 로그인한 관리자만. select 정책이 없으면 아무도 못 읽는다
create policy "관리자 문의 읽기" on public.inquiries
  for select to authenticated using (true);

create policy "관리자 문의 수정" on public.inquiries
  for update to authenticated using (true) with check (true);

create policy "관리자 문의 삭제" on public.inquiries
  for delete to authenticated using (true);


-- ────────────────────────────────────────────
-- 공지 이미지 저장소
-- ────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('notice-images', 'notice-images', true)
on conflict (id) do nothing;

create policy "공지 이미지 공개 읽기" on storage.objects
  for select using (bucket_id = 'notice-images');

create policy "관리자 이미지 업로드" on storage.objects
  for insert to authenticated with check (bucket_id = 'notice-images');

create policy "관리자 이미지 삭제" on storage.objects
  for delete to authenticated using (bucket_id = 'notice-images');
```

### 확인

**Table Editor** 에 `notices` / `inquiries` 두 테이블이 보이고,
**Storage** 에 `notice-images` 버킷이 있으면 성공이다.
각 테이블 이름 옆에 **RLS enabled** 표시가 있어야 한다.

### 2-1. 메인 페이지 노출 칸 추가 (이미 2번을 실행했다면 이것만 더)

메인 페이지 NOTICE 섹션에 실을 3건을 관리자가 고를 수 있게 하는 칸이다.
SQL Editor 에 붙여넣고 Run 한다.

```sql
alter table public.notices
  add column if not exists is_featured boolean not null default false;

create index if not exists notices_featured_idx
  on public.notices (is_featured) where is_featured;
```

---

## 3. 관리자 계정 만들기

가입 폼은 만들지 않는다. 아무나 가입해서 관리자가 되면 안 되기 때문이다.
계정은 콘솔에서 직접 만든다.

1. 좌측 **Authentication → Users → Add user → Create new user**
2. 이메일 / 비밀번호 입력
3. **Auto Confirm User** 를 켠다 (메일 인증 절차를 건너뛴다)

나중에 클라이언트에게 넘길 때도 여기서 계정을 하나 더 만들어 주면 된다.

> 가입(sign up)을 아예 막아 두려면 **Authentication → Providers → Email** 에서
> **Allow new users to sign up** 을 끈다. 권장한다.

---

## 4. 사이트에 키 넣기

프로젝트 루트 `.env` 에 추가한다. (`.env` 는 `.gitignore` 에 있어 커밋되지 않는다)

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

> `VITE_` 로 시작하는 값은 **빌드 결과물에 그대로 박힌다.** anon key 는 원래 공개되는
> 값이라 괜찮지만, 그래서 2 단계의 RLS 를 반드시 켜 둬야 한다.

배포 환경(Vercel / Netlify 등)에서는 같은 이름으로 대시보드에 환경변수를 등록한다.
**환경변수를 바꾼 뒤에는 다시 빌드해야 반영된다.**

---

## 5. 패키지 설치

```
npm install @supabase/supabase-js
```

---

## 6. 만들 화면

| 경로 | 로그인 필요 | 내용 |
|---|---|---|
| `/notice` | ✗ | 공지 목록 — 지금 UI 그대로, 데이터만 Supabase |
| `/notice/:id` | ✗ | 공지 상세 — 열 때 조회수 +1 |
| `/contact` | ✗ | 문의 폼 → `inquiries` 에 저장 |
| `/admin` | ✗ | 로그인 화면 |
| `/admin/notices` | ✓ | 공지 목록·작성·수정·삭제, 이미지 드래그 업로드 |
| `/admin/inquiries` | ✓ | 문의 목록, 읽음 처리 |

---

## 나중에 클라이언트 계정으로 넘기기

Supabase 는 계정 이전이 간단하다.

1. **Project Settings → Team → Invite** 로 클라이언트를 초대한다
2. 역할을 **Owner** 로 올린다
3. 필요하면 개발자 계정을 팀에서 뺀다

프로젝트 URL 과 키가 그대로이므로 **코드도 `.env` 도 손댈 필요가 없다.**
(무료 플랜은 조직 소유 이전에 제약이 있을 수 있는데, 그때는 클라이언트를 Owner 로
올려 두는 것만으로도 실무상 충분하다.)

---

## 자주 걸리는 곳

**"결과가 빈 배열로만 온다"**
→ RLS 정책이 없거나 조건이 안 맞는 것이다. 에러가 아니라 **빈 결과**로 오기 때문에
헷갈리기 쉽다. SQL Editor 에서 `select * from public.notices;` 는 잘 나오는데
사이트에서만 비어 있다면 거의 항상 정책 문제다.

**"insert 가 조용히 실패한다"**
→ `with check` 조건을 보라. `to authenticated` 인데 로그인이 안 된 상태일 수 있다.

**"이미지 URL 이 404"**
→ 버킷이 public 인지 확인한다. `storage.buckets` 의 `public` 이 `true` 여야
`getPublicUrl()` 로 받은 주소가 열린다.

**"로그인은 됐는데 새로고침하면 풀린다"**
→ `supabase.auth.getSession()` 을 앱 시작 시 한 번 불러 세션을 복원해야 한다.
`onAuthStateChange` 구독도 함께 건다.
