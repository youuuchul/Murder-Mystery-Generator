"use client";

/**
 * 브라우저 전용 Supabase Realtime 구독 클라이언트.
 * - anon/publishable key만 사용 (public 채널 구독).
 * - 메이커 인증/DB 쿼리용이 아니라 Realtime Broadcast 수신 전용으로 경량화.
 * - 탭 단위 싱글톤으로 여러 훅이 호출해도 WebSocket 하나만 유지.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getRealtimeClient(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  cached = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}
