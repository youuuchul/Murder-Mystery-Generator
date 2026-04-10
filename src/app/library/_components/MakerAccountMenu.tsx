import Link from "next/link";
import { describeMakerRecoveryEmail } from "@/lib/maker-account-recovery";
import { isMakerAdmin } from "@/lib/maker-role";
import type { AppUser, MakerAccountIdentity } from "@/types/auth";

type MakerAccountMenuProps = {
  currentUser: AppUser;
  currentAccount: MakerAccountIdentity | null;
  nextPath: string;
  errorMessage?: string | null;
  noticeMessage?: string | null;
};

/**
 * 게임 관리 헤더에서 계정 정보와 로그아웃을 함께 다루는 드롭다운 메뉴.
 * 저장 직후에는 notice/error가 보이도록 메뉴를 펼친 상태로 시작한다.
 */
export default function MakerAccountMenu({
  currentUser,
  currentAccount,
  nextPath,
  errorMessage,
  noticeMessage,
}: MakerAccountMenuProps) {
  const shouldStartOpen = Boolean(errorMessage || noticeMessage);

  return (
    <details className="group relative" open={shouldStartOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1.5 text-sm text-dark-100 transition-colors hover:border-dark-500 hover:text-white [&::-webkit-details-marker]:hidden">
        <span>작업자 {currentUser.displayName}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-4 w-4 text-dark-400 transition-transform group-open:rotate-180"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.112l3.71-3.88a.75.75 0 1 1 1.08 1.04l-4.25 4.444a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </summary>

      <div className="fixed inset-x-2 top-[calc(4rem+0.5rem)] z-30 flex max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-2xl border border-dark-700 bg-dark-900/95 shadow-2xl shadow-black/40 backdrop-blur sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[26rem] sm:max-w-[min(26rem,calc(100vw-1rem))] sm:max-h-[calc(100vh-5rem)]">
        <div className="border-b border-dark-800 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-dark-50">계정 정보</p>
              <p className="mt-1 font-mono text-[11px] text-dark-500">{currentUser.id}</p>
            </div>
            {isMakerAdmin(currentUser) ? (
              <span className="rounded-full border border-amber-800 bg-amber-950/50 px-3 py-1 text-[11px] font-medium text-amber-300">
                ADMIN
              </span>
            ) : null}
          </div>
        </div>

        <div
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {errorMessage ? (
            <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {errorMessage}
            </div>
          ) : null}
          {noticeMessage ? (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {noticeMessage}
            </div>
          ) : null}

          {currentAccount ? (
            <>
              {isMakerAdmin(currentUser) ? (
                <Link
                  href="/library/manage/sessions"
                  className="block rounded-2xl border border-amber-900/60 bg-amber-950/20 px-4 py-3 text-sm font-medium text-amber-200 transition-colors hover:bg-amber-950/30"
                >
                  세션 관리
                </Link>
              ) : null}

              <div className="rounded-2xl border border-dark-800 bg-dark-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-dark-500">Login ID</p>
                <p className="mt-3 rounded-xl border border-dark-700 bg-dark-900 px-3 py-3 font-mono text-xs text-dark-100">
                  {currentAccount.loginId}
                </p>
              </div>

              <div className="rounded-2xl border border-dark-800 bg-dark-950/70 p-4">
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
                  <input type="hidden" name="next" value={nextPath} />
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-dark-200">
                      이메일 주소
                    </span>
                    <input
                      type="email"
                      name="recoveryEmail"
                      pattern="[^@\s]+@[^@\s]+\.[^@\s]{2,}"
                      defaultValue={currentAccount.recoveryEmail ?? ""}
                      autoComplete="email"
                      className="w-full rounded-xl border border-red-900 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-red-500 valid:border-emerald-900 valid:focus:border-emerald-500"
                      placeholder="name@example.com"
                    />
                  </label>

                  {!currentAccount.recoveryEmail && (
                    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
                      비워두면 비밀번호를 찾을 수 없습니다.
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full rounded-xl border border-mystery-600 bg-mystery-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-mystery-600"
                  >
                    복구 이메일 저장
                  </button>
                </form>
              </div>

              <div className="rounded-2xl border border-dark-800 bg-dark-950/70 p-4">
                <p className="text-sm font-medium text-dark-100">비밀번호 변경</p>
                <form action="/api/maker-access" method="post" className="mt-4 space-y-3">
                  <input type="hidden" name="intent" value="change_password" />
                  <input type="hidden" name="next" value={nextPath} />
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
                    비밀번호 변경
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dark-800 bg-dark-950/70 p-4">
              <p className="text-sm font-medium text-dark-100">계정 연결이 필요합니다</p>
              <p className="mt-2 text-sm leading-6 text-dark-300">
                지금 계정을 만들면 현재 작업을 유지한 채 다른 브라우저와 다른 기기에서도 같은 작업자로 다시 들어올 수 있습니다.
              </p>
              <Link
                href={`/maker-access?mode=signup&next=${encodeURIComponent(nextPath)}`}
                className="mt-4 inline-flex rounded-xl border border-mystery-600 bg-mystery-700 px-4 py-2.5 text-sm text-white transition-colors hover:bg-mystery-600"
              >
                계정 만들기
              </Link>
            </div>
          )}

          <form action="/api/maker-access" method="post" className="border-t border-dark-800 pt-4">
            <input type="hidden" name="intent" value="logout" />
            <input type="hidden" name="next" value="/maker-access" />
            <button
              type="submit"
              className="w-full rounded-xl border border-dark-700 px-4 py-3 text-sm font-medium text-dark-200 transition-colors hover:border-dark-500 hover:bg-dark-800 hover:text-dark-50"
            >
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </details>
  );
}
