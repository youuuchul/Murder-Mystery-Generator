import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeMakerLoginId,
  normalizeMakerRecoveryEmail,
} from "@/lib/maker-account";
import type { MakerAuthProviderConfig } from "@/lib/maker-auth-config";

export interface SupabaseMakerProfileRow {
  id: string;
  display_name: string;
  login_id: string;
  recovery_email: string | null;
  role: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

const SUPABASE_MAKER_PROFILE_COLUMNS = "*";

/**
 * 로그인 ID 를 Supabase email/password Auth 에 태우기 위한 내부 전용 이메일로 바꾼다.
 * 외부 사용자에게 보이는 값은 계속 `loginId` 이고, email 은 구현 세부사항으로만 쓴다.
 */
export function buildSupabaseMakerEmail(loginId: string): string {
  return `${normalizeMakerLoginId(loginId)}@makers.local`;
}

/**
 * 현재 메이커 계정이 Auth 레이어에서 실제로 쓰는 이메일을 계산한다.
 * 복구 이메일이 있으면 Auth email도 그 값을 쓰고, 없으면 내부 전용 makers.local 주소를 쓴다.
 */
export function resolveSupabaseMakerAuthEmail(
  loginId: string,
  recoveryEmail?: string | null
): string {
  const normalizedRecoveryEmail = normalizeMakerRecoveryEmail(recoveryEmail ?? "");
  return normalizedRecoveryEmail || buildSupabaseMakerEmail(loginId);
}

/** profiles 조회에 공통으로 쓰는 column 목록 문자열. */
export function getSupabaseMakerProfileColumns(): string {
  return SUPABASE_MAKER_PROFILE_COLUMNS;
}

/**
 * 메이커 인증 확인용 public Supabase client.
 * 서버 route 에서만 쓰고 세션은 브라우저에 유지하지 않는다.
 */
export function createSupabaseMakerAuthClient(
  config: MakerAuthProviderConfig
): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * profiles 조회/생성 및 Auth admin 작업용 서버 전용 secret key client.
 * 반드시 서버에서만 사용해야 한다.
 */
export function createSupabaseMakerAuthAdminClient(
  config: MakerAuthProviderConfig
): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
