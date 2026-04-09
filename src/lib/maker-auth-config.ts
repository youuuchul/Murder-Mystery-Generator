export interface MakerAuthProviderConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseSecretKey: string;
}

/**
 * 현재 서버 프로세스가 사용할 메이커 인증 설정을 읽는다.
 * 인증 backend는 Supabase 단일 구현만 지원한다.
 */
export function getMakerAuthProviderConfig(): MakerAuthProviderConfig {
  return {
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
    supabaseSecretKey: (
      process.env.SUPABASE_SECRET_KEY
      ?? process.env.SUPABASE_SERVICE_ROLE_KEY
      ?? ""
    ).trim(),
  };
}

/**
 * Supabase 인증에 필요한 환경변수 중 비어 있는 항목을 반환한다.
 */
export function getMissingSupabaseMakerAuthEnv(
  config: MakerAuthProviderConfig = getMakerAuthProviderConfig()
): string[] {
  const missing: string[] = [];

  if (!config.supabaseUrl) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!config.supabasePublishableKey) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_PUBLISHABLE_KEY");
  }

  if (!config.supabaseSecretKey) {
    missing.push("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");
  }

  return missing;
}
