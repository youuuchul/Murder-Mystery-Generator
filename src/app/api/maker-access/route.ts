import { NextRequest, NextResponse } from "next/server";
import {
  MAKER_ACCESS_COOKIE_NAME,
  createMakerAccessToken,
  getMakerAccessCookieOptions,
  getMakerAccessPassword,
  isMakerAccessEnabled,
} from "@/lib/maker-access";
import {
  MAKER_USER_COOKIE_NAME,
  createMakerUser,
  getMakerUserCookieOptions,
  getMakerUserFromCookieStore,
  isValidMakerDisplayName,
  isValidMakerUserId,
  normalizeMakerUserId,
  normalizeMakerNextPath,
  serializeMakerUser,
} from "@/lib/maker-user";
import {
  hashMakerAccountPassword,
  isValidMakerAccountPassword,
  isValidMakerLoginId,
  normalizeMakerLoginId,
  verifyMakerAccountPassword,
} from "@/lib/maker-account";
import {
  createMakerAccount,
  findMakerAccountByLoginId,
  getMakerAccountById,
} from "@/lib/storage/maker-account-storage";
import {
  findMakerUserByDisplayName,
  upsertMakerUser,
} from "@/lib/storage/maker-user-storage";

type MakerAccessIntent =
  | "logout"
  | "account_login"
  | "account_signup"
  | "temporary_login";

/**
 * 프록시/개발 서버 환경에서도 브라우저가 실제로 접근한 origin을 복원한다.
 * Next dev 가 내부적으로 `0.0.0.0`을 request.url에 넣는 경우가 있어,
 * 리다이렉트는 항상 host/proto 헤더 기준으로 만든다.
 */
function getRequestOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const protocol = forwardedProto || request.nextUrl.protocol.replace(/:$/, "") || "http";

  return `${protocol}://${host}`;
}

/** 현재 요청 기준의 안전한 절대 리다이렉트 URL을 만든다. */
function buildRedirectUrl(request: NextRequest, pathname: string): URL {
  return new URL(pathname, getRequestOrigin(request));
}

/** 실패 사유를 유지한 채 메이커 접근 화면으로 되돌린다. */
function redirectToMakerAccess(
  request: NextRequest,
  next: string,
  error: string,
  mode: "login" | "signup" | "temporary"
) {
  const failureUrl = buildRedirectUrl(request, "/maker-access");
  failureUrl.searchParams.set("error", error);
  failureUrl.searchParams.set("mode", mode);
  failureUrl.searchParams.set("next", next);
  return NextResponse.redirect(failureUrl, 303);
}

/**
 * 메이커 게이트가 켜져 있으면 공통 비밀번호를 먼저 검사한다.
 * 계정 로그인과 별개로, 외부 노출 제어는 계속 이 게이트가 담당한다.
 */
async function validateMakerGate(
  request: NextRequest,
  next: string,
  mode: "login" | "signup" | "temporary",
  gatePassword: string
) {
  if (!isMakerAccessEnabled()) {
    return null;
  }

  if (gatePassword !== getMakerAccessPassword()) {
    return redirectToMakerAccess(request, next, "invalid_password", mode);
  }

  return null;
}

/** 메이커 로그인 성공 시 필요한 쿠키를 함께 발급한다. */
async function buildLoginSuccessResponse(
  request: NextRequest,
  next: string,
  user: ReturnType<typeof createMakerUser>,
  gatePassword: string
) {
  const response = NextResponse.redirect(buildRedirectUrl(request, next), 303);

  if (isMakerAccessEnabled()) {
    const token = await createMakerAccessToken(gatePassword);
    response.cookies.set(
      MAKER_ACCESS_COOKIE_NAME,
      token,
      getMakerAccessCookieOptions()
    );
  }

  response.cookies.set(
    MAKER_USER_COOKIE_NAME,
    serializeMakerUser(user),
    getMakerUserCookieOptions()
  );

  return response;
}

