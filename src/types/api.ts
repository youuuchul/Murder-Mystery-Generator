import type { GameMetadata, GamePackage, GameSettings } from "./game";

// ─── 게임 API ───────────────────────────────────────────────

export interface ListGamesResponse {
  games: GameMetadata[];
}

export interface GetGameResponse {
  game: GamePackage;
}

export interface CreateGameRequest {
  title: string;
  settings: GameSettings;
}

export interface CreateGameResponse {
  game: GamePackage;
}

export interface UpdateGameRequest {
  game: Partial<Omit<GamePackage, "id" | "createdAt">>;
}

export interface UpdateGameResponse {
  game: GamePackage;
}

export interface DeleteGameResponse {
  success: boolean;
}

// ─── 공통 에러 응답 ─────────────────────────────────────────

export interface ApiError {
  error: string;
  details?: unknown;
}
