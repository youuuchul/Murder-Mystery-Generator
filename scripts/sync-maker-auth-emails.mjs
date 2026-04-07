#!/usr/bin/env node

/**
 * profiles.recovery_email 과 auth.users.email 을 현재 규칙으로 동기화하는 운영 스크립트.
 * 복구 이메일이 있으면 그 값을 auth email로 쓰고, 없으면 내부 makers.local 주소를 쓴다.
 * 기본 실행은 dry-run이며, `--apply`를 붙여야 실제 변경을 반영한다.
 *
 * Usage:
 *   node scripts/sync-maker-auth-emails.mjs
 *   node scripts/sync-maker-auth-emails.mjs <loginId>
 *   node scripts/sync-maker-auth-emails.mjs --apply
 *   node scripts/sync-maker-auth-emails.mjs <loginId> --apply
 */

import {
  getAdminOpsContext,
  listAllAuthUsers,
  parseCliArgs,
  printJson,
} from "./lib/admin-operations.mjs";

/**
 * 사용법을 출력한다.
 */
function printUsage() {
  console.log("Usage: node scripts/sync-maker-auth-emails.mjs [loginId] [--apply]");
}

/**
 * 로그인 ID를 내부 저장/비교용 형태로 정리한다.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeLoginId(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * 복구 이메일을 내부 저장/비교용 형태로 정리한다.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeRecoveryEmail(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * 복구 이메일이 없을 때 쓰는 내부 로그인용 auth email을 만든다.
 *
 * @param {string} loginId
 * @returns {string}
 */
function buildInternalAuthEmail(loginId) {
  return `${normalizeLoginId(loginId)}@makers.local`;
}

/**
 * 복구 이메일이 있으면 그 값을, 없으면 내부 로그인용 이메일을 반환한다.
 *
 * @param {any} profile
 * @returns {string}
 */
function resolveExpectedAuthEmail(profile) {
  const recoveryEmail = normalizeRecoveryEmail(profile?.recovery_email || "");
  return recoveryEmail || buildInternalAuthEmail(profile.login_id);
}

async function main() {
  const { positional, apply, help } = parseCliArgs(process.argv.slice(2));

  if (help) {
    printUsage();
    return;
  }

  if (positional.length > 1) {
    printUsage();
    process.exit(1);
  }

  const loginIdFilter = positional[0]?.trim().toLowerCase() || null;
  const { supabase } = getAdminOpsContext();
  const [{ data: profiles, error: profilesError }, authUsers] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false }),
    listAllAuthUsers(supabase),
  ]);

  if (profilesError) {
    throw new Error(`Failed to list profiles: ${profilesError.message}`);
  }

  const authUserById = new Map(authUsers.map((user) => [user.id, user]));
  const targetProfiles = (profiles ?? []).filter((profile) => (
    loginIdFilter ? String(profile.login_id || "").trim().toLowerCase() === loginIdFilter : true
  ));

  const mismatches = targetProfiles.map((profile) => {
    const authUser = authUserById.get(profile.id) ?? null;
    const currentAuthEmail = String(authUser?.email || "").trim().toLowerCase() || null;
    const expectedAuthEmail = resolveExpectedAuthEmail(profile);

    return {
      id: profile.id,
      loginId: profile.login_id,
      displayName: profile.display_name,
      recoveryEmail: profile.recovery_email,
      currentAuthEmail,
      expectedAuthEmail,
      matches: currentAuthEmail === expectedAuthEmail,
    };
  }).filter((item) => item.matches === false);

  if (!apply) {
    printJson({
      mode: "dry-run",
      loginIdFilter,
      mismatchCount: mismatches.length,
      mismatches,
    });
    return;
  }

  const updated = [];
  for (const mismatch of mismatches) {
    const { error } = await supabase.auth.admin.updateUserById(mismatch.id, {
      email: mismatch.expectedAuthEmail,
      email_confirm: true,
    });

    if (error) {
      throw new Error(`Failed to sync auth email for "${mismatch.loginId}": ${error.message}`);
    }

    updated.push({
      id: mismatch.id,
      loginId: mismatch.loginId,
      previousAuthEmail: mismatch.currentAuthEmail,
      nextAuthEmail: mismatch.expectedAuthEmail,
    });
  }

  printJson({
    mode: "apply",
    loginIdFilter,
    updatedCount: updated.length,
    updated,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
