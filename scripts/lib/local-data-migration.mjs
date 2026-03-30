import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const GAMES_DIR = path.join(DATA_DIR, "games");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
const BACKUPS_DIR = path.join(ROOT_DIR, "backups", "local-data");
const GAME_BATCH_SIZE = 25;
const SESSION_BATCH_SIZE = 50;

/**
 * `.env` 파일을 단순 key/value 맵으로 읽는다.
 * 현재 마이그레이션 스크립트는 서버 시작 없이 직접 Supabase service-role에 연결하므로
 * 실행 시점에 파일 기반 env 해석이 필요하다.
 *
 * @param {string} [envPath]
 * @returns {Record<string, string>}
 */
export function parseEnvFile(envPath = path.join(ROOT_DIR, ".env")) {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  return Object.fromEntries(
    fs.readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        const key = line.slice(0, separatorIndex).trim();
        let value = line.slice(separatorIndex + 1).trim();

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

/**
 * 마이그레이션 전용 Supabase service-role client를 만든다.
 *
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function createMigrationSupabaseClient() {
  const env = parseEnvFile();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || "";

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing Supabase env. Set NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY."
    );
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * 타임스탬프를 파일명 친화적인 `YYYYMMDD_HHmmss` 형식으로 만든다.
 *
 * @param {Date} [date]
 * @returns {string}
 */
function formatTimestamp(date = new Date()) {
  const parts = [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, "0"),
    `${date.getDate()}`.padStart(2, "0"),
  ];
  const time = [
    `${date.getHours()}`.padStart(2, "0"),
    `${date.getMinutes()}`.padStart(2, "0"),
    `${date.getSeconds()}`.padStart(2, "0"),
  ];
  return `${parts.join("")}_${time.join("")}`;
}

/**
 * 폴더가 없으면 생성한다.
 *
 * @param {string} dirPath
 */
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * 파일을 JSON으로 읽는다.
 *
 * @template T
 * @param {string} filePath
 * @returns {T}
 */
function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/**
 * 배열을 고정 크기 청크로 자른다.
 *
 * @template T
 * @param {T[]} values
 * @param {number} size
 * @returns {T[][]}
 */
function chunk(values, size) {
  const batches = [];
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }
  return batches;
}

/**
 * 게임 공개 상태를 현재 enum으로 정규화한다.
 *
 * @param {string | undefined} visibility
 * @returns {"draft" | "private" | "public"}
 */
function normalizeVisibility(visibility) {
  if (visibility === "draft" || visibility === "private" || visibility === "public") {
    return visibility;
  }

  return "private";
}

/**
 * 로컬 게임 JSON 전부를 읽는다.
 *
 * @returns {any[]}
 */
export function readLocalGames() {
  if (!fs.existsSync(GAMES_DIR)) {
    return [];
  }

  return fs.readdirSync(GAMES_DIR)
    .map((directoryName) => path.join(GAMES_DIR, directoryName, "game.json"))
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => readJsonFile(filePath));
}

/**
 * 로컬 세션 JSON 전부를 읽는다.
 *
 * @returns {any[]}
 */
export function readLocalSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    return [];
  }

  return fs.readdirSync(SESSIONS_DIR)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => path.join(SESSIONS_DIR, fileName))
    .map((filePath) => readJsonFile(filePath));
}

/**
 * 로컬 세션 파일 경로와 파싱된 JSON을 함께 반환한다.
 * orphan 정리처럼 파일 자체를 이동해야 하는 작업에서 사용한다.
 *
 * @returns {{ filePath: string, fileName: string, session: any }[]}
 */
function readLocalSessionEntries() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    return [];
  }

  return fs.readdirSync(SESSIONS_DIR)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => {
      const filePath = path.join(SESSIONS_DIR, fileName);
      return {
        filePath,
        fileName,
        session: readJsonFile(filePath),
      };
    });
}

