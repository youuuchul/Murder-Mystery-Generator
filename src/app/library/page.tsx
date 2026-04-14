/** @screen P-008 — docs/screens.json 참조 */
import { Suspense } from "react";
import LibraryCountsBadges, {
  LibraryCountsBadgesSkeleton,
} from "./_components/LibraryCountsBadges";
import LibraryGameSection, {
  LibraryGameSectionSkeleton,
} from "./_components/LibraryGameSection";
import LibraryNavSection, {
  LibraryNavSectionSkeleton,
} from "./_components/LibraryNavSection";
import LibraryQuickJoin from "./_components/LibraryQuickJoin";
import {
  getMakerAccountErrorMessage,
  getMakerAccountNoticeMessage,
} from "./_components/maker-account-feedback";

export const dynamic = "force-dynamic"; // 로그인 상태·Navigation을 반영하려면 요청마다 렌더링 필요

type LibraryPageProps = {
  searchParams?: Promise<{
    notice?: string;
    error?: string;
  }>;
};

/**
 * Library 진입 페이지.
 * 쉘(헤더 레이아웃 + 히어로 텍스트 + QuickJoin)은 DB 요청을 기다리지 않고 즉시 렌더하고,
 * 네비게이션(Supabase Auth 왕복)·개수 배지·공개 게임 그리드는 각각 Suspense로 스트리밍한다.
 * 배지와 그리드는 React.cache(library-data.ts) 기반으로 DB 요청을 요청 단위에서 공유한다.
 */
export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const resolvedSearchParams = await searchParams;
  const accountErrorMessage = getMakerAccountErrorMessage(resolvedSearchParams?.error);
  const accountNoticeMessage = getMakerAccountNoticeMessage(resolvedSearchParams?.notice);

  return (
    <div className="min-h-screen bg-dark-950">
      <header className="sticky top-0 z-10 border-b border-dark-800 bg-dark-950/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <h1 className="text-lg font-semibold text-dark-50">Murder Mystery</h1>

          <nav className="flex items-center gap-2">
            <Suspense fallback={<LibraryNavSectionSkeleton />}>
              <LibraryNavSection
                errorMessage={accountErrorMessage}
                noticeMessage={accountNoticeMessage}
              />
            </Suspense>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-dark-800 bg-[radial-gradient(circle_at_top_left,rgba(140,88,77,0.22),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(76,35,52,0.22),transparent_28%),linear-gradient(180deg,rgba(18,18,22,0.98),rgba(11,11,14,0.98))] p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-mystery-300/70">Public Library</p>
          <h2 className="mt-4 text-3xl font-semibold text-dark-50">시나리오를 고르고 바로 플레이</h2>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-dark-300">
            <Suspense fallback={<LibraryCountsBadgesSkeleton />}>
              <LibraryCountsBadges />
            </Suspense>
            <span className="rounded-full border border-mystery-800/60 bg-mystery-950/30 px-3 py-1 text-mystery-300/80">
              회원가입 후 직접 제작
            </span>
          </div>
          <LibraryQuickJoin />
        </section>

        <section className="mt-8">
          <Suspense fallback={<LibraryGameSectionSkeleton />}>
            <LibraryGameSection />
          </Suspense>
        </section>
      </main>
    </div>
  );
}
