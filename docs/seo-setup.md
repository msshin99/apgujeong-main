# SEO 설정 — 테이블 · 정책 · 초기값

검색엔진과 AI 크롤러에 실릴 문구(제목·설명·키워드·FAQ·JSON-LD)를 **관리자 화면에서 고칠 수
있게** DB 로 옮기는 작업이다. `docs/supabase-setup.md` 의 뒤를 잇는 문서이고, 그쪽 **2-4
(관리자 권한 분리)를 먼저 끝낸 상태**를 전제한다.

- **`seo_settings`** — 사이트 전역 기본값. 한 행만 존재한다
- **`seo_pages`** — 라우트별 override. `/`, `/brand`, `/menu` … 8 개 행
- **`notices` 의 SEO 칸** — 공지 한 건 한 건의 제목·설명·OG 이미지
- **`seo-images` 버킷** — OG(공유) 이미지 전용. 반드시 공개 버킷

작업 순서는 아래 1 → 6 이다. 전부 SQL Editor 에서 하는 일이고, 브라우저 설정은 없다.

---

## 0. 실행하지 않으면 어떻게 되는가

**아무것도 깨지지 않는다.** 사이트는 `src/lib/seoData.js` 에 박혀 있는 기본값으로 그대로
동작한다. 빌드(prerender)는 DB 조회가 실패하거나 빈 결과가 오면 조용히 그 파일로 되돌아가고,
모든 페이지의 `<title>` · `description` · JSON-LD 는 지금과 똑같이 나간다.

이 마이그레이션이 주는 것은 **한 가지뿐**이다 — 문구를 바꿀 때 개발자와 코드 배포가
필요하지 않게 된다. 관리자 화면에서 고치고 다시 빌드하면 끝이다.

그래서 순서에 여유가 있다. 급하지 않다면 사이트를 먼저 띄우고 나중에 실행해도 된다.
다만 **한 번 실행하면 그 뒤로는 DB 값이 이긴다.** 실행한 뒤 표를 비워 두면(제목이 빈 문자열)
코드는 다시 `seoData.js` 로 되돌아가도록 되어 있으므로, 빈 칸 때문에 페이지 제목이
사라지는 사고는 나지 않는다. **빈 값 = "설정 안 함" 이지 "빈 제목" 이 아니다.**

> ⚠️ **먼저 확인할 것 — `public.is_admin()` 이 있어야 한다.**
> 이 문서의 모든 쓰기 정책은 `docs/supabase-setup.md` **2-4** 에서 만든 관리자 명단
> (`public.admins` + `public.is_admin()`)에 기댄다. 그게 없으면 아래 SQL 은
> **42883 (undefined_function)** 로 실패한다. 2-4 를 먼저 실행한다.
> 확인: `select public.is_admin();` 이 에러 없이 `true`/`false` 를 돌려주면 된다.

---

## 1. 공통 — `updated_at` 자동 갱신

관리자 화면에 "언제 마지막으로 손봤는지" 를 띄우려면 이 값을 손으로 넣게 두면 안 된다.
잊고 안 넣으면 화면은 3 년 전 날짜를 그대로 보여 준다.

```sql
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
```

---

## 2. 테이블 · 정책 만들기

> **아래 SQL 블록은 통째로 한 번에 붙여넣고 Run 한다.**
> 여러 번 다시 실행해도 안전하게 써 두었다(`if not exists` / `on conflict do nothing`).

### 읽기는 왜 익명에게 여는가

**두 곳이 다 읽어야 하기 때문이다.**

1. GitHub Actions 의 prerender 스크립트는 **로그인하지 않은 anon key** 로 돈다
2. 브라우저 런타임도 SPA 라우팅 중 head 를 갱신하려면 같은 값을 읽는다

어차피 결과물 HTML 에 그대로 실릴 문구라 숨길 것이 없다. 쓰기만 2-4 의 관리자 명단으로 조인다.

