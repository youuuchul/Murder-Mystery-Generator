import type { GamePackage } from "@/types/game";
import type { GameSession } from "@/types/session";
import { getPersistenceProviderConfig } from "@/lib/persistence-config";
import {
  createSession as createLocalSession,
  deleteSession as deleteLocalSession,
  getSession as getLocalSession,
  getSessionByCode as getLocalSessionByCode,
  listActiveSessions as listLocalActiveSessions,
  updateSession as updateLocalSession,
} from "@/lib/storage/session-storage";

export interface SessionRepository {
  createSession(game: GamePackage): GameSession;
  getSession(sessionId: string): GameSession | null;
  getSessionByCode(sessionCode: string): GameSession | null;
  updateSession(session: GameSession): void;
  deleteSession(sessionId: string): boolean;
  listActiveSessions(gameId: string): GameSession[];
}

/**
 * 로컬 JSON 기반 세션 저장소 구현.
 * 세션 변경이 잦아도 route/page 계층은 이 경계만 의존하게 유지한다.
 */
const localSessionRepository: SessionRepository = {
  createSession(game) {
    return createLocalSession(game);
  },
  getSession(sessionId) {
    return getLocalSession(sessionId);
  },
  getSessionByCode(sessionCode) {
    return getLocalSessionByCode(sessionCode);
  },
  updateSession(session) {
    updateLocalSession(session);
  },
  deleteSession(sessionId) {
    return deleteLocalSession(sessionId);
  },
  listActiveSessions(gameId) {
    return listLocalActiveSessions(gameId);
  },
};

let cachedProvider: ReturnType<typeof getPersistenceProviderConfig>["provider"] | null = null;
let cachedRepository: SessionRepository | null = null;

/**
 * 현재 세션 저장소 구현을 반환한다.
 * Supabase DB 전환 전까지는 local provider 만 실제로 구현한다.
 */
export function getSessionRepository(): SessionRepository {
  const config = getPersistenceProviderConfig();

  if (cachedRepository && cachedProvider === config.provider) {
    return cachedRepository;
  }

  cachedProvider = config.provider;

  if (config.provider === "supabase") {
    throw new Error("APP_PERSISTENCE_PROVIDER=supabase is not implemented for sessions yet.");
  }

  cachedRepository = localSessionRepository;
  return cachedRepository;
}

export function createSession(game: GamePackage): GameSession {
  return getSessionRepository().createSession(game);
}

export function getSession(sessionId: string): GameSession | null {
  return getSessionRepository().getSession(sessionId);
}

export function getSessionByCode(sessionCode: string): GameSession | null {
  return getSessionRepository().getSessionByCode(sessionCode);
}

export function updateSession(session: GameSession): void {
  getSessionRepository().updateSession(session);
}

export function deleteSession(sessionId: string): boolean {
  return getSessionRepository().deleteSession(sessionId);
}

export function listActiveSessions(gameId: string): GameSession[] {
  return getSessionRepository().listActiveSessions(gameId);
}
