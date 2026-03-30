import fs from "fs";
import path from "path";
import type { AppUser, MakerUserRecord } from "@/types/auth";
import { normalizeMakerDisplayName } from "@/lib/maker-user";

const MAKER_USERS_DIR = path.join(process.cwd(), "data", "makers");
const MAKER_USERS_INDEX_PATH = path.join(MAKER_USERS_DIR, "index.json");

/** 작업자 레지스트리 저장 디렉토리를 보장한다. */
function ensureMakerUsersDir(): void {
  if (!fs.existsSync(MAKER_USERS_DIR)) {
    fs.mkdirSync(MAKER_USERS_DIR, { recursive: true });
  }
}

/** 작업자 레지스트리 전체를 읽는다. */
export function listMakerUsers(): MakerUserRecord[] {
  ensureMakerUsersDir();

  if (!fs.existsSync(MAKER_USERS_INDEX_PATH)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(MAKER_USERS_INDEX_PATH, "utf-8");
    const parsed = JSON.parse(raw) as MakerUserRecord[];

    return Array.isArray(parsed)
      ? parsed
        .map((record) => ({
          id: typeof record.id === "string" ? record.id.trim() : "",
          displayName: normalizeMakerDisplayName(record.displayName),
          createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
          updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
        }))
        .filter((record) => Boolean(record.id) && Boolean(record.displayName))
      : [];
  } catch {
    return [];
  }
}

/** displayName 이 같은 기존 작업자 레코드를 찾는다. */
export function findMakerUserByDisplayName(displayName: string): MakerUserRecord | null {
  const normalizedDisplayName = normalizeMakerDisplayName(displayName);

  if (!normalizedDisplayName) {
    return null;
  }

  return listMakerUsers().find((record) => record.displayName === normalizedDisplayName) ?? null;
}

/** userId 로 기존 작업자 레코드를 찾는다. */
export function getMakerUserById(userId: string): MakerUserRecord | null {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    return null;
  }

  return listMakerUsers().find((record) => record.id === normalizedUserId) ?? null;
}

/**
 * 현재 작업자 세션을 로컬 레지스트리에 저장한다.
 * 같은 ID 가 있으면 이름/updatedAt 만 갱신한다.
 */
export function upsertMakerUser(user: AppUser, now = new Date().toISOString()): MakerUserRecord {
  const normalizedUser: AppUser = {
    id: user.id.trim(),
    displayName: normalizeMakerDisplayName(user.displayName),
  };
  const existingUsers = listMakerUsers();
  const existingRecord = existingUsers.find((record) => record.id === normalizedUser.id);
  const nextRecord: MakerUserRecord = existingRecord
    ? {
      ...existingRecord,
      displayName: normalizedUser.displayName,
      updatedAt: now,
    }
    : {
      ...normalizedUser,
      createdAt: now,
      updatedAt: now,
    };
  const nextUsers = existingUsers
    .filter((record) => record.id !== normalizedUser.id)
    .concat(nextRecord)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  ensureMakerUsersDir();
  fs.writeFileSync(MAKER_USERS_INDEX_PATH, JSON.stringify(nextUsers, null, 2), "utf-8");

  return nextRecord;
}
