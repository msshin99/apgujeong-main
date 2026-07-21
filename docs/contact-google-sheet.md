> # ⛔ 폐기된 문서 — 따라 하지 말 것
>
> **이 문서는 더 이상 유효하지 않다.** 구글 시트 방식은 Supabase 로 완전히 대체됐다.
> 코드 어디에도 `VITE_CONTACT_ENDPOINT` 를 읽는 곳이 없다(검색 결과 0건). 이 문서대로
> `.env` 를 채워도 **아무 일도 일어나지 않는다.**
>
> 문의는 Supabase 의 `inquiries` 테이블로 들어간다. → **[docs/supabase-setup.md](./supabase-setup.md)**
>
> ## 그래도 따라 하면 생기는 일
>
> 3 단계는 Apps Script 웹앱을 **"액세스 권한이 있는 사용자: 모든 사용자"** 로,
> **"다음 사용자 인증 정보로 실행: 나"** 로 배포하라고 한다. 그 조합은 곧
> **인증 없이 누구나 호출할 수 있는 URL 이 당신의 구글 계정으로 메일을 보낸다**는 뜻이다.
> URL 이 새어 나가면 아무나 무제한으로 두드릴 수 있다 — **고정된 알림 주소로 스팸 메일이
> 쏟아지고, 시트에는 쓰레기 데이터가 무한히 쌓이며, 계정의 일일 메일 발송 할당량이
> 소진돼 정작 진짜 문의 알림이 오지 않는다.**
> `doPost` 에는 인증도, 출처 검사도, 횟수 제한도 없다.
>
> (수신자까지 남이 정할 수 있는 **오픈 릴레이는 아니다** — 2 단계 코드의
> `MailApp.sendEmail({ to: NOTIFY_TO, ... })` 는 받는 주소를 상수에 묶어 두고,
> 공격자가 조종할 수 있는 것은 제목과 본문뿐이다. 그래도 위 피해만으로 충분히 배포를
> 내려야 할 이유가 된다.)
>
> **이미 배포한 적이 있다면 지금 해제한다** — Apps Script → 배포 → 배포 관리 → 보관처리.
>
> 아래 내용은 **기록용으로만** 남겨 둔다.

---

# 문의하기 → Google 스프레드시트 연결 (폐기)

문의 폼(`/contact`)에서 보낸 내용을 구글 시트에 한 줄씩 쌓고, 새 문의가 오면 메일로 알린다.
서버가 필요 없고 데이터가 **구글 계정 안에** 남는다.

---

## 1. 시트 만들기

