import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getMissingSupabasePersistenceEnv,
  getPersistenceProviderConfig,
  type PersistenceProviderConfig,
} from "@/lib/persistence-config";

/**
 * 게임 메타/원본 JSON 저장에 쓰는 서버 전용 Supabase client를 만든다.
 * `games.owner_id`가 `profiles.id`를 참조하므로, 현재 단계에서는 maker auth도 Supabase여야 한다.
 */
export function createSupabasePersistenceClient(
  config: PersistenceProviderConfig = getPersistenceProviderConfig()
): SupabaseClient {
  const missingEnv = getMissingSupabasePersistenceEnv(config);
  if (missingEnv.length > 0) {
    throw new Error(
      `Supabase persistence requires env vars: ${missingEnv.join(", ")}`
    );
  }

  return createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      // Next.js 14 App Router가 기본 GET fetch를 force-cache 처리해서
      // dynamic 플래그가 없는 라우트(/api/join 등)에서 Supabase 쿼리 결과가
      // 장시간 고정되는 이슈가 있었다. persistence 쿼리는 항상 최신이어야 하므로
      // 글로벌 fetch를 cache: "no-store"로 덮어써서 데이터 캐시 레이어를 우회한다.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
