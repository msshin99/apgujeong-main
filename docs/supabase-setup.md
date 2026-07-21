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
- **anon public** — 대시보드에 보이는 값을 그대로 복사한다

> **키 형식이 두 가지다.** 예전에 만든 프로젝트는 `eyJhbGci...` 로 시작하는 JWT 이고,
> 2025 년 이후에 만든 프로젝트는 `sb_publishable_...` 로 시작하는 publishable key 다.
> **둘 다 정상이고 `@supabase/supabase-js` 는 양쪽 다 받는다.** 이 문서 4 번과
> `docs/deploy.md` 의 예시는 그중 한쪽을 적어 둔 것일 뿐, 형식을 지정하는 게 아니다.
> 형식을 맞추려 하지 말고 **대시보드에 실제로 떠 있는 문자열을 그대로** 넣는다.

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
  -- 개인정보 수집·이용 동의(필수). 폼이 항상 함께 보내므로 이 칸이 없으면 접수가 전부 실패한다
  agree_privacy boolean   not null default false,
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

### 2-2. `agree_privacy` 칸 추가 (이미 2번을 실행했다면 이것만 더)

> ⚠️ **이 칸이 없으면 문의 폼은 100% 실패한다.**
> 문의 폼이 `agree_privacy` 를 함께 보내는데 테이블에 그 칸이 없으면 Postgres 가
> **42703 (undefined_column)** 로 거절한다. 방문자에게는 "전송에 실패했습니다" 만 뜨고
> 문의는 한 건도 들어오지 않는다.
>
> 위 2번 SQL 에 이 칸이 이미 들어 있으므로, **새 프로젝트라면 따로 할 일이 없다.**
> 아래는 `agree_privacy` 가 없던 시절에 2번을 실행한 **기존 설치용 마이그레이션**이다.

```sql
alter table public.inquiries
  add column if not exists agree_privacy boolean not null default false;
```

왜 필요한가 — 이름·연락처·이메일을 받는 이상 **개인정보 수집·이용 동의는 법적으로 필수
동의**다(PIPA). 지금까지는 덜 중요한 `agree_sms`(선택 동의)만 저장되고 정작 필수 동의는
아무 데도 남지 않았다. 분쟁이 생기면 "동의를 받았다"를 증명할 기록이 없다.

남은 숙제 두 가지 — 지금 마이그레이션으로는 해결되지 않는다.

- **동의 시점** — 방어 가능한 기록으로 쓰려면 `boolean` 만으로는 부족하다.
  언제 동의했는지가 함께 있어야 한다. 필요해지면 아래를 더 실행한다.
  ```sql
  alter table public.inquiries
    add column if not exists agreed_at timestamptz;
  ```
  (`created_at` 으로 갈음할 수도 있지만, 접수 시각과 동의 시각은 개념이 다르다.)
- **보존·파기 정책이 아직 없다.** 문의는 지금 무기한 쌓인다. PIPA 는 목적 달성 후 파기를
  요구한다. 보존 기간을 정하고(예: 접수 후 1 년) 만료분을 지우는 절차를 정해야 한다.
  개인정보 처리방침의 문구와 실제 동작이 어긋나면 그 자체가 위반이다.

---

### 2-3. 문의 입력 제한 — 길이 · 컬럼 권한 · 접수 속도

지금 `inquiries` 의 insert 정책은 `with check (true)` 다. 즉 **아무나, 아무 값을, 무제한으로**
넣을 수 있다. 폼의 honeypot 은 브라우저에서만 도는 장치라 PostgREST 를 직접 호출하면
그냥 지나간다. 아래 세 가지를 걸어 둔다. 각각이 막는 것과 못 막는 것을 함께 적었다.