```sql
-- ────────────────────────────────────────────
-- (1) 사이트 전역 SEO 설정 — 한 행만 존재하는 표
--
-- id 를 smallint 로 두고 check (id = 1) 를 건다. 두 번째 행을 넣는 순간 23514 로 거절된다.
-- "설정이 두 벌이라 어느 쪽이 먹었는지 모르는" 사고를 DB 가 막는다.
-- ────────────────────────────────────────────
create table if not exists public.seo_settings (
  id                  smallint primary key default 1,

  -- 기본 메타 ─ 사이트 전체의 기본값. 라우트별 값이 없을 때 여기로 떨어진다
  site_name           text        not null default '',   -- 브랜드명. og:site_name, Organization.name
  site_url            text        not null default '',   -- canonical 기준 origin. **끝 슬래시 없이**
  title_template      text        not null default '%s | 압구정곱창',  -- %s 자리에 페이지 제목
  default_title       text        not null default '',   -- 템플릿을 안 쓰는 홈용 제목
  default_description text        not null default '',   -- 페이지 설명이 비었을 때의 대체 문구
  default_og_path     text,                              -- seo-images 버킷 안의 경로. 공유 썸네일
  locale              text        not null default 'ko_KR',  -- og:locale · JSON-LD inLanguage

  -- 조직/사업자 정보 (전부 빈 값 허용 — 아래 5 번 참고)
  org_legal_name      text        not null default '',   -- 사업자등록증상 상호
  org_alternate_name  text        not null default '',   -- 영문/약칭. 예: Apgujeong
  org_phone           text        not null default '',   -- 대표번호. E.164 권장(+82-2-…)
  org_email           text        not null default '',
  org_street          text        not null default '',   -- 도로명 + 상세
  org_locality        text        not null default '',   -- 시/군/구  예: 강남구
  org_region          text        not null default '',   -- 시/도    예: 서울특별시
  org_postal_code     text        not null default '',
  org_country         text        not null default '',   -- ISO 2자리. 예: KR
  org_biz_number      text        not null default '',   -- 사업자등록번호
  org_founding_date   date,
  org_price_range     text        not null default '',   -- 예: ₩₩
  org_opening_hours   jsonb       not null default '[]'::jsonb,
    -- [{ "days": ["Mo","Tu"], "opens": "17:00", "closes": "23:00" }] 형태.
    -- 영업시간도 확정 전이므로 빈 배열이 기본이다.

  same_as             text[]      not null default '{}', -- 네이버 플레이스·인스타·카카오맵 URL
  robots_default      text        not null default 'index,follow',

  updated_at          timestamptz not null default now(),

  constraint seo_settings_singleton check (id = 1),
  constraint seo_settings_locale    check (locale ~ '^[a-z]{2}_[A-Z]{2}$'),
  constraint seo_settings_robots    check (robots_default in
                                       ('index,follow','index,nofollow','noindex,follow','noindex,nofollow')),
  constraint seo_settings_hours_arr check (jsonb_typeof(org_opening_hours) = 'array'),
  constraint seo_settings_title_len check (char_length(default_title)       <= 120),
  constraint seo_settings_desc_len  check (char_length(default_description) <= 320)
);

-- sameAs 는 그대로 JSON-LD 에 나간다. 상대경로나 오타가 하나 섞이면 링크 전체가 무효가 된다.
-- check 제약 안에서는 서브쿼리를 쓸 수 없으므로 함수로 뺀다(이것 때문에 붙였다 떼는 일이 잦다).
create or replace function public.all_http_urls(arr text[])
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(u ~ '^https?://'), true) from unnest(arr) u;
$$;

alter table public.seo_settings
  drop constraint if exists seo_settings_sameas_url;
alter table public.seo_settings
  add constraint seo_settings_sameas_url check (public.all_http_urls(same_as));

-- 설정 화면이 "없는 행" 을 다루지 않도록 빈 행을 미리 넣어 둔다.
-- 값이 비어 있는 것과 행이 없는 것은 다르다 — 후자는 관리자 화면이 insert/update 를
-- 갈라 처리해야 해서 코드가 두 배가 된다.
insert into public.seo_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists seo_settings_touch on public.seo_settings;
create trigger seo_settings_touch
  before update on public.seo_settings
  for each row execute function public.touch_updated_at();

alter table public.seo_settings enable row level security;

drop policy if exists "SEO 설정 공개 읽기"  on public.seo_settings;
drop policy if exists "관리자 SEO 설정 수정" on public.seo_settings;

-- prerender 스크립트(anon)와 런타임이 둘 다 읽는다
create policy "SEO 설정 공개 읽기" on public.seo_settings
  for select to anon, authenticated using (true);

create policy "관리자 SEO 설정 수정" on public.seo_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- insert/delete 정책은 일부러 만들지 않는다. 한 행짜리 표라 새로 만들거나 지울 일이 없다.


-- ────────────────────────────────────────────
-- (2) 라우트별 SEO override
--
-- 키는 라우트 경로 그 자체다. 숫자 id 를 키로 삼으면 코드에서 쓸 때마다
-- "이 id 가 어느 페이지였더라" 를 매번 뒤져야 한다. 경로는 코드에도 그대로 있다.
--
-- '/notice/:id' 처럼 콜론이 든 템플릿 경로도 한 행으로 넣는다.
-- 이 행은 개별 공지의 '기본값' 역할을 한다 — 공지마다의 값은 notices 쪽 칸이 이긴다.
-- ────────────────────────────────────────────
create table if not exists public.seo_pages (
  id              bigint generated always as identity primary key,
  route           text        not null unique,          -- '/menu' 처럼 앱의 라우트와 글자까지 같아야 한다

  title           text        not null default '',      -- <title> · og:title. 비면 seoData.js 기본값
  description     text        not null default '',      -- <meta description> · og:description
  keywords        text[]      not null default '{}',    -- 보조 키워드. 문구를 쓸 때 참고하는 용도
  primary_keyword text        not null default '',      -- 이 페이지가 1등을 노리는 단 하나의 검색어
  og_path         text,                                 -- seo-images 버킷 경로. 없으면 설정의 기본 OG
  canonical_url   text,                                 -- 비우면 site_url + route 로 만든다

  -- robots 는 boolean 두 개로 나눈다. 'noindex,nofollow' 같은 문자열 한 칸으로 두면
  -- 관리자 화면이 자유 입력이 되어 오타 하나로 페이지가 색인에서 통째로 빠진다.
  robots_index    boolean     not null default true,
  robots_follow   boolean     not null default true,
  robots_extra    text[]      not null default '{}',    -- max-image-preview:large 등

  faq             jsonb       not null default '[]'::jsonb,
    -- [{ "q": "...", "a": "..." }] . FAQPage 는 이 배열이 비면 아예 안 내보낸다.
    -- ⚠ 여기 넣은 Q&A 는 **페이지 본문에도 보여야 한다.** 마크업에만 있는 FAQ 는 정책 위반이다.
  schema_type     text,                                 -- 라우트 기본 판정을 덮어쓸 때만 채운다

  admin_note      text        not null default '',      -- 운영자 메모. 밖으로 안 나간다
  updated_at      timestamptz not null default now(),

  constraint seo_pages_route_form check (route ~ '^/[A-Za-z0-9/:_-]*$'),
  constraint seo_pages_title_len  check (char_length(title)       <= 120),
  constraint seo_pages_desc_len   check (char_length(description) <= 320),
  constraint seo_pages_kw_count   check (array_length(keywords, 1) is null or array_length(keywords, 1) <= 20),
  constraint seo_pages_faq_arr    check (jsonb_typeof(faq) = 'array'),
  constraint seo_pages_faq_size   check (jsonb_array_length(faq) <= 20),
  constraint seo_pages_schema     check (schema_type is null or schema_type in
                                    ('WebPage','AboutPage','ContactPage','CollectionPage',
                                     'ItemPage','FAQPage','Restaurant','Menu'))
);

drop trigger if exists seo_pages_touch on public.seo_pages;
create trigger seo_pages_touch
  before update on public.seo_pages
  for each row execute function public.touch_updated_at();

-- 관리하는 라우트를 미리 깔아 둔다. 값은 3 번에서 채운다.
-- 관리자 화면은 "여기 있는 행" 만 목록에 띄우면 된다(라우트를 손으로 만들 일이 없다).
insert into public.seo_pages (route) values
  ('/'), ('/brand'), ('/menu'), ('/wine'), ('/stores'),
  ('/notice'), ('/notice/:id'), ('/contact')
on conflict (route) do nothing;

alter table public.seo_pages enable row level security;

drop policy if exists "SEO 페이지 공개 읽기"  on public.seo_pages;
drop policy if exists "관리자 SEO 페이지 등록" on public.seo_pages;
drop policy if exists "관리자 SEO 페이지 수정" on public.seo_pages;
drop policy if exists "관리자 SEO 페이지 삭제" on public.seo_pages;

create policy "SEO 페이지 공개 읽기" on public.seo_pages
  for select to anon, authenticated using (true);

create policy "관리자 SEO 페이지 등록" on public.seo_pages
  for insert to authenticated with check (public.is_admin());

create policy "관리자 SEO 페이지 수정" on public.seo_pages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "관리자 SEO 페이지 삭제" on public.seo_pages
  for delete to authenticated using (public.is_admin());
```

