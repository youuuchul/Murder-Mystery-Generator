"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PlayerSessionEntryItem {
  id: string;
  sessionName: string;
  modeLabel?: string;
  phaseLabel: string;
  createdAtLabel: string;
  lockedPlayerCount: number;
  totalPlayerCount: number;
}

interface JoinLookupResponse {
  session: {
    id: string;
    gameId: string;
  };
}

interface CreateSessionResponse {
  session: {
    sessionCode: string;
  };
}

interface SessionLimitSession {
  id: string;
  gameId: string;
  gameTitle: string;
  sessionName: string;
  sessionCode: string;
  phase: string;
}

type PlayerSessionEntryProps = {
  gameId: string;
  gameTitle: string;
  sessions: PlayerSessionEntryItem[];
};

/**
 * 플레이어가 공개 게임 기준으로 방을 고르거나 코드로 바로 입장하는 진입 패널.
 * 목록 클릭은 선택만 하는 것이 아니라, 바로 코드 확인 팝업으로 이어지게 한다.
 */
export default function PlayerSessionEntry({
  gameId,
  gameTitle,
  sessions,
}: PlayerSessionEntryProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [limitSessions, setLimitSessions] = useState<SessionLimitSession[] | null>(null);
  const [promptSessionId, setPromptSessionId] = useState<string | null>(null);
  const [promptCode, setPromptCode] = useState("");
  const [promptError, setPromptError] = useState("");
  const [promptChecking, setPromptChecking] = useState(false);

  const promptSession = sessions.find((session) => session.id === promptSessionId) ?? null;

  async function verifyCodeAndEnter(nextCode: string, expectedSessionId?: string) {
    const upper = nextCode.trim().toUpperCase();
    if (upper.length !== 6) {
      throw new Error("6자리 코드를 입력해주세요.");
    }

    const response = await fetch(`/api/join/${upper}`);
    if (!response.ok) {
      throw new Error("세션을 찾을 수 없습니다. 코드를 다시 확인해주세요.");
    }

    const data = await response.json() as JoinLookupResponse;

    if (data.session.gameId !== gameId) {
      throw new Error("이 게임의 참가 코드가 아닙니다.");
    }

    if (expectedSessionId && data.session.id !== expectedSessionId) {
      throw new Error("선택한 방의 코드가 아닙니다. 방을 다시 확인해주세요.");
    }

    router.push(`/join/${upper}`);
  }

  async function handleDirectJoin() {
    setChecking(true);
    setError("");

    try {
      await verifyCodeAndEnter(code);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "세션에 들어갈 수 없습니다.");
    } finally {
      setChecking(false);
    }
  }

  async function handlePromptJoin() {
    if (!promptSession) {
      return;
    }

    setPromptChecking(true);
    setPromptError("");

    try {
      await verifyCodeAndEnter(promptCode, promptSession.id);
    } catch (nextError) {
      setPromptError(nextError instanceof Error ? nextError.message : "세션에 들어갈 수 없습니다.");
    } finally {
      setPromptChecking(false);
    }
  }

  /**
   * 플레이어 합의로 진행하는 방을 새로 만들고,
   * 만든 사람도 곧바로 플레이어 참가 퍼널로 들어가게 한다.
   */
  async function handleCreatePlayerSession() {
    setCreatingSession(true);
    setError("");

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          mode: "player-consensus",
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as {
          error?: string;
          code?: string;
          sessions?: SessionLimitSession[];
        };
        if (data.code === "SESSION_LIMIT_EXCEEDED" && data.sessions) {
          setLimitSessions(data.sessions);
          setError(data.error ?? "세션 한도에 도달했습니다.");
        } else {
          setError(data.error ?? "방을 만들지 못했습니다. 잠시 후 다시 시도해주세요.");
        }
        return;
      }

      const data = await response.json() as CreateSessionResponse;
      router.push(`/join/${data.session.sessionCode}`);
    } finally {
      setCreatingSession(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-dark-800 bg-[radial-gradient(circle_at_top_left,rgba(95,61,87,0.18),transparent_34%),linear-gradient(180deg,rgba(18,18,22,0.98),rgba(11,11,14,0.98))] p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-mystery-300/70">Player Entry</p>
            <h1 className="mt-4 text-3xl font-semibold text-dark-50">{gameTitle}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-dark-300">방을 고르거나 코드를 입력하세요.</p>
          </div>

          <div className="rounded-2xl border border-dark-800 bg-dark-950/60 p-4 lg:max-w-sm">
            <p className="text-xs uppercase tracking-[0.22em] text-dark-500">No GM</p>
            <button
              type="button"
              onClick={handleCreatePlayerSession}
              disabled={creatingSession}
              className="mt-4 w-full rounded-xl border border-emerald-700 bg-emerald-950/40 px-4 py-3 text-sm font-semibold text-emerald-200 transition-colors hover:border-emerald-500 hover:text-emerald-50 disabled:opacity-50"
            >
              {creatingSession ? "방 만드는 중…" : "GM 없이 직접 세션 생성"}
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="rounded-[24px] border border-dark-800 bg-dark-900/90 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-dark-500">Session Code</p>
          <h2 className="mt-2 text-xl font-semibold text-dark-50">코드로 입장</h2>
          <p className="mt-3 text-sm leading-6 text-dark-300">
            받은 참가 코드를 입력하면 바로 해당 방으로 입장할 수 있습니다.
          </p>

          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 6))}
              placeholder="예: ABC123"
              maxLength={6}
              className="w-full rounded-2xl border border-dark-700 bg-dark-950 px-4 py-4 text-center text-3xl font-mono font-bold tracking-[0.24em] text-mystery-300 outline-none transition focus:border-mystery-500"
              onKeyDown={(event) => event.key === "Enter" && void handleDirectJoin()}
              autoCapitalize="characters"
              autoComplete="off"
            />
            <button
              onClick={() => { void handleDirectJoin(); }}
              disabled={code.length !== 6 || checking}
              className="rounded-xl border border-mystery-600 bg-mystery-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-mystery-600 disabled:opacity-40"
            >
              {checking ? "코드 확인 중…" : "입장하기"}
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              <p>{error}</p>
              {limitSessions && limitSessions.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {limitSessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => router.push(`/join/${s.sessionCode}`)}
                      className="flex w-full items-center justify-between rounded-xl border border-dark-700 bg-dark-950/60 px-3 py-2 text-left transition-colors hover:border-dark-500"
                    >
                      <span className="text-dark-200">{s.gameTitle} — {s.sessionName}</span>
                      <span className="shrink-0 text-xs text-mystery-400">입장 →</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-[24px] border border-dark-800 bg-dark-900/90 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-dark-500">Room List</p>
              <h2 className="mt-2 text-xl font-semibold text-dark-50">참가 가능한 방</h2>
            </div>
            <span className="rounded-full border border-dark-700 bg-dark-950 px-3 py-1 text-xs text-dark-300">
              활성 {sessions.length}개
            </span>
          </div>

          {sessions.length > 0 ? (
            <div className="mt-5 grid gap-3">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => {
                    setPromptSessionId(session.id);
                    setPromptCode("");
                    setPromptError("");
                  }}
                  className="w-full rounded-2xl border border-dark-800 bg-dark-950/70 px-4 py-4 text-left transition-colors hover:border-dark-600 hover:bg-dark-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-dark-50">{session.sessionName}</p>
                        {session.modeLabel ? (
                          <span className="rounded-full border border-dark-700 bg-dark-900 px-2 py-0.5 text-[11px] text-dark-300">
                            {session.modeLabel}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-dark-500">{session.createdAtLabel} 생성</p>
                    </div>
                    <span className="rounded-full border border-dark-700 bg-dark-900 px-3 py-1 text-xs text-dark-300">
                      {session.phaseLabel}
                    </span>
                  </div>
                  <p className="mt-4 text-sm text-dark-300">
                    {session.lockedPlayerCount} / {session.totalPlayerCount}명 참가 중
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-dark-700 bg-dark-950/60 px-4 py-8 text-center text-sm text-dark-500">
              지금은 열려 있는 방이 없습니다.
            </div>
          )}
        </div>
      </section>

      {promptSession ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-dark-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-dark-700 bg-dark-900 p-5 shadow-2xl">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-mystery-400/70">Room Code</p>
              <h2 className="text-xl font-semibold text-dark-50">{promptSession.sessionName}</h2>
              <p className="text-sm leading-6 text-dark-300">참가 코드를 입력하세요.</p>
            </div>

            <div className="mt-5 space-y-3">
              <input
                type="text"
                value={promptCode}
                onChange={(event) => setPromptCode(event.target.value.toUpperCase().slice(0, 6))}
                placeholder="예: ABC123"
                maxLength={6}
                className="w-full rounded-2xl border border-dark-700 bg-dark-950 px-4 py-4 text-center text-3xl font-mono font-bold tracking-[0.24em] text-mystery-300 outline-none transition focus:border-mystery-500"
                onKeyDown={(event) => event.key === "Enter" && void handlePromptJoin()}
                autoCapitalize="characters"
                autoComplete="off"
              />

              {promptError ? (
                <p className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {promptError}
                </p>
              ) : null}
            </div>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setPromptSessionId(null);
                  setPromptCode("");
                  setPromptError("");
                }}
                className="flex-1 rounded-xl border border-dark-700 px-4 py-3 text-sm font-medium text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => { void handlePromptJoin(); }}
                disabled={promptCode.length !== 6 || promptChecking}
                className="flex-1 rounded-xl bg-mystery-700 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-mystery-600 disabled:opacity-50"
              >
                {promptChecking ? "코드 확인 중…" : "입장하기"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
