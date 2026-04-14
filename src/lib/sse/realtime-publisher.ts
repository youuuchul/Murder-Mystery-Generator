/**
 * Supabase Realtime Broadcast 발행 (서버 → 전 인스턴스 전파).
 * Vercel 서버리스에서 in-memory broadcaster가 다른 인스턴스에 닿지 못하는 한계를 보완한다.
 * REST 엔드포인트를 사용해 구독 없이 fire-and-forget 으로 전송한다.
 */
import { getPersistenceProviderConfig } from "@/lib/persistence-config";

const PUBLIC_REALTIME_CHANNEL_PREFIX = "session";

export function sessionRealtimeTopic(sessionId: string): string {
  return `${PUBLIC_REALTIME_CHANNEL_PREFIX}:${sessionId}`;
}

export async function publishSessionRealtime(
  sessionId: string,
  event: string,
  payload: unknown
): Promise<void> {
  const { supabaseUrl, supabaseSecretKey } = getPersistenceProviderConfig();
  if (!supabaseUrl || !supabaseSecretKey) return;

  try {
    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseSecretKey,
        Authorization: `Bearer ${supabaseSecretKey}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: sessionRealtimeTopic(sessionId),
            event,
            payload,
            private: false,
          },
        ],
      }),
    });
  } catch {
    // 실시간 발행 실패는 게임 진행을 막지 않는다.
  }
}
