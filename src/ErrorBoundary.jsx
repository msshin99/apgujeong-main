import { Component } from "react";

/**
 * 렌더 중 예외가 나면 화면이 통째로 하얗게 비어 버린다.
 * 방문자가 아무것도 할 수 없게 두지 않으려고 최소한의 안내와 빠져나갈 길을 둔다.
 *
 * 에러 경계는 아직 클래스 컴포넌트로만 만들 수 있어서 여기만 class 를 쓴다.
 */
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // 화면에는 원인을 노출하지 않되, 개발자 도구에서는 확인할 수 있어야 한다
    console.error("[ErrorBoundary]", error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-[24px] bg-white px-[20px] py-[80px] text-center font-pretendard">
        <p className="text-[20px] leading-[30px] font-bold tracking-[-0.5px] text-[#222] md:text-[24px] md:leading-[34px]">
          페이지를 불러오는 중 문제가 발생했습니다
        </p>
        <p className="text-[14px] leading-[24px] font-light tracking-[-0.35px] text-[#999] md:text-[16px] md:leading-[26px]">
          잠시 후 다시 시도해 주세요.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-[12px]">
          {/* 라우터 자체가 망가진 경우에도 확실히 빠져나가도록 전체 새로고침으로 이동한다 */}
          <a
            href={import.meta.env.BASE_URL}
            className="rounded-[9999px] border border-solid border-[#e5e5ec] px-[28px] py-[11px] text-[14px] leading-[22px] font-medium tracking-[-0.35px] text-[#222] transition-colors duration-300 hover:bg-[#f5f5f7] md:text-[15px]"
          >
            홈으로
          </a>
          <button
            type="button"
            onClick={this.handleRetry}
            className="cursor-pointer rounded-[9999px] bg-[#e61911] px-[28px] py-[11px] text-[14px] leading-[22px] font-medium tracking-[-0.35px] text-white transition-opacity duration-300 hover:opacity-85 md:text-[15px]"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }
}
