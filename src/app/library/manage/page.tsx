import Link from "next/link";
import {
  canAccessGmPlay,
  canDeleteGame,
  canViewAllGames,
  getGameOwnershipState,
} from "@/lib/game-access";
import { listGames } from "@/lib/game-repository";
import { isMakerAccessEnabled } from "@/lib/maker-access";
import { getMakerAuthGateway } from "@/lib/maker-auth-gateway";
import { isMakerAdmin } from "@/lib/maker-role";
import { requireCurrentMakerUser } from "@/lib/maker-user.server";
import GuideMenu from "../_components/GuideMenu";
import GameGrid from "../_components/GameGrid";
import MakerAccountMenu from "../_components/MakerAccountMenu";
import {
  getMakerAccountErrorMessage,
  getMakerAccountNoticeMessage,
} from "../_components/maker-account-feedback";

export const dynamic = "force-dynamic";

const makerAuthGateway = getMakerAuthGateway();

type ManageLibraryPageProps = {
  searchParams?: Promise<{
    scope?: string;
    owner?: string;
    notice?: string;
    error?: string;
  }>;
};

export default async function ManageLibraryPage({ searchParams }: ManageLibraryPageProps) {
  const resolvedSearchParams = await searchParams;
  const currentUser = await requireCurrentMakerUser("/library/manage");
  const currentAccount = await makerAuthGateway.getAccountById(currentUser.id);
  const canSeeAllGames = canViewAllGames(currentUser);
  const includeReadonly = canSeeAllGames && resolvedSearchParams?.scope === "all";
  const ownershipFilter = includeReadonly
    ? resolvedSearchParams?.owner ?? "all"
    : "mine";
  const makerUsers = await makerAuthGateway.listUsers();
  const ownerNameMap = new Map(makerUsers.map((user) => [user.id, user.displayName]));
  const managedGames = (await listGames())
    .map((game) => {
      const ownershipState = getGameOwnershipState(game, currentUser.id);

      return {
        game,
        ownershipState,
        canEdit: ownershipState !== "readonly" || isMakerAdmin(currentUser),
        canDelete: canDeleteGame(game, currentUser),
        canPlay: canAccessGmPlay(game, currentUser),
        ownerDisplayName: ownerNameMap.get(game.access.ownerId),
      };
    })
    .filter((item) => includeReadonly || item.ownershipState !== "readonly");

  const filteredGames = managedGames.filter((item) => {
    switch (ownershipFilter) {
      case "mine":
        return item.ownershipState === "owned";
      case "others":
        return item.ownershipState === "readonly";
      case "claimable":
        return item.ownershipState === "claimable";
      default:
        return true;
    }
  });

  const makerAccessEnabled = isMakerAccessEnabled();
  const publicCount = filteredGames.filter((item) => item.game.access.visibility === "public").length;
  const unlistedCount = filteredGames.filter((item) => item.game.access.visibility === "unlisted").length;
  const privateCount = filteredGames.filter((item) => item.game.access.visibility === "private").length;
  const draftCount = filteredGames.filter((item) => item.game.access.visibility === "draft").length;
  const readonlyCount = managedGames.filter((item) => item.ownershipState === "readonly").length;
  const ownedCount = managedGames.filter((item) => item.ownershipState === "owned").length;
  const claimableCount = managedGames.filter((item) => item.ownershipState === "claimable").length;
  const accountErrorMessage = getMakerAccountErrorMessage(resolvedSearchParams?.error);
  const accountNoticeMessage = getMakerAccountNoticeMessage(resolvedSearchParams?.notice);
  const managePagePath = includeReadonly
    ? ownershipFilter === "all"
      ? "/library/manage?scope=all"
      : `/library/manage?scope=all&owner=${ownershipFilter}`
    : "/library/manage";
  const pageTitle = includeReadonly ? "게임 관리" : "내 게임 관리";
  const pageDescription = includeReadonly
    ? "내 게임과 운영 확인이 필요한 전체 게임을 함께 관리합니다. 공개 상태를 바꾸면 공개 라이브러리에도 바로 반영됩니다."
    : "내가 만든 게임과 아직 귀속되지 않은 레거시 게임을 관리합니다. 공개 상태를 바꾸면 공개 라이브러리에도 바로 반영됩니다.";

  return (
    <div className="min-h-screen bg-dark-950">
      <header className="sticky top-0 z-10 border-b border-dark-800 bg-dark-950/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/library" className="text-sm text-dark-400 transition-colors hover:text-dark-200">
              ← 공개 라이브러리
            </Link>
            <span className="text-dark-700">|</span>
            <span className="text-sm font-medium text-dark-100">{pageTitle}</span>
          </div>

          <nav className="flex items-center gap-2">
            <MakerAccountMenu
              currentUser={currentUser}
              currentAccount={currentAccount}
              nextPath={managePagePath}
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
            {makerAccessEnabled ? (
              <span className="hidden rounded-full border border-emerald-900 bg-emerald-950/70 px-3 py-1 text-xs font-medium text-emerald-300 sm:inline-flex">
                제작 보호 ON
              </span>
            ) : null}
            <GuideMenu />
            <Link
              href="/maker/new"
              className="rounded-md border border-mystery-600 bg-mystery-700 px-4 py-1.5 text-sm text-white transition-colors hover:bg-mystery-600"
            >
              + 새 게임 만들기
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-dark-800 bg-[radial-gradient(circle_at_top_left,rgba(126,84,99,0.18),transparent_34%),linear-gradient(180deg,rgba(18,18,22,0.98),rgba(11,11,14,0.98))] p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-mystery-300/70">Manage</p>
          <h1 className="mt-4 text-3xl font-semibold text-dark-50">{pageTitle}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-dark-300">
            {pageDescription}
          </p>
          {canSeeAllGames ? (
            <p className="mt-2 text-sm leading-6 text-amber-200/90">
              관리자 계정은 다른 작업자의 비공개 게임과 세션도 운영 점검용으로 열 수 있습니다.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/library/manage"
              className={[
                "rounded-full border px-3 py-1 text-xs transition-colors",
                includeReadonly
                  ? "border-dark-700 bg-dark-950 text-dark-300 hover:border-dark-500 hover:text-dark-100"
                  : "border-mystery-700 bg-mystery-950/40 text-mystery-200",
              ].join(" ")}
            >
              내 게임만 보기
            </Link>
            {canSeeAllGames ? (
              <Link
                href="/library/manage?scope=all"
                className={[
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  includeReadonly
                    ? "border-mystery-700 bg-mystery-950/40 text-mystery-200"
                    : "border-dark-700 bg-dark-950 text-dark-300 hover:border-dark-500 hover:text-dark-100",
                ].join(" ")}
              >
                숨김 포함 전체 보기
              </Link>
            ) : null}
          </div>

          {includeReadonly ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { key: "all", label: `전체 보기 ${managedGames.length}개` },
                { key: "mine", label: `내 게임 ${ownedCount}개` },
                { key: "others", label: `다른 작업자 ${readonlyCount}개` },
                { key: "claimable", label: `귀속 가능 ${claimableCount}개` },
              ].map((item) => (
                <Link
                  key={item.key}
                  href={
                    item.key === "all"
                      ? "/library/manage?scope=all"
                      : `/library/manage?scope=all&owner=${item.key}`
                  }
                  className={[
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    ownershipFilter === item.key
                      ? "border-mystery-700 bg-mystery-950/40 text-mystery-200"
                      : "border-dark-700 bg-dark-950 text-dark-300 hover:border-dark-500 hover:text-dark-100",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1 text-dark-200">
              전체 {filteredGames.length}개
            </span>
            <span className="rounded-full border border-emerald-900 bg-emerald-950/50 px-3 py-1 text-emerald-300">
              공개 {publicCount}개
            </span>
            {unlistedCount > 0 && (
              <span className="rounded-full border border-sky-900 bg-sky-950/40 px-3 py-1 text-sky-300">
                링크 전용 {unlistedCount}개
              </span>
            )}
            <span className="rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1 text-dark-300">
              비공개 {privateCount}개
            </span>
            <span className="rounded-full border border-amber-900 bg-amber-950/40 px-3 py-1 text-amber-300">
              초안 {draftCount}개
            </span>
            {includeReadonly ? (
              <span className="rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1 text-dark-400">
                다른 작업자 게임 {readonlyCount}개
              </span>
            ) : null}
          </div>
        </section>

        <section className="mt-8">
          <GameGrid games={filteredGames} isAdminViewer={isMakerAdmin(currentUser)} />
        </section>
      </main>
    </div>
  );
}
