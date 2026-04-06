import Link from "next/link";
import { listPublicGames } from "@/lib/game-repository";
import { buildMakerAccessPath } from "@/lib/maker-user";
import { getCurrentMakerUser } from "@/lib/maker-user.server";
import GuideMenu from "./_components/GuideMenu";
import PublicGameGrid from "./_components/PublicGameGrid";

export const dynamic = "force-dynamic"; // 항상 서버에서 최신 목록 렌더링

export default async function LibraryPage() {
  const currentUser = await getCurrentMakerUser();
  const games = await listPublicGames();

  return (
    <div className="min-h-screen bg-dark-950">
      <header className="sticky top-0 z-10 border-b border-dark-800 bg-dark-950/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <h1 className="text-lg font-semibold text-dark-50">Murder Mystery</h1>

          <nav className="flex items-center gap-2">
            <GuideMenu />
            {currentUser ? (
              <>
                <span className="hidden rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1 text-xs font-medium text-dark-200 sm:inline-flex">
                  작업자 {currentUser.displayName}
                </span>
                <Link
                  href="/library/manage"
                  className="rounded-md border border-dark-700 px-3 py-1.5 text-sm text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50"
                >
                  내 게임 관리
                </Link>
              </>
            ) : (
              <Link
                href={buildMakerAccessPath("/library/manage")}
                className="rounded-md border border-dark-700 px-3 py-1.5 text-sm text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50"
              >
                제작자 로그인
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-dark-800 bg-[radial-gradient(circle_at_top_left,rgba(140,88,77,0.22),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(76,35,52,0.22),transparent_28%),linear-gradient(180deg,rgba(18,18,22,0.98),rgba(11,11,14,0.98))] p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-mystery-300/70">Public Library</p>
          <h2 className="mt-4 text-3xl font-semibold text-dark-50">바로 시작할 수 있는 시나리오</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-dark-300">
            마음에 드는 시나리오를 고른 뒤 세션을 열어 바로 진행할 수 있습니다.
            이미 열어둔 방이 있으면 이어서 들어가고, 새로 시작하고 싶으면 새 세션을 만들면 됩니다.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-dark-300">
            <span className="rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1">
              지금 고를 수 있는 작품 {games.length}개
            </span>
            <span className="rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1">
              세션은 시작 화면에서 새로 만들거나 이어서 열기
            </span>
          </div>
        </section>

        <section className="mt-8">
          <PublicGameGrid games={games} />
        </section>
      </main>
    </div>
  );
}