### 확인

**Table Editor** 에 `seo_settings` / `seo_pages` 두 표가 보이고,
둘 다 이름 옆에 **RLS enabled** 표시가 있어야 한다.
`select count(*) from public.seo_pages;` 가 **8** 이면 된다.

### 토픽 클러스터는 표가 아니다 — 코드에 고정돼 있다

**클러스터를 담는 DB 표는 만들지 않는다.** 어느 페이지가 어느 검색 의도의 대표(필러)인지,
어떤 페이지끼리 한 묶음인지는 `src/lib/seoData.js` 의 **`CLUSTERS`** 상수에 박혀 있다.
지금은 세 묶음이다 — 곱창 미식(`/menu`) · 지점 방문(`/stores`) · 브랜드·가맹(`/brand`).
페이지 하단의 "함께 보기" 내부링크는 전부 이 상수에서 나온다(`src/lib/seo.js` 의
`internalLinksFor`).

**바꾸려면 그 파일을 고쳐서 다시 배포해야 한다.** 관리자 화면에는 클러스터를 편집하는
자리가 없다.

왜 이렇게 두었나 — 클러스터는 **정보구조 결정**이지 운영 문구가 아니다. 사이트에 페이지가
여덟 개뿐인데 묶음을 바꾼다는 건 사이트의 뼈대를 다시 짠다는 뜻이고, 그건 코드 변경과 같이
가야 할 일이다. 반면 제목·설명·키워드는 성과를 보며 수시로 고치는 값이라 DB 로 뺐다.
운영자가 클릭 한 번으로 필러를 옮길 수 있게 두면, 어느 날 내부링크가 통째로 뒤집혀도
아무도 이유를 모른다.

---

## 3. 초기값 채우기 (시드) — **필수**

여기까지만 하면 표는 전부 비어 있고, 사이트는 계속 `src/lib/seoData.js` 로만 돈다.
아래를 실행해야 **DB 값이 코드 기본값과 같아진다.**

값은 전부 지금 사이트에 실제로 떠 있는 문구에서 뽑은 것이다. `src/lib/seoData.js` 와
**같은 값이어야 한다** — 한쪽만 고치면 "관리자 화면에서 바꿨는데 왜 안 바뀌지"(또는 그 반대)가
된다. 문구를 바꿀 때는 DB 쪽만 바꾸고, `seoData.js` 는 DB 가 죽었을 때의 안전망으로만 둔다.

