import { createSupabasePersistenceClient } from "@/lib/supabase/persistence";
import type { GameSession } from "@/types/session";

const DEFAULT_SUPABASE_SESSION_BACKUPS_BUCKET = "session-backups";
const SUPABASE_SESSION_BACKUP_FILE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;

export interface CreateSessionBackupSnapshotOptions {
  reason?: string;
}

export interface SessionBackupSnapshot {
  location: string;
  bucketName: string;
}

let ensuredSupabaseSessionBackupsBucketName: string | null = null;

export function getSessionBackupsBucketName(): string {
  return process.env.SUPABASE_SESSION_BACKUPS_BUCKET?.trim()
    || DEFAULT_SUPABASE_SESSION_BACKUPS_BUCKET;
}

function formatBackupTimestamp(date = new Date()): string {
  const iso = date.toISOString();
  return iso.replace(/[-:]/g, "").replace(/\./g, "_");
}

function normalizeBackupReason(reason?: string): string {
  const normalized = reason?.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") ?? "";
  return normalized.replace(/^-+|-+$/g, "") || "snapshot";
}

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

export async function createSessionBackupSnapshot(
  session: GameSession,
  options: CreateSessionBackupSnapshotOptions = {}
): Promise<SessionBackupSnapshot> {
  const backedUpAt = new Date().toISOString();
  const reason = normalizeBackupReason(options.reason);
  const filename = `${formatBackupTimestamp(new Date(backedUpAt))}-${reason}.json`;
  const payload = buildBackupPayload(session, reason, backedUpAt);

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
    bucketName,
    location: objectPath,
  };
}
