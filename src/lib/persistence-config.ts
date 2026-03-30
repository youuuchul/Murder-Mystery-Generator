export type PersistenceProvider = "local" | "supabase";

export interface PersistenceProviderConfig {
  provider: PersistenceProvider;
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
  };
}
