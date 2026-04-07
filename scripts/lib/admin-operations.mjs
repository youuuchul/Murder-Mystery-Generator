import { parseEnvFile, createMigrationSupabaseClient } from "./local-data-migration.mjs";

const DEFAULT_CONTENT_BACKUPS_BUCKET = "game-content-backups";
const DEFAULT_SESSION_BACKUPS_BUCKET = "session-backups";
const DEFAULT_ASSETS_BUCKET = "game-assets";
const JSON_BACKUP_FILE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;

/**
 * 운영 스크립트가 현재 프로젝트의 Supabase 환경을 읽어 공통 컨텍스트를 만든다.
 * 기본 provider가 Supabase인 배포 환경을 전제로 하고, 잘못된 환경에서는 즉시 멈춘다.
 *
 * @returns {{ env: Record<string, string>, supabase: import("@supabase/supabase-js").SupabaseClient }}
 */
export function getAdminOpsContext() {
  const env = parseEnvFile();
  const provider = String(env.APP_PERSISTENCE_PROVIDER || "local").trim().toLowerCase();

  if (provider !== "supabase") {
    throw new Error("These admin operation scripts currently support APP_PERSISTENCE_PROVIDER=supabase only.");
  }

  return {
    env,
    supabase: createMigrationSupabaseClient(),
  };
}

/**
 * 명령행 인자에서 플래그와 위치 인자를 분리한다.
 *
 * @param {string[]} argv
 * @returns {{ positional: string[], apply: boolean, help: boolean }}
 */
export function parseCliArgs(argv) {
  const positional = [];
  let apply = false;
  let help = false;

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    positional.push(arg);
  }

  return { positional, apply, help };
}

/**
 * 로그 출력을 일정한 JSON 형식으로 맞춘다.
 *
 * @param {unknown} value
 */
export function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

/**
 * 백업 파일명에 넣을 안전한 타임스탬프를 만든다.
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function formatBackupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\./g, "_");
}

/**
 * 백업 이유 문자열을 파일명 친화적으로 정리한다.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeBackupReason(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "snapshot";
}

/**
 * 본문 백업 bucket 이름을 읽는다.
 *
 * @param {Record<string, string>} env
 * @returns {string}
 */
export function getGameContentBackupsBucketName(env) {
  return env.SUPABASE_CONTENT_BACKUPS_BUCKET?.trim() || DEFAULT_CONTENT_BACKUPS_BUCKET;
}

/**
 * 세션 백업 bucket 이름을 읽는다.
 *
 * @param {Record<string, string>} env
 * @returns {string}
 */
export function getSessionBackupsBucketName(env) {
  return env.SUPABASE_SESSION_BACKUPS_BUCKET?.trim() || DEFAULT_SESSION_BACKUPS_BUCKET;
}

/**
 * 게임 자산 bucket 이름을 읽는다.
 *
 * @param {Record<string, string>} env
 * @returns {string}
 */
export function getGameAssetsBucketName(env) {
  return env.SUPABASE_ASSETS_BUCKET?.trim() || DEFAULT_ASSETS_BUCKET;
}

/**
 * JSON 백업용 private bucket이 없으면 생성한다.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} bucketName
 */
export async function ensureJsonBackupBucket(supabase, bucketName) {
  const { data, error } = await supabase.storage.getBucket(bucketName);

  if (error && !data) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: false,
      fileSizeLimit: JSON_BACKUP_FILE_SIZE_LIMIT_BYTES,
      allowedMimeTypes: ["application/json"],
    });

    if (
      createError
      && createError.message.toLowerCase().includes("already exists") === false
    ) {
      throw new Error(`Failed to ensure backup bucket "${bucketName}": ${createError.message}`);
    }
  }
}

/**
 * 게임 메타와 본문을 함께 읽는다.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} gameId
 * @returns {Promise<{ game: any | null, content: any | null }>}
 */
export async function loadGameSnapshot(supabase, gameId) {
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .maybeSingle();

  if (gameError) {
    throw new Error(`Failed to load game row: ${gameError.message}`);
  }

  const { data: content, error: contentError } = await supabase
    .from("game_content")
    .select("*")
    .eq("game_id", gameId)
    .maybeSingle();

  if (contentError) {
    throw new Error(`Failed to load game content row: ${contentError.message}`);
  }

  return { game, content };
}

/**
 * 게임 삭제 전 복구용 스냅샷을 Storage에 남긴다.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Record<string, string>} env
 * @param {any} snapshot
 * @param {string} reason
 * @returns {Promise<string>}
 */