1. [sheets.new](https://sheets.new) 로 새 스프레드시트를 만든다. 이름은 `압구정곱창 문의` 정도.
2. 1행에 머리글을 넣는다.

   | A | B | C | D | E | F |
   |---|---|---|---|---|---|
   | 접수일시 | 성함 | 연락처 | 이메일 | 문의사항 | SMS수신 |

## 2. Apps Script 붙이기

시트 상단 메뉴에서 **확장 프로그램 → Apps Script**. 기본 코드를 지우고 아래를 붙여넣는다.

```js
/** 새 문의가 오면 알림을 받을 주소. 비워 두면 메일을 보내지 않는다 */
const NOTIFY_TO = "받을주소@example.com";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    sheet.appendRow([
      new Date(),
      data.name || "",
      data.phone || "",
      data.email || "",
      data.message || "",
      data.agreeSms || "",
    ]);

    if (NOTIFY_TO && NOTIFY_TO.indexOf("example.com") === -1) {
      MailApp.sendEmail({
        to: NOTIFY_TO,
        subject: `[압구정곱창] 새 문의 - ${data.name || "이름없음"}`,
        body: [
          `성함: ${data.name}`,
          `연락처: ${data.phone}`,
          `이메일: ${data.email}`,
          `SMS수신: ${data.agreeSms}`,
          "",
          data.message,
        ].join("\n"),
      });
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

`NOTIFY_TO` 를 실제 받을 메일 주소로 바꾼다.

## 3. 웹앱으로 배포

1. 오른쪽 위 **배포 → 새 배포**.
2. 톱니바퀴 → **웹 앱** 선택.
3. 설정
   - 설명: `문의 접수`
   - **다음 사용자 인증 정보로 실행: 나**
   - **액세스 권한이 있는 사용자: 모든 사용자** ← 이걸 안 바꾸면 폼에서 접근할 수 없다
4. **배포** → 권한 승인(처음 한 번만. "안전하지 않음" 경고가 나오면 고급 → 이동).
5. 나오는 **웹 앱 URL** 을 복사한다. `https://script.google.com/macros/s/AKfy.../exec` 형태.

## 4. 사이트에 연결

프로젝트 루트 `.env` 에 추가한다.

```
VITE_CONTACT_ENDPOINT=https://script.google.com/macros/s/AKfy.../exec
```

`.env` 는 `.gitignore` 에 있으므로 커밋되지 않는다. 배포 환경(Vercel/Netlify 등)에서는
같은 이름의 환경변수를 대시보드에 등록해야 한다. **환경변수를 바꾼 뒤에는 다시 빌드해야 반영된다.**

---

## 나중에 클라이언트 계정으로 넘기기

지금은 개발자 계정으로 만들고, 나중에 클라이언트 구글 계정으로 옮길 수 있다.
**옮기는 방법에 따라 URL 이 바뀌기도 하고 안 바뀌기도 한다.**

### 방법 A — 소유권 이전 (권장, URL 그대로)

1. 시트 우측 상단 **공유** → 클라이언트 계정을 편집자로 추가.
2. 다시 **공유** → 클라이언트 이름 옆 드롭다운 → **소유권 이전** → 클라이언트가 수락.
3. 시트에 붙어 있는 Apps Script 프로젝트도 함께 넘어간다.
4. 클라이언트 계정으로 **배포 → 배포 관리 → 새 버전으로 다시 배포**를 한 번 해 준다.
   - 이때 URL 은 **그대로**다. 즉 `.env` 를 손대지 않아도 된다.
   - 이후로는 문의 메일과 데이터가 전부 클라이언트 계정 아래에 있다.

> 개인 지메일 계정끼리는 소유권 이전이 되고, 회사 Workspace 계정과 개인 계정 사이에서는
> 조직 정책상 막히는 경우가 있다. 그때는 방법 B 를 쓴다.

### 방법 B — 클라이언트 계정에서 새로 만들기 (URL 바뀜)

1. 클라이언트 계정으로 1~3 단계를 다시 한다.
2. 새로 받은 URL 로 `.env` 의 `VITE_CONTACT_ENDPOINT` 를 바꾸고 다시 배포한다.
3. 기존 시트의 데이터는 새 시트에 복사해 옮긴다.

**바꾸는 데 필요한 작업은 환경변수 한 줄 교체 + 재배포뿐이다.** 코드는 건드리지 않는다.
그래서 지금 개발자 계정으로 시작해도 나중에 넘기는 데 부담이 없다.

### 넘기기 전까지 해 둘 것

- `NOTIFY_TO` 를 처음부터 **클라이언트 메일 주소**로 넣어 두면, 소유권을 넘기기 전에도
  문의 알림은 클라이언트가 바로 받는다.
- 시트를 클라이언트 계정과 **편집자로 공유**해 두면 데이터는 지금도 함께 볼 수 있다.

---

## 확인

`npm run dev` 후 `/contact` 에서 폼을 제출하고 시트에 줄이 늘어나는지 본다.
`VITE_CONTACT_ENDPOINT` 가 없으면 전송을 건너뛰고 접수 문구만 뜬다(개발 중 콘솔에 안내가 찍힌다).

## 개인정보 관련

문의 내용에는 이름·연락처·이메일이 들어간다. 개인정보 처리방침에
수집 항목, 보관 기간, 처리 위탁(Google LLC)을 명시해야 한다.