> ⚠️ **`site_url` 한 칸만은 손으로 채운다.** 배포 주소는 저장소마다 다르다
> (`https://<계정>.github.io/<저장소이름>` 또는 커스텀 도메인). **끝 슬래시 없이** 넣는다.
> 이 값이 비어 있으면 canonical · `og:url` · JSON-LD 의 `@id` 를 만들 절대 URL 이 없어
> **해당 태그와 노드가 통째로 생략된다**(틀린 주소를 쓰는 것보다 낫다).
> `src/lib/seoData.js` 의 값과도 같아야 한다.

```sql
-- ────────────────────────────────────────────
-- 3-a. 전역 설정
--      NAP(주소·전화·영업시간)은 일부러 비워 둔다. 이유는 5 번에 적었다.
-- ────────────────────────────────────────────
update public.seo_settings set
  site_name           = '압구정곱창',
  site_url            = '',                       -- ← ★ 배포 주소를 여기 채운다 (끝 슬래시 없이)
  title_template      = '%s | 압구정곱창',
  default_title       = '압구정곱창 | 한우 곱창 전문 다이닝',
  default_description = '상위 0.1%의 한우 곱창을 72시간 저온 숙성해 400℃ 화로에서 구워냅니다. 압구정·성수동·서교동 지점, 시그니처 메뉴와 와인 페어링까지 압구정곱창에서 만나보세요.',
  org_alternate_name  = 'Apgujeong',              -- 푸터 워드마크. 이건 실제 표기라 넣는다
  locale              = 'ko_KR',
  robots_default      = 'index,follow'
where id = 1;


-- ────────────────────────────────────────────
-- 3-b. 라우트별 값
--      on conflict 로 덮어쓰므로 여러 번 실행해도 결과가 같다.
--      admin_note 는 밖으로 안 나가는 운영자 메모다.
-- ────────────────────────────────────────────
insert into public.seo_pages (route, title, description, primary_keyword, keywords, faq, admin_note) values

('/',
 '압구정곱창 | 한우 곱창 전문 다이닝',
 '상위 0.1%의 한우 곱창을 72시간 저온 숙성해 400℃ 화로에서 구워냅니다. 압구정·성수동·서교동 지점, 시그니처 메뉴와 와인 페어링까지 압구정곱창에서 만나보세요.',
 '압구정곱창',
 '{"한우 곱창","곱창 맛집","압구정 곱창","곱창 전문점","프리미엄 곱창","곱창 다이닝"}',
 '[{"q":"압구정곱창은 어떤 원육을 쓰나요?","a":"전국 산지에서 매일 새벽 육질과 곱의 밀도를 기준으로 상위 0.1%의 한우 곱창만을 엄선합니다. 상위 10% 품질의 두툼하고 곱이 가득 찬 한우 및 수입 원육을 함께 사용합니다."},{"q":"곱창을 어떻게 숙성하나요?","a":"특제 과일 효소와 함께 72시간 동안 진행되는 저온 숙성 공법으로 곱창 본연의 고소한 풍미를 극대화하고 입안에서 녹아드는 부드러운 식감을 완성합니다."},{"q":"조리 방식은 어떻게 되나요?","a":"400℃ 초고온 화로에서 순식간에 구워내 수분은 가두고 불향을 입히며, 전문 그릴러가 가장 완벽하게 익은 순간에 테이블로 전달합니다."},{"q":"압구정곱창 지점은 어디에 있나요?","a":"성수동지점, 압구정지점, 서교동지점을 운영하고 있습니다."}]',
 '홈은 어느 클러스터에도 넣지 않는다. 세 필러를 가리키는 허브이고 브랜드명 검색만 전담한다. title_template 을 쓰지 않는 유일한 페이지.'),

('/brand',
 '브랜드 소개 | 압구정곱창',
 '2005년부터 맛의 極을 향해 걸어온 압구정곱창의 이야기. 정직한 식재료와 장인의 손길로 완성되는 프리미엄 한우 곱창의 표준, 그리고 창업 개설 비용 안내까지 확인하세요.',
 '압구정곱창 브랜드',
 '{"곱창 프랜차이즈","곱창 창업","한우 곱창 전문점 창업","곱창 가맹","프리미엄 곱창 브랜드","곱창 개설 비용"}',
 '[{"q":"압구정곱창은 언제부터 시작되었나요?","a":"브랜드 소개 페이지는 2005년부터 2026년까지 이어지는 발자취를 소개하며, 맛의 極(극)을 향한 고집으로 본연의 깊이를 지켜왔다고 밝히고 있습니다."},{"q":"압구정곱창의 핵심 가치는 무엇인가요?","a":"정직한 식재료와 장인의 손길로 완성되는 프리미엄 곱창의 표준을 제시하는 것입니다. 첫 번째 원칙인 철저한 원육 선별은 매일 아침 도축장에서부터 시작되는 엄격한 품질 관리로, 가장 깨끗하고 신선한 한우 곱창만을 선보이겠다는 약속입니다."},{"q":"매장은 어떤 콘셉트인가요?","a":"단순한 식사를 넘어 미각과 시각이 조화를 이루는, 미니멀하고 세련된 공간에서 깊은 풍미를 경험할 수 있도록 구성했습니다."}]',
 '가맹 클러스터의 필러. BrandCost·BrandPerformance 의 수치는 아직 자리표시자라 description 에 숫자를 쓰지 않는다.'),

('/menu',
 '메뉴 소개 | 압구정곱창',
 '한우 곱창·대창·막창 구이부터 곱창 전골, 양곱창 볶음밥, 막걸리와 하이볼까지. 압구정곱창의 전 메뉴와 가격, 원산지·중량을 한눈에 확인하세요.',
 '압구정곱창 메뉴',
 '{"한우 곱창 구이 가격","곱창 대창 막창","곱창 전골","양곱창 볶음밥","곱창집 메뉴판","곱창 가격"}',
 '[{"q":"한우 곱창 구이 가격은 얼마인가요?","a":"한우 곱창 구이는 국내산 한우 200G 기준 30,000원입니다. 한우 대창 구이도 200G 30,000원, 한우 막창 구이는 150G 30,000원입니다."},{"q":"곱창 외에 어떤 메뉴가 있나요?","a":"사이드 메뉴로 한우 차돌박이(30,000원), 한우 곱창 전골(28,000원), 양곱창 볶음밥(10,000원), 볶음밥(4,000원)이 있습니다."},{"q":"특창 구이는 어느 나라 원육을 쓰나요?","a":"특창 구이는 뉴질랜드산 원육을 사용하며 150G 33,000원입니다. 그 외 곱창·대창·막창·차돌박이·곱창 전골은 국내산 한우입니다."},{"q":"주류는 어떤 것을 파나요?","a":"소주(참이슬·처음처럼·진로) 6,000원, 맥주(카스·테라·클라우드) 6,000~7,000원, 88 막걸리 10,000원, 우도 땅콩 막걸리 8,000원, 잭다니엘 하이볼 10,000원, 화요 25와 일품진로 각 30,000원을 판매합니다."}]',
 '미식 클러스터의 필러. 사이트에서 JSON-LD 가 가장 알찬 페이지(Menu + MenuSection + MenuItem).'),

('/wine',
 '와인 리스트 | 압구정곱창',
 '곱창과 어울리는 프리미엄 와인 리스트. 돔 페리뇽 루미너스, 모엣 샹동 아이스 앵페리얼, 보테가 골드 프로세코 등 압구정곱창의 와인과 가격을 확인하세요.',
 '곱창 와인 페어링',
 '{"압구정곱창 와인","곱창 와인 맛집","돔 페리뇽 가격","모엣 샹동 아이스 앵페리얼","샴페인 곱창","와인 있는 곱창집"}',
 '[{"q":"압구정곱창에서 어떤 와인을 마실 수 있나요?","a":"우드스톡 콜렛레인 까버네쇼비뇽, 모엣 샹동 아이스 앵페리얼, 제이콥스 크릭 스파클링 로제, 돔 페리뇽 루미너스, 보테가 골드 프로세코를 준비하고 있습니다."},{"q":"와인 가격대는 어떻게 되나요?","a":"제이콥스 크릭 스파클링 로제 90,000원부터 보테가 골드 프로세코 120,000원, 우드스톡 콜렛레인 130,000원, 모엣 샹동 아이스 앵페리얼 150,000원, 돔 페리뇽 루미너스 480,000원까지 있습니다."}]',
 '필러가 아니라 /menu 의 곁가지다. primary_keyword 를 페어링 쪽으로 갈라 두어 /menu 와 경쟁시키지 않는다.'),

('/stores',
 '지점 찾기 | 압구정곱창',
 '압구정곱창 지점 안내. 압구정지점·성수동지점·서교동지점의 위치를 지도에서 확인하고 네이버 예약으로 바로 자리를 잡으세요.',
 '압구정곱창 지점',
 '{"압구정 곱창 위치","성수동 곱창","서교동 곱창","홍대 곱창","압구정곱창 예약","곱창집 찾기"}',
 '[{"q":"압구정곱창은 어디에 있나요?","a":"압구정지점은 서울 강남구 압구정로42길 25-8 1층에 있으며, 그 외 성수동지점(성동구 성수동)과 서교동지점(마포구 서교동)을 함께 운영합니다."},{"q":"예약은 어떻게 하나요?","a":"지점 찾기 페이지의 네이버 예약하기 버튼을 눌러 네이버 지도 예약 페이지에서 예약할 수 있습니다."}]',
 '지역 검색의 착지점이자 방문 클러스터의 필러. NAP 이 확정될 때까지 Restaurant/ItemList JSON-LD 는 생략된다(5 번 참고).'),

('/notice',
 '공지사항 | 압구정곱창',
 '압구정곱창의 새 소식과 안내를 전해 드립니다. 휴무·배송 안내, 신메뉴와 이벤트 등 매장 공지사항을 한곳에서 확인하세요.',
 '압구정곱창 공지사항',
 '{"압구정곱창 소식","곱창집 휴무 안내","압구정곱창 이벤트","압구정곱창 새소식"}',
 '[]',
 '방문 클러스터에 신선도를 공급하는 페이지. FAQ 는 비워 둔다 — 본문에 없는 Q&A 는 넣으면 안 된다.'),

('/notice/:id',
 '압구정곱창 공지사항',
 '압구정곱창의 새 소식과 안내입니다.',
 '압구정곱창 공지',
 '{"압구정곱창 안내","압구정곱창 휴무","압구정곱창 배송 안내"}',
 '[]',
 '개별 공지의 **기본값** 행이다. 실제 글에서는 notices.seo_title / seo_description / faq 가 이 값을 이긴다. 여기 값은 그 칸들이 비었을 때만 쓰인다.'),

('/contact',
 '문의하기 | 압구정곱창',
 '압구정곱창에 궁금한 점을 남겨 주세요. 성함과 연락처, 문의 내용을 남기시면 담당자가 확인 후 빠르게 연락드립니다.',
 '압구정곱창 문의',
 '{"곱창 가맹 문의","곱창 창업 상담","압구정곱창 창업 문의","곱창 프랜차이즈 상담","압구정곱창 연락처"}',
 '[{"q":"문의하려면 무엇을 입력해야 하나요?","a":"성함, 연락처, 이메일, 문의사항을 입력하고 개인정보 수집 및 이용에 동의하시면 문의를 보낼 수 있습니다."},{"q":"문의하면 언제 답변을 받나요?","a":"문의가 접수되면 담당자가 확인 후 빠르게 연락드린다고 안내하고 있습니다."}]',
 '가맹 클러스터의 전환 지점. 독립 주제가 아니라 /brand 에 종속된 페이지다.')

on conflict (route) do update set
  title           = excluded.title,
  description     = excluded.description,
  primary_keyword = excluded.primary_keyword,
  keywords        = excluded.keywords,
  faq             = excluded.faq,
  admin_note      = excluded.admin_note;

-- schema_type 은 전부 null 로 둔다.
-- 코드가 라우트별 기본값을 이미 안다(/brand→AboutPage, /contact→ContactPage,
-- /stores·/wine·/notice→CollectionPage, /notice/:id→ItemPage, 나머지→WebPage).
-- 이 칸은 그 판정을 **덮어쓸 때만** 채운다.

-- 클러스터를 넣는 SQL 은 없다. 위 2 번 끝의 설명대로 클러스터는
-- src/lib/seoData.js 의 CLUSTERS 에 코드로 고정돼 있다.
-- (admin_note 에 "미식 클러스터의 필러" 같은 메모가 남아 있는데, 그건 어디까지나
--  운영자용 설명이고 실제 소속은 그 상수가 정한다.)
```