/**
 * 실제 import 전에 로컬 게임/세션 폴더를 타임스탬프 백업으로 복사한다.
 *
 * @param {string} [label]
 * @returns {{ backupDir: string, manifest: Record<string, unknown> }}
 */
export function createLocalDataBackup(label = "pre-supabase-import") {
  const backupDir = path.join(BACKUPS_DIR, `${formatTimestamp()}-${label}`);
  ensureDir(backupDir);

  const targetGamesDir = path.join(backupDir, "games");
  const targetSessionsDir = path.join(backupDir, "sessions");

  if (fs.existsSync(GAMES_DIR)) {
    fs.cpSync(GAMES_DIR, targetGamesDir, { recursive: true });
  }

  if (fs.existsSync(SESSIONS_DIR)) {
    fs.cpSync(SESSIONS_DIR, targetSessionsDir, { recursive: true });
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    source: {
      gamesDir: GAMES_DIR,
      sessionsDir: SESSIONS_DIR,
    },
    counts: {
      games: readLocalGames().length,
      sessions: readLocalSessions().length,
    },
  };

  fs.writeFileSync(
    path.join(backupDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  return { backupDir, manifest };
}

/**
 * 로컬 게임 폴더가 없는 세션 파일만 찾는다.
 * 현재 앱 기준으로는 이런 세션은 `/join` 및 session lookup 에서 복구 불가하므로
 * active session 폴더에 남겨두기보다 격리 대상이다.
 *
 * @returns {{
 *   id: string,
 *   gameId: string,
 *   sessionCode: string,
 *   fileName: string,
 *   filePath: string,
 *   createdAt?: string,
 *   startedAt?: string,
 *   endedAt?: string,
 *   lockedPlayerCount: number,
 *   playerStateCount: number,
 * }[]}
 */
export function listLocalOrphanSessions() {
  const localGameIds = new Set(readLocalGames().map((game) => game.id));

  return readLocalSessionEntries()
    .filter(({ session }) => !localGameIds.has(session.gameId))
    .map(({ filePath, fileName, session }) => ({
      id: session.id,
      gameId: session.gameId,
      sessionCode: session.sessionCode,
      fileName,
      filePath,
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      lockedPlayerCount: (session.sharedState?.characterSlots ?? []).filter((slot) => slot?.isLocked).length,
      playerStateCount: Array.isArray(session.playerStates) ? session.playerStates.length : 0,
    }));
}

/**
 * orphan 세션을 backup 폴더로 이동해 active session 경로에서 분리한다.
 * 원본 삭제 대신 move 를 사용해 복구 가능성을 남기고, manifest 에 원래 경로를 기록한다.
 *
 * @param {string} [label]
 * @returns {{
 *   archiveDir: string,
 *   archivedCount: number,
 *   archivedSessions: Record<string, unknown>[],
 * }}
 */
export function archiveLocalOrphanSessions(label = "orphan-sessions") {
  const orphanSessions = listLocalOrphanSessions();
  const archiveDir = path.join(BACKUPS_DIR, `${formatTimestamp()}-${label}`);
  const archiveSessionsDir = path.join(archiveDir, "sessions");
  ensureDir(archiveSessionsDir);

  const archivedSessions = [];

  for (const orphanSession of orphanSessions) {
    const targetPath = path.join(archiveSessionsDir, orphanSession.fileName);
    fs.renameSync(orphanSession.filePath, targetPath);
    archivedSessions.push({
      ...orphanSession,
      archivedTo: targetPath,
    });
  }

  fs.writeFileSync(
    path.join(archiveDir, "manifest.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        archivedCount: archivedSessions.length,
        archivedSessions,
      },
      null,
      2
    ),
    "utf8"
  );

  return {
    archiveDir,
    archivedCount: archivedSessions.length,
    archivedSessions,
  };
}

/**
 * 게임 메타 row를 Supabase `games` 스키마에 맞춰 만든다.
 *
 * @param {any} game
 * @param {string} ownerId
 * @returns {Record<string, unknown>}
 */
function buildGameMetadataRow(game, ownerId) {
  const settings = game.settings ?? {};
  const rules = game.rules ?? {};
  const visibility = normalizeVisibility(game.access?.visibility);
  const tags = Array.isArray(settings.tags) ? settings.tags.filter(Boolean) : [];
  const players = Array.isArray(game.players) ? game.players : [];
  const clues = Array.isArray(game.clues) ? game.clues : [];
  const locations = Array.isArray(game.locations) ? game.locations : [];
  const roundCount = Number.isInteger(rules.roundCount) ? rules.roundCount : 0;
  const summary = typeof settings.summary === "string" ? settings.summary.trim() : "";
  const openingNarration = game.scripts?.opening?.narration?.trim?.() ?? "";
  const hasEndingBranch = Array.isArray(game.ending?.branches) && game.ending.branches.length > 0;
  const hasEndingNarration = Boolean(game.scripts?.ending?.narration?.trim?.());
  const lifecycleStatus = summary && players.length > 0 && openingNarration && (hasEndingBranch || hasEndingNarration)
    ? "ready"
    : "draft";

  return {
    id: game.id,
    owner_id: ownerId,
    title: game.title,
    summary: summary || null,
    difficulty: settings.difficulty || "normal",
    player_count: Number.isInteger(settings.playerCount) ? settings.playerCount : players.length,
    estimated_duration: Number.isInteger(settings.estimatedDuration) ? settings.estimatedDuration : 90,
    cover_asset_id: null,
    visibility,
    lifecycle_status: lifecycleStatus,
    tags,
    clue_count: clues.length,
    location_count: locations.length,
    round_count: roundCount,
    published_at: game.access?.publishedAt || null,
    created_at: game.createdAt || new Date().toISOString(),
    updated_at: game.updatedAt || game.createdAt || new Date().toISOString(),
    last_editor_id: ownerId,
  };
}

/**
 * 게임 원본 JSON row를 Supabase `game_content` 스키마에 맞춰 만든다.
 *
 * @param {any} game
 * @returns {Record<string, unknown>}
 */
function buildGameContentRow(game) {
  return {
    game_id: game.id,
    content_json: game,
    schema_version: 1,
    migrated_from_local: true,
  };
}

/**
 * 세션 row를 Supabase `sessions` 스키마에 맞춰 만든다.
 *
 * @param {any} session
 * @returns {Record<string, unknown>}
 */
function buildSessionRow(session) {
  const sharedState = session.sharedState ?? {};
  const characterSlots = Array.isArray(sharedState.characterSlots)
    ? sharedState.characterSlots
    : [];

  return {
    id: session.id,
    game_id: session.gameId,
    session_code: `${session.sessionCode ?? ""}`.trim().toUpperCase(),
    host_user_id: null,
    phase: sharedState.phase ?? "lobby",
    current_round: Number.isInteger(sharedState.currentRound) ? sharedState.currentRound : 0,
    current_sub_phase: sharedState.currentSubPhase ?? null,
    locked_player_count: characterSlots.filter((slot) => slot?.isLocked).length,
    total_player_count: characterSlots.length,
    started_at: session.startedAt ?? null,
    ended_at: session.endedAt ?? null,
    created_at: session.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    session_json: session,
  };
}

/**
 * 특정 id 집합이 원격 테이블에 이미 존재하는지 찾는다.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} table
 * @param {string} column
 * @param {string[]} ids
 * @returns {Promise<Set<string>>}
 */
async function loadExistingIds(supabase, table, column, ids) {
  if (ids.length === 0) {
    return new Set();
  }

  const existingIds = new Set();

  for (const idBatch of chunk(ids, 100)) {
    const { data, error } = await supabase
      .from(table)
      .select(column)
      .in(column, idBatch);

    if (error) {
      throw new Error(`Failed to inspect Supabase ${table}: ${error.message}`);
    }

    for (const row of data ?? []) {
      const value = row[column];
      if (typeof value === "string" && value) {
        existingIds.add(value);
      }
    }
  }

  return existingIds;
}

/**
 * 로컬 owner id가 실제 Supabase `profiles`에 존재하는지 확인한다.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string[]} ownerIds
 * @returns {Promise<Set<string>>}
 */
async function loadExistingProfileIds(supabase, ownerIds) {
  return loadExistingIds(supabase, "profiles", "id", ownerIds);
}

/**
 * dry-run/apply 공통으로 쓰는 migration plan을 만든다.
 * ownerId가 비어 있거나 profiles에 없는 게임은 fallback owner 없이는 import 대상에서 제외한다.
 *
 * @param {{ fallbackOwnerId?: string }} [options]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function buildMigrationPlan(options = {}) {
  const fallbackOwnerId = options.fallbackOwnerId?.trim() || "";
  const supabase = createMigrationSupabaseClient();
  const localGames = readLocalGames();
  const localSessions = readLocalSessions();
  const localGameIds = new Set(localGames.map((game) => game.id));
  const rawOwnerIds = [
    ...new Set(
      localGames
        .map((game) => game.access?.ownerId?.trim?.() ?? "")
        .filter(Boolean)
    ),
  ];
  const ownerIdsToResolve = fallbackOwnerId
    ? [...new Set([...rawOwnerIds, fallbackOwnerId])]
    : rawOwnerIds;
  const existingProfileIds = await loadExistingProfileIds(supabase, ownerIdsToResolve);
  const importableGames = [];
  const skippedGames = [];
  const unresolvedGames = [];

  for (const game of localGames) {
    const originalOwnerId = game.access?.ownerId?.trim?.() ?? "";
    const originalVisibility = normalizeVisibility(game.access?.visibility);
    let resolvedOwnerId = "";
    let resolution = "original";

    if (originalOwnerId && existingProfileIds.has(originalOwnerId)) {
      resolvedOwnerId = originalOwnerId;
    } else if (fallbackOwnerId) {
      if (!existingProfileIds.has(fallbackOwnerId)) {
        resolution = "invalid-fallback";
      } else {
        resolvedOwnerId = fallbackOwnerId;
        resolution = originalOwnerId ? "fallback-missing-profile" : "fallback-empty-owner";
      }
    } else {
      resolution = originalOwnerId ? "missing-profile" : "missing-owner";
    }

    const gameSummary = {
      id: game.id,
      title: game.title,
      originalOwnerId,
      resolvedOwnerId,
      visibility: originalVisibility,
      resolution,
    };

    if (resolvedOwnerId) {
      importableGames.push({
        ...gameSummary,
        metadataRow: buildGameMetadataRow(game, resolvedOwnerId),
        contentRow: buildGameContentRow(game),
      });
    } else if (resolution === "invalid-fallback") {
      unresolvedGames.push(gameSummary);
    } else {
      skippedGames.push(gameSummary);
    }
  }

  const importableGameIds = new Set(importableGames.map((game) => game.id));
  const importableSessions = [];
  const skippedSessions = [];

  for (const session of localSessions) {
    if (!localGameIds.has(session.gameId)) {
      skippedSessions.push({
        id: session.id,
        gameId: session.gameId,
        reason: "missing-local-game",
      });
      continue;
    }

    if (!importableGameIds.has(session.gameId)) {
      skippedSessions.push({
        id: session.id,
        gameId: session.gameId,
        reason: "game-owner-unresolved",
      });
      continue;
    }

    importableSessions.push({
      id: session.id,
      gameId: session.gameId,
      row: buildSessionRow(session),
    });
  }

  const existingRemoteGameIds = await loadExistingIds(
    supabase,
    "games",
    "id",
    importableGames.map((game) => game.id)
  );
  const existingRemoteSessionIds = await loadExistingIds(
    supabase,
    "sessions",
    "id",
    importableSessions.map((session) => session.id)
  );

  const blockers = [];
  if (fallbackOwnerId && !existingProfileIds.has(fallbackOwnerId)) {
    blockers.push({
      type: "invalid-fallback-owner",
      fallbackOwnerId,
      detail: "fallback owner id가 Supabase profiles 에 존재하지 않습니다.",
    });
  }

  if (!fallbackOwnerId && skippedGames.length > 0) {
    blockers.push({
      type: "unresolved-game-owners",
      detail: "ownerId가 비어 있거나 profiles 에 없는 게임이 있어 import 할 수 없습니다.",
      gameIds: skippedGames.map((game) => game.id),
    });
  }

  return {
    fallbackOwnerId,
    counts: {
      localGames: localGames.length,
      localSessions: localSessions.length,
      importableGames: importableGames.length,
      importableSessions: importableSessions.length,
      skippedGames: skippedGames.length,
      skippedSessions: skippedSessions.length,
      existingRemoteGames: existingRemoteGameIds.size,
      existingRemoteSessions: existingRemoteSessionIds.size,
    },
    importableGames,
    importableSessions,
    skippedGames,
    skippedSessions,
    existingRemoteGameIds: [...existingRemoteGameIds].sort(),
    existingRemoteSessionIds: [...existingRemoteSessionIds].sort(),
    blockers,
  };
}

/**
 * migration plan을 사람이 읽기 쉬운 JSON 요약으로 만든다.
 *
 * @param {Record<string, unknown>} plan
 * @returns {string}
 */
export function formatMigrationPlan(plan) {
  return JSON.stringify(
    {
      counts: plan.counts,
      blockers: plan.blockers,
      fallbackOwnerId: plan.fallbackOwnerId || null,
      skippedGames: plan.skippedGames,
      skippedSessions: plan.skippedSessions,
      existingRemoteGameIds: plan.existingRemoteGameIds,
      existingRemoteSessionIds: plan.existingRemoteSessionIds,
    },
    null,
    2
  );
}

/**
 * dry-run plan을 실제 Supabase upsert로 적용한다.
 * apply 전 항상 로컬 데이터 백업을 생성한다.
 *
 * @param {Record<string, unknown>} plan
 * @param {{ backupLabel?: string }} [options]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function applyMigrationPlan(plan, options = {}) {
  if ((plan.blockers?.length ?? 0) > 0) {
    throw new Error("Migration plan still has blockers. Resolve them before applying.");
  }

  const { backupDir } = createLocalDataBackup(options.backupLabel);
  const supabase = createMigrationSupabaseClient();
  const importableGames = plan.importableGames ?? [];
  const importableSessions = plan.importableSessions ?? [];

  for (const batch of chunk(importableGames, GAME_BATCH_SIZE)) {
    const metadataRows = batch.map((game) => game.metadataRow);
    const contentRows = batch.map((game) => game.contentRow);

    if (metadataRows.length > 0) {
      const { error } = await supabase
        .from("games")
        .upsert(metadataRows, { onConflict: "id" });

      if (error) {
        throw new Error(`Failed to upsert games: ${error.message}`);
      }
    }

    if (contentRows.length > 0) {
      const { error } = await supabase
        .from("game_content")
        .upsert(contentRows, { onConflict: "game_id" });

      if (error) {
        throw new Error(`Failed to upsert game_content: ${error.message}`);
      }
    }
  }

  for (const batch of chunk(importableSessions, SESSION_BATCH_SIZE)) {
    const sessionRows = batch.map((session) => session.row);
    if (sessionRows.length === 0) {
      continue;
    }

    const { error } = await supabase
      .from("sessions")
      .upsert(sessionRows, { onConflict: "id" });

    if (error) {
      throw new Error(`Failed to upsert sessions: ${error.message}`);
    }
  }

  return {
    backupDir,
    importedGames: importableGames.length,
    importedSessions: importableSessions.length,
  };
}