/**
 * POST /api/maker-access
 * 메이커 접근 비밀번호 검증과 작업자 세션 발급을 함께 처리한다.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "account_login") as MakerAccessIntent;
  const next = normalizeMakerNextPath(
    String(formData.get("next") ?? "/library/manage"),
    intent === "logout" ? "/maker-access" : "/library/manage"
  );

  if (intent === "logout") {
    const response = NextResponse.redirect(buildRedirectUrl(request, next), 303);
    response.cookies.delete(MAKER_ACCESS_COOKIE_NAME);
    response.cookies.delete(MAKER_USER_COOKIE_NAME);
    return response;
  }

  const gatePassword = String(formData.get("gatePassword") ?? "");
  const currentSessionUser = getMakerUserFromCookieStore(request.cookies);

  if (intent === "account_login") {
    const gateError = await validateMakerGate(request, next, "login", gatePassword);
    if (gateError) {
      return gateError;
    }

    const loginId = normalizeMakerLoginId(String(formData.get("loginId") ?? ""));
    const accountPassword = String(formData.get("accountPassword") ?? "");
    if (!isValidMakerLoginId(loginId)) {
      return redirectToMakerAccess(request, next, "invalid_login_id", "login");
    }

    const account = findMakerAccountByLoginId(loginId);
    if (!account || !verifyMakerAccountPassword(accountPassword, account)) {
      return redirectToMakerAccess(request, next, "invalid_account_credentials", "login");
    }

    const user = createMakerUser(account.displayName, account.id);
    upsertMakerUser(user);
    return buildLoginSuccessResponse(request, next, user, gatePassword);
  }

  if (intent === "account_signup") {
    const gateError = await validateMakerGate(request, next, "signup", gatePassword);
    if (gateError) {
      return gateError;
    }

    const displayName = String(formData.get("displayName") ?? "");
    const loginId = normalizeMakerLoginId(String(formData.get("loginId") ?? ""));
    const accountPassword = String(formData.get("accountPassword") ?? "");
    const accountPasswordConfirm = String(formData.get("accountPasswordConfirm") ?? "");
    const recoveryKey = normalizeMakerUserId(String(formData.get("recoveryKey") ?? ""));

    if (!isValidMakerDisplayName(displayName)) {
      return redirectToMakerAccess(request, next, "invalid_display_name", "signup");
    }

    if (!isValidMakerLoginId(loginId)) {
      return redirectToMakerAccess(request, next, "invalid_login_id", "signup");
    }

    if (!isValidMakerAccountPassword(accountPassword)) {
      return redirectToMakerAccess(request, next, "invalid_account_password", "signup");
    }

    if (accountPassword !== accountPasswordConfirm) {
      return redirectToMakerAccess(request, next, "password_mismatch", "signup");
    }

    if (recoveryKey && !isValidMakerUserId(recoveryKey)) {
      return redirectToMakerAccess(request, next, "invalid_recovery_key", "signup");
    }

    if (findMakerAccountByLoginId(loginId)) {
      return redirectToMakerAccess(request, next, "duplicate_login_id", "signup");
    }

    const linkedUserId = recoveryKey || currentSessionUser?.id;
    if (linkedUserId && getMakerAccountById(linkedUserId)) {
      return redirectToMakerAccess(request, next, "account_already_linked", "signup");
    }

    const user = createMakerUser(displayName, linkedUserId);
    const passwordFields = hashMakerAccountPassword(accountPassword);
    createMakerAccount({
      id: user.id,
      displayName: user.displayName,
      loginId,
      ...passwordFields,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    upsertMakerUser(user);

    return buildLoginSuccessResponse(request, next, user, gatePassword);
  }

  const displayName = String(formData.get("displayName") ?? "");
  const recoveryKey = normalizeMakerUserId(String(formData.get("recoveryKey") ?? ""));

  if (!isValidMakerDisplayName(displayName)) {
    return redirectToMakerAccess(request, next, "invalid_display_name", "temporary");
  }

  if (recoveryKey && !isValidMakerUserId(recoveryKey)) {
    return redirectToMakerAccess(request, next, "invalid_recovery_key", "temporary");
  }

  const gateError = await validateMakerGate(request, next, "temporary", gatePassword);
  if (gateError) {
    return gateError;
  }

  const matchedMaker = !currentSessionUser && !recoveryKey
    ? findMakerUserByDisplayName(displayName)
    : null;
  const nextUserId = recoveryKey || currentSessionUser?.id || matchedMaker?.id;
  const user = createMakerUser(displayName, nextUserId);
  upsertMakerUser(user);

  return buildLoginSuccessResponse(request, next, user, gatePassword);
}

/**
 * DELETE /api/maker-access
 * 발급한 메이커 접근 쿠키를 제거한다.
 */
export async function DELETE(request: NextRequest) {
  const next = normalizeMakerNextPath(
    request.nextUrl.searchParams.get("next"),
    "/maker-access"
  );
  const response = NextResponse.redirect(buildRedirectUrl(request, next), 303);

  response.cookies.delete(MAKER_ACCESS_COOKIE_NAME);
  response.cookies.delete(MAKER_USER_COOKIE_NAME);
  return response;
}
