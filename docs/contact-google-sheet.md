# 문의하기 → Google 스프레드시트 연결

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
