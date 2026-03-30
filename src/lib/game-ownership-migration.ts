import { isGameOwner, reassignGameOwnership } from "@/lib/game-access";
import { getGame, listGames, saveGame } from "@/lib/storage/game-storage";

export interface OwnershipMigrationResult {
  updatedCount: number;
  updatedGameIds: string[];
}

/**
 * 로컬 JSON 게임 저장소에서 특정 ownerId 를 다른 사용자로 일괄 이관한다.
 * Supabase 계정 생성 시 기존 로컬 작업자의 ownerId 를 새 auth user id 로 옮길 때 쓴다.
 */
export function migrateLocalGameOwnership(
  previousOwnerId: string,
  nextOwnerId: string,
  now = new Date().toISOString()
): OwnershipMigrationResult {
  const fromOwnerId = previousOwnerId.trim();
  const toOwnerId = nextOwnerId.trim();

  if (!fromOwnerId || !toOwnerId || fromOwnerId === toOwnerId) {
    return {
      updatedCount: 0,
      updatedGameIds: [],
    };
  }

  const updatedGameIds: string[] = [];

  for (const metadata of listGames()) {
    const game = getGame(metadata.id);
    if (!game || !isGameOwner(game, fromOwnerId)) {
      continue;
    }

    saveGame(reassignGameOwnership(game, toOwnerId, now));
    updatedGameIds.push(game.id);
  }

  return {
    updatedCount: updatedGameIds.length,
    updatedGameIds,
  };
}
