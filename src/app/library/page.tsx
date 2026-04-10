import Link from "next/link";
import { listPublicGames } from "@/lib/game-repository";
import { getMakerAuthGateway } from "@/lib/maker-auth-gateway";
import { isMakerAdmin } from "@/lib/maker-role";
import { buildMakerAccessPath } from "@/lib/maker-user";
import { getCurrentMakerUser } from "@/lib/maker-user.server";
import GuideMenu from "./_components/GuideMenu";
import LibraryQuickJoin from "./_components/LibraryQuickJoin";
import MakerAccountMenu from "./_components/MakerAccountMenu";
import PublicGameGrid from "./_components/PublicGameGrid";
import {
  getMakerAccountErrorMessage,
  getMakerAccountNoticeMessage,
} from "./_components/maker-account-feedback";

export const dynamic = "force-dynamic"; // 항상 서버에서 최신 목록 렌더링

const makerAuthGateway = getMakerAuthGateway();

type LibraryPageProps = {
  searchParams?: Promise<{
    notice?: string;
    error?: string;
  }>;
};

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const resolvedSearchParams = await searchParams;
  const currentUser = await getCurrentMakerUser();
  const currentAccount = currentUser
    ? await makerAuthGateway.getAccountById(currentUser.id)
    : null;
  const games = await listPublicGames();
  const makerUsers = await makerAuthGateway.listUsers();
  const ownerNameMap = new Map(makerUsers.map((user) => [user.id, user.displayName]));
  const publicGameItems = games.map((game) => ({
    game,
    ownerDisplayName: ownerNameMap.get(game.access.ownerId),
  }));
  const accountErrorMessage = getMakerAccountErrorMessage(resolvedSearchParams?.error);
  const accountNoticeMessage = getMakerAccountNoticeMessage(resolvedSearchParams?.notice);

  return (
    <div className="min-h-screen bg-dark-950">
      <header className="sticky top-0 z-10 border-b border-dark-800 bg-dark-950/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <h1 className="text-lg font-semibold text-dark-50">Murder Mystery</h1>

          <nav className="flex items-center gap-2">
            <GuideMenu />
            {currentUser ? (
              <>
                <MakerAccountMenu
                  currentUser={currentUser}
                  currentAccount={currentAccount}
                  nextPath="/library"
                  errorMessage={accountErrorMessage}
                  noticeMessage={accountNoticeMessage}
                />
                {isMakerAdmin(currentUser) ? (
                  <Link
                    href="/library/manage/sessions"
                    className="hidden rounded-full border border-amber-800 bg-amber-950/50 px-3 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-950/70 sm:inline-flex"
                  >
                    ADMIN
                  </Link>
                ) : null}
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
          <p className="text-xs uppercase tracking-[0.3em] text-mystery-300/70">Murder Mystery</p>
          <h2 className="mt-4 text-3xl font-semibold text-dark-50">시나리오를 고르고 바로 플레이</h2>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-dark-300">
            <span className="rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1">
              공개 시나리오 {publicGameItems.length}개
            </span>
          </div>
          <LibraryQuickJoin />
        </section>

        <section className="mt-8">
          <PublicGameGrid games={publicGameItems} />
        </section>
      </main>
    </div>
  );
}
