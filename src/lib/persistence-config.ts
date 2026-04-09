export interface PersistenceProviderConfig {
  supabaseUrl: string;
  supabaseSecretKey: string;
}

/**
 * 현재 서버 프로세스가 사용할 데이터 저장 설정을 읽는다.
 * 저장 backend는 Supabase 단일 구현만 지원한다.
 */
export function getPersistenceProviderConfig(): PersistenceProviderConfig {
  return {
    supabaseUrl: (
      process.env.NEXT_PUBLIC_SUPABASE_URL
      ?? process.env.SUPABASE_URL
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
 * Supabase persistence 사용에 필요한 환경변수 중 비어 있는 항목을 반환한다.
 */
export function getMissingSupabasePersistenceEnv(
  config: PersistenceProviderConfig = getPersistenceProviderConfig()
): string[] {
  const missing: string[] = [];

  if (!config.supabaseUrl) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
  }

  if (!config.supabaseSecretKey) {
    missing.push("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");
  }

  return missing;
}