> ⚠️ **(1) 길이 제한을 걸기 전에 두 가지를 확인한다.**
>
> - **폼에도 같은 상한이 있어야 한다.** `src/pages/ContactForm.jsx` 의 이름·이메일·문의내용
>   입력에 `maxLength={50 / 254 / 2000}` 이 걸려 있다(이 문서의 값과 같다). 값을 바꾸면
>   **양쪽을 함께** 바꾼다. 폼 쪽이 비면 길게 쓴 정상 방문자의 문의가 **23514
>   (check_violation)** 로 거절되고, 화면에는 원인 없는 "전송에 실패했습니다" 만 뜬다.
> - **`add constraint` 는 기존 행도 검사한다.** 이미 상한을 넘는 문의가 쌓여 있으면
>   ALTER 자체가 실패한다. 먼저 확인하고, 걸린 게 있으면 정리하거나
>   `not valid` 로 붙인 뒤 나중에 `validate constraint` 한다.
>   ```sql
>   select id, char_length(name), char_length(phone), char_length(email), char_length(message)
>     from public.inquiries
>    where char_length(name) > 50 or char_length(phone) > 30
>       or char_length(email) > 254 or char_length(message) > 2000;
>   ```

```sql
-- ────────────────────────────────────────────
-- (1) 길이 제한
--     text 는 원래 길이 제한이 없어서 한 건에 수십 MB 를 밀어 넣을 수 있다.
--     저장공간보다 관리자 화면이 먼저 죽는다.
-- ────────────────────────────────────────────
alter table public.inquiries
  add constraint inquiries_name_len    check (char_length(name)    between 1 and 50),
  add constraint inquiries_phone_len   check (char_length(phone)   between 1 and 30),
  add constraint inquiries_email_len   check (char_length(email)   between 1 and 254),
  add constraint inquiries_message_len check (char_length(message) between 1 and 2000);

-- ────────────────────────────────────────────
-- (2) 컬럼 단위 권한
--     is_read / created_at 은 운영자만 다뤄야 하는 칸이다.
--     지금은 익명이 직접 넣을 수 있어서, "이미 읽음 + 3년 전 날짜" 로 넣으면
--     최신순 200건만 보는 관리자 화면에 영영 뜨지 않는다. 실질적인 은폐다.
--
--     Postgres 는 테이블 단위 INSERT 권한이 모든 칸을 포함하므로,
--     테이블 권한을 회수하고 허용할 칸만 다시 부여하는 방식이어야 한다.
--     (revoke insert (컬럼) 만으로는 테이블 권한이 남아 효과가 없다)
-- ────────────────────────────────────────────
revoke insert on public.inquiries from anon;
grant  insert (name, phone, email, message, agree_sms, agree_privacy)
  on public.inquiries to anon;

-- ────────────────────────────────────────────
-- (3) 접수 속도 제한
-- ────────────────────────────────────────────

-- 3-a. 한 요청에 여러 건 밀어 넣기 차단.
--      PostgREST 는 JSON 배열 본문을 받으므로 요청 한 번에 수천 행이 들어간다.
--      행 단위 트리거는 같은 문장 안에서 앞 행이 아직 보이지 않아 이걸 못 막는다.
--      그래서 문장 단위 트리거로 따로 센다.
create or replace function public.inquiries_batch_limit()
returns trigger
language plpgsql
as $$
declare
  n integer;
begin
  select count(*) into n from inserted;
  if n > 1 then
    raise exception '문의는 한 번에 한 건만 접수할 수 있습니다.'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create trigger inquiries_batch_limit_trg
  after insert on public.inquiries
  referencing new table as inserted
  for each statement execute function public.inquiries_batch_limit();

-- 3-b. 시간창 단위 총량 제한.
--      security definer 가 꼭 필요하다 — 익명에게는 select 정책이 없어서
--      호출자 권한으로는 count 가 항상 0 으로 나와 제한이 걸리지 않는다.
create or replace function public.inquiries_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent integer;
begin
  select count(*) into recent
    from public.inquiries
   where created_at > now() - interval '1 minute';

  if recent >= 5 then
    raise exception '문의가 너무 자주 접수되었습니다. 잠시 후 다시 시도해 주세요.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger inquiries_rate_limit_trg
  before insert on public.inquiries
  for each row execute function public.inquiries_rate_limit();
```

