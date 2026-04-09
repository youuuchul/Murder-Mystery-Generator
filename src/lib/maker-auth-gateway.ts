import type {
  AppUser,
  MakerAccountIdentity,
  MakerUserRecord,
} from "@/types/auth";
import {
  getMakerAuthProviderConfig,
  getMissingSupabaseMakerAuthEnv,
} from "@/lib/maker-auth-config";
import { createSupabaseMakerAuthGateway } from "@/lib/maker-auth-gateway-supabase";

export interface CreateMakerAccountInput {
  displayName: string;
  loginId: string;
  password: string;
  recoveryEmail?: string;
  now?: string;
  preferredUserId?: string;
  migrateOwnerIdFrom?: string;
}

export interface UpdateMakerAccountProfileInput {
  userId: string;
  recoveryEmail?: string | null;
  now?: string;
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
  updateAccountProfile(input: UpdateMakerAccountProfileInput): Promise<MakerAccountIdentity | null>;
  updateAccountPassword(userId: string, password: string, now?: string): Promise<boolean>;
}

let cachedGateway: MakerAuthGateway | null = null;

export function getMakerAuthGateway(): MakerAuthGateway {
  if (cachedGateway) {
    return cachedGateway;
  }

  const config = getMakerAuthProviderConfig();
  const missingEnv = getMissingSupabaseMakerAuthEnv(config);
  if (missingEnv.length > 0) {
    throw new Error(`Missing Supabase auth env vars: ${missingEnv.join(", ")}`);
  }

  cachedGateway = createSupabaseMakerAuthGateway(config);
  return cachedGateway;
}
