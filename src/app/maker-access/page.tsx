import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  MAKER_ACCESS_COOKIE_NAME,
  isMakerAccessEnabled,
  isValidMakerAccessToken,
} from "@/lib/maker-access";
import {
  describeMakerRecoveryEmail,
  previewMakerPasswordResetToken,
} from "@/lib/maker-account-recovery";
import {
  getMakerUserFromCookieStore,
  normalizeMakerNextPath,
} from "@/lib/maker-user";
import { getMakerAuthGateway } from "@/lib/maker-auth-gateway";
import { getCurrentMakerUser } from "@/lib/maker-user.server";

type MakerAccessMode = "login" | "signup" | "temporary" | "recover" | "reset";

type Props = {
  searchParams: Promise<{
    next?: string;
    error?: string;
    notice?: string;
    mode?: string;
    token?: string;
    recoveryEmail?: string;
  }>;
};

const makerAuthGateway = getMakerAuthGateway();

/** 메이커 접근 화면 모드를 현재 provider 와 요청값에 맞게 정리한다. */
function normalizeMakerAccessMode(
  value: string | undefined,
  supportsTemporaryAccess: boolean
): MakerAccessMode {
  switch (value) {
    case "signup":
    case "recover":
    case "reset":
      return value;
    case "temporary":
      return supportsTemporaryAccess ? "temporary" : "login";
    default:
      return "login";
  }
}

/** 화면 상단에 띄울 오류 메시지를 현재 query 값에서 고른다. */
function getMakerAccessErrorMessage(error: string | undefined): string | null {
  switch (error) {
    case "invalid_password":
      return "메이커 공통 비밀번호가 올바르지 않습니다.";
    case "invalid_display_name":
      return "작업자 이름을 입력하세요.";
    case "invalid_login_id":
      return "로그인 ID는 영문 소문자, 숫자, `.`, `_`, `-` 조합으로 3자 이상 입력하세요.";
    case "invalid_account_password":
      return "계정 비밀번호는 8자 이상이어야 합니다.";
    case "password_mismatch":
      return "비밀번호 확인이 일치하지 않습니다.";
    case "invalid_account_credentials":
      return "로그인 ID 또는 계정 비밀번호가 올바르지 않습니다.";
    case "temporary_login_disabled":
      return "현재는 계정 로그인 또는 계정 만들기만 사용할 수 있습니다.";
    case "duplicate_login_id":
      return "이미 사용 중인 로그인 ID입니다.";
    case "account_already_linked":
      return "현재 작업자 키에는 이미 다른 계정이 연결돼 있습니다. 기존 로그인 ID로 로그인하세요.";
    case "invalid_recovery_key":
      return "작업자 키 형식이 올바르지 않습니다. 현재 표시된 키를 그대로 붙여넣으세요.";
    case "invalid_recovery_email":
      return "복구 이메일 형식이 올바르지 않습니다.";
    case "duplicate_recovery_email":
      return "이미 다른 계정이 쓰는 복구 이메일입니다.";
    case "unknown_login_id":
      return "해당 로그인 ID를 찾을 수 없습니다.";
    case "missing_recovery_email":
      return "이 계정은 복구 이메일이 등록되지 않아 비밀번호를 찾을 수 없습니다.";
    case "recovery_delivery_unavailable":
      return "지금은 복구 메일을 보낼 수 없습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.";
    case "invalid_reset_token":
      return "사용할 수 없는 재설정 링크입니다.";
    case "expired_reset_token":
      return "재설정 링크 유효 시간이 지났습니다. 다시 요청해주세요.";
    case "used_reset_token":
      return "이미 사용한 재설정 링크입니다. 다시 요청해주세요.";
    case "login_required":
      return "먼저 로그인해주세요.";
    default:
      return null;
  }
}

/** 화면 상단에 띄울 성공 메시지를 현재 query 값에서 고른다. */
function getMakerAccessNoticeMessage(
  notice: string | undefined,
  recoveryEmail: string | undefined
): string | null {
  switch (notice) {
    case "password_reset_sent":
      return recoveryEmail
        ? `${recoveryEmail} 주소로 비밀번호 재설정 링크를 보냈습니다.`
        : "가입 때 입력한 복구 이메일로 비밀번호 재설정 링크를 보냈습니다.";
    case "password_reset_completed":
      return "새 비밀번호가 저장되었습니다. 이제 새 비밀번호로 로그인할 수 있습니다.";
    default:
      return null;
  }
}

/**
 * 메이커/라이브러리 접근용 계정 로그인 화면.
 * 가입, 비밀번호 찾기, 재설정까지 한 경로에서 처리한다.
 */