**막는 것 / 못 막는 것**

| 장치 | 막는다 | 못 막는다 |
|---|---|---|
| 길이 제한 | 초대형 본문, 저장공간 고갈 | 짧은 스팸 |
| 컬럼 권한 | `is_read`·`created_at` 조작으로 인한 은폐 | 정상 칸으로 들어오는 스팸 |
| 배치 차단 | 요청 한 번에 수천 행 | 요청을 여러 번 나누는 것 |
| 속도 제한 | 1 분에 5 건 넘는 연속 투입 | 천천히 꾸준히 넣는 스팸 |

속도 제한은 **IP 별이 아니라 테이블 전체 기준**이다. 문의 테이블에 IP 나 식별자 칸이 없어서
방문자를 구분할 방법이 없다. 그래서 공격자가 1 분에 5 건을 채우면 **그 사이 정상 방문자도
거절된다.** 문의가 하루 몇 건인 사이트라 실무상 감수할 만하지만, 이게 곤란하면 Edge Function
앞단에 CAPTCHA(hCaptcha·Turnstile)를 두는 쪽이 정공법이다. DB 트리거로는 여기까지가 한계다.

---

### 2-4. 관리자 권한 분리 — RLS 전면 교체 (**보안 필수**)

> 🚨 **지금 상태는 "로그인한 사람 = 관리자" 다.**
> 모든 관리자 정책이 `to authenticated using (true)` 이고, 앱의 유일한 검사도
> "세션이 있는가" 뿐이다(`src/pages/admin/AdminLayout.jsx`). anon key 는 빌드 결과물에
> 그대로 박혀 누구나 읽을 수 있고, Supabase 는 **이메일 가입이 기본으로 켜져 있다.**
> 즉 `POST /auth/v1/signup` 한 번이면 누구나 `authenticated` 가 되어
> **문의에 남은 방문자 개인정보(이름·전화·이메일·문의내용) 전체 열람, 공지 위·변조 및 삭제,
> Storage 파일 업로드·삭제** 를 전부 할 수 있다. 아래를 그대로 실행한다.

### 1단계 — 가입을 먼저 끈다 (대시보드)

**Authentication → Sign In / Providers → Email → "Allow new users to sign up" 을 끈다.**

이걸 먼저 하지 않으면 **아래 SQL 은 전부 무의미하다.** 정책을 관리자 명단 기준으로 바꿔도,
가입이 열려 있으면 공격자가 계정을 만들어 `authenticated` 가 되는 것 자체는 그대로다.
명단에 없으니 데이터는 못 보지만, 무제한 계정 생성 통로가 열린 채로 남는다.
**끈 뒤 실제로 확인한다** — 로그아웃 상태에서 회원가입이 거절되는지 본다.

### 2단계 — 관리자 명단 테이블

```sql
-- ────────────────────────────────────────────
-- 관리자 명단
-- "로그인했다" 와 "관리자다" 를 분리하는 유일한 근거가 되는 테이블이다.
-- ────────────────────────────────────────────
create table if not exists public.admins (
  user_id    uuid primary key references auth.users on delete cascade,
  memo       text,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- 본인 것만 읽힌다. 명단 전체를 열어 주면 관리자 계정 목록이 노출되어
-- 그 자체가 공격 표적이 된다.
create policy "본인 관리자 여부 확인" on public.admins
  for select to authenticated using (user_id = auth.uid());
-- insert/update/delete 정책은 일부러 만들지 않는다.
-- 명단 변경은 SQL Editor(=service_role)에서만 한다.

-- 정책마다 서브쿼리를 쓰지 않도록 함수 하나로 묶는다.
-- security definer 여야 한다 — 그렇지 않으면 admins 의 RLS 를 다시 타면서
-- storage.objects 처럼 다른 스키마에서 부를 때 조용히 false 가 된다.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

grant execute on function public.is_admin() to authenticated;
```

