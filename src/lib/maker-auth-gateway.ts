import type { AppUser, MakerAccountRecord, MakerUserRecord } from "@/types/auth";
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

/**
 * 현재 로컬 JSON 저장소를 감싼 기본 메이커 인증 gateway.
 * route/page 계층은 이 구현 세부사항을 직접 알지 않도록 유지한다.
 */
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
 * Supabase provider 가 선택됐지만 어댑터가 아직 구현되지 않았을 때
 * 어디서 막혔는지 즉시 파악할 수 있도록 명시적으로 실패시킨다.
 */
function createSupabaseMakerAuthGateway(config: MakerAuthProviderConfig): MakerAuthGateway {
  const missingEnv = getMissingSupabaseMakerAuthEnv(config);

  if (missingEnv.length > 0) {
    throw new Error(
      `MAKER_AUTH_PROVIDER=supabase requires env vars: ${missingEnv.join(", ")}`
    );
  }

  throw new Error(
    "MAKER_AUTH_PROVIDER=supabase is selected, but the Supabase maker auth gateway is not implemented yet."
  );
}

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
  cachedGateway =
    config.provider === "supabase"
      ? createSupabaseMakerAuthGateway(config)
      : localMakerAuthGateway;

  return cachedGateway;
}
