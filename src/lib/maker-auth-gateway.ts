import type { AppUser, MakerAccountRecord, MakerUserRecord } from "@/types/auth";
import {
  hashMakerAccountPassword,
  normalizeMakerLoginId,
  verifyMakerAccountPassword,
} from "@/lib/maker-account";
import {
  createMakerAccount as createLocalMakerAccount,
  findMakerAccountByLoginId as findLocalMakerAccountByLoginId,
  getMakerAccountById as getLocalMakerAccountById,
} from "@/lib/storage/maker-account-storage";
import {
  findMakerUserByDisplayName as findLocalMakerUserByDisplayName,
  getMakerUserById as getLocalMakerUserById,
  listMakerUsers as listLocalMakerUsers,
  upsertMakerUser as upsertLocalMakerUser,
} from "@/lib/storage/maker-user-storage";

export interface CreateMakerAccountInput {
  id: string;
  displayName: string;
  loginId: string;
  password: string;
  now?: string;
}

export interface MakerAuthGateway {
  listUsers(): MakerUserRecord[];
  findUserByDisplayName(displayName: string): MakerUserRecord | null;
  getUserById(userId: string): MakerUserRecord | null;
  upsertUser(user: AppUser, now?: string): MakerUserRecord;
  getAccountById(userId: string): MakerAccountRecord | null;
  findAccountByLoginId(loginId: string): MakerAccountRecord | null;
  authenticateAccount(loginId: string, password: string): MakerAccountRecord | null;
  createAccount(input: CreateMakerAccountInput): MakerAccountRecord;
}

const localMakerAuthGateway: MakerAuthGateway = {
  listUsers() {
    return listLocalMakerUsers();
  },
  findUserByDisplayName(displayName) {
    return findLocalMakerUserByDisplayName(displayName);
  },
  getUserById(userId) {
    return getLocalMakerUserById(userId);
  },
  upsertUser(user, now) {
    return upsertLocalMakerUser(user, now);
  },
  getAccountById(userId) {
    return getLocalMakerAccountById(userId);
  },
  findAccountByLoginId(loginId) {
    return findLocalMakerAccountByLoginId(loginId);
  },
  authenticateAccount(loginId, password) {
    const account = findLocalMakerAccountByLoginId(normalizeMakerLoginId(loginId));
    if (!account || !verifyMakerAccountPassword(password, account)) {
      return null;
    }

    return account;
  },
  createAccount({ id, displayName, loginId, password, now = new Date().toISOString() }) {
    const passwordFields = hashMakerAccountPassword(password);

    return createLocalMakerAccount({
      id,
      displayName,
      loginId,
      ...passwordFields,
      createdAt: now,
      updatedAt: now,
    });
  },
};

/**
 * 현재 메이커 인증/프로필 저장 구현을 반환한다.
 * 지금은 로컬 JSON 기반이지만, 이후 Supabase Auth + profiles 구현으로 교체할 경계다.
 */
export function getMakerAuthGateway(): MakerAuthGateway {
  return localMakerAuthGateway;
}
