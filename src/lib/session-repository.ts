import type { GamePackage } from "@/types/game";
import type { GameSession, SessionMode } from "@/types/session";
import { normalizePlayerAgentSessionState } from "@/lib/ai/player-agent/core/player-agent-state";
import { buildInitialSession } from "@/lib/session-factory";
import { createSessionBackupSnapshot } from "@/lib/session-integrity";
import { createSupabasePersistenceClient } from "@/lib/supabase/persistence";

export interface CreateSessionOptions {
  hostUserId?: string;
  sessionMode?: SessionMode;
}

export interface SessionRepository {
  createSession(game: GamePackage, options?: CreateSessionOptions): Promise<GameSession>;
  getSession(sessionId: string): Promise<GameSession | null>;
  getSessionByCode(sessionCode: string): Promise<GameSession | null>;
  updateSession(session: GameSession): Promise<GameSession>;
  deleteSession(sessionId: string): Promise<boolean>;
  listActiveSessions(gameId: string): Promise<GameSession[]>;
  listAllActiveSessions(): Promise<GameSession[]>;
  countActiveSessionsByHost(hostUserId: string): Promise<number>;
  listActiveSessionsByHost(hostUserId: string): Promise<GameSession[]>;
}

/**
 * 오래된 세션 사본을 기준으로 덮어쓰려 할 때 던지는 충돌 오류다.
 * 최근 저장본을 다시 읽은 뒤 재시도하도록 호출부에서 409로 노출한다.
 */
export class SessionConflictError extends Error {
  constructor(message = "다른 변경사항이 먼저 저장돼 세션 갱신에 실패했습니다.") {
    super(message);
    this.name = "SessionConflictError";
  }
}

export function isSessionConflictError(error: unknown): error is SessionConflictError {
  return error instanceof SessionConflictError;
}

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
 * 세션 모드가 비어 있거나 손상된 오래된 데이터를 현재 기본값으로 보정한다.
 */
function normalizeSessionMode(value: string | undefined): SessionMode {
  return value === "player-consensus" ? "player-consensus" : "gm";
}

/**
 * GM 대시보드로 다루는 세션인지 판별한다.
 * 플레이어 합의 세션은 참가 퍼널과 플레이어 화면에서만 다룬다.
 */
export function isGmManagedSession(session: Pick<GameSession, "mode">): boolean {
  return normalizeSessionMode(session.mode) === "gm";
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
 * 세션 이름과 갱신 시각이 비어 있으면 화면과 저장소 비교에 필요한 기본값을 채운다.
 */
function withSessionDefaults<T extends GameSession>(
  session: T,
  options: {
    fallbackName?: string;
    fallbackUpdatedAt?: string;
  } = {}
): T {
  const normalizedMode = normalizeSessionMode(session.mode);
  const normalizedSessionName = session.sessionName?.trim()
    || options.fallbackName
    || buildFallbackSessionName(session.createdAt);
  const normalizedUpdatedAt = session.updatedAt?.trim()
    || options.fallbackUpdatedAt
    || session.createdAt;
  const normalizedPlayerAgentState = normalizePlayerAgentSessionState(
    session.playerAgentState,
    session.id,
    normalizedMode,
    session.sharedState.characterSlots.map((slot) => slot.playerId)
  );

  if (
    normalizedMode === session.mode
    && normalizedSessionName === session.sessionName
    && normalizedUpdatedAt === session.updatedAt
    && normalizedPlayerAgentState === session.playerAgentState
  ) {
    return session;
  }

  return {
    ...session,
    mode: normalizedMode,
    sessionName: normalizedSessionName,
    updatedAt: normalizedUpdatedAt,
    playerAgentState: normalizedPlayerAgentState,
  };
}

/** eventLog 최대 크기 — JSONB 저장 부하 억제 */
const MAX_EVENT_LOG_SIZE = 200;

function capEventLog(session: GameSession): GameSession {
  const log = session.sharedState.eventLog ?? [];
  if (log.length <= MAX_EVENT_LOG_SIZE) return session;
  return {
    ...session,
    sharedState: {
      ...session.sharedState,
      eventLog: log.slice(-MAX_EVENT_LOG_SIZE),
    },
  };
}

function buildSupabaseSessionRow(session: GameSession): SupabaseSessionRow {
  const normalizedSession = capEventLog(withSessionDefaults(session));
  return {
    id: normalizedSession.id,
    game_id: normalizedSession.gameId,
    session_code: normalizeSessionCode(normalizedSession.sessionCode),
    host_user_id: normalizedSession.hostUserId?.trim() || null,
    phase: normalizedSession.sharedState.phase,
    current_round: normalizedSession.sharedState.currentRound,
    current_sub_phase: normalizedSession.sharedState.currentSubPhase ?? null,
    locked_player_count: normalizedSession.sharedState.characterSlots.filter((slot) => slot.isLocked).length,
    total_player_count: normalizedSession.sharedState.characterSlots.length,
    started_at: normalizedSession.startedAt ?? null,
    ended_at: normalizedSession.endedAt ?? null,
    created_at: normalizedSession.createdAt,
    updated_at: normalizedSession.updatedAt,
    session_json: normalizedSession,
  };
}

/**
 * Supabase row와 세션 JSON 사이에 빠진 기본 필드를 보정한다.
 * Supabase trigger가 row `updated_at`을 다시 쓰므로,
 * concurrency token은 항상 row 컬럼 값을 진실로 사용한다.
 */
function hydrateSupabaseSession(row: SupabaseSessionRow): GameSession {
  return withSessionDefaults(
    {
      ...(row.session_json as GameSession),
      gameId: row.game_id,
      sessionCode: normalizeSessionCode(row.session_json.sessionCode ?? row.session_code),
      hostUserId: row.session_json.hostUserId ?? row.host_user_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.session_json.startedAt ?? row.started_at ?? undefined,
      endedAt: row.session_json.endedAt ?? row.ended_at ?? undefined,
    },
  );
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
    ? hydrateSupabaseSession(data as unknown as SupabaseSessionRow)
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
      .map((row) => hydrateSupabaseSession(row))
  );
}