### 확인

```sql
select route, primary_keyword from public.seo_pages order by route;
```

그리고 **로그아웃 상태에서 한 번 더 확인한다.** prerender 는 anon 으로 돌기 때문에
여기서 빈 배열이 오면 빌드 결과물의 head 가 통째로 `seoData.js` 로 되돌아간다.

```
curl "$VITE_SUPABASE_URL/rest/v1/seo_pages?select=route,title" -H "apikey: $VITE_SUPABASE_ANON_KEY"
```

---

## 4. 공지사항에 SEO 칸 추가 (이미 공지 테이블을 만들었다면 이것만 더)

`docs/supabase-setup.md` 2-1 / 2-2 와 같은 성격의 **기존 설치용 마이그레이션**이다.
새 프로젝트든 오래된 프로젝트든 그냥 실행하면 된다(`add column if not exists`).

공지는 사이트에서 **유일하게 계속 늘어나는 페이지**라 글 한 건 한 건이 색인 대상이다.
제목을 그대로 `<title>` 로 쓰면 검색결과에서 잘리는 경우가 많아 따로 칸을 둔다.

```sql
alter table public.notices
  add column if not exists seo_title       text   not null default '',  -- 비면 title 을 쓴다
  add column if not exists seo_description text   not null default '',  -- 비면 본문 첫 문단
  add column if not exists og_path         text,                        -- seo-images 버킷 경로
  add column if not exists faq             jsonb  not null default '[]'::jsonb,
  add column if not exists keywords        text[] not null default '{}';

alter table public.notices
  drop constraint if exists notices_seo_title_len,
  drop constraint if exists notices_seo_desc_len,
  drop constraint if exists notices_faq_arr,
  drop constraint if exists notices_faq_size;

alter table public.notices
  add constraint notices_seo_title_len check (char_length(seo_title)       <= 120),
  add constraint notices_seo_desc_len  check (char_length(seo_description) <= 320),
  add constraint notices_faq_arr       check (jsonb_typeof(faq) = 'array'),
  add constraint notices_faq_size      check (jsonb_array_length(faq) <= 20);
```