### 3단계 — 기존 정책을 전부 교체한다

기존 정책을 **지우지 않고 새로 만들기만 하면 아무 소용이 없다.** 정책은 OR 로 합쳐지므로
`using (true)` 가 하나라도 남아 있으면 그게 전부를 통과시킨다. 아래 블록은
drop 과 create 가 짝으로 들어 있으니 **통째로 붙여넣고 한 번에 Run 한다.**

```sql
-- ────────────────────────────────────────────
-- 공지사항
-- ────────────────────────────────────────────
drop policy if exists "관리자 전체 읽기" on public.notices;
drop policy if exists "관리자 등록"     on public.notices;
drop policy if exists "관리자 수정"     on public.notices;
drop policy if exists "관리자 삭제"     on public.notices;

create policy "관리자 전체 읽기" on public.notices
  for select to authenticated using (public.is_admin());

create policy "관리자 등록" on public.notices
  for insert to authenticated with check (public.is_admin());

create policy "관리자 수정" on public.notices
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "관리자 삭제" on public.notices
  for delete to authenticated using (public.is_admin());
-- "공개 공지 읽기" 는 그대로 둔다. 방문자가 봐야 하는 정책이다.

-- ────────────────────────────────────────────
-- 문의하기
-- ────────────────────────────────────────────
drop policy if exists "관리자 문의 읽기" on public.inquiries;
drop policy if exists "관리자 문의 수정" on public.inquiries;
drop policy if exists "관리자 문의 삭제" on public.inquiries;

create policy "관리자 문의 읽기" on public.inquiries
  for select to authenticated using (public.is_admin());

create policy "관리자 문의 수정" on public.inquiries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "관리자 문의 삭제" on public.inquiries
  for delete to authenticated using (public.is_admin());
-- "문의 남기기"(anon insert) 는 그대로 둔다. 2-3 에서 따로 조인다.

-- ────────────────────────────────────────────
-- Storage
-- ────────────────────────────────────────────
drop policy if exists "관리자 이미지 업로드" on storage.objects;
drop policy if exists "관리자 이미지 삭제"   on storage.objects;

create policy "관리자 이미지 업로드" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'notice-images' and public.is_admin());

create policy "관리자 이미지 삭제" on storage.objects
  for delete to authenticated
  using (bucket_id = 'notice-images' and public.is_admin());
```

### 4단계 — 첫 관리자를 명단에 넣는다

`auth.users` 에서 uuid 를 확인하고 `admins` 에 넣는다. **한 문장으로 처리한다.**

```sql
insert into public.admins (user_id, memo)
select id, '최초 관리자'
  from auth.users
 where email = 'admin@example.com'   -- ← 3 번에서 만든 실제 계정 이메일
on conflict (user_id) do nothing;

-- 들어갔는지 반드시 확인한다. 0 행이면 이메일이 틀린 것이다.
select u.email, a.created_at
  from public.admins a join auth.users u on u.id = a.user_id;
```

### 5단계 — 등록을 빠뜨리면 어떻게 되는가

**3단계만 실행하고 4단계를 잊으면 관리자 본인이 잠긴다.** 명단이 비어 있으므로
`is_admin()` 이 항상 false 가 되어, 로그인은 되지만

- `/admin/notices` — 목록이 **빈 화면**, 등록·수정·삭제 전부 조용히 실패
- `/admin/inquiries` — 문의가 **한 건도 안 보임** (에러가 아니라 빈 배열로 온다)
- 이미지 업로드 실패

이게 무서워 보이지만 **데이터는 멀쩡하다.** 정책은 보이는 범위만 줄일 뿐 지우지 않는다.
복구는 4단계를 실행하면 끝이다. SQL Editor 는 `service_role` 로 도는 별도 통로라
RLS 에 막히지 않으므로, 스스로 잠기더라도 **항상 여기로 들어갈 수 있다.**
그래서 정책과 명단 등록은 **가급적 한 번에** 실행하는 편이 낫다.