async function countSupabaseActiveSessionsByHost(hostUserId: string): Promise<number> {
  const normalizedUserId = hostUserId.trim();
  if (!normalizedUserId) {
    return 0;
  }

  const supabase = createSupabasePersistenceClient();
  const { count, error } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("host_user_id", normalizedUserId)
    .is("ended_at", null);

  if (error) {
    throw new Error(`Failed to count Supabase sessions by host: ${error.message}`);
  }

  return count ?? 0;
}

async function loadSupabaseActiveSessionsByHost(hostUserId: string): Promise<GameSession[]> {
  const normalizedUserId = hostUserId.trim();
  if (!normalizedUserId) {
    return [];
  }

  const supabase = createSupabasePersistenceClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(SUPABASE_SESSION_COLUMNS)
    .eq("host_user_id", normalizedUserId)
    .is("ended_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list Supabase sessions by host: ${error.message}`);
  }

  return sortSessionsForList(
    ((data ?? []) as unknown as SupabaseSessionRow[])
      .map((row) => hydrateSupabaseSession(row))
  );
}

async function loadSupabaseAllActiveSessions(): Promise<GameSession[]> {
  const supabase = createSupabasePersistenceClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(SUPABASE_SESSION_COLUMNS)
    .is("ended_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list all Supabase sessions: ${error.message}`);
  }

  return sortSessionsForList(
    ((data ?? []) as unknown as SupabaseSessionRow[])
      .map((row) => hydrateSupabaseSession(row))
  );
}

/**
 * Supabase sessions 저장소 구현.
 * 현재 세션 API는 raw token을 포함한 GameSession 전체를 한 번에 읽고 쓰므로 canonical source를 `session_json`으로 유지한다.
 */
