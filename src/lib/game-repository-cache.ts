import { getGame } from "@/lib/game-repository";
import type { GamePackage } from "@/types/game";

/**
 * 세션 폴링 핫패스용 getGame 짧은 TTL 캐시.
 *
 * Why: 플레이어 페이지가 1.2초마다 /api/sessions/[id]를 부르고, 그 안에서
 * 매번 정규화된 15개 테이블을 조인해 게임을 로드한다. 게임은 세션 진행 중에는
 * 거의 변하지 않으므로 인스턴스 로컬에서 30초만 재사용한다.
 *
 * How to apply: 세션 GET / events / cards 등 읽기 전용 핫패스에서만 사용.
 * 메이커 편집 등 쓰기 직후 즉시 읽어야 하는 곳에서는 원본 getGame 사용.
 */

type Entry = {
  game: GamePackage | null;
  expiresAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __game_cache: Map<string, Entry> | undefined;
}

const cache: Map<string, Entry> = (globalThis.__game_cache ??= new Map());
const TTL_MS = 30_000;
const MAX_ENTRIES = 100;

export async function getGameCached(gameId: string): Promise<GamePackage | null> {
  const now = Date.now();
  const entry = cache.get(gameId);
  if (entry && entry.expiresAt > now) {
    return entry.game;
  }

  const game = await getGame(gameId);

  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(gameId, { game, expiresAt: now + TTL_MS });
  return game;
}

/** 게임 수정 직후 호출해 캐시 무효화. */
export function invalidateGameCache(gameId: string): void {
  cache.delete(gameId);
}
