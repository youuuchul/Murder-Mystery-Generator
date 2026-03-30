import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeMakerLoginId } from "@/lib/maker-account";
import type { MakerAuthProviderConfig } from "@/lib/maker-auth-config";

export interface SupabaseMakerProfileRow {
  id: string;
  display_name: string;
  login_id: string;
  role: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

const SUPABASE_MAKER_PROFILE_COLUMNS = [
  "id",
  "display_name",
  "login_id",
  "role",
  "avatar_url",
  "created_at",
  "updated_at",
].join(",");

/**
 * 로그인 ID 를 Supabase email/password Auth 에 태우기 위한 내부 전용 이메일로 바꾼다.
 * 외부 사용자에게 보이는 값은 계속 `loginId` 이고, email 은 구현 세부사항으로만 쓴다.
 */
export function buildSupabaseMakerEmail(loginId: string): string {
  return `${normalizeMakerLoginId(loginId)}@makers.local`;
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
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * profiles 조회/생성 및 Auth admin 작업용 service-role client.
 * 반드시 서버에서만 사용해야 한다.
 */
export function createSupabaseMakerAuthAdminClient(
  config: MakerAuthProviderConfig
): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
