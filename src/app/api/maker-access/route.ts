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
  isValidMakerAccountPassword,
  isValidMakerLoginId,
  isValidMakerRecoveryEmail,
  normalizeMakerLoginId,
  normalizeMakerRecoveryEmail,
} from "@/lib/maker-account";
import {
  changeMakerPasswordForUser,
  completeMakerPasswordReset,
  requestMakerPasswordReset,
  updateMakerRecoveryEmailForUser,
} from "@/lib/maker-account-recovery";
import { getMakerAuthProviderConfig } from "@/lib/maker-auth-config";
import { getMakerAuthGateway } from "@/lib/maker-auth-gateway";
import { getRequestMakerUser } from "@/lib/maker-user.server";
import { buildSupabaseMakerEmail } from "@/lib/supabase/maker-auth";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/ssr";

type MakerAccessIntent =
  | "logout"
  | "account_login"
  | "account_signup"
  | "request_password_reset"
  | "complete_password_reset"
  | "update_recovery_email"
  | "change_password"
  | "temporary_login";

const makerAuthGateway = getMakerAuthGateway();

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
  mode: "login" | "signup" | "temporary" | "recover" | "reset",
  extraParams: Record<string, string> = {}
) {
  const failureUrl = buildRedirectUrl(request, "/maker-access");
  failureUrl.searchParams.set("error", error);
  failureUrl.searchParams.set("mode", mode);
  failureUrl.searchParams.set("next", next);
  for (const [key, value] of Object.entries(extraParams)) {
    if (value) {
      failureUrl.searchParams.set(key, value);
    }
  }
  return NextResponse.redirect(failureUrl, 303);
}

/** 성공/실패 메시지를 붙여 원하는 페이지로 되돌린다. */
function redirectWithFeedback(
  request: NextRequest,
  next: string,
  feedback: {
    error?: string;
    notice?: string;
    mode?: string;
    token?: string;
    next?: string;
  }
) {
  const redirectUrl = buildRedirectUrl(request, next);

  if (feedback.error) {
    redirectUrl.searchParams.set("error", feedback.error);
  }

  if (feedback.notice) {
    redirectUrl.searchParams.set("notice", feedback.notice);
  }

  if (feedback.mode) {
    redirectUrl.searchParams.set("mode", feedback.mode);
  }

  if (feedback.token) {
    redirectUrl.searchParams.set("token", feedback.token);
  }

  if (feedback.next) {
    redirectUrl.searchParams.set("next", feedback.next);
  }

  return NextResponse.redirect(redirectUrl, 303);
}

/**
 * 메이커 게이트가 켜져 있으면 공통 비밀번호를 먼저 검사한다.
 * 계정 로그인과 별개로, 외부 노출 제어는 계속 이 게이트가 담당한다.
 */