> **`add constraint` 는 기존 행도 검사한다.** 새로 만든 칸이라 전부 기본값이므로
> 지금은 걸릴 게 없지만, 나중에 상한을 줄일 때는 2-3 과 같은 주의가 필요하다.

**`og_path` 를 `image_path` 와 따로 둔 이유** — `docs/supabase-setup.md` **2-5** 를 적용해
`notice-images` 버킷을 비공개로 돌리면 본문 이미지는 서명 URL 이 된다. **서명 URL 은
`og:image` 로 쓸 수 없다.** 만료가 있고 크롤러는 로그인하지 않기 때문이다. 카카오톡·페이스북
미리보기가 어느 날 조용히 깨지는 게 그 결과다. 그래서 공유용 이미지는 항상 공개인
`seo-images` 버킷을 따로 본다.

**새 칸에는 정책을 더 만들 필요가 없다.** `notices` 의 정책은 2-4 에서 이미 `is_admin()`
기준으로 바뀌었고, 정책은 테이블 단위라 칸이 늘어도 그대로 적용된다.
다만 익명에게 열린 통로가 하나 있다 — `increment_notice_views` 는 `security definer` 라
RLS 를 우회한다. 그 함수는 `views` 만 건드리므로 새 칸에는 영향이 없다.
**함수 본문을 손댈 때 이 점을 기억한다.**

