import Link from "next/link";
import { describeMakerRecoveryEmail } from "@/lib/maker-account-recovery";
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

export const dynamic = "force-dynamic";

const makerAuthGateway = getMakerAuthGateway();

type ManageLibraryPageProps = {
  searchParams?: Promise<{
    scope?: string;
    notice?: string;
    error?: string;
  }>;
};

/** 계정 관리 영역에 띄울 오류 메시지를 query 값에서 고른다. */
function getManageAccountErrorMessage(error: string | undefined): string | null {
  switch (error) {
    case "invalid_recovery_email":
      return "복구 이메일 형식이 올바르지 않습니다.";
    case "invalid_account_password":
      return "새 비밀번호는 8자 이상이어야 합니다.";
    case "password_mismatch":
      return "비밀번호 확인이 일치하지 않습니다.";
    case "invalid_current_password":
      return "현재 비밀번호가 올바르지 않습니다.";
    case "account_not_found":
      return "계정을 다시 확인해주세요. 잠시 후 다시 시도하면 됩니다.";
    default:
      return null;
  }
}

/** 계정 관리 영역에 띄울 성공 메시지를 query 값에서 고른다. */
function getManageAccountNoticeMessage(notice: string | undefined): string | null {
  switch (notice) {
    case "recovery_email_saved":
      return "복구 이메일이 저장되었습니다.";
    case "recovery_email_removed":
      return "복구 이메일을 지웠습니다. 이제 비밀번호를 찾을 수 없습니다.";
    case "password_changed":
      return "비밀번호가 변경되었습니다.";
    default:
      return null;
  }
}

export default async function ManageLibraryPage({ searchParams }: ManageLibraryPageProps) {
  const resolvedSearchParams = await searchParams;
  const currentUser = await requireCurrentMakerUser("/library/manage");
  const currentAccount = await makerAuthGateway.getAccountById(currentUser.id);
  const canSeeAllGames = canViewAllGames(currentUser);
  const includeReadonly = canSeeAllGames && resolvedSearchParams?.scope === "all";
  const makerUsers = await makerAuthGateway.listUsers();
  const ownerNameMap = new Map(makerUsers.map((user) => [user.id, user.displayName]));
  const managedGames = (await listGames())
    .map((game) => {
      const ownershipState = getGameOwnershipState(game, currentUser.id);

      return {
        game,
        ownershipState,
        canEdit: ownershipState !== "readonly",
        canDelete: canDeleteGame(game, currentUser),
        canPlay: canAccessGmPlay(game, currentUser),
        ownerDisplayName: ownerNameMap.get(game.access.ownerId),
      };
    })
    .filter((item) => includeReadonly || item.ownershipState !== "readonly");

  const makerAccessEnabled = isMakerAccessEnabled();
  const publicCount = managedGames.filter((item) => item.game.access.visibility === "public").length;
  const privateCount = managedGames.filter((item) => item.game.access.visibility === "private").length;
  const draftCount = managedGames.filter((item) => item.game.access.visibility === "draft").length;
  const readonlyCount = managedGames.filter((item) => item.ownershipState === "readonly").length;
  const accountErrorMessage = getManageAccountErrorMessage(resolvedSearchParams?.error);
  const accountNoticeMessage = getManageAccountNoticeMessage(resolvedSearchParams?.notice);
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
            <span className="text-sm font-medium text-dark-100">내 게임 관리</span>
          </div>

          <nav className="flex items-center gap-2">
            <span className="hidden rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1 text-xs font-medium text-dark-200 sm:inline-flex">
              작업자 {currentUser.displayName}
            </span>
            {isMakerAdmin(currentUser) ? (
              <span className="hidden rounded-full border border-amber-800 bg-amber-950/50 px-3 py-1 text-xs font-medium text-amber-300 sm:inline-flex">
                ADMIN
              </span>
            ) : null}
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
                <div className="space-y-4">
                  {accountErrorMessage ? (
                    <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                      {accountErrorMessage}
                    </div>
                  ) : null}
                  {accountNoticeMessage ? (
                    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                      {accountNoticeMessage}
                    </div>
                  ) : null}

                  <div>
                    <p className="mt-2 text-sm leading-6 text-dark-300">
                      다른 기기에서는 아래 로그인 ID와 계정 비밀번호로 들어오면 됩니다.
                    </p>
                    <p className="mt-3 rounded-xl border border-dark-700 bg-dark-900 px-3 py-3 font-mono text-xs text-dark-100">
                      {currentAccount.loginId}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-dark-800 bg-dark-900/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-dark-100">복구 이메일</p>
                        <p className="mt-1 text-xs text-dark-400">
                          현재 {describeMakerRecoveryEmail(currentAccount.recoveryEmail)}
                        </p>
                      </div>
                      {currentAccount.recoveryEmail ? (
                        <span className="rounded-full border border-emerald-900 bg-emerald-950/50 px-3 py-1 text-[11px] text-emerald-300">
                          복구 가능
                        </span>
                      ) : (
                        <span className="rounded-full border border-amber-900 bg-amber-950/40 px-3 py-1 text-[11px] text-amber-300">
                          미등록
                        </span>
                      )}
                    </div>
                    <form action="/api/maker-access" method="post" className="mt-4 space-y-3">
                      <input type="hidden" name="intent" value="update_recovery_email" />
                      <input type="hidden" name="next" value="/library/manage" />
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-dark-200">
                          이메일 주소
                        </span>
                        <input
                          type="email"
                          name="recoveryEmail"
                          defaultValue={currentAccount.recoveryEmail ?? ""}
                          autoComplete="email"
                          className="w-full rounded-xl border border-emerald-900 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-emerald-500"
                          placeholder="name@example.com"
                        />
                      </label>
                      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
                        비워두면 비밀번호를 찾을 수 없습니다.
                        <div className="mt-1 text-xs text-amber-200/80">
                          저장 후에는 로그인 화면에서 메일로 재설정 링크를 받을 수 있습니다.
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="w-full rounded-xl border border-mystery-600 bg-mystery-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-mystery-600"
                      >
                        복구 이메일 저장
                      </button>
                    </form>
                  </div>

                  <div className="rounded-2xl border border-dark-800 bg-dark-900/70 p-4">
                    <p className="text-sm font-medium text-dark-100">비밀번호 변경</p>
                    <p className="mt-1 text-xs text-dark-400">
                      현재 비밀번호를 확인한 뒤 새 비밀번호로 바꿉니다.
                    </p>
                    <form action="/api/maker-access" method="post" className="mt-4 space-y-3">
                      <input type="hidden" name="intent" value="change_password" />
                      <input type="hidden" name="next" value="/library/manage" />
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-dark-200">
                          현재 비밀번호
                        </span>
                        <input
                          type="password"
                          name="currentPassword"
                          required
                          autoComplete="current-password"
                          className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-mystery-500"
                          placeholder="현재 비밀번호"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-dark-200">
                          새 비밀번호
                        </span>
                        <input
                          type="password"
                          name="accountPassword"
                          required
                          autoComplete="new-password"
                          className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-mystery-500"
                          placeholder="8자 이상"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-dark-200">
                          새 비밀번호 확인
                        </span>
                        <input
                          type="password"
                          name="accountPasswordConfirm"
                          required
                          autoComplete="new-password"
                          className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-mystery-500"
                          placeholder="한 번 더 입력"
                        />
                      </label>
                      <button
                        type="submit"
                        className="w-full rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-sm font-medium text-dark-100 transition hover:border-dark-500 hover:bg-dark-700"
                      >
                        새 비밀번호 저장
                      </button>
                    </form>
                  </div>
                </div>
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