async function validateMakerGate(
  request: NextRequest,
  next: string,
  mode: "login" | "signup" | "temporary" | "recover",
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

/** 메이커 로그인 성공 후 돌아갈 기본 redirect 응답을 만든다. */
async function buildLoginSuccessResponse(
  request: NextRequest,
  next: string,
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

  return response;
}

/** 로컬 provider 에서만 쓰는 legacy 작업자 세션 쿠키를 쓴다. */
function applyLocalMakerUserCookie(
  response: NextResponse,
  user: ReturnType<typeof createMakerUser>
) {
  response.cookies.set(
    MAKER_USER_COOKIE_NAME,
    serializeMakerUser(user),
    getMakerUserCookieOptions()
  );
}

/** Supabase 계정 세션을 시작하고, 성공 여부만 반환한다. */
async function signInWithSupabaseSession(
  request: NextRequest,
  response: NextResponse,
  loginId: string,
  password: string
) {
  const supabase = createSupabaseRouteHandlerClient(request, response);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: buildSupabaseMakerEmail(loginId),
    password,
  });

  return !error && !!data.user;
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
  const authProvider = getMakerAuthProviderConfig().provider;

  if (intent === "logout") {
    const response = NextResponse.redirect(buildRedirectUrl(request, next), 303);

    if (authProvider === "supabase") {
      const supabase = createSupabaseRouteHandlerClient(request, response);
      await supabase.auth.signOut();
    }

    response.cookies.delete(MAKER_ACCESS_COOKIE_NAME);
    response.cookies.delete(MAKER_USER_COOKIE_NAME);
    return response;
  }

  const gatePassword = String(formData.get("gatePassword") ?? "");
  const authenticatedUser = await getRequestMakerUser(request);
  const currentSessionUser = authenticatedUser ?? getMakerUserFromCookieStore(request.cookies);

  if (intent === "request_password_reset") {
    const gateError = await validateMakerGate(request, next, "recover", gatePassword);
    if (gateError) {
      return gateError;
    }

    const loginId = normalizeMakerLoginId(String(formData.get("loginId") ?? ""));
    if (!isValidMakerLoginId(loginId)) {
      return redirectToMakerAccess(request, next, "invalid_login_id", "recover");
    }

    const result = await requestMakerPasswordReset({
      loginId,
      requestOrigin: getRequestOrigin(request),
    });

    if (result.status === "sent") {
      return redirectWithFeedback(request, "/maker-access", {
        notice: "password_reset_sent",
        mode: "login",
        next,
      });
    }

    if (result.status === "missing_recovery_email") {
      return redirectToMakerAccess(
        request,
        next,
        "missing_recovery_email",
        "recover"
      );
    }

    if (result.status === "delivery_unavailable") {
      return redirectToMakerAccess(
        request,
        next,
        "recovery_delivery_unavailable",
        "recover"
      );
    }

    return redirectToMakerAccess(request, next, "unknown_login_id", "recover");
  }

  if (intent === "complete_password_reset") {
    const token = String(formData.get("token") ?? "").trim();
    const accountPassword = String(formData.get("accountPassword") ?? "");
    const accountPasswordConfirm = String(formData.get("accountPasswordConfirm") ?? "");

    if (!token) {
      return redirectToMakerAccess(request, next, "invalid_reset_token", "recover");
    }

    if (!isValidMakerAccountPassword(accountPassword)) {
      return redirectToMakerAccess(
        request,
        next,
        "invalid_account_password",
        "reset",
        { token }
      );
    }

    if (accountPassword !== accountPasswordConfirm) {
      return redirectToMakerAccess(request, next, "password_mismatch", "reset", {
        token,
      });
    }

    const result = await completeMakerPasswordReset({
      token,
      nextPassword: accountPassword,
    });

    if (result === "ok") {
      return redirectWithFeedback(request, "/maker-access", {
        notice: "password_reset_completed",
        mode: "login",
        next,
      });
    }

    return redirectToMakerAccess(
      request,
      next,
      result === "expired"
        ? "expired_reset_token"
        : result === "used"
          ? "used_reset_token"
          : "invalid_reset_token",
      "recover"
    );
  }

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

    if (authProvider === "supabase") {
      const response = await buildLoginSuccessResponse(request, next, gatePassword);
      const signedIn = await signInWithSupabaseSession(
        request,
        response,
        loginId,
        accountPassword
      );

      if (!signedIn) {
        return redirectToMakerAccess(request, next, "invalid_account_credentials", "login");
      }

      response.cookies.delete(MAKER_USER_COOKIE_NAME);
      return response;
    }

    const account = await makerAuthGateway.authenticateAccount(loginId, accountPassword);
    if (!account) {
      return redirectToMakerAccess(request, next, "invalid_account_credentials", "login");
    }

    const user = createMakerUser(account.displayName, account.id);
    await makerAuthGateway.upsertUser(user);
    const response = await buildLoginSuccessResponse(request, next, gatePassword);
    applyLocalMakerUserCookie(response, user);
    return response;
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
    const recoveryEmail = normalizeMakerRecoveryEmail(String(formData.get("recoveryEmail") ?? ""));
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

    if (!isValidMakerRecoveryEmail(recoveryEmail)) {
      return redirectToMakerAccess(request, next, "invalid_recovery_email", "signup");
    }

    if (recoveryKey && !isValidMakerUserId(recoveryKey)) {
      return redirectToMakerAccess(request, next, "invalid_recovery_key", "signup");
    }

    if (await makerAuthGateway.findAccountByLoginId(loginId)) {
      return redirectToMakerAccess(request, next, "duplicate_login_id", "signup");
    }

    const linkedUserId = recoveryKey || currentSessionUser?.id;
    if (linkedUserId && await makerAuthGateway.getAccountById(linkedUserId)) {
      return redirectToMakerAccess(request, next, "account_already_linked", "signup");
    }

    const account = await makerAuthGateway.createAccount({
      displayName,
      loginId,
      password: accountPassword,
      recoveryEmail,
      preferredUserId: linkedUserId,
      migrateOwnerIdFrom: linkedUserId,
    });

    if (authProvider === "supabase") {
      const response = await buildLoginSuccessResponse(request, next, gatePassword);
      const signedIn = await signInWithSupabaseSession(
        request,
        response,
        account.loginId,
        accountPassword
      );

      if (!signedIn) {
        throw new Error("Supabase account was created but the login session could not be started.");
      }

      response.cookies.delete(MAKER_USER_COOKIE_NAME);
      return response;
    }

    const user = createMakerUser(account.displayName, account.id);
    await makerAuthGateway.upsertUser(user);

    const response = await buildLoginSuccessResponse(request, next, gatePassword);
    applyLocalMakerUserCookie(response, user);
    return response;
  }

  if (intent === "update_recovery_email") {
    if (!currentSessionUser) {
      return redirectWithFeedback(request, "/maker-access", {
        error: "login_required",
        mode: "login",
        next,
      });
    }

    const recoveryEmail = String(formData.get("recoveryEmail") ?? "");
    const result = await updateMakerRecoveryEmailForUser({
      userId: currentSessionUser.id,
      recoveryEmail,
    });

    if (result.status === "invalid_email") {
      return redirectWithFeedback(request, next, {
        error: "invalid_recovery_email",
      });
    }

    if (result.status !== "ok") {
      return redirectWithFeedback(request, next, {
        error: "account_not_found",
      });
    }

    return redirectWithFeedback(request, next, {
      notice: normalizeMakerRecoveryEmail(recoveryEmail)
        ? "recovery_email_saved"
        : "recovery_email_removed",
    });
  }

  if (intent === "change_password") {
    if (!currentSessionUser) {
      return redirectWithFeedback(request, "/maker-access", {
        error: "login_required",
        mode: "login",
        next,
      });
    }

    const currentPassword = String(formData.get("currentPassword") ?? "");
    const accountPassword = String(formData.get("accountPassword") ?? "");
    const accountPasswordConfirm = String(formData.get("accountPasswordConfirm") ?? "");

    if (!isValidMakerAccountPassword(accountPassword)) {
      return redirectWithFeedback(request, next, {
        error: "invalid_account_password",
      });
    }

    if (accountPassword !== accountPasswordConfirm) {
      return redirectWithFeedback(request, next, {
        error: "password_mismatch",
      });
    }

    const result = await changeMakerPasswordForUser({
      userId: currentSessionUser.id,
      currentPassword,
      nextPassword: accountPassword,
    });

    if (result.status === "invalid_current_password") {
      return redirectWithFeedback(request, next, {
        error: "invalid_current_password",
      });
    }

    if (result.status !== "ok") {
      return redirectWithFeedback(request, next, {
        error: "account_not_found",
      });
    }

    return redirectWithFeedback(request, next, {
      notice: "password_changed",
    });
  }

  if (authProvider === "supabase") {
    return redirectToMakerAccess(request, next, "temporary_login_disabled", "login");
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
    ? await makerAuthGateway.findUserByDisplayName(displayName)
    : null;
  const nextUserId = recoveryKey || currentSessionUser?.id || matchedMaker?.id;
  const user = createMakerUser(displayName, nextUserId);
  await makerAuthGateway.upsertUser(user);

  const response = await buildLoginSuccessResponse(request, next, gatePassword);
  applyLocalMakerUserCookie(response, user);
  return response;
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

  if (getMakerAuthProviderConfig().provider === "supabase") {
    const supabase = createSupabaseRouteHandlerClient(request, response);
    await supabase.auth.signOut();
  }

  response.cookies.delete(MAKER_ACCESS_COOKIE_NAME);
  response.cookies.delete(MAKER_USER_COOKIE_NAME);
  return response;
}
