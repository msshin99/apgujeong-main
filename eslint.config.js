import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

/**
 * 이 저장소의 첫 린트 설정.
 *
 * 왜 지금인가:
 *   화면 코드가 1200px 을 경계로 완전히 다른 트리를 그리는 구조라
 *   두 갈래가 조용히 어긋나는 사고가 반복됐다. 그 갈래를 하나로 합치기 전에
 *   "훅 규칙 위반 / 의존성 누락 / 안 떼는 리스너" 같은 것을 사람 눈 대신
 *   기계가 먼저 잡아 주는 그물이 필요하다.
 *
 * 무엇을 켜고 무엇을 껐는가:
 *   react-hooks 7 의 recommended 는 React Compiler 검사(purity, immutability,
 *   set-state-in-effect …)까지 전부 켠다. 지금 코드베이스는 컴파일러를 쓰지 않고
 *   스크롤/rAF/DOM 측정으로 굴러가는 곳이 많아서 그 규칙들은 "고칠 수 없는 경고"가
 *   수백 줄 쏟아진다 — 그물이 아니라 소음이 된다. 그래서 recommended 를 통째로
 *   쓰지 않고, 실제 사고 이력이 있는 규칙만 골라 error 로 세운다.
 */
export default [
  {
    /* 빌드 산출물·캐시·의존성은 검사 대상이 아니다.
       dist 에는 프리렌더가 만든 HTML 과 번들이 들어 있어 켜 두면 린트가 몇 분씩 돈다. */
    ignores: ["dist/**", "node_modules/**", ".image-cache/**", "src/generated/**"],
  },

  /* ── 브라우저에서 도는 코드: src/** ───────────────────────────── */
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        /* 프리렌더(node)에서도 같은 모듈이 import 되므로 process 를 아는 것으로 둔다.
           실제 참조는 전부 typeof 가드 뒤에 있다. */
        process: "readonly",
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,

      /* 핵심 두 줄. 둘 다 error 다.
         exhaustive-deps 를 warn 으로 두면 CI 가 초록불이라 아무도 안 본다 —
         이 저장소의 "히어로가 빈 화면으로 뜨던" 사고가 정확히 의존성 누락이었다. */
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",

      /* 렌더 중 setState / 컴포넌트 안에서 컴포넌트 정의 — 둘 다 실제로 겪은 종류의 사고다.
         지금 코드에서는 0건이라 "새로 생기면 잡히는" 그물로만 세워 둔다. */
      "react-hooks/set-state-in-render": "error",
      "react-hooks/static-components": "error",

      /* 일부러 끈 컴파일러 검사 — 켜면 지금 코드에서 19건이 나오는데 전부
         "고치려면 컴포넌트를 다시 짜야 하는" 것이라 이 단계에서 할 일이 아니다.
           · refs(9)          — Collection/HeroTabs 가 rAF 클로저에 넘길 치수를
                                렌더 중에 ref 로 갱신한다. 주석에 이유가 적혀 있는 의도된 패턴.
           · set-state-in-effect(9) — 마운트 뒤 DOM 을 재고 setState 하는 자리들
                                (캔버스 스케일·IntersectionObserver). 이 사이트의 뼈대다.
           · immutability(1)  — Reveal 의 글자 순번 카운터.
         React Compiler 를 실제로 켜는 날 다시 볼 것. 그때는 이 목록이 작업 목록이 된다. */
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",

      /* 빠른 새로고침(HMR)이 통째 리로드로 조용히 떨어지는 것을 막는다.
         상수만 같이 내보내는 것은 허용 — 라우트 테이블 파일이 그 형태다. */
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      /* 안 쓰는 변수는 대개 리팩터링 잔해다. 다만 catch 인자와 밑줄 접두사는 봐 준다
         (에러를 일부러 삼키는 자리와, 자리만 맞추는 인자가 실제로 있다). */
      "no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],

      "no-undef": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],

      /* ESLint 10 recommended 에 새로 들어온 규칙. "선언과 동시에 넣은 초깃값이
         뒤에서 전부 덮인다"를 잡는데, 이 저장소에서는 `let body = null;` 처럼
         **실패했을 때의 값이 무엇인지 선언 자리에서 밝히는** 방어적 초기화를 문제 삼는다
         (src/lib/rest.js). 코드를 고치면 오히려 의도가 흐려지므로 규칙을 끈다. */
      "no-useless-assignment": "off",
    },
  },

  /* 진입점은 HMR 경계가 아니다.
     src/main.jsx 는 createRoot/hydrateRoot 를 부르는 자리라 내보내는 것이 없고,
     react-refresh 는 그것을 "컴포넌트를 딴 데로 옮기라"고 읽는다 — 옮길 수 없는 조언이다. */
  {
    files: ["src/main.jsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },

  /* ── 노드에서 도는 코드: scripts/**, 설정 파일 ─────────────────── */
  {
    /* *.config.js 로 잡아 둔다 — vite/vitest/eslint 설정이 모두 이 이름을 쓰고,
       앞으로 하나가 늘어도 검사 밖으로 조용히 새지 않는다 */
    files: ["scripts/**/*.mjs", "*.config.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.node,
        /* prerender/hydration-check 는 jsdom 을 세운 뒤 전역에 window·document 를 꽂는다 */
        ...globals.browser,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      /* ignoreRestSiblings 를 켜는 이유: scripts/prerender.mjs 의 stripBody 처럼
         `({ body, ...rest }) => rest` 로 **일부러 떼어 내는** 관용구가 있다.
         떼어 낸 이름을 "안 썼다"고 잡는 것은 오탐이다. */
      "no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
