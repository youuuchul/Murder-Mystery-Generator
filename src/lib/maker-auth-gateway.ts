import type {
  AppUser,
  MakerAccountIdentity,
  MakerAccountRecord,
  MakerUserRecord,
} from "@/types/auth";
import {
  hashMakerAccountPassword,
  normalizeMakerLoginId,
  verifyMakerAccountPassword,
} from "@/lib/maker-account";
import type { MakerAuthProviderConfig } from "@/lib/maker-auth-config";
import {
  getMakerAuthProviderConfig,
  getMissingSupabaseMakerAuthEnv,
} from "@/lib/maker-auth-config";
import { createSupabaseMakerAuthGateway } from "@/lib/maker-auth-gateway-supabase";
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
  displayName: string;
  loginId: string;
  password: string;
  now?: string;
  preferredUserId?: string;
  migrateOwnerIdFrom?: string;
}

export interface MakerAuthGateway {
  listUsers(): Promise<MakerUserRecord[]>;
  findUserByDisplayName(displayName: string): Promise<MakerUserRecord | null>;
  getUserById(userId: string): Promise<MakerUserRecord | null>;
  upsertUser(user: AppUser, now?: string): Promise<MakerUserRecord>;
  getAccountById(userId: string): Promise<MakerAccountIdentity | null>;
  findAccountByLoginId(loginId: string): Promise<MakerAccountIdentity | null>;
  authenticateAccount(loginId: string, password: string): Promise<MakerAccountIdentity | null>;
  createAccount(input: CreateMakerAccountInput): Promise<MakerAccountIdentity>;
}

function toMakerAccountIdentity(account: MakerAccountRecord): MakerAccountIdentity {
  return {
    id: account.id,
    displayName: account.displayName,
    loginId: account.loginId,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

/**
 * 현재 로컬 JSON 저장소를 감싼 기본 메이커 인증 gateway.
 * route/page 계층은 이 구현 세부사항을 직접 알지 않도록 유지한다.
 */
const localMakerAuthGateway: MakerAuthGateway = {
  async listUsers() {
    return listLocalMakerUsers();
  },
  async findUserByDisplayName(displayName) {
    return findLocalMakerUserByDisplayName(displayName);
  },
  async getUserById(userId) {
    return getLocalMakerUserById(userId);
  },
  async upsertUser(user, now) {
    return upsertLocalMakerUser(user, now);
  },
  async getAccountById(userId) {
    const account = getLocalMakerAccountById(userId);
    return account ? toMakerAccountIdentity(account) : null;
  },
  async findAccountByLoginId(loginId) {
    const account = findLocalMakerAccountByLoginId(loginId);
    return account ? toMakerAccountIdentity(account) : null;
  },
  async authenticateAccount(loginId, password) {
    const account = findLocalMakerAccountByLoginId(normalizeMakerLoginId(loginId));
    if (!account || !verifyMakerAccountPassword(password, account)) {
      return null;
    }

    return toMakerAccountIdentity(account);
  },
  async createAccount({
    displayName,
    loginId,
    password,
    now = new Date().toISOString(),
    preferredUserId,
  }) {
    const passwordFields = hashMakerAccountPassword(password);
    const account = createLocalMakerAccount({
      id: preferredUserId?.trim() || crypto.randomUUID(),
      displayName,
      loginId,
      ...passwordFields,
      createdAt: now,
      updatedAt: now,
    });

    return toMakerAccountIdentity(account);
  },
};

let cachedProvider: MakerAuthProviderConfig["provider"] | null = null;
let cachedGateway: MakerAuthGateway | null = null;

/**
 * 현재 메이커 인증/프로필 저장 구현을 반환한다.
 * 기본값은 로컬 JSON 기반이며, 이후 Supabase Auth + profiles 구현으로 교체할 경계다.
 */
export function getMakerAuthGateway(): MakerAuthGateway {
  const config = getMakerAuthProviderConfig();

  if (cachedGateway && cachedProvider === config.provider) {
    return cachedGateway;
  }

  cachedProvider = config.provider;
  if (config.provider === "supabase") {
    const missingEnv = getMissingSupabaseMakerAuthEnv(config);
    if (missingEnv.length > 0) {
      throw new Error(
        `MAKER_AUTH_PROVIDER=supabase requires env vars: ${missingEnv.join(", ")}`
      );
    }

    cachedGateway = createSupabaseMakerAuthGateway(config);
    return cachedGateway;
  }

  cachedGateway = localMakerAuthGateway;

  return cachedGateway;
}
