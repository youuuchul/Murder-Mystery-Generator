import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Resend } from "resend";
import {
  isValidMakerAccountPassword,
  isValidMakerRecoveryEmail,
  maskMakerRecoveryEmail,
  normalizeMakerLoginId,
  normalizeMakerRecoveryEmail,
} from "@/lib/maker-account";
import { getMakerAuthGateway } from "@/lib/maker-auth-gateway";
import { getMakerAuthProviderConfig } from "@/lib/maker-auth-config";
import {
  buildSupabaseMakerEmail,
  createSupabaseMakerAuthAdminClient,
} from "@/lib/supabase/maker-auth";

const LOCAL_MAKER_DATA_DIR = path.join(process.cwd(), "data", "makers");
const LOCAL_PASSWORD_RESET_TOKENS_PATH = path.join(
  LOCAL_MAKER_DATA_DIR,
  "password-reset-tokens.json"
);
const MAKER_PASSWORD_RESET_TTL_MS = 1000 * 60 * 60;

interface MakerPasswordResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  requestedEmail: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export type MakerPasswordResetRequestResult =
  | {
    status: "sent";
    maskedRecoveryEmail: string;
  }
  | {
    status: "unknown_login_id" | "missing_recovery_email" | "delivery_unavailable";
  };

export type MakerPasswordResetPreviewResult =
  | {
    status: "ready";
    displayName: string;
    loginId: string;
    recoveryEmail: string | null;
    expiresAt: string;
  }
  | {
    status: "invalid" | "expired" | "used";
  };

interface CreateMakerPasswordResetTokenOptions {
  userId: string;
  requestedEmail?: string;
  now?: string;
}

interface ResolveMakerRecoveryEmailConfigOptions {
  requestOrigin?: string;
}

interface MakerRecoveryEmailConfig {
  apiKey: string;
  fromEmail: string;
  baseUrl: string;
}

const makerAuthGateway = getMakerAuthGateway();

/** 복구 토큰을 저장할 로컬 디렉터리를 보장한다. */
function ensureLocalMakerRecoveryDir(): void {
  if (!fs.existsSync(LOCAL_MAKER_DATA_DIR)) {
    fs.mkdirSync(LOCAL_MAKER_DATA_DIR, { recursive: true });
  }
}

/** 로컬 JSON 저장소에 쓰는 토큰 레코드를 현재 규칙에 맞게 정리한다. */
function normalizeLocalPasswordResetTokenRecord(
  record: MakerPasswordResetTokenRecord
): MakerPasswordResetTokenRecord {
  return {
    id: typeof record.id === "string" ? record.id.trim() : "",
    userId: typeof record.userId === "string" ? record.userId.trim() : "",
    tokenHash: typeof record.tokenHash === "string" ? record.tokenHash.trim() : "",
    requestedEmail: normalizeMakerRecoveryEmail(record.requestedEmail ?? ""),
    expiresAt: typeof record.expiresAt === "string" ? record.expiresAt : "",
    usedAt: typeof record.usedAt === "string" && record.usedAt ? record.usedAt : null,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
  };
}

/** 로컬 JSON 기반 재설정 토큰 목록을 읽는다. */
function listLocalPasswordResetTokens(): MakerPasswordResetTokenRecord[] {
  ensureLocalMakerRecoveryDir();
  if (!fs.existsSync(LOCAL_PASSWORD_RESET_TOKENS_PATH)) {
    return [];
  }

  try {
    const parsed = JSON.parse(
      fs.readFileSync(LOCAL_PASSWORD_RESET_TOKENS_PATH, "utf8")
    ) as MakerPasswordResetTokenRecord[];

    return Array.isArray(parsed)
      ? parsed
        .map(normalizeLocalPasswordResetTokenRecord)
        .filter((record) => Boolean(record.id) && Boolean(record.userId) && Boolean(record.tokenHash))
      : [];
  } catch {
    return [];
  }
}