export async function backupGameSnapshot(supabase, env, snapshot, reason) {
  const bucketName = getGameContentBackupsBucketName(env);
  await ensureJsonBackupBucket(supabase, bucketName);

  const fileName = `${formatBackupTimestamp()}-${normalizeBackupReason(reason)}.json`;
  const objectPath = `${snapshot.game.id}/${fileName}`;
  const payload = JSON.stringify({
    backedUpAt: new Date().toISOString(),
    reason,
    gameId: snapshot.game.id,
    snapshot,
  }, null, 2);

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(objectPath, Buffer.from(payload, "utf8"), {
      contentType: "application/json",
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to backup game snapshot: ${error.message}`);
  }

  return `${bucketName}/${objectPath}`;
}

/**
 * 게임에 속한 세션 목록을 읽는다.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} gameId
 * @returns {Promise<any[]>}
 */
export async function listSessionsByGameId(supabase, gameId) {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("game_id", gameId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list sessions for game "${gameId}": ${error.message}`);
  }

  return data ?? [];
}

/**
 * 특정 host user가 연 세션 목록을 읽는다.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string[]} userIds
 * @returns {Promise<any[]>}
 */
export async function listSessionsByHostUserIds(supabase, userIds) {
  if (userIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .in("host_user_id", userIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list sessions by host users: ${error.message}`);
  }

  return data ?? [];
}

/**
 * 세션 삭제 전 복구용 스냅샷을 Storage에 남긴다.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Record<string, string>} env
 * @param {any} session
 * @param {string} reason
 * @returns {Promise<string>}
 */
export async function backupSessionSnapshot(supabase, env, session, reason) {
  const bucketName = getSessionBackupsBucketName(env);
  await ensureJsonBackupBucket(supabase, bucketName);

  const fileName = `${formatBackupTimestamp()}-${normalizeBackupReason(reason)}.json`;
  const objectPath = `${session.id}/${fileName}`;
  const payload = JSON.stringify({
    backedUpAt: new Date().toISOString(),
    reason,
    sessionId: session.id,
    gameId: session.game_id,
    sessionCode: session.session_code,
    snapshot: session,
  }, null, 2);

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(objectPath, Buffer.from(payload, "utf8"), {
      contentType: "application/json",
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to backup session snapshot: ${error.message}`);
  }

  return `${bucketName}/${objectPath}`;
}

/**
 * 게임 prefix 아래의 asset object path를 전부 수집한다.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Record<string, string>} env
 * @param {string} gameId
 * @returns {Promise<string[]>}
 */
export async function collectGameAssetPaths(supabase, env, gameId) {
  const bucketName = getGameAssetsBucketName(env);
  const queue = [gameId];
  const objectPaths = [];

  while (queue.length > 0) {
    const currentPrefix = queue.shift();
    if (!currentPrefix) {
      continue;
    }

    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage.from(bucketName).list(currentPrefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) {
        throw new Error(`Failed to list game assets: ${error.message}`);
      }

      const entries = data ?? [];
      for (const entry of entries) {
        const nextPath = `${currentPrefix}/${entry.name}`;
        if (entry.id) {
          objectPaths.push(nextPath);
        } else {
          queue.push(nextPath);
        }
      }

      if (entries.length < 100) {
        break;
      }

      offset += entries.length;
    }
  }

  return objectPaths;
}

/**
 * 게임 prefix 아래 asset을 전부 삭제한다.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Record<string, string>} env
 * @param {string} gameId
 * @returns {Promise<number>}
 */
export async function deleteGameAssetPrefix(supabase, env, gameId) {
  const bucketName = getGameAssetsBucketName(env);
  const objectPaths = await collectGameAssetPaths(supabase, env, gameId);

  if (objectPaths.length === 0) {
    return 0;
  }

  for (let index = 0; index < objectPaths.length; index += 100) {
    const batch = objectPaths.slice(index, index + 100);
    const { error } = await supabase.storage.from(bucketName).remove(batch);

    if (error) {
      throw new Error(`Failed to delete game assets: ${error.message}`);
    }
  }

  return objectPaths.length;
}

/**
 * Auth 사용자 목록을 모두 읽는다.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @returns {Promise<any[]>}
 */
export async function listAllAuthUsers(supabase) {
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    const batch = data?.users ?? [];
    users.push(...batch);

    if (batch.length < 100) {
      break;
    }

    page += 1;
  }

  return users;
}

/**
 * 로그인 ID로 profile을 찾는다.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} loginId
 * @returns {Promise<any | null>}
 */
export async function findProfileByLoginId(supabase, loginId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("login_id", String(loginId || "").trim().toLowerCase())
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load target profile: ${error.message}`);
  }

  return data;
}

/**
 * profile id 목록으로 게임을 찾는다.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string[]} ownerIds
 * @returns {Promise<any[]>}
 */
export async function listGamesByOwnerIds(supabase, ownerIds) {
  if (ownerIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("games")
    .select("*")
    .in("owner_id", ownerIds)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list games by owners: ${error.message}`);
  }

  return data ?? [];
}