const supabaseSessionRepository: SessionRepository = {
  async createSession(game, options = {}) {
    const supabase = createSupabasePersistenceClient();
    const existingSessions = await loadSupabaseActiveSessions(game.id);
    const sessionName = buildAutomaticSessionName(existingSessions);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const session = buildInitialSession(
        game,
        undefined,
        undefined,
        undefined,
        sessionName,
        options.hostUserId,
        options.sessionMode ?? "gm"
      );
      const row = buildSupabaseSessionRow(session);
      const { data, error } = await supabase
        .from("sessions")
        .insert(row)
        .select(SUPABASE_SESSION_COLUMNS)
        .single();

      if (!error && data) {
        return withSessionDefaults(
          hydrateSupabaseSession(data as unknown as SupabaseSessionRow),
          { fallbackName: sessionName }
        );
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
    const canonicalSession = withSessionDefaults(session);
    const persistedSession = withSessionDefaults({
      ...canonicalSession,
      updatedAt: new Date().toISOString(),
    });

    const { data, error } = await supabase
      .from("sessions")
      .update(buildSupabaseSessionRow(persistedSession))
      .eq("id", canonicalSession.id)
      .eq("updated_at", canonicalSession.updatedAt)
      .select(SUPABASE_SESSION_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to update Supabase session: ${error.message}`);
    }

    if (!data) {
      throw new SessionConflictError();
    }

    return hydrateSupabaseSession(data as unknown as SupabaseSessionRow);
  },

  async deleteSession(sessionId) {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      return false;
    }

    const existingSession = await loadSupabaseSessionBy("id", normalizedSessionId);
    if (!existingSession) {
      return false;
    }

    await createSessionBackupSnapshot(existingSession, {
      reason: "pre-delete",
    });

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
  async listAllActiveSessions() {
    return loadSupabaseAllActiveSessions();
  },
  async countActiveSessionsByHost(hostUserId) {
    return countSupabaseActiveSessionsByHost(hostUserId);
  },
  async listActiveSessionsByHost(hostUserId) {
    return loadSupabaseActiveSessionsByHost(hostUserId);
  },
};

export function getSessionRepository(): SessionRepository {
  return supabaseSessionRepository;
}

export function createSession(
  game: GamePackage,
  options?: CreateSessionOptions
): Promise<GameSession> {
  return getSessionRepository().createSession(game, options);
}

export function getSession(sessionId: string): Promise<GameSession | null> {
  return getSessionRepository().getSession(sessionId);
}

export function getSessionByCode(sessionCode: string): Promise<GameSession | null> {
  return getSessionRepository().getSessionByCode(sessionCode);
}

export function updateSession(session: GameSession): Promise<GameSession> {
  return getSessionRepository().updateSession(session);
}

export function deleteSession(sessionId: string): Promise<boolean> {
  return getSessionRepository().deleteSession(sessionId);
}

export function listActiveSessions(gameId: string): Promise<GameSession[]> {
  return getSessionRepository().listActiveSessions(gameId);
}

/**
 * 특정 게임의 활성 세션을 모두 삭제한다.
 * 가시성 전환 등에서 잔류 세션 정리에 사용한다.
 * broadcast는 호출 측(API 레이어)에서 처리해야 한다.
 */
export async function deleteActiveSessionsByGameId(gameId: string): Promise<string[]> {
  const sessions = await listActiveSessions(gameId);
  const deletedIds: string[] = [];
  for (const session of sessions) {
    const ok = await deleteSession(session.id);
    if (ok) deletedIds.push(session.id);
  }
  return deletedIds;
}

export function listAllActiveSessions(): Promise<GameSession[]> {
  return getSessionRepository().listAllActiveSessions();
}

export function countActiveSessionsByHost(hostUserId: string): Promise<number> {
  return getSessionRepository().countActiveSessionsByHost(hostUserId);
}

export function listActiveSessionsByHost(hostUserId: string): Promise<GameSession[]> {
  return getSessionRepository().listActiveSessionsByHost(hostUserId);
}

/**
 * 세션 ID 목록 중 아직 종료되지 않은 활성 세션만 반환한다.
 * 비로그인 유저의 쿠키 기반 세션 추적에 사용한다.
 */
export async function listActiveSessionsByIds(sessionIds: string[]): Promise<GameSession[]> {
  const normalizedIds = sessionIds.map((id) => id.trim()).filter(Boolean);
  if (normalizedIds.length === 0) {
    return [];
  }

  const supabase = createSupabasePersistenceClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(SUPABASE_SESSION_COLUMNS)
    .in("id", normalizedIds)
    .is("ended_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list Supabase sessions by IDs: ${error.message}`);
  }

  return ((data ?? []) as unknown as SupabaseSessionRow[])
    .map((row) => hydrateSupabaseSession(row));
}

const DEFAULT_MAX_ACTIVE_SESSIONS = 3;

export function getMaxActiveSessionsPerUser(): number {
  const envValue = process.env.MAX_ACTIVE_SESSIONS_PER_USER;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MAX_ACTIVE_SESSIONS;
}