/** 로컬 JSON 기반 재설정 토큰 목록을 파일에 저장한다. */
function saveLocalPasswordResetTokens(tokens: MakerPasswordResetTokenRecord[]): void {
  ensureLocalMakerRecoveryDir();
  fs.writeFileSync(
    LOCAL_PASSWORD_RESET_TOKENS_PATH,
    JSON.stringify(tokens, null, 2),
    "utf8"
  );
}

/** 원문 토큰을 DB/파일 비교용 해시로 바꾼다. */
function hashMakerPasswordResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/** 환경변수나 요청 헤더에서 받은 origin 문자열을 URL 로 정규화한다. */
function parseMakerRecoveryOrigin(origin: string | undefined): URL | null {
  const normalizedOrigin = origin?.trim();
  if (!normalizedOrigin) {
    return null;
  }

  try {
    return new URL(normalizedOrigin);
  } catch {
    return null;
  }
}

/** 로컬 개발용 origin 인지 확인한다. */
function isLocalMakerRecoveryOrigin(origin: URL | null): boolean {
  return origin?.hostname === "127.0.0.1"
    || origin?.hostname === "localhost";
}

/** 기본 `*.vercel.app` 주소인지 확인한다. */
function isVercelPreviewOrigin(origin: URL | null): boolean {
  return origin?.hostname.endsWith(".vercel.app") ?? false;
}

/**
 * 비밀번호 재설정 링크를 만들 때 쓸 base URL 을 정한다.
 * 커스텀 도메인에서 요청이 들어오면 예전에 남은 `*.vercel.app`
 * 환경변수보다 현재 도메인을 우선해 링크를 만든다.
 */
function resolveMakerRecoveryBaseUrl(requestOrigin?: string): string {
  const envOrigin = parseMakerRecoveryOrigin(
    process.env.MAKER_RECOVERY_BASE_URL
    ?? process.env.APP_BASE_URL
    ?? ""
  );
  const requestOriginUrl = parseMakerRecoveryOrigin(requestOrigin);

  if (
    requestOriginUrl
    && !isLocalMakerRecoveryOrigin(requestOriginUrl)
    && (
      !envOrigin
      || (
        isVercelPreviewOrigin(envOrigin)
        && !isVercelPreviewOrigin(requestOriginUrl)
      )
    )
  ) {
    return requestOriginUrl.origin;
  }

  if (envOrigin) {
    return envOrigin.origin;
  }

  return requestOriginUrl?.origin || "http://127.0.0.1:3000";
}

/** 현재 환경에서 비밀번호 재설정 메일 발송에 필요한 값을 읽는다. */
function resolveMakerRecoveryEmailConfig(
  options: ResolveMakerRecoveryEmailConfigOptions = {}
): MakerRecoveryEmailConfig | null {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL ?? "").trim();
  const baseUrl = resolveMakerRecoveryBaseUrl(options.requestOrigin);

  if (!apiKey || !fromEmail || !baseUrl) {
    return null;
  }

  return {
    apiKey,
    fromEmail,
    baseUrl,
  };
}

/** 현재 환경 설정으로 Resend SDK 클라이언트를 만든다. */
function createMakerRecoveryEmailClient(config: MakerRecoveryEmailConfig): Resend {
  return new Resend(config.apiKey);
}

/** 비밀번호 재설정 메일을 보낼 수 있는 최소 설정이 갖춰졌는지 검사한다. */
export function hasMakerRecoveryEmailDeliveryConfig(
  options: ResolveMakerRecoveryEmailConfigOptions = {}
): boolean {
  return Boolean(resolveMakerRecoveryEmailConfig(options));
}

/** 비밀번호 재설정 메일에서 사용할 링크를 만든다. */
export function buildMakerPasswordResetUrl(baseUrl: string, token: string): string {
  const url = new URL("/maker-access", baseUrl);
  url.searchParams.set("mode", "reset");
  url.searchParams.set("token", token);
  return url.toString();
}

