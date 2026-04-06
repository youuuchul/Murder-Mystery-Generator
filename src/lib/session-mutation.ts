import type { GameSession } from "@/types/session";
import {
  SessionConflictError,
  getSession,
  updateSession,
} from "@/lib/session-repository";

export interface MutateSessionWithRetryOptions {
  maxAttempts?: number;
}

export interface MutateSessionWithRetryResult<TResult> {
  session: GameSession;
  result: TResult;
}

/**
 * 최신 세션을 다시 읽어 동일한 변경을 짧게 재시도한다.
 * 참가/투표/카드 획득처럼 사용자가 같은 순간에 겹칠 수 있는 요청에서
 * 일시적 저장 충돌을 그대로 사용자 에러로 노출하지 않도록 한다.
 */
export async function mutateSessionWithRetry<TResult>(
  sessionId: string,
  mutate: (session: GameSession, attempt: number) => TResult | Promise<TResult>,
  options: MutateSessionWithRetryOptions = {}
): Promise<MutateSessionWithRetryResult<TResult>> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  let lastConflictError: SessionConflictError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const session = await getSession(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const result = await mutate(session, attempt);

    try {
      const persistedSession = await updateSession(session);
      return {
        session: persistedSession,
        result,
      };
    } catch (error) {
      if (error instanceof SessionConflictError) {
        lastConflictError = error;
        continue;
      }

      throw error;
    }
  }

  throw lastConflictError ?? new SessionConflictError();
}
