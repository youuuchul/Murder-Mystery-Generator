/**
 * 제작 편집 페이지 초기 로딩 스켈레톤.
 * Next App Router가 자동으로 이 컴포넌트를 서버 컴포넌트 resolve 동안 표시한다.
 * getGame(15테이블 조인) + auth 확인 동안 사용자가 빈 화면을 보지 않도록 한다.
 */
export default function MakerEditLoading() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(87,100,91,0.08),transparent_18%),radial-gradient(circle_at_bottom_right,rgba(42,13,18,0.12),transparent_28%),linear-gradient(180deg,rgba(15,9,12,1),rgba(23,15,18,1))]">
      <header className="sticky top-0 z-10 border-b border-dark-700 bg-[rgba(15,9,12,0.88)] backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-dark-400 text-sm">← 내 게임 관리</span>
            <span className="text-dark-700">|</span>
            <span
              aria-hidden
              className="h-4 w-40 animate-pulse rounded bg-dark-800"
            />
          </div>
          <span
            aria-hidden
            className="h-3 w-28 animate-pulse rounded bg-dark-800"
          />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div aria-hidden className="h-10 w-full animate-pulse rounded-xl bg-dark-900/60 border border-dark-800" />
        <div aria-hidden className="h-10 w-full animate-pulse rounded-xl bg-dark-900/60 border border-dark-800" />
        <div className="space-y-3">
          <div aria-hidden className="h-5 w-32 animate-pulse rounded bg-dark-800" />
          <div aria-hidden className="h-24 w-full animate-pulse rounded-xl bg-dark-900/60 border border-dark-800" />
          <div aria-hidden className="h-24 w-full animate-pulse rounded-xl bg-dark-900/60 border border-dark-800" />
        </div>
        <p className="text-center text-xs text-dark-500 pt-4">게임을 불러오는 중…</p>
      </main>
    </div>
  );
}