/** 메일 HTML에 넣을 값을 최소한으로 이스케이프한다. */
function escapeMakerRecoveryHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

/** 새 재설정 토큰 레코드의 만료 시각을 계산한다. */
function buildMakerPasswordResetExpiry(now: string): string {
  return new Date(Date.parse(now) + MAKER_PASSWORD_RESET_TTL_MS).toISOString();
}

/** 같은 계정의 이전 미사용 토큰을 더 이상 쓰지 못하게 정리한다. */
async function invalidateExistingMakerPasswordResetTokens(
  userId: string,
  now: string
): Promise<void> {
  const config = getMakerAuthProviderConfig();

  if (config.provider === "supabase") {
    const adminClient = createSupabaseMakerAuthAdminClient(config);
    const { error } = await adminClient
      .from("maker_password_reset_tokens")
      .update({ used_at: now })
      .eq("user_id", userId)
      .is("used_at", null)
      .gt("expires_at", now);

    if (error) {
      throw new Error(`Failed to invalidate existing reset tokens: ${error.message}`);
    }

    return;
  }

  const nextTokens = listLocalPasswordResetTokens().map((record) => (
    record.userId === userId
      && !record.usedAt
      && Date.parse(record.expiresAt) > Date.parse(now)
      ? { ...record, usedAt: now }
      : record
  ));
  saveLocalPasswordResetTokens(nextTokens);
}

/** 새 재설정 토큰을 저장하고 메일/내부 링크 생성에 쓸 원문 토큰을 돌려준다. */
export async function createMakerPasswordResetToken(
  options: CreateMakerPasswordResetTokenOptions
): Promise<{ rawToken: string; record: MakerPasswordResetTokenRecord }> {
  const now = options.now ?? new Date().toISOString();
  const userId = options.userId.trim();
  const requestedEmail = normalizeMakerRecoveryEmail(options.requestedEmail ?? "");
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const record: MakerPasswordResetTokenRecord = {
    id: crypto.randomUUID(),
    userId,
    tokenHash: hashMakerPasswordResetToken(rawToken),
    requestedEmail,
    expiresAt: buildMakerPasswordResetExpiry(now),
    usedAt: null,
    createdAt: now,
  };

  if (!userId) {
    throw new Error("Cannot create password reset token without a user id.");
  }

  await invalidateExistingMakerPasswordResetTokens(userId, now);

  const config = getMakerAuthProviderConfig();
  if (config.provider === "supabase") {
    const adminClient = createSupabaseMakerAuthAdminClient(config);
    const { error } = await adminClient.from("maker_password_reset_tokens").insert({
      id: record.id,
      user_id: record.userId,
      token_hash: record.tokenHash,
      requested_email: record.requestedEmail,
      expires_at: record.expiresAt,
      used_at: record.usedAt,
      created_at: record.createdAt,
    });

    if (error) {
      throw new Error(`Failed to store password reset token: ${error.message}`);
    }

    return { rawToken, record };
  }

  const nextTokens = listLocalPasswordResetTokens()
    .concat(record)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  saveLocalPasswordResetTokens(nextTokens);
  return { rawToken, record };
}

/** 해시 기준으로 저장된 재설정 토큰 레코드를 읽는다. */
async function getMakerPasswordResetTokenRecord(
  rawToken: string
): Promise<MakerPasswordResetTokenRecord | null> {
  const tokenHash = hashMakerPasswordResetToken(rawToken);
  const config = getMakerAuthProviderConfig();

  if (config.provider === "supabase") {
    const adminClient = createSupabaseMakerAuthAdminClient(config);
    const { data, error } = await adminClient
      .from("maker_password_reset_tokens")
      .select("id,user_id,token_hash,requested_email,expires_at,used_at,created_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load password reset token: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return normalizeLocalPasswordResetTokenRecord({
      id: data.id,
      userId: data.user_id,
      tokenHash: data.token_hash,
      requestedEmail: data.requested_email,
      expiresAt: data.expires_at,
      usedAt: data.used_at,
      createdAt: data.created_at,
    });
  }

  return listLocalPasswordResetTokens().find((record) => record.tokenHash === tokenHash) ?? null;
}

