#!/usr/bin/env node

/**
 * 스모크 테스트 계정과 해당 계정이 남긴 게임/세션을 정리하는 운영 스크립트.
 * 기본 실행은 dry-run이며, `--apply`를 붙여야 실제 삭제를 반영한다.
 *
 * Usage:
 *   node scripts/cleanup-smoke-users.mjs
 *   node scripts/cleanup-smoke-users.mjs --apply
 */

import {
  backupGameSnapshot,
  backupSessionSnapshot,
  deleteGameAssetPrefix,
  getAdminOpsContext,
  listAllAuthUsers,
  listGamesByOwnerIds,
  listSessionsByGameId,
  listSessionsByHostUserIds,
  loadGameSnapshot,
  parseCliArgs,
  printJson,
} from "./lib/admin-operations.mjs";

/**
 * 사용법을 출력한다.
 */
function printUsage() {
  console.log("Usage: node scripts/cleanup-smoke-users.mjs [--apply]");
}

/**
 * auth email 또는 프로필 표시명이 스모크 테스트 계정 패턴인지 판별한다.
 *
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
function startsWithSmoke(value) {
  return String(value || "").trim().toLowerCase().startsWith("smoke");
}

/**
 * profiles/auth.users 를 합쳐 삭제 후보 계정을 고른다.
 *
 * @param {any[]} profiles
 * @param {any[]} authUsers
 * @returns {Array<{ id: string, loginId: string | null, displayName: string | null, email: string | null }>}
 */
function collectSmokeTargets(profiles, authUsers) {
  const authById = new Map(authUsers.map((user) => [user.id, user]));
  const targetIds = new Set();

  for (const profile of profiles) {
    const authUser = authById.get(profile.id);
    const authEmail = authUser?.email ?? null;
    const isSmokeProfile = startsWithSmoke(profile.login_id) || startsWithSmoke(profile.display_name);
    const isSmokeEmail = authEmail?.endsWith("@makers.local") && startsWithSmoke(authEmail.split("@")[0]);

    if (isSmokeProfile || isSmokeEmail) {
      targetIds.add(profile.id);
    }
  }

  for (const authUser of authUsers) {
    const authEmail = authUser.email ?? "";
    const localPart = authEmail.split("@")[0];
    if (authEmail.endsWith("@makers.local") && startsWithSmoke(localPart)) {
      targetIds.add(authUser.id);
    }
  }

  return [...targetIds].map((id) => {
    const profile = profiles.find((item) => item.id === id) ?? null;
    const authUser = authById.get(id) ?? null;

    return {
      id,
      loginId: profile?.login_id ?? null,
      displayName: profile?.display_name ?? authUser?.user_metadata?.display_name ?? null,
      email: authUser?.email ?? null,
    };
  });
}

async function main() {
  const { positional, apply, help } = parseCliArgs(process.argv.slice(2));

  if (help) {
    printUsage();
    return;
  }

  if (positional.length > 0) {
    printUsage();
    process.exit(1);
  }

  const { supabase, env } = getAdminOpsContext();
  const [{ data: profiles, error: profilesError }, authUsers] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    listAllAuthUsers(supabase),
  ]);

  if (profilesError) {
    throw new Error(`Failed to list profiles: ${profilesError.message}`);
  }

  const targets = collectSmokeTargets(profiles ?? [], authUsers);
  const targetIds = targets.map((target) => target.id);
  const ownedGames = await listGamesByOwnerIds(supabase, targetIds);
  const hostedSessions = await listSessionsByHostUserIds(supabase, targetIds);

  const gameIdsOwnedByTargets = new Set(ownedGames.map((game) => game.id));
  const orphanHostedSessions = hostedSessions.filter((session) => !gameIdsOwnedByTargets.has(session.game_id));

  if (!apply) {
    printJson({
      mode: "dry-run",
      targetCount: targets.length,
      targets,
      ownedGameCount: ownedGames.length,
      ownedGames: ownedGames.map((game) => ({
        id: game.id,
        title: game.title,
        ownerId: game.owner_id,
      })),
      orphanHostedSessionCount: orphanHostedSessions.length,
      orphanHostedSessions: orphanHostedSessions.map((session) => ({
        id: session.id,
        gameId: session.game_id,
        sessionCode: session.session_code,
      })),
      note: "Run again with --apply to backup and delete these smoke users.",
    });
    return;
  }

  const deletedGames = [];
  for (const game of ownedGames) {
    const snapshot = await loadGameSnapshot(supabase, game.id);
    const gameBackupLocation = await backupGameSnapshot(supabase, env, snapshot, "pre-smoke-cleanup");
    const sessions = await listSessionsByGameId(supabase, game.id);
    const sessionBackups = [];

    for (const session of sessions) {
      const backupLocation = await backupSessionSnapshot(supabase, env, session, "pre-smoke-game-delete");
      sessionBackups.push({
        sessionId: session.id,
        backupLocation,
      });
    }

    const deletedAssetCount = await deleteGameAssetPrefix(supabase, env, game.id);
    const { error: deleteGameError } = await supabase
      .from("games")
      .delete()
      .eq("id", game.id);

    if (deleteGameError) {
      throw new Error(`Failed to delete smoke game "${game.id}": ${deleteGameError.message}`);
    }

    deletedGames.push({
      gameId: game.id,
      title: game.title,
      gameBackupLocation,
      deletedAssetCount,
      deletedSessionCount: sessions.length,
      sessionBackups,
    });
  }

  const deletedSessions = [];
  for (const session of orphanHostedSessions) {
    const backupLocation = await backupSessionSnapshot(supabase, env, session, "pre-smoke-session-delete");
    const { error: deleteSessionError } = await supabase
      .from("sessions")
      .delete()
      .eq("id", session.id);

    if (deleteSessionError) {
      throw new Error(`Failed to delete smoke session "${session.id}": ${deleteSessionError.message}`);
    }

    deletedSessions.push({
      sessionId: session.id,
      sessionCode: session.session_code,
      backupLocation,
    });
  }

  const deletedUsers = [];
  for (const target of targets) {
    const { error } = await supabase.auth.admin.deleteUser(target.id);
    if (error) {
      throw new Error(`Failed to delete smoke auth user "${target.id}": ${error.message}`);
    }

    deletedUsers.push(target);
  }

  printJson({
    mode: "apply",
    deletedUserCount: deletedUsers.length,
    deletedUsers,
    deletedGameCount: deletedGames.length,
    deletedGames,
    deletedOrphanHostedSessionCount: deletedSessions.length,
    deletedOrphanHostedSessions: deletedSessions,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
