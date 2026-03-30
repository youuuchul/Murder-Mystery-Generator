import Link from "next/link";
import { canAccessGmPlay, getGameOwnershipState } from "@/lib/game-access";
import { listGames } from "@/lib/game-repository";
import { isMakerAccessEnabled } from "@/lib/maker-access";
import { getMakerAuthGateway } from "@/lib/maker-auth-gateway";
import { requireCurrentMakerUser } from "@/lib/maker-user.server";
import GuideMenu from "../_components/GuideMenu";
import GameGrid from "../_components/GameGrid";

export const dynamic = "force-dynamic";

const makerAuthGateway = getMakerAuthGateway();

type ManageLibraryPageProps = {
  searchParams?: Promise<{
    scope?: string;
  }>;
};

export default async function ManageLibraryPage({ searchParams }: ManageLibraryPageProps) {
  const resolvedSearchParams = await searchParams;
  const currentUser = await requireCurrentMakerUser("/library/manage");
  const currentAccount = await makerAuthGateway.getAccountById(currentUser.id);
  const includeReadonly = resolvedSearchParams?.scope === "all";
  const makerUsers = await makerAuthGateway.listUsers();
  const ownerNameMap = new Map(makerUsers.map((user) => [user.id, user.displayName]));
  const managedGames = listGames()
    .map((game) => {
      const ownershipState = getGameOwnershipState(game, currentUser.id);

      return {
        game,
        ownershipState,
        canEdit: ownershipState !== "readonly",
        canPlay: canAccessGmPlay(game, currentUser.id),
        ownerDisplayName: ownerNameMap.get(game.access.ownerId),
      };
    })
    .filter((item) => includeReadonly || item.ownershipState !== "readonly");

  const makerAccessEnabled = isMakerAccessEnabled();
  const publicCount = managedGames.filter((item) => item.game.access.visibility === "public").length;
  const privateCount = managedGames.filter((item) => item.game.access.visibility === "private").length;
  const draftCount = managedGames.filter((item) => item.game.access.visibility === "draft").length;
  const readonlyCount = managedGames.filter((item) => item.ownershipState === "readonly").length;

  return (
    <div className="min-h-screen bg-dark-950">
      <header className="sticky top-0 z-10 border-b border-dark-800 bg-dark-950/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/library" className="text-sm text-dark-400 transition-colors hover:text-dark-200">
              ← 공개 라이브러리
            </Link>
            <span className="text-dark-700">|</span>
            <span className="text-sm font-medium text-dark-100">내 게임 관리</span>
          </div>

          <nav className="flex items-center gap-2">
            <span className="hidden rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1 text-xs font-medium text-dark-200 sm:inline-flex">
              작업자 {currentUser.displayName}
            </span>
            {makerAccessEnabled ? (
              <span className="hidden rounded-full border border-emerald-900 bg-emerald-950/70 px-3 py-1 text-xs font-medium text-emerald-300 sm:inline-flex">
                제작 보호 ON
              </span>
            ) : null}
            <GuideMenu />
            <form action="/api/maker-access" method="post">
              <input type="hidden" name="intent" value="logout" />
              <input type="hidden" name="next" value="/maker-access" />
              <button
                type="submit"
                className="rounded-md border border-dark-700 px-3 py-1.5 text-sm text-dark-300 transition-colors hover:border-dark-500 hover:text-dark-100"
              >
                로그아웃
              </button>
            </form>
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
          <h1 className="mt-4 text-3xl font-semibold text-dark-50">내 게임 관리</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-dark-300">
            내가 만든 게임과 아직 귀속되지 않은 레거시 게임을 관리합니다.
            공개 상태를 바꾸면 즉시 공개 라이브러리에 반영됩니다.
          </p>

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
          </div>

          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1 text-dark-200">
              전체 {managedGames.length}개
            </span>
            <span className="rounded-full border border-emerald-900 bg-emerald-950/50 px-3 py-1 text-emerald-300">
              공개 {publicCount}개
            </span>
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

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-dark-800 bg-dark-950/70 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-dark-500">Account</p>
              {currentAccount ? (
                <>
                  <p className="mt-2 text-sm leading-6 text-dark-300">
                    이 작업자는 계정 로그인으로 이어집니다. 다른 기기에서는 아래 로그인 ID와 계정 비밀번호로 들어오면 됩니다.
                  </p>
                  <p className="mt-3 rounded-xl border border-dark-700 bg-dark-900 px-3 py-3 font-mono text-xs text-dark-100">
                    {currentAccount.loginId}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm leading-6 text-dark-300">
                    아직 계정이 연결되지 않았습니다. 지금 계정을 만들면 현재 ownerId 를 유지한 채 다른 브라우저와 다른 기기에서도 같은 작업자로 로그인할 수 있습니다.
                  </p>
                  <Link
                    href="/maker-access?mode=signup&next=%2Flibrary%2Fmanage"
                    className="mt-3 inline-flex rounded-xl border border-mystery-600 bg-mystery-700 px-4 py-2.5 text-sm text-white transition-colors hover:bg-mystery-600"
                  >
                    계정 만들기
                  </Link>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-dark-800 bg-dark-950/70 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-dark-500">Worker Key</p>
              <p className="mt-2 text-sm leading-6 text-dark-300">
                기존 임시 세션이나 레거시 ownerId 를 복구할 때 쓰는 작업자 키입니다.
                계정 만들기 전에는 이 값으로 기존 작업을 다시 이어갈 수 있습니다.
              </p>
              <p className="mt-3 rounded-xl border border-dark-700 bg-dark-900 px-3 py-3 font-mono text-xs text-dark-100">
                {currentUser.id}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <GameGrid games={managedGames} />
        </section>
      </main>
    </div>
  );
}