> 관리자를 뺄 때는 계정을 지우지 말고 명단에서만 지운다.
> `delete from public.admins where user_id = '…';`

---

### 2-5. 비공개 공지의 이미지 차단

`is_public = false` 인 공지는 목록·상세에서 감춰지지만 **거기 붙은 사진은 그대로 열린다.**
기존 select 정책은 `to` 절이 없고 `bucket_id` 만 보므로 누구에게나 열려 있고, 더 근본적으로
**버킷이 `public = true` 라 `/object/public/...` 경로는 RLS 자체를 타지 않는다.**
파일명 규칙을 짐작하면 목록화도 된다. 글은 숨겼는데 사진은 안 숨겨진 상태다.

### 선택지 두 가지

**(a) select 를 `authenticated` 로 좁히고, 공개 공지 이미지는 다른 경로로 배포**
비공개 이미지는 확실히 막힌다. 그런데 공개 공지 이미지까지 같이 막히므로 그것들은
`public/images/` 같은 정적 자산으로 따로 빼야 한다. 관리자가 글을 쓸 때마다 개발자가
파일을 커밋해야 한다는 뜻이라, 관리자 페이지를 만든 이유가 사라진다.

**(b) 버킷을 비공개로 돌리고 서명 URL 로 배포**
공개/비공개 판단을 공지의 `is_public` 에 그대로 위임할 수 있다. 관리자 운영 흐름은 안 바뀐다.
대신 URL 에 만료가 생겨 무한 캐시가 안 되고, 앱 코드가 `getPublicUrl()` →
`createSignedUrl()` 로 바뀌어야 한다.

### 권장 — (b)

이유는 하나다. **(a) 는 문제를 옮길 뿐 관리자가 스스로 글을 올린다는 전제를 깬다.**
(b) 는 공개 여부의 근거가 공지 테이블 한 곳에 모인다.

**대신 (b) 의 코드 비용은 한 줄이 아니다.** `createSignedUrl()` 은 Promise 를 돌려주는데
지금 `publicUrl()` 은 동기 함수이고, 동기라는 전제 위에서 두 군데가 호출한다.

- `src/lib/notices.js` 의 `toView()` — 행을 화면용 모양으로 바꾸는 도중 동기적으로 부른다.
- `src/pages/admin/AdminNotices.jsx` 의 `currentImage` — **렌더 본문에서** 직접 부른다.

그래서 실제로 해야 할 일은 이렇다.

1. `toView()` 를 비동기로 바꾸거나(호출하는 곳이 전부 따라 바뀐다), 목록을 받은 뒤
   `createSignedUrls(paths, 만료초)` 로 **한 번에 서명해** 결과를 상태로 들고 있는다.
   후자가 요청 수도 적고 파급도 작다.
2. 관리자 편집창은 렌더 중 호출을 없애고, 미리보기 URL 을 `useEffect` 로 받아 상태에 담는다.
3. 서명 URL 은 만료가 있으므로 오래 열어 둔 화면에서는 다시 받아야 한다.

```sql
-- 1) 버킷을 비공개로. 이걸 하지 않으면 아래 정책은 장식이다
--    (public 버킷은 RLS 를 우회한다).
update storage.buckets set public = false where id = 'notice-images';

-- 2) 읽기 정책을 공지의 공개 여부에 묶는다
drop policy if exists "공지 이미지 공개 읽기" on storage.objects;

create policy "공개 공지 이미지만 읽기" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'notice-images'
    and (
      public.is_admin()                       -- 관리자는 비공개 글 이미지도 본다
      or exists (                             -- 그 외에는 공개 공지에 붙은 파일만
        select 1 from public.notices n
         where n.image_path = storage.objects.name
           and n.is_public = true
      )
    )
  );
```