---

## 5. NAP 은 비워 둔다 — 그리고 그게 의도다

**NAP = Name · Address · Phone.** 여기에 영업시간까지 묶어서 지역 검색의 뼈대를 이룬다.

**이 마이그레이션은 NAP 을 하나도 채우지 않는다.** `org_phone`, `org_street`,
`org_locality`, `org_region`, `org_postal_code`, `org_country`, `org_opening_hours` 전부
빈 값 그대로다.

### 왜

지금 사이트에 떠 있는 값이 **실제 값이 아니기 때문이다.**

| 어디 | 지금 값 |
|---|---|
| 세 지점 전화번호 | `010-1234-5678` (세 지점이 전부 같다) |
| 성수동·서교동 주소 | `0000빌딩 101호` / `0000빌딩 301호` |
| 푸터 사업자 정보 | 대표 `000`, 사업자등록번호 `000-00-00000`, 대표번호 `00-0000-0000` |
| 영업시간 | 사이트 어디에도 없다 |

이 값을 그대로 JSON-LD 로 내보내면 **구조화 데이터 스팸 정책 위반**이다. 리치 결과가
안 나오는 것은 그냥 손해지만, 가짜 주소·전화가 색인되면 **수동 조치(manual action)** 대상이
된다. 회복 비용이 비교가 안 된다. 게다가 한 번 색인된 가짜 전화번호는 지운다고 바로
사라지지 않는다.

### 그래서 사이트가 실제로 하는 일

**값이 없으면 그 스키마 블록을 통째로 생략한다.** 빈 문자열을 넣는 게 아니라 **속성 자체를,
때로는 노드 전체를 안 만든다.** 구체적으로 지금 나가지 않는 것:

- **`Restaurant` / `LocalBusiness` 노드 — 한 건도 나가지 않는다.**
  이름 + 완전한 주소(도로명·시군구·시도·우편번호·국가 다섯 칸 전부) + 전화가
  **모두** 실제 값일 때만 그 지점 노드를 만든다. 압구정지점은 주소는 진짜지만 전화가
  자리표시자라 탈락하고, 성수동·서교동은 주소까지 자리표시자라 탈락한다.
- **`/stores` 의 `ItemList`** — 안에 들어갈 Restaurant 노드가 0 개이므로 함께 생략된다.
  이름만 나열한 목록은 검색엔진에 아무 의미가 없고, 주소 없는 점포를 실체로 선언하는 셈이 된다.
- **`openingHoursSpecification`** — `org_opening_hours` 가 빈 배열이라 생략.
- **`Organization.address` / `.telephone`** — 생략. (`name` 과 `url` 은 진짜라 Organization
  노드 자체는 정상적으로 나간다.)
- **`geo`(좌표)** — 지금 지도의 좌표는 코드에도 "동네의 대략적 위치" 라고 적혀 있다.
  틀린 좌표는 없는 좌표보다 나쁘다. 주소가 확정될 때까지 넣지 않는다.
- **`aggregateRating` / `review`** — **어떤 조건에서도 나가지 않는다.** 사이트에 1차 리뷰
  데이터가 없다. 외부 플랫폼 별점을 자기 마크업으로 옮겨 적는 것은 명백한 위반이다.

빌드는 이걸 **경고가 아니라 실패로** 다룬다. 결과 JSON 에 `0000`·`1234-5678`·`example.com`
같은 문자열이 남아 있으면 빌드가 멈춘다. 경고로 두면 아무도 안 본다.

### 지금 채워도 되는 것 하나 — `same_as`

NAP 이 비어 있는 동안 **이 사이트에서 유일하게 실효가 있는 지역 신호**다.
네이버 플레이스·인스타그램 URL 하나만 넣어도 이 사이트와 그 계정이 같은 업체로 이어진다.

```sql
update public.seo_settings set same_as = array[
  'https://map.naver.com/p/entry/place/37069188'   -- 압구정지점 네이버 플레이스
] where id = 1;
```

`https://` 로 시작하지 않는 값은 제약이 거절한다(23514). 상대경로나 오타 하나가 링크 전체를
무효로 만들기 때문이다.

### NAP 이 확정되는 날 무엇이 자동으로 켜지는가

`seo_settings` 의 주소 다섯 칸 + 전화 + 영업시간을 채우고 **다시 빌드하면, 코드 변경 없이**
Organization 의 `address`·`telephone`, `/stores` 의 Restaurant 노드와 ItemList, 홈의
Restaurant, `openingHoursSpecification` 이 한꺼번에 살아난다.
**"값이 없으면 생략" 규칙을 조건문으로 심어 둔 것이 곧 미래의 마이그레이션이다.**

