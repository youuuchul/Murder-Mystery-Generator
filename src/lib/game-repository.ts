import type { GameMetadata, GamePackage } from "@/types/game";
import { getPersistenceProviderConfig } from "@/lib/persistence-config";
import {
  deleteGame as deleteLocalGame,
  getGame as getLocalGame,
  listGames as listLocalGames,
  listPublicGames as listLocalPublicGames,
  saveGame as saveLocalGame,
} from "@/lib/storage/game-storage";

export interface GameRepository {
  listGames(): GameMetadata[];
  listPublicGames(): GameMetadata[];
  getGame(gameId: string): GamePackage | null;
  saveGame(game: GamePackage): void;
  deleteGame(gameId: string): boolean;
}

/**
 * 로컬 JSON 기반 게임 저장소 구현.
 * 호출부는 이 경계만 의존하고, 실제 파일 I/O 구현은 storage 폴더에 남긴다.
 */
const localGameRepository: GameRepository = {
  listGames() {
    return listLocalGames();
  },
  listPublicGames() {
    return listLocalPublicGames();
  },
  getGame(gameId) {
    return getLocalGame(gameId);
  },
  saveGame(game) {
    saveLocalGame(game);
  },
  deleteGame(gameId) {
    return deleteLocalGame(gameId);
  },
};

let cachedProvider: ReturnType<typeof getPersistenceProviderConfig>["provider"] | null = null;
let cachedRepository: GameRepository | null = null;

/**
 * 현재 게임 저장소 구현을 반환한다.
 * Supabase DB 전환 전까지는 local provider 만 실제로 구현한다.
 */
export function getGameRepository(): GameRepository {
  const config = getPersistenceProviderConfig();

  if (cachedRepository && cachedProvider === config.provider) {
    return cachedRepository;
  }

  cachedProvider = config.provider;

  if (config.provider === "supabase") {
    throw new Error("APP_PERSISTENCE_PROVIDER=supabase is not implemented for games yet.");
  }

  cachedRepository = localGameRepository;
  return cachedRepository;
}

export function listGames(): GameMetadata[] {
  return getGameRepository().listGames();
}

export function listPublicGames(): GameMetadata[] {
  return getGameRepository().listPublicGames();
}

export function getGame(gameId: string): GamePackage | null {
  return getGameRepository().getGame(gameId);
}

export function saveGame(game: GamePackage): void {
  getGameRepository().saveGame(game);
}

export function deleteGame(gameId: string): boolean {
  return getGameRepository().deleteGame(gameId);
}