> **앱 코드 변경이 함께 필요하다.** 버킷을 비공개로 돌리면 `getPublicUrl()` 로 만든 주소는
> 전부 404 가 된다 — 목록·상세·메인의 공지 이미지가 한꺼번에 깨진다.
> 위에 적은 1~3 을 **먼저 끝내고** 화면에서 이미지가 보이는 것을 확인한 뒤에 SQL 을 실행한다.
> 순서를 지킨다: 코드 먼저, SQL 나중.

---

## 3. 관리자 계정 만들기

가입 폼은 만들지 않는다. 아무나 가입해서 관리자가 되면 안 되기 때문이다.
계정은 콘솔에서 직접 만든다.

1. 좌측 **Authentication → Users → Add user → Create new user**
2. 이메일 / 비밀번호 입력
3. **Auto Confirm User** 를 켠다 (메일 인증 절차를 건너뛴다)

나중에 클라이언트에게 넘길 때도 여기서 계정을 하나 더 만들어 주면 된다.

> ⚠️ **계정을 만든 것만으로는 관리자가 되지 않는다** — 되어서도 안 된다.
> 만든 계정을 **2-4 의 `admins` 명단에 넣어야** 관리자 화면이 동작한다.
> 가입 차단(**Allow new users to sign up** 끄기)도 2-4 의 1단계다. 선택이 아니라 필수다.

---

## 4. 사이트에 키 넣기

프로젝트 루트 `.env` 에 추가한다. (`.env` 는 `.gitignore` 에 있어 커밋되지 않는다)

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...   # 예전 프로젝트라면 eyJhbGci... 형태다
```

> 키 형식은 1 번의 안내대로 **대시보드에 실제로 떠 있는 문자열을 그대로** 넣는다.
> `sb_publishable_...` 든 `eyJhbGci...` 든 양쪽 다 정상이다.

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

## 이어서 — SEO 설정 (선택, 나중에 해도 된다)

검색엔진과 AI 크롤러에 실릴 문구(제목·설명·키워드·FAQ·JSON-LD)를 관리자 화면에서 고칠 수
있게 하는 표가 따로 있다. **`docs/seo-setup.md`** 를 본다.

- 위 **1 → 6** 과는 별개의 작업이고, **2-4(관리자 명단 · `is_admin()`)를 먼저 끝낸 뒤**에 한다
  — 그쪽 쓰기 정책이 전부 `is_admin()` 에 기댄다.
- **실행하지 않아도 사이트는 그대로 동작한다.** 코드에 박힌 기본값(`src/lib/seoData.js`)으로
  돌아가므로 페이지 제목이나 설명이 비는 일은 없다. 이 마이그레이션이 주는 것은
  "문구를 바꿀 때 개발자가 필요 없어진다" 한 가지뿐이다.
- 주소·전화·영업시간은 **일부러 비운 채로** 넣는다. 지금 사이트의 값이 자리표시자라,
  그대로 색인되면 구조화 데이터 스팸이 된다. 자세한 이유는 그 문서 5 번에 있다.

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
→ 2-5 를 실행하기 전이라면 버킷이 public 인지 확인한다. `storage.buckets` 의 `public` 이
`true` 여야 `getPublicUrl()` 로 받은 주소가 열린다.
→ 2-5 를 실행한 뒤라면 반대다. 버킷이 비공개이므로 `getPublicUrl()` 은 항상 404 다.
`createSignedUrl()` 을 쓰고 있는지, 서명 URL 의 만료 시간이 지나지 않았는지 본다.

**"관리자로 로그인했는데 목록이 비어 있다"**
→ 2-4 의 정책만 실행하고 명단 등록(4단계)을 빠뜨린 경우다.
`select * from public.admins;` 가 비어 있으면 그거다. 4단계를 실행하면 복구된다.

**"로그인은 됐는데 새로고침하면 풀린다"**
→ `supabase.auth.getSession()` 을 앱 시작 시 한 번 불러 세션을 복원해야 한다.
`onAuthStateChange` 구독도 함께 건다.
