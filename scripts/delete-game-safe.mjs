#!/usr/bin/env node

/**
 * 게임과 연결된 세션/자산을 백업 후 안전하게 삭제하는 운영 스크립트.
 * 기본 실행은 dry-run이며, `--apply`를 붙여야 실제 삭제를 반영한다.
 *
 * Usage:
 *   node scripts/delete-game-safe.mjs <gameId>
 *   node scripts/delete-game-safe.mjs <gameId> --apply
 */

import {
  backupGameSnapshot,
  backupSessionSnapshot,
  deleteGameAssetPrefix,
  getAdminOpsContext,
  listSessionsByGameId,
  loadGameSnapshot,
  parseCliArgs,
  printJson,
} from "./lib/admin-operations.mjs";

/**
 * 사용법을 출력한다.
 */
function printUsage() {
  console.log("Usage: node scripts/delete-game-safe.mjs <gameId> [--apply]");
}

async function main() {
  const { positional, apply, help } = parseCliArgs(process.argv.slice(2));

  if (help) {
    printUsage();
    return;
  }

  const [gameId] = positional;
  if (!gameId) {
    printUsage();
    process.exit(1);
  }

  const { supabase, env } = getAdminOpsContext();
  const snapshot = await loadGameSnapshot(supabase, gameId.trim());

  if (!snapshot.game) {
    throw new Error(`Game not found: ${gameId}`);
  }

  const sessions = await listSessionsByGameId(supabase, snapshot.game.id);
  const sessionSummary = sessions.map((session) => ({
    id: session.id,
    code: session.session_code,
    name: session.session_json?.sessionName ?? null,
    phase: session.phase,
    hostUserId: session.host_user_id,
  }));

  if (!apply) {
    printJson({
      mode: "dry-run",
      game: {
        id: snapshot.game.id,
        title: snapshot.game.title,
        ownerId: snapshot.game.owner_id,
        visibility: snapshot.game.visibility,
      },
      sessionCount: sessions.length,
      sessions: sessionSummary,
      note: "Run again with --apply to backup and delete this game.",
    });
    return;
  }

  const gameBackupLocation = await backupGameSnapshot(supabase, env, snapshot, "pre-safe-delete");
  const sessionBackupLocations = [];

  for (const session of sessions) {
    const backupLocation = await backupSessionSnapshot(supabase, env, session, "pre-game-delete");
    sessionBackupLocations.push({
      sessionId: session.id,
      backupLocation,
    });
  }

  const deletedAssetCount = await deleteGameAssetPrefix(supabase, env, snapshot.game.id);
  const { error: deleteGameError } = await supabase
    .from("games")
    .delete()
    .eq("id", snapshot.game.id);

  if (deleteGameError) {
    throw new Error(`Failed to delete game: ${deleteGameError.message}`);
  }

  printJson({
    mode: "apply",
    deleted: true,
    game: {
      id: snapshot.game.id,
      title: snapshot.game.title,
    },
    gameBackupLocation,
    deletedAssetCount,
    deletedSessionCount: sessions.length,
    sessionBackupLocations,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
