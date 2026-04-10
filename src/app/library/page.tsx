import Link from "next/link";
import { listPublicGames, countNonPublicGames } from "@/lib/game-repository";
import { getMakerAuthGateway } from "@/lib/maker-auth-gateway";
import { isMakerAdmin } from "@/lib/maker-role";
import { buildMakerAccessPath } from "@/lib/maker-user";
import { getCurrentMakerUser } from "@/lib/maker-user.server";
import GuideMenu from "./_components/GuideMenu";
import LibraryQuickJoin from "./_components/LibraryQuickJoin";
import MakerAccountMenu from "./_components/MakerAccountMenu";
import MobileNavMenu from "./_components/MobileNavMenu";
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
  const [games, nonPublicCount] = await Promise.all([
    listPublicGames(),
    countNonPublicGames(),
  ]);
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
            {currentUser ? (
              <>
                {/* 데스크톱: 가이드·ADMIN 인라인 */}
                <div className="hidden items-center gap-2 sm:flex">
                  <GuideMenu />
                  {isMakerAdmin(currentUser) ? (
                    <Link
                      href="/library/manage/sessions"
                      className="rounded-full border border-amber-800 bg-amber-950/50 px-3 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-950/70"
                    >
                      ADMIN
                    </Link>
                  ) : null}
                </div>

                {/* 계정 메뉴: 데스크톱에서 summary 보임, 모바일에서는 햄버거 "계정 정보"로 접근 */}
                <div className="[&>details>summary]:hidden [&>details>summary]:sm:flex">
                  <MakerAccountMenu
                    currentUser={currentUser}
                    currentAccount={currentAccount}
                    nextPath="/library"
                    errorMessage={accountErrorMessage}
                    noticeMessage={accountNoticeMessage}
                  />
                </div>

                {/* 모바일: ⋮ 메뉴 */}
                <MobileNavMenu
                  displayName={currentUser.displayName}
                  isAdmin={isMakerAdmin(currentUser)}
                  showAccountLink
                />

                <Link
                  href="/library/manage"
                  className="rounded-md border border-mystery-800/60 bg-mystery-950/30 px-3 py-1.5 text-sm text-mystery-200 transition-colors hover:border-mystery-600 hover:text-mystery-50"
                >
                  내 게임 관리
                </Link>
              </>
            ) : (
              <Link
                href={buildMakerAccessPath("/library/manage")}
                className="rounded-md border border-mystery-800/60 bg-mystery-950/30 px-3 py-1.5 text-sm text-mystery-200 transition-colors hover:border-mystery-600 hover:text-mystery-50"
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
          <h2 className="mt-4 text-3xl font-semibold text-dark-50">시나리오를 고르고 바로 플레이</h2>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-dark-300">
            <span className="rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1">
              공개 시나리오 {publicGameItems.length}개
            </span>
            {nonPublicCount > 0 && (
              <span className="rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1">
                제작중 {nonPublicCount}개
              </span>
            )}
            <span className="rounded-full border border-mystery-800/60 bg-mystery-950/30 px-3 py-1 text-mystery-300/80">
              회원가입 후 직접 제작
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
