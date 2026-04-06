import fs from "fs";
import path from "path";
import {
  getPersistenceProviderConfig,
  type PersistenceProvider,
} from "@/lib/persistence-config";
import { createSupabasePersistenceClient } from "@/lib/supabase/persistence";
import type { GameSession } from "@/types/session";

const LOCAL_SESSION_BACKUP_DIR = path.join(process.cwd(), "backups", "sessions");
const DEFAULT_SUPABASE_SESSION_BACKUPS_BUCKET = "session-backups";
const SUPABASE_SESSION_BACKUP_FILE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;

export interface CreateSessionBackupSnapshotOptions {
  provider?: PersistenceProvider;
  reason?: string;
}

export interface SessionBackupSnapshot {
  provider: PersistenceProvider;
  location: string;
  bucketName?: string;
}

let ensuredSupabaseSessionBackupsBucketName: string | null = null;

/**
 * 세션 백업에 사용할 Supabase Storage bucket 이름을 읽는다.
 * 미설정 시 기본 bucket 이름으로 복구 경로를 단순하게 유지한다.
 */
export function getSessionBackupsBucketName(): string {
  return process.env.SUPABASE_SESSION_BACKUPS_BUCKET?.trim()
    || DEFAULT_SUPABASE_SESSION_BACKUPS_BUCKET;
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
 * 세션 백업용 JSON payload를 만든다.
 * 복구 시점 판단이 쉽도록 세션 메타와 전체 상태를 함께 남긴다.
 */
function buildBackupPayload(session: GameSession, reason: string, backedUpAt: string): string {
  return JSON.stringify({
    backedUpAt,
    reason,
    sessionId: session.id,
    gameId: session.gameId,
    sessionCode: session.sessionCode,
    sessionName: session.sessionName,
    sessionUpdatedAt: session.updatedAt,
    session,
  }, null, 2);
}

/**
 * 로컬 세션 백업 폴더를 만든다.
 */
function ensureLocalSessionBackupDir(sessionId: string): string {
  const dir = path.join(LOCAL_SESSION_BACKUP_DIR, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Supabase 세션 백업 bucket이 없으면 만든다.
 * 세션 JSON만 담는 전용 bucket을 따로 둬 게임 본문 백업과 분리한다.
 */
async function ensureSupabaseSessionBackupsBucket(): Promise<string> {
  const bucketName = getSessionBackupsBucketName();
  if (ensuredSupabaseSessionBackupsBucketName === bucketName) {
    return bucketName;
  }

  const supabase = createSupabasePersistenceClient();
  const { data, error } = await supabase.storage.getBucket(bucketName);

  if (error && !data) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: false,
      fileSizeLimit: SUPABASE_SESSION_BACKUP_FILE_SIZE_LIMIT_BYTES,
      allowedMimeTypes: ["application/json"],
    });

    if (
      createError
      && createError.message.toLowerCase().includes("already exists") === false
    ) {
      throw new Error(`Failed to ensure session backup bucket: ${createError.message}`);
    }
  }

  ensuredSupabaseSessionBackupsBucketName = bucketName;
  return bucketName;
}

/**
 * 세션 이전 버전을 현재 저장소에 백업한다.
 * 삭제 전 상태를 남겨 복구 가능성을 확보한다.
 */
export async function createSessionBackupSnapshot(
  session: GameSession,
  options: CreateSessionBackupSnapshotOptions = {}
): Promise<SessionBackupSnapshot> {
  const provider = options.provider ?? getPersistenceProviderConfig().provider;
  const backedUpAt = new Date().toISOString();
  const reason = normalizeBackupReason(options.reason);
  const filename = `${formatBackupTimestamp(new Date(backedUpAt))}-${reason}.json`;
  const payload = buildBackupPayload(session, reason, backedUpAt);

  if (provider === "supabase") {
    const supabase = createSupabasePersistenceClient();
    const bucketName = await ensureSupabaseSessionBackupsBucket();
    const objectPath = `${session.id}/${filename}`;
    const { error } = await supabase.storage
      .from(bucketName)
      .upload(objectPath, Buffer.from(payload, "utf8"), {
        contentType: "application/json",
        cacheControl: "31536000",
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to backup session to Supabase Storage: ${error.message}`);
    }

    return {
      provider,
      bucketName,
      location: objectPath,
    };
  }

  const dir = ensureLocalSessionBackupDir(session.id);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, payload, "utf8");

  return {
    provider,
    location: filePath,
  };
}
