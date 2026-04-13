/**
 * 플레이어 화면 로딩 스켈레톤.
 * - 라우트 전환 시 loading.tsx로 사용
 * - 페이지 내부 loading state일 때도 동일 UI를 보여줘서 체감을 일관되게 유지
 */
export default function PlayLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-dark-950 text-dark-50">
      <header className="sticky top-0 z-10 border-b border-dark-800 bg-dark-950/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div aria-hidden className="h-5 w-32 animate-pulse rounded bg-dark-800" />
          <div aria-hidden className="h-5 w-16 animate-pulse rounded bg-dark-800" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <div aria-hidden className="h-24 w-full animate-pulse rounded-2xl border border-dark-800 bg-dark-900/60" />
        <div aria-hidden className="h-40 w-full animate-pulse rounded-2xl border border-dark-800 bg-dark-900/60" />
        <div aria-hidden className="h-56 w-full animate-pulse rounded-2xl border border-dark-800 bg-dark-900/60" />
        <p className="pt-2 text-center text-xs text-dark-500">세션 불러오는 중…</p>
      </main>
    </div>
  );
}
