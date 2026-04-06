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
    const sessionName = buildAutomaticSessionName(listLocalActiveSessions(game.id));
    return withSessionName(createLocalSession(game, sessionName), sessionName);
  },
  async getSession(sessionId) {
    const session = getLocalSession(sessionId);
    return session ? withSessionName(session) : null;
  },
  async getSessionByCode(sessionCode) {
    const session = getLocalSessionByCode(sessionCode);
    return session ? withSessionName(session) : null;
  },
  async updateSession(session) {
    updateLocalSession(withSessionName(session));
  },
  async deleteSession(sessionId) {
    return deleteLocalSession(sessionId);
  },
  async listActiveSessions(gameId) {
    return sortSessionsForList(listLocalActiveSessions(gameId)).map((session) => withSessionName(session));
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

/**
 * GM 세션 목록에서 실제 진행 중인 세션이 빈 lobby보다 먼저 보이도록 정렬한다.
 * 같은 우선순위 안에서는 최신 생성 세션을 먼저 유지한다.
 */
function sortSessionsForList<T extends GameSession>(sessions: T[]): T[] {
  function getPriority(session: GameSession): number {
    const lockedPlayerCount = session.sharedState.characterSlots.filter((slot) => slot.isLocked).length;

    if (session.sharedState.phase !== "lobby") {
      return 0;
    }

    if (lockedPlayerCount > 0) {
      return 1;
    }

    return 2;
  }

  return [...sessions].sort((a, b) => {
    const priorityDiff = getPriority(a) - getPriority(b);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function normalizeSessionCode(sessionCode: string): string {
  return sessionCode.trim().toUpperCase();
}

/**
 * 생성 시점 기준으로 사람이 구분하기 쉬운 기본 방 제목을 만든다.
 */
function buildAutomaticSessionName(existingSessions: GameSession[]): string {
  return `${existingSessions.length + 1}번 방`;
}

/**
 * 예전 세션에 이름이 없을 때 목록과 현재 화면에서 쓸 임시 방 제목을 만든다.
 */
function buildFallbackSessionName(createdAt: string): string {
  const date = new Date(createdAt);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}.${day} ${hour}:${minute} 방`;
}

/**
 * 세션 이름이 비어 있으면 화면에서 바로 쓸 수 있는 기본 이름을 채운다.
 */
function withSessionName<T extends GameSession>(session: T, fallbackName?: string): T {
  const normalizedSessionName = session.sessionName?.trim() || fallbackName || buildFallbackSessionName(session.createdAt);

  if (normalizedSessionName === session.sessionName) {
    return session;
  }

  return {
    ...session,
    sessionName: normalizedSessionName,
  };
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
    ? withSessionName((data as unknown as SupabaseSessionRow).session_json as GameSession)
    : null;
}

async function loadSupabaseActiveSessions(gameId: string): Promise<GameSession[]> {
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

  return sortSessionsForList(
    ((data ?? []) as unknown as SupabaseSessionRow[])
      .map((row) => withSessionName(row.session_json as GameSession))
  );
}

/**
 * Supabase sessions 저장소 구현.
 * 현재 세션 API는 raw token을 포함한 GameSession 전체를 한 번에 읽고 쓰므로 canonical source를 `session_json`으로 유지한다.
 */
const supabaseSessionRepository: SessionRepository = {
  async createSession(game) {
    const supabase = createSupabasePersistenceClient();
    const existingSessions = await loadSupabaseActiveSessions(game.id);
    const sessionName = buildAutomaticSessionName(existingSessions);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const session = buildInitialSession(game, undefined, undefined, undefined, sessionName);
      const row = buildSupabaseSessionRow(session);
      const { data, error } = await supabase
        .from("sessions")
        .insert(row)
        .select(SUPABASE_SESSION_COLUMNS)
        .single();

      if (!error && data) {
        return withSessionName((data as unknown as SupabaseSessionRow).session_json as GameSession, sessionName);
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
      .upsert(buildSupabaseSessionRow(withSessionName(session)), { onConflict: "id" });

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
    return loadSupabaseActiveSessions(gameId);
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
