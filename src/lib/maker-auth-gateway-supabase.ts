import {
  normalizeMakerLoginId,
  normalizeMakerRecoveryEmail,
} from "@/lib/maker-account";
import {
  DuplicateMakerLoginIdError,
  DuplicateMakerRecoveryEmailError,
} from "@/lib/maker-auth-errors";
import type { MakerAuthProviderConfig } from "@/lib/maker-auth-config";
import { migrateLocalGameOwnership } from "@/lib/game-ownership-migration";
import { normalizeMakerRole } from "@/lib/maker-role";
import type {
  CreateMakerAccountInput,
  MakerAuthGateway,
  UpdateMakerAccountProfileInput,
} from "@/lib/maker-auth-gateway";
import { normalizeMakerDisplayName } from "@/lib/maker-user";
import {
  createSupabaseMakerAuthAdminClient,
  createSupabaseMakerAuthClient,
  getSupabaseMakerProfileColumns,
  resolveSupabaseMakerAuthEmail,
  type SupabaseMakerProfileRow,
} from "@/lib/supabase/maker-auth";
import type { AppUser, MakerAccountIdentity, MakerUserRecord } from "@/types/auth";

/** 아직 migration 이 반영되지 않은 환경에서 recovery_email 컬럼 누락 오류를 감지한다. */
function isMissingSupabaseRecoveryEmailColumn(errorMessage: string): boolean {
  return errorMessage.includes("recovery_email")
    && (
      errorMessage.includes("schema cache")
      || errorMessage.includes("column")
    );
}

/** profiles upsert/update 시 recovery_email 컬럼이 없으면 기본 필드만 다시 저장한다. */
async function writeSupabaseMakerProfile(
  config: MakerAuthProviderConfig,
  values: {
    id: string;
    display_name: string;
    login_id: string;
    role?: string | null;
    updated_at: string;
    recovery_email?: string | null;
  }
): Promise<SupabaseMakerProfileRow> {
  const adminClient = createSupabaseMakerAuthAdminClient(config);
  const primaryPayload = {
    ...values,
    recovery_email: values.recovery_email ?? null,
  };
  const fallbackPayload = {
    id: values.id,
    display_name: values.display_name,
    login_id: values.login_id,
    role: values.role ?? "creator",
    updated_at: values.updated_at,
  };

  const primaryAttempt = await adminClient
    .from("profiles")
    .upsert(primaryPayload)
    .select(getSupabaseMakerProfileColumns())
    .single();

  if (!primaryAttempt.error) {
    return primaryAttempt.data as unknown as SupabaseMakerProfileRow;
  }

  if (!isMissingSupabaseRecoveryEmailColumn(primaryAttempt.error.message)) {
    throw new Error(`Failed to upsert Supabase maker profile: ${primaryAttempt.error.message}`);
  }

  const fallbackAttempt = await adminClient
    .from("profiles")
    .upsert(fallbackPayload)
    .select(getSupabaseMakerProfileColumns())
    .single();

  if (fallbackAttempt.error) {
    throw new Error(`Failed to upsert Supabase maker profile: ${fallbackAttempt.error.message}`);
  }

  return fallbackAttempt.data as unknown as SupabaseMakerProfileRow;
}

/** Supabase Auth / profiles 응답이 로그인 ID 중복 상황인지 판별한다. */
function isSupabaseDuplicateLoginIdMessage(errorMessage: string): boolean {
  const normalizedMessage = errorMessage.toLowerCase();

  return (
    (normalizedMessage.includes("already") && normalizedMessage.includes("registered"))
    || normalizedMessage.includes("user_already_exists")
    || normalizedMessage.includes("duplicate key")
    || (
      normalizedMessage.includes("unique constraint")
      && normalizedMessage.includes("login_id")
    )
  );
}

/** Supabase Auth email 값이 이미 다른 계정에 묶여 있는지 대략 판별한다. */
function isSupabaseDuplicateEmailMessage(errorMessage: string): boolean {
  const normalizedMessage = errorMessage.toLowerCase();

  return (
    (normalizedMessage.includes("already") && normalizedMessage.includes("registered"))
    || normalizedMessage.includes("user_already_exists")
    || (
      normalizedMessage.includes("duplicate key")
      && normalizedMessage.includes("email")
    )
    || (
      normalizedMessage.includes("unique constraint")
      && normalizedMessage.includes("email")
    )
  );
}

/**
 * profiles 기준으로 Auth 레이어에서 써야 하는 이메일을 찾는다.
 * 복구 이메일을 등록한 계정은 실제 이메일을, 없으면 내부 makers.local 주소를 쓴다.
 */
function getProfileAuthEmail(profile: Pick<SupabaseMakerProfileRow, "login_id" | "recovery_email">): string {
  return resolveSupabaseMakerAuthEmail(profile.login_id, profile.recovery_email);
}

