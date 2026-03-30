export type MakerAuthProvider = "local" | "supabase";

export interface MakerAuthProviderConfig {
  provider: MakerAuthProvider;
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseServiceRoleKey: string;
}

/**
 * 메이커 인증 provider 설정값을 정규화한다.
 * 미설정 또는 알 수 없는 값은 항상 `local` 로 되돌린다.
 */
function normalizeMakerAuthProvider(value: string | undefined): MakerAuthProvider {
  return value?.trim().toLowerCase() === "supabase" ? "supabase" : "local";
}

/**
 * 현재 서버 프로세스가 사용할 메이커 인증 provider 설정을 읽는다.
 * 이후 Supabase Auth 전환 시 route/page 계층은 이 설정만 의존하면 된다.
 */
export function getMakerAuthProviderConfig(): MakerAuthProviderConfig {
  return {
    provider: normalizeMakerAuthProvider(process.env.MAKER_AUTH_PROVIDER),
    supabaseUrl: (
      process.env.NEXT_PUBLIC_SUPABASE_URL
      ?? process.env.SUPABASE_URL
      ?? ""
    ).trim(),
    supabasePublishableKey: (
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ?? process.env.SUPABASE_PUBLISHABLE_KEY
      ?? ""
    ).trim(),
    supabaseServiceRoleKey: (
      process.env.SUPABASE_SERVICE_ROLE_KEY
      ?? process.env.SUPABASE_SECRET_KEY
      ?? ""
    ).trim(),
  };
}

/**
 * Supabase provider 사용에 필요한 환경변수 중 비어 있는 항목을 반환한다.
 */
export function getMissingSupabaseMakerAuthEnv(
  config: MakerAuthProviderConfig = getMakerAuthProviderConfig()
): string[] {
  if (config.provider !== "supabase") {
    return [];
  }

  const missing: string[] = [];

  if (!config.supabaseUrl) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!config.supabasePublishableKey) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_PUBLISHABLE_KEY");
  }

  if (!config.supabaseServiceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY");
  }

  return missing;
}
