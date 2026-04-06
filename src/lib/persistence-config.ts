export type PersistenceProvider = "local" | "supabase";

export interface PersistenceProviderConfig {
  provider: PersistenceProvider;
  supabaseUrl: string;
  supabaseSecretKey: string;
}

/**
 * 게임/세션 저장소 provider 설정값을 정규화한다.
 * 미설정 또는 알 수 없는 값은 항상 `local` 로 되돌린다.
 */
function normalizePersistenceProvider(value: string | undefined): PersistenceProvider {
  return value?.trim().toLowerCase() === "supabase" ? "supabase" : "local";
}

/**
 * 현재 서버 프로세스가 사용할 데이터 저장 provider 를 읽는다.
 * 메이커 인증 provider 와 분리해, 인증은 Supabase 여도 저장은 로컬 JSON 인 과도기 구성을 허용한다.
 */
export function getPersistenceProviderConfig(): PersistenceProviderConfig {
  return {
    provider: normalizePersistenceProvider(process.env.APP_PERSISTENCE_PROVIDER),
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
 * Supabase persistence provider 사용에 필요한 환경변수 중 비어 있는 항목을 반환한다.
 * 게임 저장소는 서버 전용 secret key client를 사용하므로 URL과 secret key만 검사한다.
 */
export function getMissingSupabasePersistenceEnv(
  config: PersistenceProviderConfig = getPersistenceProviderConfig()
): string[] {
  if (config.provider !== "supabase") {
    return [];
  }

  const missing: string[] = [];

  if (!config.supabaseUrl) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
  }

  if (!config.supabaseSecretKey) {
    missing.push("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");
  }

  return missing;
}