/** 사용이 끝난 재설정 토큰을 재사용 불가 상태로 바꾼다. */
async function consumeMakerPasswordResetToken(rawToken: string, usedAt: string): Promise<void> {
  const tokenHash = hashMakerPasswordResetToken(rawToken);
  const config = getMakerAuthProviderConfig();

  if (config.provider === "supabase") {
    const adminClient = createSupabaseMakerAuthAdminClient(config);
    const { error } = await adminClient
      .from("maker_password_reset_tokens")
      .update({ used_at: usedAt })
      .eq("token_hash", tokenHash)
      .is("used_at", null);

    if (error) {
      throw new Error(`Failed to consume password reset token: ${error.message}`);
    }

    return;
  }

  const nextTokens = listLocalPasswordResetTokens().map((record) => (
    record.tokenHash === tokenHash && !record.usedAt
      ? { ...record, usedAt }
      : record
  ));
  saveLocalPasswordResetTokens(nextTokens);
}

/** 재설정 토큰이 아직 유효한지 상태를 계산한다. */
function resolveMakerPasswordResetTokenStatus(
  record: MakerPasswordResetTokenRecord | null,
  now: string
): "invalid" | "expired" | "used" | "ready" {
  if (!record) {
    return "invalid";
  }

  if (record.usedAt) {
    return "used";
  }

  if (Date.parse(record.expiresAt) <= Date.parse(now)) {
    return "expired";
  }

  return "ready";
}

