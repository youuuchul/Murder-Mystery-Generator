import type { GamePackage } from "@/types/game";
import type { GameSession } from "@/types/session";
import { getPersistenceProviderConfig } from "@/lib/persistence-config";
import { buildInitialSession } from "@/lib/session-factory";
import { createSupabasePersistenceClient } from "@/lib/supabase/persistence";
import {
  createSession as createLocalSession,
  deleteSession as deleteLocalSession,
  getSession as getLocalSession,
  getSessionByCode as getLocalSessionByCode,
  listActiveSessions as listLocalActiveSessions,
  updateSession as updateLocalSession,
} from "@/lib/storage/session-storage";

export interface SessionRepository {
  createSession(game: GamePackage): Promise<GameSession>;
  getSession(sessionId: string): Promise<GameSession | null>;
  getSessionByCode(sessionCode: string): Promise<GameSession | null>;
  updateSession(session: GameSession): Promise<void>;
  deleteSession(sessionId: string): Promise<boolean>;
  listActiveSessions(gameId: string): Promise<GameSession[]>;
}

/**
 * 로컬 JSON 기반 세션 저장소 구현.
 * 세션 변경이 잦아도 route/page 계층은 이 경계만 의존하게 유지한다.
 */
const localSessionRepository: SessionRepository = {
  async createSession(game) {
    return createLocalSession(game);
  },
  async getSession(sessionId) {
    return getLocalSession(sessionId);
  },
  async getSessionByCode(sessionCode) {
    return getLocalSessionByCode(sessionCode);
  },
  async updateSession(session) {
    updateLocalSession(session);
  },
  async deleteSession(sessionId) {
    return deleteLocalSession(sessionId);
  },
  async listActiveSessions(gameId) {
    return listLocalActiveSessions(gameId);
  },
};

interface SupabaseSessionRow {
  id: string;
  game_id: string;
  session_code: string;
  host_user_id: string | null;
  phase: GameSession["sharedState"]["phase"];
  current_round: number;
  current_sub_phase: GameSession["sharedState"]["currentSubPhase"] | null;
  locked_player_count: number;
  total_player_count: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  session_json: GameSession;
}

const SUPABASE_SESSION_COLUMNS = [
  "id",
  "game_id",
  "session_code",
  "host_user_id",
  "phase",
  "current_round",
  "current_sub_phase",
  "locked_player_count",
  "total_player_count",
  "started_at",
  "ended_at",
  "created_at",
  "updated_at",
  "session_json",
].join(",");

function normalizeSessionCode(sessionCode: string): string {
  return sessionCode.trim().toUpperCase();
}

function buildSupabaseSessionRow(session: GameSession): SupabaseSessionRow {
  return {
    id: session.id,
    game_id: session.gameId,
    session_code: normalizeSessionCode(session.sessionCode),
    host_user_id: null,
    phase: session.sharedState.phase,
    current_round: session.sharedState.currentRound,
    current_sub_phase: session.sharedState.currentSubPhase ?? null,
    locked_player_count: session.sharedState.characterSlots.filter((slot) => slot.isLocked).length,
    total_player_count: session.sharedState.characterSlots.length,
    started_at: session.startedAt ?? null,
    ended_at: session.endedAt ?? null,
    created_at: session.createdAt,
    updated_at: new Date().toISOString(),
    session_json: session,
  };
}

