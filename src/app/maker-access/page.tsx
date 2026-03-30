import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  MAKER_ACCESS_COOKIE_NAME,
  isMakerAccessEnabled,
  isValidMakerAccessToken,
} from "@/lib/maker-access";
import {
  getMakerUserFromCookieStore,
  normalizeMakerNextPath,
} from "@/lib/maker-user";
import { getMakerAuthProviderConfig } from "@/lib/maker-auth-config";
import { getMakerAuthGateway } from "@/lib/maker-auth-gateway";

type MakerAccessMode = "login" | "signup" | "temporary";

const makerAuthGateway = getMakerAuthGateway();

/** 메이커 접근 화면 모드를 정규화한다. */
function normalizeMakerAccessMode(value: string | undefined): MakerAccessMode {
  return value === "signup" || value === "temporary" ? value : "login";
}

type Props = {
  searchParams: Promise<{
    next?: string;
    error?: string;
    mode?: string;
  }>;
};

/**
 * 메이커/라이브러리 접근용 임시 비밀번호 입력 화면.
 * 로컬/터널 공유 테스트에서 제작 동선만 가볍게 보호하는 용도다.
 */
export default async function MakerAccessPage({ searchParams }: Props) {
  const { next, error, mode: rawMode } = await searchParams;
  const nextPath = normalizeMakerNextPath(next, "/library/manage");
  const authProvider = getMakerAuthProviderConfig().provider;
  const supportsTemporaryAccess = authProvider === "local";
  const mode = supportsTemporaryAccess
    ? normalizeMakerAccessMode(rawMode)
    : rawMode === "signup"
      ? "signup"
      : "login";

  const cookieStore = cookies();
  const currentUser = getMakerUserFromCookieStore(cookieStore);
  const currentAccount = currentUser ? await makerAuthGateway.getAccountById(currentUser.id) : null;
  const granted = await isValidMakerAccessToken(
    cookieStore.get(MAKER_ACCESS_COOKIE_NAME)?.value
  );
  const needsPassword = isMakerAccessEnabled() && !granted;

  if (!needsPassword && currentUser && mode === "login") {
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
            {supportsTemporaryAccess
              ? " 아직 계정이 없으면 현재 작업자 세션에 로그인 ID를 연결할 수 있습니다."
              : " 현재 provider 는 Supabase 계정 기반으로 동작합니다."}
          </p>
        </div>

        {error === "invalid_password" ? (
          <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            메이커 공통 비밀번호가 올바르지 않습니다.
          </div>
        ) : null}
        {error === "invalid_display_name" ? (
          <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            작업자 이름을 입력하세요.
          </div>
        ) : null}
        {error === "invalid_login_id" ? (
          <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            로그인 ID는 영문 소문자, 숫자, `.`, `_`, `-` 조합으로 3자 이상 입력하세요.
          </div>
        ) : null}
        {error === "invalid_account_password" ? (
          <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            계정 비밀번호는 8자 이상이어야 합니다.
          </div>
        ) : null}
        {error === "password_mismatch" ? (
          <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            계정 비밀번호 확인이 일치하지 않습니다.
          </div>
        ) : null}
        {error === "invalid_account_credentials" ? (
          <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            로그인 ID 또는 계정 비밀번호가 올바르지 않습니다.
          </div>
        ) : null}
        {error === "temporary_login_disabled" ? (
          <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Supabase 계정 모드에서는 임시 작업자 로그인을 지원하지 않습니다. 계정 로그인 또는 계정 만들기를 사용하세요.
          </div>
        ) : null}
        {error === "duplicate_login_id" ? (
          <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            이미 사용 중인 로그인 ID입니다.
          </div>
        ) : null}
        {error === "account_already_linked" ? (
          <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            현재 작업자 키에는 이미 다른 계정이 연결돼 있습니다. 기존 로그인 ID로 로그인하세요.
          </div>
        ) : null}
        {error === "invalid_recovery_key" ? (
          <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            작업자 키 형식이 올바르지 않습니다. 현재 표시된 복구 키를 그대로 붙여넣으세요.
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
          {supportsTemporaryAccess ? (
            <a
              href={`/maker-access?mode=temporary&next=${encodeURIComponent(nextPath)}`}
              className={[
                "rounded-full border px-3 py-1 transition-colors",
                mode === "temporary"
                  ? "border-mystery-700 bg-mystery-950/40 text-mystery-200"
                  : "border-dark-700 bg-dark-950 text-dark-400 hover:border-dark-500 hover:text-dark-100",
              ].join(" ")}
            >
              임시 작업자
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
          </form>
        ) : null}

        {mode === "signup" ? (
          <form action="/api/maker-access" method="post" className="space-y-4">
            <input type="hidden" name="intent" value="account_signup" />
            <input type="hidden" name="next" value={nextPath} />
            {currentUser ? <input type="hidden" name="recoveryKey" value={currentUser.id} /> : null}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-dark-200">
                작업자 이름
              </span>
              <input
                type="text"
                name="displayName"
                required
                autoFocus={!needsPassword}
                defaultValue={currentUser?.displayName ?? ""}
                maxLength={32}
                autoComplete="nickname"
                className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-mystery-500"
                placeholder="예: Alex, 스튜디오A"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-dark-200">
                로그인 ID
              </span>
              <input
                type="text"
                name="loginId"
                required
                autoComplete="username"
                className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-mystery-500"
                placeholder="다른 기기에서도 계속 쓸 고정 ID"
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

            {!currentUser ? (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-dark-200">
                  기존 작업자 키
                  <span className="ml-2 text-xs font-normal text-dark-500">선택 입력</span>
                </span>
                <input
                  type="text"
                  name="recoveryKey"
                  className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 font-mono text-xs text-dark-50 outline-none transition focus:border-mystery-500"
                  placeholder="기존 ownerId 를 새 계정으로 옮길 때만 입력"
                />
              </label>
            ) : (
              <div className="rounded-2xl border border-dark-800 bg-dark-950/80 px-4 py-3 text-xs leading-5 text-dark-400">
                현재 작업자 세션에 계정을 연결합니다.
                <div className="mt-2 font-mono text-dark-200">{currentUser.id}</div>
              </div>
            )}

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

        {supportsTemporaryAccess && mode === "temporary" ? (
          <form action="/api/maker-access" method="post" className="space-y-4">
            <input type="hidden" name="intent" value="temporary_login" />
            <input type="hidden" name="next" value={nextPath} />
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-dark-200">
                작업자 이름
              </span>
              <input
                type="text"
                name="displayName"
                required
                autoFocus={!needsPassword}
                defaultValue={currentUser?.displayName ?? ""}
                maxLength={32}
                autoComplete="nickname"
                className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-mystery-500"
                placeholder="예: Alex, 스튜디오A"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-dark-200">
                작업자 키
                <span className="ml-2 text-xs font-normal text-dark-500">선택 입력</span>
              </span>
              <input
                type="text"
                name="recoveryKey"
                defaultValue={currentAccount ? "" : currentUser?.id ?? ""}
                className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 font-mono text-xs text-dark-50 outline-none transition focus:border-mystery-500"
                placeholder="같은 작업자로 다시 들어갈 때 붙여넣는 복구 키"
              />
              <p className="mt-2 text-xs leading-5 text-dark-500">
                계정을 아직 만들지 않았다면 작업자 키로 기존 ownerId 를 이어서 복구할 수 있습니다.
              </p>
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
              className="w-full rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-sm font-medium text-dark-100 transition hover:border-dark-500 hover:bg-dark-700"
            >
              임시 작업자로 들어가기
            </button>
          </form>
        ) : null}

        <p className="mt-5 text-xs leading-5 text-dark-500">
          계정 로그인 이후에도 브라우저에는 작업자 세션 쿠키가 저장됩니다.
          메이커 공통 비밀번호 게이트가 켜져 있으면 접근 쿠키도 함께 저장됩니다.
        </p>
      </div>
    </div>
  );
}
