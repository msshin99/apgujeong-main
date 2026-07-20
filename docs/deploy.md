# 배포 — GitHub + Vercel

코드는 GitHub 에 두고, Vercel 이 그것을 받아 빌드·배포한다.
`main` 에 push 할 때마다 자동으로 다시 배포된다.

---

## 1. GitHub 저장소에 올리기

프로젝트 폴더에서 순서대로 실행한다.

```bash
git init
git add .
git commit -m "압구정곱창 웹사이트"
git branch -M main
```

GitHub 에서 새 저장소를 만든다 ([github.com/new](https://github.com/new)).

- Repository name: `apgujeong`
- **Private 를 권장한다** (Vercel 은 비공개 저장소도 무료로 연결된다)
- **README·.gitignore·license 는 추가하지 않는다** — 이미 있는 것과 충돌한다

만들고 나오는 주소를 원격으로 등록하고 올린다.

```bash
git remote add origin https://github.com/<계정>/apgujeong.git
git push -u origin main
```

> `.env` 는 `.gitignore` 에 있어 올라가지 않는다. 키는 뒤에서 Vercel 에 직접 넣는다.

## 2. Vercel 에 연결

1. [vercel.com](https://vercel.com) → **Continue with GitHub** 으로 로그인
2. **Add New… → Project** → 방금 만든 저장소 **Import**
3. 설정은 건드릴 필요가 없다. Vercel 이 Vite 를 알아본다.
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`

## 3. 환경변수 넣기

**Deploy 를 누르기 전에** Environment Variables 를 펼쳐 아래 셋을 넣는다.
(이미 배포했다면 Settings → Environment Variables 에서 넣고 다시 배포한다)

| Name | Value |
|---|---|
| `VITE_NAVER_MAP_CLIENT_ID` | 네이버 지도 키 |
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_...` |

값은 로컬 `.env` 파일에 있는 것과 같다. 셋 다 Production / Preview / Development
모두 체크한다.

> **환경변수를 바꾸면 반드시 다시 배포해야 한다.** `VITE_` 값은 빌드할 때
> 결과물에 박히므로, 이미 만들어진 배포본은 예전 값을 그대로 들고 있다.
> Deployments → 맨 위 항목의 ⋯ → **Redeploy**.

## 4. 배포 후 반드시 할 일

### 네이버 지도에 도메인 등록

지도는 요청이 온 주소가 등록된 것과 다르면 인증을 거부한다.
**로컬에서는 되는데 배포하면 지도만 안 뜨는** 가장 흔한 원인이다.

[NAVER Cloud 콘솔](https://console.ncloud.com) → **Maps → Application → 변경**
→ **Web 서비스 URL** 에 배포 주소를 추가한다.

```
http://localhost:5173
https://apgujeong.vercel.app        ← Vercel 이 준 주소
https://실제도메인.com               ← 도메인을 연결했다면 이것도
```

### Supabase 는 따로 할 일이 없다

anon key 는 어느 도메인에서든 쓸 수 있고, 접근 제어는 RLS 가 담당한다.
다만 관리자 로그인 후 이메일 링크(비밀번호 재설정 등)를 쓸 계획이라면
**Authentication → URL Configuration → Site URL** 을 배포 주소로 바꿔 둔다.

---

## 앞으로의 흐름

```
코드 수정 → git add . → git commit -m "..." → git push
                                                  ↓
                                       Vercel 이 자동으로 빌드·배포 (1~2분)
```

Pull Request 를 만들면 그 브랜치만의 **미리보기 주소**가 따로 생긴다.
실서비스에 영향 없이 확인한 뒤 합칠 수 있다.

## 도메인 연결

Vercel → 프로젝트 → **Settings → Domains** 에서 도메인을 넣으면
어떤 DNS 레코드를 추가하라고 알려 준다. 그대로 도메인 산 곳(가비아 등)에
넣으면 된다. HTTPS 인증서는 Vercel 이 자동으로 발급한다.

도메인을 연결한 뒤에는 **네이버 지도 Web 서비스 URL 에 그 도메인도 추가**해야 한다.

## 클라이언트에게 넘길 때

- **GitHub** — 저장소 Settings → Collaborators 에 초대, 또는 소유권 이전
- **Vercel** — 프로젝트를 클라이언트 팀으로 옮기거나 멤버로 초대
- **Supabase** — Project Settings → Team 에서 초대 후 Owner 로 지정

셋 다 코드 수정 없이 계정만 옮기면 된다.