/** 현재 계정 설정으로 비밀번호 재설정 메일을 발송한다. */
async function sendMakerPasswordResetEmail(options: {
  displayName: string;
  loginId: string;
  recoveryEmail: string;
  resetUrl: string;
}): Promise<void> {
  const config = resolveMakerRecoveryEmailConfig();
  if (!config) {
    throw new Error("Password reset email delivery is not configured.");
  }

  const safeDisplayName = escapeMakerRecoveryHtml(options.displayName);
  const safeLoginId = escapeMakerRecoveryHtml(options.loginId);
  const safeResetUrl = escapeMakerRecoveryHtml(options.resetUrl);
  const resend = createMakerRecoveryEmailClient(config);

  const html = [
    `<div style="background:#0b0b0f;color:#f5efe8;padding:32px;font-family:Inter,Arial,sans-serif;">`,
    `<div style="max-width:560px;margin:0 auto;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:28px;background:#141319;">`,
    `<p style="margin:0 0 12px;color:#e58c83;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;">Murder Mystery Maker</p>`,
    `<h1 style="margin:0 0 16px;font-size:28px;line-height:1.25;">비밀번호를 다시 설정할 수 있어요</h1>`,
    `<p style="margin:0 0 12px;color:#d4c5bd;line-height:1.7;">${safeDisplayName} 작업자의 로그인 ID는 <strong>${safeLoginId}</strong> 입니다.</p>`,
    `<p style="margin:0 0 20px;color:#d4c5bd;line-height:1.7;">아래 버튼을 열어 새 비밀번호를 정해주세요. 링크는 1시간 동안만 사용할 수 있습니다.</p>`,
    `<p style="margin:0 0 20px;"><a href="${safeResetUrl}" style="display:inline-block;background:#b63f34;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:600;">새 비밀번호 설정</a></p>`,
    `<p style="margin:0;color:#9c8c84;line-height:1.7;word-break:break-all;">버튼이 열리지 않으면 아래 주소를 직접 열어주세요.<br />${safeResetUrl}</p>`,
    `</div>`,
    `</div>`,
  ].join("");
  const text = [
    `${options.displayName} 작업자의 비밀번호를 다시 설정할 수 있습니다.`,
    `로그인 ID: ${options.loginId}`,
    `아래 주소를 열어 새 비밀번호를 정해주세요. 링크는 1시간 동안만 사용할 수 있습니다.`,
    options.resetUrl,
  ].join("\n\n");

  const { error } = await resend.emails.send({
    from: config.fromEmail,
    to: [options.recoveryEmail],
    subject: "비밀번호 재설정 안내",
    html,
    text,
  });

  if (error) {
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
}

/**
 * 로그인 ID 기준으로 비밀번호 재설정 메일을 요청한다.
 * 복구 이메일이 없는 계정은 여기서 명시적으로 막아 사용자가 원인을 알 수 있게 한다.
 */
export async function requestMakerPasswordReset(options: {
  loginId: string;
  requestOrigin: string;
  now?: string;
}): Promise<MakerPasswordResetRequestResult> {
  const now = options.now ?? new Date().toISOString();
  const loginId = normalizeMakerLoginId(options.loginId);
  const account = await makerAuthGateway.findAccountByLoginId(loginId);

  if (!account) {
    return { status: "unknown_login_id" };
  }

  const recoveryEmail = normalizeMakerRecoveryEmail(account.recoveryEmail ?? "");
  if (!recoveryEmail) {
    return { status: "missing_recovery_email" };
  }

  const emailConfig = resolveMakerRecoveryEmailConfig({ requestOrigin: options.requestOrigin });
  if (!emailConfig) {
    return { status: "delivery_unavailable" };
  }

  const { rawToken } = await createMakerPasswordResetToken({
    userId: account.id,
    requestedEmail: recoveryEmail,
    now,
  });
  const resetUrl = buildMakerPasswordResetUrl(emailConfig.baseUrl, rawToken);

  await sendMakerPasswordResetEmail({
    displayName: account.displayName,
    loginId: account.loginId,
    recoveryEmail,
    resetUrl,
  });

  return {
    status: "sent",
    maskedRecoveryEmail: maskMakerRecoveryEmail(recoveryEmail),
  };
}

/** 재설정 링크가 아직 유효한지 화면 렌더 전에 미리 확인한다. */
export async function previewMakerPasswordResetToken(
  rawToken: string,
  now = new Date().toISOString()
): Promise<MakerPasswordResetPreviewResult> {
  const record = await getMakerPasswordResetTokenRecord(rawToken);
  const tokenStatus = resolveMakerPasswordResetTokenStatus(record, now);

  if (tokenStatus !== "ready" || !record) {
    return {
      status:
        tokenStatus === "expired"
          ? "expired"
          : tokenStatus === "used"
            ? "used"
            : "invalid",
    };
  }

  const account = await makerAuthGateway.getAccountById(record.userId);
  if (!account) {
    return { status: "invalid" };
  }

  return {
    status: "ready",
    displayName: account.displayName,
    loginId: account.loginId,
    recoveryEmail: record.requestedEmail || account.recoveryEmail || null,
    expiresAt: record.expiresAt,
  };
}

/** 재설정 링크로 새 비밀번호를 저장하고 토큰을 즉시 소모한다. */
export async function completeMakerPasswordReset(options: {
  token: string;
  nextPassword: string;
  now?: string;
}): Promise<"ok" | "invalid" | "expired" | "used"> {
  const now = options.now ?? new Date().toISOString();
  if (!isValidMakerAccountPassword(options.nextPassword)) {
    throw new Error("Password reset requires a valid next password.");
  }

  const record = await getMakerPasswordResetTokenRecord(options.token);
  const tokenStatus = resolveMakerPasswordResetTokenStatus(record, now);
  if (tokenStatus !== "ready" || !record) {
    return tokenStatus === "expired"
      ? "expired"
      : tokenStatus === "used"
        ? "used"
        : "invalid";
  }

  const updated = await makerAuthGateway.updateAccountPassword(
    record.userId,
    options.nextPassword,
    now
  );
  if (!updated) {
    return "invalid";
  }

  await consumeMakerPasswordResetToken(options.token, now);
  return "ok";
}

/** 로그인된 작업자의 복구 이메일을 저장한다. 빈 값이면 복구 기능을 끈다. */
export async function updateMakerRecoveryEmailForUser(options: {
  userId: string;
  recoveryEmail?: string;
  now?: string;
}) {
  const normalizedRecoveryEmail = normalizeMakerRecoveryEmail(options.recoveryEmail ?? "");
  if (!isValidMakerRecoveryEmail(normalizedRecoveryEmail)) {
    return { status: "invalid_email" as const };
  }

  const account = await makerAuthGateway.updateAccountProfile({
    userId: options.userId,
    recoveryEmail: normalizedRecoveryEmail,
    now: options.now ?? new Date().toISOString(),
  });

  if (!account) {
    return { status: "account_missing" as const };
  }

  return {
    status: "ok" as const,
    account,
  };
}

/** 로그인된 작업자의 비밀번호를 현재 비밀번호 확인 후 변경한다. */
export async function changeMakerPasswordForUser(options: {
  userId: string;
  currentPassword: string;
  nextPassword: string;
  now?: string;
}) {
  if (!isValidMakerAccountPassword(options.nextPassword)) {
    return { status: "invalid_password" as const };
  }

  const account = await makerAuthGateway.getAccountById(options.userId);
  if (!account) {
    return { status: "account_missing" as const };
  }

  const authenticatedAccount = await makerAuthGateway.authenticateAccount(
    account.loginId,
    options.currentPassword
  );
  if (!authenticatedAccount) {
    return { status: "invalid_current_password" as const };
  }

  const updated = await makerAuthGateway.updateAccountPassword(
    account.id,
    options.nextPassword,
    options.now ?? new Date().toISOString()
  );

  return {
    status: updated ? "ok" as const : "account_missing" as const,
  };
}

/**
 * 내부 운영용으로 재설정 링크를 바로 발급한다.
 * 메일이 없는 계정도 응급 복구가 가능하도록 별도 스크립트에서 사용한다.
 */
export async function createMakerPasswordResetLinkForLoginId(options: {
  loginId: string;
  requestOrigin?: string;
  now?: string;
}) {
  const loginId = normalizeMakerLoginId(options.loginId);
  const account = await makerAuthGateway.findAccountByLoginId(loginId);

  if (!account) {
    return null;
  }

  const { rawToken, record } = await createMakerPasswordResetToken({
    userId: account.id,
    requestedEmail: account.recoveryEmail ?? "",
    now: options.now,
  });

  return {
    account,
    requestedEmail: record.requestedEmail || null,
    url: buildMakerPasswordResetUrl(
      resolveMakerRecoveryBaseUrl(options.requestOrigin),
      rawToken
    ),
  };
}

/** 스크립트/안내에서 현재 재설정 메일 발송이 가능한지 설명할 때 쓴다. */
export function getMakerRecoveryEmailDeliverySummary(
  options: ResolveMakerRecoveryEmailConfigOptions = {}
): string {
  const config = resolveMakerRecoveryEmailConfig(options);
  if (!config) {
    return "비밀번호 재설정 메일 발송 설정이 아직 준비되지 않았습니다.";
  }

  return `비밀번호 재설정 메일은 ${config.fromEmail} 주소로 발송됩니다.`;
}

/** 응급 복구용 링크 생성 전에 현재 계정에 메일이 등록됐는지 간단히 표시한다. */
export function describeMakerRecoveryEmail(value: string | null | undefined): string {
  const normalizedEmail = normalizeMakerRecoveryEmail(value ?? "");
  return normalizedEmail ? maskMakerRecoveryEmail(normalizedEmail) : "미등록";
}

/** 응급 복구 스크립트에서도 동일한 내부 로그인용 이메일 규칙을 재사용한다. */
export function buildMakerEmergencyRecoveryEmail(loginId: string): string {
  return buildSupabaseMakerEmail(loginId);
}