export default async function MakerAccessPage({ searchParams }: Props) {
  const { next, error, notice, mode: rawMode, token, recoveryEmail } = await searchParams;
  const nextPath = normalizeMakerNextPath(next, "/library/manage");
  const mode = normalizeMakerAccessMode(rawMode, false);
  const cookieStore = cookies();
  const authenticatedUser = await getCurrentMakerUser();
  const currentUser = authenticatedUser ?? getMakerUserFromCookieStore(cookieStore);
  const currentAccount = currentUser ? await makerAuthGateway.getAccountById(currentUser.id) : null;
  const granted = await isValidMakerAccessToken(
    cookieStore.get(MAKER_ACCESS_COOKIE_NAME)?.value
  );
  const needsPassword = isMakerAccessEnabled() && !granted;
  const errorMessage = getMakerAccessErrorMessage(error);
  const noticeMessage = getMakerAccessNoticeMessage(notice, recoveryEmail);
  const resetPreview = mode === "reset"
    ? await previewMakerPasswordResetToken(token ?? "")
    : null;

  if (!needsPassword && authenticatedUser && mode === "login") {
    redirect(nextPath);
  }

  return (
    <div className="min-h-screen bg-dark-950 px-4 py-10 text-dark-50">
      <div className="mx-auto max-w-md rounded-3xl border border-dark-800 bg-dark-900 p-8 shadow-2xl">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.24em] text-mystery-400">
            Maker Login
          </p>
          <h1 className="mt-3 text-2xl font-semibold">제작자 로그인</h1>
          <p className="mt-2 text-sm leading-6 text-dark-400">
            계정 로그인은 다른 브라우저와 다른 기기에서도 같은 작업자로 이어집니다.
          </p>
        </div>

        {errorMessage ? (
          <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}
        {noticeMessage ? (
          <div className="mb-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {noticeMessage}
          </div>
        ) : null}

        <div className="mb-6 flex flex-wrap gap-2 text-xs">
          <a
            href={`/maker-access?mode=login&next=${encodeURIComponent(nextPath)}`}
            className={[
              "rounded-full border px-3 py-1 transition-colors",
              mode === "login"
                ? "border-mystery-700 bg-mystery-950/40 text-mystery-200"
                : "border-dark-700 bg-dark-950 text-dark-400 hover:border-dark-500 hover:text-dark-100",
            ].join(" ")}
          >
            계정 로그인
          </a>
          <a
            href={`/maker-access?mode=signup&next=${encodeURIComponent(nextPath)}`}
            className={[
              "rounded-full border px-3 py-1 transition-colors",
              mode === "signup"
                ? "border-mystery-700 bg-mystery-950/40 text-mystery-200"
                : "border-dark-700 bg-dark-950 text-dark-400 hover:border-dark-500 hover:text-dark-100",
            ].join(" ")}
          >
            계정 만들기
          </a>
          {mode === "recover" || mode === "reset" ? (
            <a
              href={`/maker-access?mode=recover&next=${encodeURIComponent(nextPath)}`}
              className="rounded-full border border-mystery-700 bg-mystery-950/40 px-3 py-1 text-mystery-200 transition-colors"
            >
              비밀번호 찾기
            </a>
          ) : null}
        </div>

        {mode === "login" ? (
          <form action="/api/maker-access" method="post" className="space-y-4">
            <input type="hidden" name="intent" value="account_login" />
            <input type="hidden" name="next" value={nextPath} />

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-dark-200">
                로그인 ID
              </span>
              <input
                type="text"
                name="loginId"
                required
                autoFocus={!needsPassword}
                autoComplete="username"
                className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-mystery-500"
                placeholder="예: studio-a, alex_01"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-dark-200">
                계정 비밀번호
              </span>
              <input
                type="password"
                name="accountPassword"
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-mystery-500"
                placeholder="계정 생성 때 정한 비밀번호"
              />
            </label>

            {needsPassword ? (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-dark-200">
                  메이커 공통 비밀번호
                </span>
                <input
                  type="password"
                  name="gatePassword"
                  required
                  autoFocus={needsPassword}
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-mystery-500"
                  placeholder="공유받은 제작자 비밀번호"
                />
              </label>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-xl border border-mystery-600 bg-mystery-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-mystery-600"
            >
              계정으로 로그인
            </button>

            <a
              href={`/maker-access?mode=recover&next=${encodeURIComponent(nextPath)}`}
              className="block text-center text-sm text-dark-400 transition-colors hover:text-dark-100"
            >
              비밀번호를 잊어버렸어요
            </a>
          </form>
        ) : null}

        {mode === "signup" ? (
          <form action="/api/maker-access" method="post" className="space-y-4">
            <input type="hidden" name="intent" value="account_signup" />
            <input type="hidden" name="next" value={nextPath} />
            {currentUser ? <input type="hidden" name="recoveryKey" value={currentUser.id} /> : null}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-dark-200">
                로그인 ID
                <span className="ml-2 text-xs font-normal text-dark-500">영소문자/숫자, 3~32자</span>
              </span>
              <input
                type="text"
                name="loginId"
                required
                autoFocus={!needsPassword}
                maxLength={32}
                pattern="[a-z0-9][a-z0-9._\-]{2,31}"
                autoComplete="username"
                className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-mystery-500"
                placeholder="로그인에 사용할 ID"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-dark-200">
                작업자 이름
              </span>
              <input
                type="text"
                name="displayName"
                required
                defaultValue={currentUser?.displayName ?? ""}
                maxLength={32}
                autoComplete="nickname"
                className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-mystery-500"
                placeholder="제작자로 노출되는 이름"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-dark-200">
                계정 비밀번호
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
                계정 비밀번호 확인
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

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-dark-200">
                복구 이메일
                <span className="ml-2 text-xs font-normal text-emerald-300">선택 입력</span>
              </span>
              <input
                type="email"
                name="recoveryEmail"
                pattern="[^@\s]+@[^@\s]+\.[^@\s]{2,}"
                autoComplete="email"
                className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-red-500 valid:border-emerald-900 valid:focus:border-emerald-500"
                placeholder="name@example.com"
              />
            </label>

            {currentUser ? (
              <div className="rounded-2xl border border-dark-800 bg-dark-950/80 px-4 py-3 text-xs leading-5 text-dark-400">
                현재 작업자 세션에 계정을 연결합니다.
                <div className="mt-2 font-mono text-dark-200">{currentUser.id}</div>
              </div>
            ) : null}

            {needsPassword ? (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-dark-200">
                  메이커 공통 비밀번호
                </span>
                <input
                  type="password"
                  name="gatePassword"
                  required
                  autoFocus={needsPassword}
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-mystery-500"
                  placeholder="공유받은 제작자 비밀번호"
                />
              </label>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-xl border border-mystery-600 bg-mystery-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-mystery-600"
            >
              계정 만들기
            </button>
          </form>
        ) : null}

        {mode === "recover" ? (
          <form action="/api/maker-access" method="post" className="space-y-4">
            <input type="hidden" name="intent" value="request_password_reset" />
            <input type="hidden" name="next" value={nextPath} />

            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
              가입 때 복구 이메일을 입력한 계정만 비밀번호를 다시 설정할 수 있습니다.
              <div className="mt-1 text-xs text-amber-200/80">
                이메일을 넣지 않았다면 내부 관리자 도움으로만 복구할 수 있습니다.
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-dark-200">
                로그인 ID
              </span>
              <input
                type="text"
                name="loginId"
                required
                autoFocus={!needsPassword}
                autoComplete="username"
                className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-mystery-500"
                placeholder="가입할 때 쓴 로그인 ID"
              />
            </label>

            {needsPassword ? (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-dark-200">
                  메이커 공통 비밀번호
                </span>
                <input
                  type="password"
                  name="gatePassword"
                  required
                  autoFocus={needsPassword}
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-mystery-500"
                  placeholder="공유받은 제작자 비밀번호"
                />
              </label>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-xl border border-mystery-600 bg-mystery-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-mystery-600"
            >
              재설정 링크 받기
            </button>
          </form>
        ) : null}

        {mode === "reset" ? (
          resetPreview?.status === "ready" && token ? (
            <form action="/api/maker-access" method="post" className="space-y-4">
              <input type="hidden" name="intent" value="complete_password_reset" />
              <input type="hidden" name="next" value={nextPath} />
              <input type="hidden" name="token" value={token} />

              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-100">
                <div className="font-medium">{resetPreview.displayName}</div>
                <div className="mt-1 text-xs text-emerald-200/80">
                  로그인 ID {resetPreview.loginId}
                  {resetPreview.recoveryEmail
                    ? ` · 복구 메일 ${describeMakerRecoveryEmail(resetPreview.recoveryEmail)}`
                    : ""}
                </div>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-dark-200">
                  새 비밀번호
                </span>
                <input
                  type="password"
                  name="accountPassword"
                  required
                  autoFocus
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
                className="w-full rounded-xl border border-mystery-600 bg-mystery-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-mystery-600"
              >
                새 비밀번호 저장
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
                이 링크로는 비밀번호를 바꿀 수 없습니다. 새 재설정 링크를 다시 받아주세요.
              </div>
              <a
                href={`/maker-access?mode=recover&next=${encodeURIComponent(nextPath)}`}
                className="block rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-center text-sm text-dark-100 transition hover:border-dark-500"
              >
                다시 요청하기
              </a>
            </div>
          )
        ) : null}


        <div className="mt-5 space-y-2 text-xs leading-5 text-dark-500">
          <p>
            회원가입 시 아이디, 비밀번호, 작업자 이름을 수집하며, 복구 이메일은 선택 항목입니다.
            가입을 완료하면 위 항목의 수집 및 이용에 동의한 것으로 간주됩니다.
          </p>
          <p>
            저작권, 데이터 관리 등 서비스 이용 정책은{" "}
            <a href="/guide" className="text-dark-400 underline underline-offset-2 hover:text-dark-200">사용 가이드</a>
            에서 확인하세요.
          </p>
        </div>
      </div>
    </div>
  );
}
