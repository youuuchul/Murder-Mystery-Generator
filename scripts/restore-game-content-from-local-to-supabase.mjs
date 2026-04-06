import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import {
  createMigrationSupabaseClient,
  parseEnvFile,
} from "./lib/local-data-migration.mjs";

const ROOT_DIR = process.cwd();
const DEFAULT_CONTENT_BACKUPS_BUCKET = "game-content-backups";
const CONTENT_BACKUPS_FILE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;

/**
 * 로컬 게임 파일 절대 경로를 만든다.
 *
 * @param {string} gameId
 * @returns {string}
 */
function getLocalGamePath(gameId) {
  return path.join(ROOT_DIR, "data", "games", gameId, "game.json");
}

/**
 * 공개 상태를 현재 enum으로 맞춘다.
 *
 * @param {unknown} value
 * @returns {"draft" | "private" | "public"}
 */
function normalizeVisibility(value) {
  return value === "draft" || value === "private" || value === "public" ? value : "private";
}

/**
 * 로컬 게임 JSON에서 Supabase `games` row를 만든다.
 *
 * @param {any} game
 * @returns {Record<string, unknown>}
 */
function buildGameMetadataRow(game) {
  const settings = game.settings ?? {};
  const rules = game.rules ?? {};
  const players = Array.isArray(game.players) ? game.players : [];
  const clues = Array.isArray(game.clues) ? game.clues : [];
  const locations = Array.isArray(game.locations) ? game.locations : [];
  const summary = typeof settings.summary === "string" ? settings.summary.trim() : "";
  const openingNarration = game.scripts?.opening?.narration?.trim?.() ?? "";
  const hasEndingBranch = Array.isArray(game.ending?.branches) && game.ending.branches.length > 0;
  const hasEndingNarration = Boolean(game.scripts?.ending?.narration?.trim?.());
  const lifecycleStatus = summary && players.length > 0 && openingNarration && (hasEndingBranch || hasEndingNarration)
    ? "ready"
    : "draft";

  return {
    id: game.id,
    owner_id: game.access?.ownerId?.trim?.() ?? "",
    title: game.title,
    summary: summary || null,
    difficulty: settings.difficulty || "normal",
    player_count: Number.isInteger(settings.playerCount) ? settings.playerCount : players.length,
    estimated_duration: Number.isInteger(settings.estimatedDuration) ? settings.estimatedDuration : 90,
    cover_asset_id: null,
    visibility: normalizeVisibility(game.access?.visibility),
    lifecycle_status: lifecycleStatus,
    tags: Array.isArray(settings.tags) ? settings.tags.filter(Boolean) : [],
    clue_count: clues.length,
    location_count: locations.length,
    round_count: Number.isInteger(rules.roundCount) ? rules.roundCount : 0,
    published_at: game.access?.publishedAt || null,
    created_at: game.createdAt || new Date().toISOString(),
    updated_at: game.updatedAt || game.createdAt || new Date().toISOString(),
    last_editor_id: game.access?.ownerId?.trim?.() || null,
  };
}

/**
 * 본문 백업 bucket 이름을 읽는다.
 *
 * @param {Record<string, string>} env
 * @returns {string}
 */
function getContentBackupsBucketName(env) {
  return env.SUPABASE_CONTENT_BACKUPS_BUCKET?.trim() || DEFAULT_CONTENT_BACKUPS_BUCKET;
}

/**
 * 본문 백업 bucket이 없으면 만든다.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} bucketName
 */
async function ensureContentBackupsBucket(supabase, bucketName) {
  const { data, error } = await supabase.storage.getBucket(bucketName);

  if (error && !data) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: false,
      fileSizeLimit: CONTENT_BACKUPS_FILE_SIZE_LIMIT_BYTES,
      allowedMimeTypes: ["application/json"],
    });

    if (
      createError
      && createError.message.toLowerCase().includes("already exists") === false
    ) {
      throw new Error(`Failed to ensure content backup bucket: ${createError.message}`);
    }
  }
}

/**
 * 현재 Supabase 본문을 복구 전 백업한다.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Record<string, string>} env
 * @param {string} gameId
 * @param {any} game
 * @returns {Promise<string>}
 */
async function backupCurrentSupabaseContent(supabase, env, gameId, game) {
  const bucketName = getContentBackupsBucketName(env);
  await ensureContentBackupsBucket(supabase, bucketName);

  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\./g, "_");
  const objectPath = `${gameId}/${timestamp}-pre-restore.json`;
  const payload = JSON.stringify({
    backedUpAt: new Date().toISOString(),
    reason: "pre-restore",
    gameId,
    gameUpdatedAt: game.updatedAt ?? null,
    game,
  }, null, 2);

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(objectPath, Buffer.from(payload, "utf8"), {
      contentType: "application/json",
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to backup current Supabase game content: ${error.message}`);
  }

  return `${bucketName}/${objectPath}`;
}

/**
 * 로컬 게임 JSON을 Supabase canonical source로 다시 올린다.
 * 기존 Supabase 본문은 먼저 Storage에 백업한다.
 *
 * @param {string} gameId
 */
async function restoreGameContent(gameId) {
  const localGamePath = getLocalGamePath(gameId);
  if (!fs.existsSync(localGamePath)) {
    throw new Error(`Local game file not found: ${localGamePath}`);
  }

  const env = parseEnvFile();
  const supabase = createMigrationSupabaseClient();
  const localGame = JSON.parse(fs.readFileSync(localGamePath, "utf8"));

  if (!localGame?.access?.ownerId?.trim?.()) {
    throw new Error("Local game is missing access.ownerId, so the Supabase games row cannot be rebuilt safely.");
  }

  const { data: currentContentRow, error: currentContentError } = await supabase
    .from("game_content")
    .select("game_id, content_json")
    .eq("game_id", gameId)
    .maybeSingle();

  if (currentContentError) {
    throw new Error(`Failed to load current Supabase game content: ${currentContentError.message}`);
  }

  let backupLocation = null;
  if (currentContentRow?.content_json) {
    backupLocation = await backupCurrentSupabaseContent(
      supabase,
      env,
      gameId,
      currentContentRow.content_json
    );
  }

  const metadataRow = buildGameMetadataRow(localGame);
  const { error: metadataError } = await supabase
    .from("games")
    .upsert(metadataRow, { onConflict: "id" });

  if (metadataError) {
    throw new Error(`Failed to restore Supabase game metadata: ${metadataError.message}`);
  }

  const { error: contentError } = await supabase
    .from("game_content")
    .upsert({
      game_id: localGame.id,
      content_json: localGame,
      schema_version: 1,
      migrated_from_local: true,
    }, { onConflict: "game_id" });

  if (contentError) {
    throw new Error(`Failed to restore Supabase game content: ${contentError.message}`);
  }

  const branches = Array.isArray(localGame.ending?.branches) ? localGame.ending.branches : [];
  console.log(JSON.stringify({
    restoredGameId: gameId,
    localGamePath,
    backupLocation,
    branchCount: branches.length,
    personalEndingCounts: branches.map((branch) => ({
      label: branch.label,
      count: Array.isArray(branch.personalEndings) ? branch.personalEndings.length : 0,
    })),
  }, null, 2));
}

const gameId = process.argv[2]?.trim();

if (!gameId) {
  console.error("Usage: node scripts/restore-game-content-from-local-to-supabase.mjs <game-id>");
  process.exit(1);
}

restoreGameContent(gameId).catch((error) => {
  console.error(error);
  process.exit(1);
});
