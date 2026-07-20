# 배포 — GitHub Pages

`main` 에 push 하면 GitHub Actions 가 빌드해서 Pages 로 올린다.
서버는 따로 없다. 정적 파일만 올라가고, 데이터는 브라우저가 Supabase 와 직접 주고받는다.

주소는 `https://<계정>.github.io/<저장소이름>/` 형태가 된다.

---

## 1. GitHub 저장소에 올리기

이미 로컬 저장소와 첫 커밋은 만들어져 있다. 남은 건 원격 등록과 push 다.

[github.com/new](https://github.com/new) 에서 저장소를 만든다.

- Repository name: `apgujeong` (이름은 자유. 주소에 그대로 들어간다)
- **Public 을 권장한다.** Pages 자체는 비공개 저장소에서도 게시할 수 있지만
  계정 플랜에 따라 막히는 경우가 있다. 게시된 사이트는 어차피 누구나 볼 수 있다.
- **README·.gitignore·license 는 추가하지 않는다** — 이미 있는 것과 충돌한다

```bash
git remote add origin https://github.com/<계정>/apgujeong.git
git push -u origin main
```

> `.env` 는 `.gitignore` 에 있어 올라가지 않는다. 키는 다음 단계에서 따로 넣는다.

## 2. 키 등록 (Secrets)

저장소 → **Settings → Secrets and variables → Actions → New repository secret**
로 세 개를 만든다. 이름을 정확히 맞춰야 한다.

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_...` |
| `VITE_NAVER_MAP_CLIENT_ID` | 네이버 지도 키 |

값은 로컬 `.env` 파일에 있는 것과 같다.

> **이 값들은 빌드 결과물에 그대로 박혀 누구나 볼 수 있다.** 원래 브라우저에 노출되는
> 공개 키라 괜찮지만, 그래서 Supabase 의 RLS 정책이 반드시 켜져 있어야 한다.
> `service_role` 키는 어떤 경우에도 여기 넣지 않는다.

## 3. Pages 켜기

저장소 → **Settings → Pages → Build and deployment → Source** 를
**GitHub Actions** 로 바꾼다. (`Deploy from a branch` 가 아니다)

## 4. 배포

`main` 에 push 하면 자동으로 돈다. 지금 바로 돌리려면
**Actions 탭 → Deploy to GitHub Pages → Run workflow**.

2~3분 뒤 Actions 로그 맨 아래에 주소가 찍힌다.

---

## 5. 배포 후 반드시 — 네이버 지도 도메인 등록

지도는 요청이 온 주소가 등록된 것과 다르면 인증을 거부한다.
**로컬에서는 되는데 배포하면 지도만 안 뜨는** 가장 흔한 원인이다.

[NAVER Cloud 콘솔](https://console.ncloud.com) → **Maps → Application → 변경**
→ **Web 서비스 URL** 에 추가한다. 경로가 아니라 도메인 단위로 본다.

```
http://localhost:5173
https://<계정>.github.io
```

---

## 관리자 페이지는 어떻게 동작하나

GitHub Pages 는 정적 파일만 올려 주지만, 관리자 화면에 **서버는 필요 없다.**

```
브라우저 (GitHub Pages 에서 받은 JS)  ⇄  Supabase (로그인 · 데이터 · 이미지)
```

로그인, 공지 등록, 이미지 업로드, 문의 조회가 모두 브라우저에서 Supabase 로
직접 요청된다. 그래서 Pages 든 Vercel 이든 똑같이 동작한다.

`https://<계정>.github.io/apgujeong/admin` 으로 들어가면 된다.

### 주소를 숨기려 하지 않는다

`/admin` 주소는 감춘다고 안전해지지 않는다. 실제 방어선은 두 가지다.

1. **로그인** — Supabase Auth 계정이 없으면 화면 자체가 로그인 폼에서 멈춘다
2. **RLS** — 로그인하지 않은 요청은 데이터베이스가 거절한다. 공지는 읽기만 되고,
   문의는 아예 읽히지 않는다

브라우저 개발자 도구로 코드를 뜯어봐도 여기까지는 뚫리지 않는다.
**단, `service_role` 키를 프론트에 넣는 순간 이 두 겹이 모두 무력해진다.**

### 새 관리자 계정 만들기

Supabase → **Authentication → Users → Add user**. **Auto Confirm User** 를 켠다.
가입 폼은 사이트에 두지 않았다 — 아무나 관리자가 되면 안 되기 때문이다.

---

## 주소 새로고침이 되는 이유

`/notice/1` 같은 주소는 서버에 실제 파일이 없다. 그대로 두면 새로고침할 때
404 가 뜬다. 그래서 빌드 후 `index.html` 을 `404.html` 로 한 벌 복사한다
(`package.json` 의 `postbuild`).

GitHub Pages 는 없는 경로에 `404.html` 을 내려 주고, 그 안의 React 앱이
주소를 읽어 알맞은 화면을 그린다. 결과적으로 어떤 주소든 새로고침이 된다.

---

## 앞으로의 흐름

```
코드 수정 → git add . → git commit -m "..." → git push
                                                  ↓
                                    GitHub Actions 가 빌드·배포 (2~3분)
```

키(Secret)를 바꿨을 때는 push 가 없어도 **Actions → Run workflow** 로 다시
배포해야 한다. `VITE_` 값은 빌드 시점에 박히기 때문이다.

## 도메인 연결

저장소 → **Settings → Pages → Custom domain** 에 도메인을 넣고,
도메인 산 곳(가비아 등)에서 DNS 를 GitHub 로 향하게 한다.

도메인을 붙이면 주소가 `https://도메인/` 이 되어 저장소 이름이 사라진다.
그때는 워크플로의 `BASE_PATH` 를 `/` 로 바꿔야 한다.

```yaml
BASE_PATH: /          # 커스텀 도메인을 쓸 때
```

**도메인을 연결한 뒤 네이버 지도 Web 서비스 URL 에 그 도메인도 추가**해야 한다.

## 클라이언트에게 넘길 때

- **GitHub** — Settings → Collaborators 에 초대, 또는 소유권 이전
- **Supabase** — Project Settings → Team 에서 초대 후 Owner 로 지정

코드는 손댈 필요가 없다.
