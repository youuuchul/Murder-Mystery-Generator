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
  });
}
