#!/usr/bin/env node

/**
 * 내부 운영용 비밀번호 재설정 링크 생성 스크립트.
 * 가입 때 복구 이메일을 넣지 않은 계정도 응급 복구할 수 있게 별도 링크를 발급한다.
 *
 * Usage:
 *   node scripts/create-maker-password-reset-link.mjs <loginId> [origin]
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const ROOT_DIR = process.cwd();
const LOCAL_MAKER_ACCOUNTS_PATH = path.join(ROOT_DIR, "data", "makers", "accounts.json");
const LOCAL_PASSWORD_RESET_TOKENS_PATH = path.join(
  ROOT_DIR,
  "data",
  "makers",
  "password-reset-tokens.json"
);
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60;

/** 간단한 `.env` 형식 파일을 읽어 키/값 맵으로 변환한다. */
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const delimiterIndex = line.indexOf("=");
        const key = line.slice(0, delimiterIndex).trim();
        let value = line.slice(delimiterIndex + 1).trim();
        if (
          (value.startsWith("\"") && value.endsWith("\""))
          || (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value];
      })
  );
}

/** 로그인 ID 비교용 정규화. */
function normalizeLoginId(value) {
  return value.trim().toLowerCase();
}

/** 원문 토큰을 저장용 해시로 바꾼다. */
function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/** 재설정 URL을 만든다. */
function buildResetUrl(origin, rawToken) {
  const url = new URL("/maker-access", origin);
  url.searchParams.set("mode", "reset");
  url.searchParams.set("token", rawToken);
  return url.toString();
}

/** 로컬 JSON 배열 파일을 읽는다. */
function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 로컬 JSON 배열 파일을 저장한다. */
function writeJsonArray(filePath, items) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2), "utf8");
}

async function createSupabaseResetLink(env, loginId, origin) {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
  const supabaseSecretKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Missing Supabase env. Set NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  const adminClient = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id,display_name,login_id,recovery_email")
    .eq("login_id", loginId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Failed to load maker profile: ${profileError.message}`);
  }

  if (!profile) {
    throw new Error(`No maker account found for login ID "${loginId}".`);
  }

  const now = new Date().toISOString();
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const record = {
    id: crypto.randomUUID(),
    user_id: profile.id,
    token_hash: hashToken(rawToken),
    requested_email: (profile.recovery_email || "").trim().toLowerCase(),
    expires_at: new Date(Date.parse(now) + PASSWORD_RESET_TTL_MS).toISOString(),
    used_at: null,
    created_at: now,
  };

  const { error: invalidateError } = await adminClient
    .from("maker_password_reset_tokens")
    .update({ used_at: now })
    .eq("user_id", profile.id)
    .is("used_at", null)
    .gt("expires_at", now);

  if (invalidateError) {
    throw new Error(`Failed to invalidate old reset tokens: ${invalidateError.message}`);
  }

  const { error: insertError } = await adminClient
    .from("maker_password_reset_tokens")
    .insert(record);

  if (insertError) {
    throw new Error(`Failed to store reset token: ${insertError.message}`);
  }

  return {
    account: profile,
    url: buildResetUrl(origin, rawToken),
  };
}

function createLocalResetLink(loginId, origin) {
  const accounts = readJsonArray(LOCAL_MAKER_ACCOUNTS_PATH);
  const account = accounts.find((item) => normalizeLoginId(item.loginId || "") === loginId);
  if (!account) {
    throw new Error(`No maker account found for login ID "${loginId}".`);
  }

  const now = new Date().toISOString();
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const nextTokens = readJsonArray(LOCAL_PASSWORD_RESET_TOKENS_PATH).map((record) => (
    record.userId === account.id && !record.usedAt && Date.parse(record.expiresAt) > Date.parse(now)
      ? { ...record, usedAt: now }
      : record
  ));

  nextTokens.unshift({
    id: crypto.randomUUID(),
    userId: account.id,
    tokenHash: hashToken(rawToken),
    requestedEmail: (account.recoveryEmail || "").trim().toLowerCase(),
    expiresAt: new Date(Date.parse(now) + PASSWORD_RESET_TTL_MS).toISOString(),
    usedAt: null,
    createdAt: now,
  });
  writeJsonArray(LOCAL_PASSWORD_RESET_TOKENS_PATH, nextTokens);

  return {
    account,
    url: buildResetUrl(origin, rawToken),
  };
}

async function main() {
  const loginIdArg = process.argv[2];
  if (!loginIdArg) {
    console.error("Usage: node scripts/create-maker-password-reset-link.mjs <loginId> [origin]");
    process.exit(1);
  }

  const env = parseEnvFile(path.join(ROOT_DIR, ".env"));
  const loginId = normalizeLoginId(loginIdArg);
  const origin = (
    process.argv[3]
    || env.MAKER_RECOVERY_BASE_URL
    || env.APP_BASE_URL
    || "http://127.0.0.1:3000"
  ).trim();
  const provider = (env.MAKER_AUTH_PROVIDER || "local").trim().toLowerCase();
  const result = provider === "supabase"
    ? await createSupabaseResetLink(env, loginId, origin)
    : createLocalResetLink(loginId, origin);

  console.log(`displayName: ${result.account.display_name || result.account.displayName}`);
  console.log(`loginId: ${result.account.login_id || result.account.loginId}`);
  console.log(`recoveryEmail: ${(result.account.recovery_email || result.account.recoveryEmail || "").trim() || "미등록"}`);
  console.log(`resetUrl: ${result.url}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
