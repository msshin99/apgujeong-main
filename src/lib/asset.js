/**
 * public 폴더 자산의 주소를 만든다.
 *
 * GitHub Pages 프로젝트 사이트는 `https://계정.github.io/저장소이름/` 아래에서 돌아간다.
 * 그래서 소스에 `/images/a.png` 라고 적으면 `계정.github.io/images/a.png` 를 찾아가
 * 404 가 난다. 앞에 저장소 이름이 붙어야 한다.
 *
 * BASE_URL 은 vite 가 base 설정에서 만들어 주는 값이다.
 * 로컬 개발에서는 "/" 라 아무것도 달라지지 않는다.
 *
 *   asset("/images/a.png")
 *     로컬  → /images/a.png
 *     배포  → /apgujeong-main/images/a.png
 *
 * CSS 의 url() 은 vite 가 알아서 고쳐 주므로 여기서 다룰 필요가 없다.
 */
const BASE = import.meta.env.BASE_URL;

export function asset(path) {
  if (!path) return path;
  // 이미 완성된 주소(https://…, data:… 등)는 그대로 둔다
  if (/^([a-z]+:)?\/\//i.test(path) || path.startsWith("data:")) return path;
  return BASE + String(path).replace(/^\//, "");
}