async function loadSupabaseSessionBy(
  column: "id" | "session_code",
  value: string
): Promise<GameSession | null> {
  const normalizedValue = column === "session_code"
    ? normalizeSessionCode(value)
    : value.trim();
  if (!normalizedValue) {
    return null;
  }

  const supabase = createSupabasePersistenceClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(SUPABASE_SESSION_COLUMNS)
    .eq(column, normalizedValue)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Supabase session: ${error.message}`);
  }

  return data
    ? ((data as unknown as SupabaseSessionRow).session_json as GameSession)
    : null;
}

/**
 * Supabase sessions 저장소 구현.
 * 현재 세션 API는 raw token을 포함한 GameSession 전체를 한 번에 읽고 쓰므로 canonical source를 `session_json`으로 유지한다.
 */
const supabaseSessionRepository: SessionRepository = {
  async createSession(game) {
    const supabase = createSupabasePersistenceClient();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const session = buildInitialSession(game);
      const row = buildSupabaseSessionRow(session);
      const { data, error } = await supabase
        .from("sessions")
        .insert(row)
        .select(SUPABASE_SESSION_COLUMNS)
        .single();

      if (!error && data) {
        return (data as unknown as SupabaseSessionRow).session_json as GameSession;
      }

      if (error?.code !== "23505") {
        throw new Error(`Failed to create Supabase session: ${error?.message ?? "unknown error"}`);
      }
    }

    throw new Error("Failed to create Supabase session after retrying code generation.");
  },

  async getSession(sessionId) {
    return loadSupabaseSessionBy("id", sessionId);
  },

  async getSessionByCode(sessionCode) {
    return loadSupabaseSessionBy("session_code", sessionCode);
  },

  async updateSession(session) {
    const supabase = createSupabasePersistenceClient();
    const { error } = await supabase
      .from("sessions")
      .upsert(buildSupabaseSessionRow(session), { onConflict: "id" });

    if (error) {
      throw new Error(`Failed to update Supabase session: ${error.message}`);
    }
  },

  async deleteSession(sessionId) {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      return false;
    }

    const supabase = createSupabasePersistenceClient();
    const { data, error } = await supabase
      .from("sessions")
      .delete()
      .eq("id", normalizedSessionId)
      .select("id");

    if (error) {
      throw new Error(`Failed to delete Supabase session: ${error.message}`);
    }

    return (data?.length ?? 0) > 0;
  },

  async listActiveSessions(gameId) {
    const normalizedGameId = gameId.trim();
    if (!normalizedGameId) {
      return [];
    }

    const supabase = createSupabasePersistenceClient();
    const { data, error } = await supabase
      .from("sessions")
      .select(SUPABASE_SESSION_COLUMNS)
      .eq("game_id", normalizedGameId)
      .is("ended_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to list Supabase sessions: ${error.message}`);
    }

    return ((data ?? []) as unknown as SupabaseSessionRow[])
      .map((row) => row.session_json as GameSession);
  },
};

let cachedProvider: ReturnType<typeof getPersistenceProviderConfig>["provider"] | null = null;
let cachedRepository: SessionRepository | null = null;

/**
 * 현재 세션 저장소 구현을 반환한다.
 * local 과 supabase 구현을 모두 이 경계 뒤로 숨겨 route/page 계층은 같은 API만 사용하게 유지한다.
 */
export function getSessionRepository(): SessionRepository {
  const config = getPersistenceProviderConfig();

  if (cachedRepository && cachedProvider === config.provider) {
    return cachedRepository;
  }

  cachedProvider = config.provider;

  if (config.provider === "supabase") {
    cachedRepository = supabaseSessionRepository;
    return cachedRepository;
  }

  cachedRepository = localSessionRepository;
  return cachedRepository;
}

export function createSession(game: GamePackage): Promise<GameSession> {
  return getSessionRepository().createSession(game);
}

export function getSession(sessionId: string): Promise<GameSession | null> {
  return getSessionRepository().getSession(sessionId);
}

export function getSessionByCode(sessionCode: string): Promise<GameSession | null> {
  return getSessionRepository().getSessionByCode(sessionCode);
}

export function updateSession(session: GameSession): Promise<void> {
  return getSessionRepository().updateSession(session);
}

export function deleteSession(sessionId: string): Promise<boolean> {
  return getSessionRepository().deleteSession(sessionId);
}

export function listActiveSessions(gameId: string): Promise<GameSession[]> {
  return getSessionRepository().listActiveSessions(gameId);
}
