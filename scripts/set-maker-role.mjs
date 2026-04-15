#!/usr/bin/env node

/**
 * 메이커 계정 role을 `creator` 또는 `admin`으로 바꾸는 운영 스크립트.
 * `profiles.role` 을 Supabase 에서 직접 갱신한다.
 *
 * Usage:
 *   node scripts/set-maker-role.mjs <loginId> <role>
 *   node scripts/set-maker-role.mjs <loginId> admin
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const ROOT_DIR = process.cwd();

/**
 * 간단한 `.env` 파일을 읽어 키/값 맵으로 바꾼다.
 * 현재 스크립트는 프로젝트 루트 `.env`만 기준으로 삼는다.
 */
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

/** 입력 role을 현재 지원 값으로 정규화한다. */
function normalizeRole(value) {
  return value === "admin" ? "admin" : "creator";
}

/** 로그인 ID를 저장/비교용 형태로 정리한다. */
function normalizeLoginId(value) {
  return String(value || "").trim().toLowerCase();
}

/** Supabase profiles.role 을 갱신한다. */
async function updateSupabaseMakerRole(env, loginId, role) {
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
    .update({
      role,
      updated_at: new Date().toISOString(),
    })
    .eq("login_id", loginId)
    .select("id,display_name,login_id,role")
    .maybeSingle();

  if (profileError) {
    throw new Error(`Failed to update Supabase maker role: ${profileError.message}`);
  }

  if (!profile) {
    throw new Error(`No Supabase maker profile found for login ID "${loginId}".`);
  }

  return {
    userId: profile.id,
    displayName: profile.display_name,
    loginId: profile.login_id,
    role: profile.role,
  };
}

async function main() {
  const loginIdArg = process.argv[2];
  const roleArg = process.argv[3];

  if (!loginIdArg || !roleArg) {
    console.error("Usage: node scripts/set-maker-role.mjs <loginId> <role>");
    process.exit(1);
  }

  const loginId = normalizeLoginId(loginIdArg);
  const role = normalizeRole(roleArg);
  if (!loginId) {
    console.error("loginId is required.");
    process.exit(1);
  }

  const env = parseEnvFile(path.join(ROOT_DIR, ".env"));
  const result = await updateSupabaseMakerRole(env, loginId, role);

  console.log(`loginId: ${result.loginId}`);
  console.log(`displayName: ${result.displayName}`);
  console.log(`userId: ${result.userId}`);
  console.log(`role: ${result.role}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
