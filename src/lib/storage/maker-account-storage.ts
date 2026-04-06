import fs from "fs";
import path from "path";
import type { MakerAccountRecord } from "@/types/auth";
import { normalizeMakerDisplayName } from "@/lib/maker-user";
import { normalizeMakerLoginId, normalizeMakerRecoveryEmail } from "@/lib/maker-account";

const MAKER_DATA_DIR = path.join(process.cwd(), "data", "makers");
const MAKER_ACCOUNTS_PATH = path.join(MAKER_DATA_DIR, "accounts.json");

/** 계정 저장 디렉토리를 보장한다. */
function ensureMakerAccountsDir(): void {
  if (!fs.existsSync(MAKER_DATA_DIR)) {
    fs.mkdirSync(MAKER_DATA_DIR, { recursive: true });
  }
}

/** 계정 레코드 하나를 현재 비교/저장 규칙에 맞게 정리한다. */
function normalizeMakerAccountRecord(record: MakerAccountRecord): MakerAccountRecord {
  return {
    id: typeof record.id === "string" ? record.id.trim() : "",
    loginId: normalizeMakerLoginId(record.loginId),
    displayName: normalizeMakerDisplayName(record.displayName),
    recoveryEmail: normalizeMakerRecoveryEmail(record.recoveryEmail ?? ""),
    passwordSalt: typeof record.passwordSalt === "string" ? record.passwordSalt : "",
    passwordHash: typeof record.passwordHash === "string" ? record.passwordHash : "",
    createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
  };
}

/** 전체 작업자 계정 목록을 읽는다. */
export function listMakerAccounts(): MakerAccountRecord[] {
  ensureMakerAccountsDir();

  if (!fs.existsSync(MAKER_ACCOUNTS_PATH)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(MAKER_ACCOUNTS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as MakerAccountRecord[];

    return Array.isArray(parsed)
      ? parsed
        .map(normalizeMakerAccountRecord)
        .filter((record) => (
          Boolean(record.id)
          && Boolean(record.loginId)
          && Boolean(record.passwordSalt)
          && Boolean(record.passwordHash)
        ))
      : [];
  } catch {
    return [];
  }
}

/** 계정 목록 전체를 파일에 저장한다. */
function saveMakerAccounts(accounts: MakerAccountRecord[]): void {
  ensureMakerAccountsDir();
  fs.writeFileSync(MAKER_ACCOUNTS_PATH, JSON.stringify(accounts, null, 2), "utf-8");
}

/** loginId 기준으로 계정을 찾는다. */
export function findMakerAccountByLoginId(loginId: string): MakerAccountRecord | null {
  const normalizedLoginId = normalizeMakerLoginId(loginId);

  if (!normalizedLoginId) {
    return null;
  }

  return listMakerAccounts().find((account) => account.loginId === normalizedLoginId) ?? null;
}

/** AppUser.id 기준으로 계정을 찾는다. */
export function getMakerAccountById(userId: string): MakerAccountRecord | null {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    return null;
  }

  return listMakerAccounts().find((account) => account.id === normalizedUserId) ?? null;
}

/**
 * 새 계정을 저장한다.
 * 같은 loginId 또는 userId 가 이미 있으면 기존 레코드를 그대로 돌려준다.
 */
export function createMakerAccount(account: MakerAccountRecord): MakerAccountRecord {
  const normalizedAccount = normalizeMakerAccountRecord(account);
  const accounts = listMakerAccounts();
  const existingAccount = accounts.find((record) => (
    record.id === normalizedAccount.id || record.loginId === normalizedAccount.loginId
  ));

  if (existingAccount) {
    return existingAccount;
  }

  const nextAccounts = accounts
    .concat(normalizedAccount)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  saveMakerAccounts(nextAccounts);
  return normalizedAccount;
}

/**
 * 기존 계정 일부 필드를 갱신한다.
 * 새 비밀번호 해시와 복구 이메일 변경처럼 전체 레코드를 다시 쓰는 작업에 공통 사용한다.
 */
export function updateMakerAccount(
  userId: string,
  updates: Partial<MakerAccountRecord>
): MakerAccountRecord | null {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    return null;
  }

  const accounts = listMakerAccounts();
  const accountIndex = accounts.findIndex((account) => account.id === normalizedUserId);
  if (accountIndex === -1) {
    return null;
  }

  const currentAccount = accounts[accountIndex];
  const nextAccount = normalizeMakerAccountRecord({
    ...currentAccount,
    ...updates,
    id: currentAccount.id,
    loginId: updates.loginId ?? currentAccount.loginId,
    createdAt: currentAccount.createdAt,
  });

  const nextAccounts = [...accounts];
  nextAccounts[accountIndex] = nextAccount;
  saveMakerAccounts(
    nextAccounts.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  );

  return nextAccount;
}
