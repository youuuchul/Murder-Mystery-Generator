import { normalizeMakerLoginId } from "@/lib/maker-account";
import type { MakerAuthProviderConfig } from "@/lib/maker-auth-config";
import { migrateLocalGameOwnership } from "@/lib/game-ownership-migration";
import type { CreateMakerAccountInput, MakerAuthGateway } from "@/lib/maker-auth-gateway";
import { normalizeMakerDisplayName } from "@/lib/maker-user";
import {
  buildSupabaseMakerEmail,
  createSupabaseMakerAuthAdminClient,
  createSupabaseMakerAuthClient,
  getSupabaseMakerProfileColumns,
  type SupabaseMakerProfileRow,
} from "@/lib/supabase/maker-auth";
import type { AppUser, MakerAccountIdentity, MakerUserRecord } from "@/types/auth";

function toMakerUserRecord(profile: SupabaseMakerProfileRow): MakerUserRecord {
  return {
    id: profile.id,
    displayName: profile.display_name,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

function toMakerAccountIdentity(profile: SupabaseMakerProfileRow): MakerAccountIdentity {
  return {
    id: profile.id,
    displayName: profile.display_name,
    loginId: profile.login_id,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

async function getSupabaseProfileById(
  config: MakerAuthProviderConfig,
  userId: string
): Promise<SupabaseMakerProfileRow | null> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    return null;
  }

  const adminClient = createSupabaseMakerAuthAdminClient(config);
  const { data, error } = await adminClient
    .from("profiles")
    .select(getSupabaseMakerProfileColumns())
    .eq("id", normalizedUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Supabase maker profile by id: ${error.message}`);
  }

  return data as unknown as SupabaseMakerProfileRow | null;
}

async function getSupabaseProfileByLoginId(
  config: MakerAuthProviderConfig,
  loginId: string
): Promise<SupabaseMakerProfileRow | null> {
  const normalizedLoginId = normalizeMakerLoginId(loginId);
  if (!normalizedLoginId) {
    return null;
  }

  const adminClient = createSupabaseMakerAuthAdminClient(config);
  const { data, error } = await adminClient
    .from("profiles")
    .select(getSupabaseMakerProfileColumns())
    .eq("login_id", normalizedLoginId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Supabase maker profile by login id: ${error.message}`);
  }

  return data as unknown as SupabaseMakerProfileRow | null;
}

/**
 * Supabase Auth + profiles 기반 메이커 인증 gateway 를 만든다.
 * 현재 작업자 세션은 Supabase SSR auth 쿠키를 기준으로 복원하고, 계정/프로필 원본도 Supabase에 둔다.
 */
export function createSupabaseMakerAuthGateway(
  config: MakerAuthProviderConfig
): MakerAuthGateway {
  return {
    async listUsers() {
      const adminClient = createSupabaseMakerAuthAdminClient(config);
      const { data, error } = await adminClient
        .from("profiles")
        .select(getSupabaseMakerProfileColumns())
        .order("updated_at", { ascending: false });

      if (error) {
        throw new Error(`Failed to list Supabase maker profiles: ${error.message}`);
      }

      return ((data ?? []) as unknown as SupabaseMakerProfileRow[]).map(toMakerUserRecord);
    },

    async findUserByDisplayName(displayName) {
      const normalizedDisplayName = normalizeMakerDisplayName(displayName);
      if (!normalizedDisplayName) {
        return null;
      }

      const adminClient = createSupabaseMakerAuthAdminClient(config);
      const { data, error } = await adminClient
        .from("profiles")
        .select(getSupabaseMakerProfileColumns())
        .eq("display_name", normalizedDisplayName)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to find Supabase maker profile by display name: ${error.message}`);
      }

      return data ? toMakerUserRecord(data as unknown as SupabaseMakerProfileRow) : null;
    },

    async getUserById(userId) {
      const profile = await getSupabaseProfileById(config, userId);
      return profile ? toMakerUserRecord(profile) : null;
    },

    async upsertUser(user: AppUser, now = new Date().toISOString()) {
      const existingProfile = await getSupabaseProfileById(config, user.id);

      if (!existingProfile) {
        throw new Error(
          "Supabase maker profile not found for the current user. Sign in with a Supabase account first."
        );
      }

      const nextDisplayName = normalizeMakerDisplayName(user.displayName);
      if (existingProfile.display_name === nextDisplayName) {
        return toMakerUserRecord(existingProfile);
      }

      const adminClient = createSupabaseMakerAuthAdminClient(config);
      const { data, error } = await adminClient
        .from("profiles")
        .update({
          display_name: nextDisplayName,
          updated_at: now,
        })
        .eq("id", existingProfile.id)
        .select(getSupabaseMakerProfileColumns())
        .single();

      if (error) {
        throw new Error(`Failed to update Supabase maker profile: ${error.message}`);
      }

      return toMakerUserRecord(data as unknown as SupabaseMakerProfileRow);
    },

    async getAccountById(userId) {
      const profile = await getSupabaseProfileById(config, userId);
      return profile ? toMakerAccountIdentity(profile) : null;
    },

    async findAccountByLoginId(loginId) {
      const profile = await getSupabaseProfileByLoginId(config, loginId);
      return profile ? toMakerAccountIdentity(profile) : null;
    },

    async authenticateAccount(loginId, password) {
      const authClient = createSupabaseMakerAuthClient(config);
      const { data, error } = await authClient.auth.signInWithPassword({
        email: buildSupabaseMakerEmail(loginId),
        password,
      });

      if (error || !data.user) {
        return null;
      }

      const account = await getSupabaseProfileById(config, data.user.id);
      return account ? toMakerAccountIdentity(account) : null;
    },

    async createAccount({
      displayName,
      loginId,
      password,
      now = new Date().toISOString(),
      migrateOwnerIdFrom,
    }: CreateMakerAccountInput) {
      const normalizedDisplayName = normalizeMakerDisplayName(displayName);
      const normalizedLoginId = normalizeMakerLoginId(loginId);
      const adminClient = createSupabaseMakerAuthAdminClient(config);
      const { data, error } = await adminClient.auth.admin.createUser({
        email: buildSupabaseMakerEmail(normalizedLoginId),
        password,
        email_confirm: true,
        user_metadata: {
          display_name: normalizedDisplayName,
          login_id: normalizedLoginId,
        },
      });

      if (error || !data.user) {
        throw new Error(`Failed to create Supabase maker account: ${error?.message ?? "unknown error"}`);
      }

      const { data: profileData, error: profileError } = await adminClient
        .from("profiles")
        .upsert({
          id: data.user.id,
          display_name: normalizedDisplayName,
          login_id: normalizedLoginId,
          role: "creator",
          updated_at: now,
        })
        .select(getSupabaseMakerProfileColumns())
        .single();

      if (profileError) {
        throw new Error(`Failed to upsert Supabase maker profile: ${profileError.message}`);
      }

      if (migrateOwnerIdFrom && migrateOwnerIdFrom.trim() !== data.user.id) {
        await migrateLocalGameOwnership(migrateOwnerIdFrom, data.user.id, now);
      }

      return toMakerAccountIdentity(profileData as unknown as SupabaseMakerProfileRow);
    },
  };
}