function toMakerUserRecord(profile: SupabaseMakerProfileRow): MakerUserRecord {
  return {
    id: profile.id,
    displayName: profile.display_name,
    role: normalizeMakerRole(profile.role),
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

function toMakerAccountIdentity(profile: SupabaseMakerProfileRow): MakerAccountIdentity {
  return {
    id: profile.id,
    displayName: profile.display_name,
    role: normalizeMakerRole(profile.role),
    loginId: profile.login_id,
    recoveryEmail: profile.recovery_email ?? null,
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
      const profile = await getSupabaseProfileByLoginId(config, loginId);
      if (!profile) {
        return null;
      }

      const authClient = createSupabaseMakerAuthClient(config);
      const { data, error } = await authClient.auth.signInWithPassword({
        email: getProfileAuthEmail(profile),
        password,
      });

      if (error || !data.user) {
        return null;
      }

      return toMakerAccountIdentity(profile);
    },

    async createAccount({
      displayName,
      loginId,
      password,
      recoveryEmail,
      now = new Date().toISOString(),
      migrateOwnerIdFrom,
    }: CreateMakerAccountInput) {
      const normalizedDisplayName = normalizeMakerDisplayName(displayName);
      const normalizedLoginId = normalizeMakerLoginId(loginId);
      const normalizedRecoveryEmail = normalizeMakerRecoveryEmail(recoveryEmail ?? "");
      const existingProfile = await getSupabaseProfileByLoginId(config, normalizedLoginId);
      if (existingProfile) {
        throw new DuplicateMakerLoginIdError(normalizedLoginId);
      }

      const adminClient = createSupabaseMakerAuthAdminClient(config);
      const authEmail = resolveSupabaseMakerAuthEmail(normalizedLoginId, normalizedRecoveryEmail);
      const { data, error } = await adminClient.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: normalizedDisplayName,
          login_id: normalizedLoginId,
        },
      });

      if (error || !data.user) {
        if (
          normalizedRecoveryEmail
          && error
          && isSupabaseDuplicateEmailMessage(error.message)
        ) {
          throw new DuplicateMakerRecoveryEmailError(normalizedRecoveryEmail);
        }

        if (error && isSupabaseDuplicateLoginIdMessage(error.message)) {
          throw new DuplicateMakerLoginIdError(normalizedLoginId);
        }
        throw new Error(`Failed to create Supabase maker account: ${error?.message ?? "unknown error"}`);
      }

      let profileData: SupabaseMakerProfileRow;

      try {
        profileData = await writeSupabaseMakerProfile(config, {
          id: data.user.id,
          display_name: normalizedDisplayName,
          login_id: normalizedLoginId,
          recovery_email: normalizedRecoveryEmail || null,
          role: "creator",
          updated_at: now,
        });
      } catch (profileError) {
        if (
          profileError instanceof Error
          && isSupabaseDuplicateLoginIdMessage(profileError.message)
        ) {
          await adminClient.auth.admin.deleteUser(data.user.id);
          throw new DuplicateMakerLoginIdError(normalizedLoginId);
        }
        throw profileError;
      }

      if (migrateOwnerIdFrom && migrateOwnerIdFrom.trim() !== data.user.id) {
        await migrateLocalGameOwnership(migrateOwnerIdFrom, data.user.id, now);
      }

      return toMakerAccountIdentity(profileData);
    },

    async updateAccountProfile({
      userId,
      recoveryEmail,
      now = new Date().toISOString(),
    }: UpdateMakerAccountProfileInput) {
      const normalizedUserId = userId.trim();
      if (!normalizedUserId) {
        return null;
      }

      const existingProfile = await getSupabaseProfileById(config, normalizedUserId);
      if (!existingProfile) {
        return null;
      }

      const normalizedNextRecoveryEmail = normalizeMakerRecoveryEmail(recoveryEmail ?? "") || null;
      const adminClient = createSupabaseMakerAuthAdminClient(config);
      const { data: authUserData, error: authUserError } = await adminClient.auth.admin.getUserById(
        existingProfile.id
      );

      if (authUserError) {
        throw new Error(`Failed to load Supabase auth user: ${authUserError.message}`);
      }

      const previousAuthEmail = normalizeMakerRecoveryEmail(authUserData.user?.email ?? "") || null;
      const nextAuthEmail = resolveSupabaseMakerAuthEmail(
        existingProfile.login_id,
        normalizedNextRecoveryEmail
      );
      const authEmailChanged = previousAuthEmail !== nextAuthEmail;

      try {
        if (authEmailChanged) {
          const { error: authEmailUpdateError } = await adminClient.auth.admin.updateUserById(
            existingProfile.id,
            {
              email: nextAuthEmail,
              email_confirm: true,
            }
          );

          if (authEmailUpdateError) {
            if (
              normalizedNextRecoveryEmail
              && isSupabaseDuplicateEmailMessage(authEmailUpdateError.message)
            ) {
              throw new DuplicateMakerRecoveryEmailError(normalizedNextRecoveryEmail);
            }

            throw new Error(`Failed to update Supabase auth email: ${authEmailUpdateError.message}`);
          }
        }

        const profile = await writeSupabaseMakerProfile(config, {
          id: existingProfile.id,
          display_name: existingProfile.display_name,
          login_id: existingProfile.login_id,
          recovery_email: normalizedNextRecoveryEmail,
          role: existingProfile.role ?? "creator",
          updated_at: now,
        });
        return toMakerAccountIdentity(profile);
      } catch (error) {
        if (
          authEmailChanged
          && previousAuthEmail
        ) {
          await adminClient.auth.admin.updateUserById(existingProfile.id, {
            email: previousAuthEmail,
            email_confirm: true,
          }).catch(() => undefined);
        }

        if (error instanceof DuplicateMakerRecoveryEmailError) {
          throw error;
        }

        if (
          error instanceof Error
          && isMissingSupabaseRecoveryEmailColumn(error.message)
        ) {
          return toMakerAccountIdentity(existingProfile);
        }
        throw error;
      }
    },

    async updateAccountPassword(userId, password) {
      const normalizedUserId = userId.trim();
      if (!normalizedUserId) {
        return false;
      }

      const adminClient = createSupabaseMakerAuthAdminClient(config);
      const { error } = await adminClient.auth.admin.updateUserById(normalizedUserId, {
        password,
      });

      if (error) {
        throw new Error(`Failed to update Supabase maker password: ${error.message}`);
      }

      return true;
    },
  };
}