지점별 값은 지금 `src/pages/StoreFinder.jsx` 에 하드코딩돼 있다. 지점이 실제로 늘어나는
시점에 `stores` 테이블을 따로 만들어 같은 규칙을 지점 단위로 적용한다(이번 범위 밖).

> 덧붙여 — 지역 검색의 실제 승부는 JSON-LD 가 아니라 **네이버 플레이스·구글 비즈니스
> 프로필 등록**이다. 그쪽이 먼저고, `same_as` 는 그것을 사이트와 이어 주는 끈이다.

---

## 6. OG 이미지 저장소 만들기

```sql
-- OG 이미지를 가져가는 쪽은 카카오톡·페이스북·슬랙·검색 크롤러다. 전부 로그인이 없다.
-- 여기만은 서명 URL 을 쓸 수 없으므로 notice-images 와 분리해 공개 버킷으로 둔다.
insert into storage.buckets (id, name, public)
values ('seo-images', 'seo-images', true)
on conflict (id) do nothing;

drop policy if exists "SEO 이미지 공개 읽기"   on storage.objects;
drop policy if exists "관리자 SEO 이미지 업로드" on storage.objects;
drop policy if exists "관리자 SEO 이미지 삭제"   on storage.objects;

create policy "SEO 이미지 공개 읽기" on storage.objects
  for select using (bucket_id = 'seo-images');

create policy "관리자 SEO 이미지 업로드" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'seo-images' and public.is_admin());

create policy "관리자 SEO 이미지 삭제" on storage.objects
  for delete to authenticated
  using (bucket_id = 'seo-images' and public.is_admin());
```

**Storage** 에 `seo-images` 버킷이 보이고 `public` 표시가 있으면 성공이다.

> 이 버킷은 `docs/supabase-setup.md` **2-5** 의 비공개 전환 대상이 **아니다.**
> 2-5 를 실행해도 `seo-images` 는 공개인 채로 둔다. 비공개로 돌리는 순간 공유 미리보기가
> 전부 깨진다.

---

## 실행 순서 요약

| 순서 | 무엇 | 필수/선택 |
|---|---|---|
| 0 | `docs/supabase-setup.md` **2-4** (관리자 명단 · `is_admin()`) | **선행 필수** |
| 1 | `touch_updated_at()` | 필수 |
| 2 | 두 테이블 + RLS (**한 번에** 붙여넣기) | 필수 |
| 3 | 초기값 시드 — `site_url` 은 손으로 채운다 | 필수 |
| 4 | `notices` SEO 칸 추가 | 필수 |
| 5 | NAP — 지금은 아무것도 안 한다. `same_as` 만 선택적으로 | 선택 |
| 6 | `seo-images` 버킷 | 필수 |
| — | **환경변수를 바꾸지 않아도 되지만, 실행 뒤에는 반드시 다시 빌드한다** | 필수 |

**다시 빌드하지 않으면 아무것도 바뀌지 않는다.** 메타 정보는 빌드 시점에 HTML 에
박히므로(prerender), DB 만 고치고 배포하지 않으면 크롤러가 보는 문서는 그대로다.

---

## 자주 걸리는 곳

**"`function public.is_admin() does not exist` 로 실패한다"**
→ `docs/supabase-setup.md` 2-4 를 아직 실행하지 않았다. 그것부터 한다.

**"`relation "public.seo_pages" does not exist` 로 실패한다"**
→ 2 번을 건너뛰고 3 번(시드)부터 실행했다. 2 번 블록을 먼저 통째로 Run 한다.

**"클러스터를 관리자 화면에서 바꾸고 싶다"**
→ 그런 화면은 없다. 2 번 끝의 설명을 읽는다. `src/lib/seoData.js` 의 `CLUSTERS` 를
   고쳐서 다시 배포해야 한다.

**"빌드 결과물의 제목이 예전 그대로다"**
→ 세 가지를 순서대로 본다. (1) 시드를 실행했는가 (2) **로그아웃 상태에서** REST 로
   `seo_pages` 가 읽히는가 — anon select 정책이 없으면 prerender 는 빈 배열을 받고
   조용히 `seoData.js` 로 되돌아간다 (3) 그 뒤에 다시 빌드했는가.

**"canonical 과 og:url 이 통째로 없다"**
→ `seo_settings.site_url` 이 비어 있다. 3-a 의 ★ 표시 칸을 채운다. 끝 슬래시는 뺀다.

**"지점 정보가 검색결과에 안 뜬다"**
→ 정상이다. 5 번을 읽는다. 전화·주소가 자리표시자인 동안 Restaurant 스키마는
   의도적으로 출력되지 않는다.

**"FAQ 를 넣었는데 리치 결과가 안 나온다"**
→ **페이지 본문에 그 Q&A 가 보이는지** 본다. 마크업에만 있는 FAQ 는 무시되는 정도가 아니라
   정책 위반이다. FAQ 를 채우려면 해당 페이지에 FAQ 섹션을 함께 그려야 한다.

**"공유 미리보기 이미지가 어느 날 깨졌다"**
→ `og_path` 대신 `image_path`(notice-images) 를 쓰고 있고, 2-5 로 그 버킷이 비공개가 된
   경우다. 서명 URL 은 만료되므로 `og:image` 로 쓸 수 없다. `seo-images` 에 올린 파일을
   `og_path` 에 지정한다.
