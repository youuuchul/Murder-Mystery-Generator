import fs from "fs";
import path from "path";
import { getGameAssetsBucketName } from "@/lib/game-asset-storage";
import { normalizeGame } from "@/lib/game-normalizer";
import {
  getPersistenceProviderConfig,
  type PersistenceProvider,
} from "@/lib/persistence-config";
import { getGame as getLocalGame } from "@/lib/storage/game-storage";
import { createSupabasePersistenceClient } from "@/lib/supabase/persistence";
import type { GamePackage } from "@/types/game";

const LOCAL_GAME_CONTENT_BACKUP_DIR = path.join(process.cwd(), "backups", "game-content");
const DEFAULT_SUPABASE_GAME_CONTENT_BACKUPS_BUCKET = "game-content-backups";
const SUPABASE_GAME_CONTENT_BACKUP_FILE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;

export interface GameContentSourceStatus {
  primaryProvider: PersistenceProvider;
  localBackupAvailable: boolean;
  localBackupDiffers: boolean;
  localBackupUpdatedAt?: string;
}

export interface CreateGameContentBackupSnapshotOptions {
  provider?: PersistenceProvider;
  reason?: string;
}

export interface GameContentBackupSnapshot {
  provider: PersistenceProvider;
  location: string;
  bucketName?: string;
}

let ensuredSupabaseGameContentBackupsBucketName: string | null = null;

/**
 * 게임 본문 백업에 사용할 Supabase Storage bucket 이름을 읽는다.
 * 미설정 시 기본 bucket 이름으로 자동 복구 경로를 단순하게 유지한다.
 */
export function getGameContentBackupsBucketName(): string {
  return process.env.SUPABASE_CONTENT_BACKUPS_BUCKET?.trim()
    || DEFAULT_SUPABASE_GAME_CONTENT_BACKUPS_BUCKET;
}

/**
 * 두 게임 본문이 현재 정규화 규칙 기준으로 같은지 비교한다.
 * 저장소마다 필드 순서가 달라도, 실제 편집 내용이 같으면 동일한 값으로 본다.
 */
export function areGamePackagesEquivalent(left: GamePackage, right: GamePackage): boolean {
  return JSON.stringify(normalizeGame(left)) === JSON.stringify(normalizeGame(right));
}

/**
 * 현재 편집 중인 게임이 어느 저장소를 기준으로 열렸는지와,
 * 로컬 백업본이 남아 있을 때 내용이 다른지 여부를 계산한다.
 */
export function getGameContentSourceStatus(
  gameId: string,
  primaryGame: GamePackage
): GameContentSourceStatus {
  const primaryProvider = getPersistenceProviderConfig().provider;

  if (primaryProvider !== "supabase") {
    return {
      primaryProvider,
      localBackupAvailable: false,
      localBackupDiffers: false,
    };
  }

  const localBackup = getLocalGame(gameId);
  if (!localBackup) {
    return {
      primaryProvider,
      localBackupAvailable: false,
      localBackupDiffers: false,
    };
  }

  return {
    primaryProvider,
    localBackupAvailable: true,
    localBackupDiffers: !areGamePackagesEquivalent(primaryGame, localBackup),
    localBackupUpdatedAt: localBackup.updatedAt,
  };
}

/**
 * 백업 파일명에 넣을 안전한 타임스탬프를 만든다.
 */
function formatBackupTimestamp(date = new Date()): string {
  const iso = date.toISOString();
  return iso.replace(/[-:]/g, "").replace(/\./g, "_");
}

/**
 * 백업 목적 문자열을 파일명 친화적으로 정리한다.
 */
function normalizeBackupReason(reason?: string): string {
  const normalized = reason?.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") ?? "";
  return normalized.replace(/^-+|-+$/g, "") || "snapshot";
}

/**
 * 게임 본문 백업용 JSON payload를 만든다.
 * 원본 게임과 함께 백업 시점/이유를 남겨 복구 판단을 돕는다.
 */
function buildBackupPayload(game: GamePackage, reason: string, backedUpAt: string): string {
  return JSON.stringify({
    backedUpAt,
    reason,
    gameId: game.id,
    gameUpdatedAt: game.updatedAt,
    game: normalizeGame(game),
  }, null, 2);
}

/**
 * 로컬 백업 폴더를 만든다.
 */
function ensureLocalGameContentBackupDir(gameId: string): string {
  const dir = path.join(LOCAL_GAME_CONTENT_BACKUP_DIR, gameId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Supabase 본문 백업 bucket이 없으면 만든다.
 * 콘텐츠 JSON만 담는 전용 bucket을 따로 둬 이미지 bucket 설정과 충돌하지 않게 한다.
 */
async function ensureSupabaseGameContentBackupsBucket(): Promise<string> {
  const bucketName = getGameContentBackupsBucketName();
  if (ensuredSupabaseGameContentBackupsBucketName === bucketName) {
    return bucketName;
  }

  const supabase = createSupabasePersistenceClient();
  const { data, error } = await supabase.storage.getBucket(bucketName);

  if (error && !data) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: false,
      fileSizeLimit: SUPABASE_GAME_CONTENT_BACKUP_FILE_SIZE_LIMIT_BYTES,
      allowedMimeTypes: ["application/json"],
    });

    if (
      createError
      && createError.message.toLowerCase().includes("already exists") === false
    ) {
      throw new Error(`Failed to ensure game content backup bucket: ${createError.message}`);
    }
  }

  ensuredSupabaseGameContentBackupsBucketName = bucketName;
  return bucketName;
}

/**
 * 게임 본문 이전 버전을 현재 저장소에 백업한다.
 * 덮어쓰기/삭제 전에 호출해 복구 지점을 남긴다.
 */
export async function createGameContentBackupSnapshot(
  game: GamePackage,
  options: CreateGameContentBackupSnapshotOptions = {}
): Promise<GameContentBackupSnapshot> {
  const provider = options.provider ?? getPersistenceProviderConfig().provider;
  const backedUpAt = new Date().toISOString();
  const reason = normalizeBackupReason(options.reason);
  const filename = `${formatBackupTimestamp(new Date(backedUpAt))}-${reason}.json`;
  const payload = buildBackupPayload(game, reason, backedUpAt);

  if (provider === "supabase") {
    const supabase = createSupabasePersistenceClient();
    const bucketName = await ensureSupabaseGameContentBackupsBucket();
    const objectPath = `${game.id}/${filename}`;
    const { error } = await supabase.storage
      .from(bucketName)
      .upload(objectPath, Buffer.from(payload, "utf8"), {
        contentType: "application/json",
        cacheControl: "31536000",
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to backup game content to Supabase Storage: ${error.message}`);
    }

    return {
      provider,
      bucketName,
      location: objectPath,
    };
  }

  const dir = ensureLocalGameContentBackupDir(game.id);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, payload, "utf8");

  return {
    provider,
    location: filePath,
  };
}

/**
 * 현재 게임 자산 bucket 이름을 그대로 쓰지 않는다는 점을 코드에서 명확히 남긴다.
 * 본문 백업은 이미지 bucket과 MIME 제약이 달라 전용 bucket을 사용한다.
 */
export function getGameContentBackupStorageNotes(): string {
  return `asset bucket=${getGameAssetsBucketName()}, backup bucket=${getGameContentBackupsBucketName()}`;
}
