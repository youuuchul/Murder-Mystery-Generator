#!/usr/bin/env node

/**
 * 게임 소유권을 다른 작업자 로그인 ID로 안전하게 이관하는 운영 스크립트.
 * 기본 실행은 dry-run이며, `--apply`를 붙여야 실제 변경을 반영한다.
 *
 * Usage:
 *   node scripts/transfer-game-owner.mjs <gameId> <targetLoginId>
 *   node scripts/transfer-game-owner.mjs <gameId> <targetLoginId> --apply
 */

import {
  backupGameSnapshot,
  findProfileByLoginId,
  getAdminOpsContext,
  loadGameSnapshot,
  parseCliArgs,
  printJson,
} from "./lib/admin-operations.mjs";

/**
 * 사용법을 출력한다.
 */
function printUsage() {
  console.log("Usage: node scripts/transfer-game-owner.mjs <gameId> <targetLoginId> [--apply]");
}

/**
 * 게임 소유권 이전 전후 요약을 만든다.
 *
 * @param {any} game
 * @param {any | null} currentOwner
 * @param {any} targetProfile
 * @param {boolean} apply
 * @returns {Record<string, unknown>}
 */
function buildSummary(game, currentOwner, targetProfile, apply) {
  return {
    mode: apply ? "apply" : "dry-run",
    game: {
      id: game.id,
      title: game.title,
      visibility: game.visibility,
      currentOwnerId: game.owner_id,
      currentOwnerLoginId: currentOwner?.login_id ?? null,
      currentOwnerDisplayName: currentOwner?.display_name ?? null,
    },
    targetOwner: {
      id: targetProfile.id,
      loginId: targetProfile.login_id,
      displayName: targetProfile.display_name,
    },
  };
}

async function main() {
  const { positional, apply, help } = parseCliArgs(process.argv.slice(2));

  if (help) {
    printUsage();
    return;
  }

  const [gameId, targetLoginId] = positional;
  if (!gameId || !targetLoginId) {
    printUsage();
    process.exit(1);
  }

  const { supabase, env } = getAdminOpsContext();
  const snapshot = await loadGameSnapshot(supabase, gameId.trim());

  if (!snapshot.game) {
    throw new Error(`Game not found: ${gameId}`);
  }

  const targetProfile = await findProfileByLoginId(supabase, targetLoginId);
  if (!targetProfile) {
    throw new Error(`Target login ID not found: ${targetLoginId}`);
  }

  const { data: currentOwner, error: currentOwnerError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", snapshot.game.owner_id)
    .maybeSingle();

  if (currentOwnerError) {
    throw new Error(`Failed to load current owner profile: ${currentOwnerError.message}`);
  }

  const summary = buildSummary(snapshot.game, currentOwner, targetProfile, apply);

  if (!apply) {
    printJson(summary);
    return;
  }

  if (snapshot.game.owner_id === targetProfile.id) {
    printJson({
      ...summary,
      changed: false,
      message: "Target owner already owns this game.",
    });
    return;
  }

  const backupLocation = await backupGameSnapshot(supabase, env, snapshot, "pre-owner-transfer");
  const now = new Date().toISOString();
  const nextContent = snapshot.content?.content_json
    ? JSON.parse(JSON.stringify(snapshot.content.content_json))
    : null;

  if (nextContent) {
    nextContent.access = {
      ...(nextContent.access ?? {}),
      ownerId: targetProfile.id,
    };
    nextContent.updatedAt = now;
  }

  if (nextContent) {
    const { error: contentError } = await supabase
      .from("game_content")
      .update({
        content_json: nextContent,
      })
      .eq("game_id", snapshot.game.id);

    if (contentError) {
      throw new Error(`Failed to update game content owner: ${contentError.message}`);
    }
  }

  const { error: gameError } = await supabase
    .from("games")
    .update({
      owner_id: targetProfile.id,
      last_editor_id: targetProfile.id,
      updated_at: now,
    })
    .eq("id", snapshot.game.id);

  if (gameError) {
    throw new Error(`Failed to update game owner: ${gameError.message}`);
  }

  printJson({
    ...summary,
    changed: true,
    backupLocation,
    updatedAt: now,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
