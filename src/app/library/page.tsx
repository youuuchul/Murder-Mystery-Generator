import Link from "next/link";
import { buildMakerAccessPath } from "@/lib/maker-user";
import { getCurrentMakerUser } from "@/lib/maker-user.server";
import { listPublicGames } from "@/lib/storage/game-storage";
import GuideMenu from "./_components/GuideMenu";
import PublicGameGrid from "./_components/PublicGameGrid";

export const dynamic = "force-dynamic"; // 항상 서버에서 최신 목록 렌더링

export default function LibraryPage() {
  const currentUser = getCurrentMakerUser();
  const games = listPublicGames();

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
          <h2 className="mt-4 text-3xl font-semibold text-dark-50">지금 바로 플레이할 공개 시나리오</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-dark-300">
            공개 상태로 전환된 게임만 이곳에 나타납니다. GM 화면에서 바로 세션을 시작하고,
            참가자들은 기존처럼 코드로 `/join`에 입장하면 됩니다.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-dark-300">
            <span className="rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1">
              공개 게임 {games.length}개
            </span>
            <span className="rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1">
              플레이 코드는 세션 시작 후 생성
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
