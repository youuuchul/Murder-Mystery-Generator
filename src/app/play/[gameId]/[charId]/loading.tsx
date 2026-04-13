import PlayLoadingSkeleton from "./_components/PlayLoadingSkeleton";

/**
 * 플레이어 화면 초기 로딩 스켈레톤.
 * Next App Router가 라우트 전환 동안 이 컴포넌트를 보여준다.
 * 페이지 본체의 loading state도 동일한 스켈레톤을 사용한다.
 */
export default function PlayLoading() {
  return <PlayLoadingSkeleton />;
}
