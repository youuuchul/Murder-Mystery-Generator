"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface PlayerSessionEntryItem {
  id: string;
  sessionName: string;
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

type PlayerSessionEntryProps = {
  gameId: string;
  gameTitle: string;
  sessions: PlayerSessionEntryItem[];
};

/**
 * 플레이어가 특정 게임 기준으로 방을 찾고, 코드 검증 후 입장하는 클라이언트 진입 패널.
 * 방 목록은 찾기용으로만 쓰고, 실제 입장은 세션 코드 검증을 통과해야 한다.
 */
export default function PlayerSessionEntry({
  gameId,
  gameTitle,
  sessions,
}: PlayerSessionEntryProps) {
  const router = useRouter();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;

  /**
   * 선택된 방이 있을 때 ESC 로 빠르게 선택을 해제해
   * 코드만으로 바로 입장하는 기본 상태로 돌아갈 수 있게 한다.
   */
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedSessionId(null);
        setError("");
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  async function handleJoin() {
    const upper = code.trim().toUpperCase();
    if (upper.length !== 6) {
      setError("6자리 코드를 입력해주세요.");
      return;
    }

    setChecking(true);
    setError("");

    try {
      const response = await fetch(`/api/join/${upper}`);
      if (!response.ok) {
        setError("세션을 찾을 수 없습니다. 코드를 다시 확인해주세요.");
        return;
      }

      const data = await response.json() as JoinLookupResponse;

      if (data.session.gameId !== gameId) {
        setError("이 게임의 참가 코드가 아닙니다.");
        return;
      }

      if (selectedSessionId && data.session.id !== selectedSessionId) {
        setError("선택한 방의 코드가 아닙니다. 방을 다시 확인해주세요.");
        return;
      }

      router.push(`/join/${upper}`);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-dark-800 bg-[radial-gradient(circle_at_top_left,rgba(95,61,87,0.18),transparent_34%),linear-gradient(180deg,rgba(18,18,22,0.98),rgba(11,11,14,0.98))] p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-mystery-300/70">Player Entry</p>
        <h1 className="mt-4 text-3xl font-semibold text-dark-50">{gameTitle}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-dark-300">
          참가할 방을 확인한 뒤 세션 코드를 입력하세요. 방 목록은 찾기용이고, 실제 입장은 코드가 맞아야 열립니다.
        </p>
      </section>

      <section className="space-y-6">
        <div className="rounded-[24px] border border-dark-800 bg-dark-900/90 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-dark-500">Session Code</p>
          <h2 className="mt-2 text-xl font-semibold text-dark-50">코드로 입장</h2>
          <p className="mt-3 text-sm leading-6 text-dark-300">
            {selectedSession
              ? `선택한 방은 "${selectedSession.sessionName}" 입니다. 이 방의 참가 코드를 입력하세요.`
              : "GM에게 받은 참가 코드를 입력하면 바로 해당 방으로 입장할 수 있습니다."}
          </p>

          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 6))}
              placeholder="예: ABC123"
              maxLength={6}
              className="w-full rounded-2xl border border-dark-700 bg-dark-950 px-4 py-4 text-center text-3xl font-mono font-bold tracking-[0.24em] text-mystery-300 outline-none transition focus:border-mystery-500"
              onKeyDown={(event) => event.key === "Enter" && handleJoin()}
              autoCapitalize="characters"
              autoComplete="off"
            />
            <button
              onClick={handleJoin}
              disabled={code.length !== 6 || checking}
              className="rounded-xl border border-mystery-600 bg-mystery-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-mystery-600 disabled:opacity-40"
            >
              {checking ? "코드 확인 중…" : "입장하기"}
            </button>
          </div>

          {selectedSession ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-mystery-700/40 bg-mystery-950/20 px-4 py-3">
              <p className="text-sm text-mystery-100">
                선택한 방: <span className="font-semibold">{selectedSession.sessionName}</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedSessionId(null);
                  setError("");
                }}
                className="rounded-lg border border-dark-700 px-3 py-1.5 text-xs text-dark-300 transition-colors hover:border-dark-500 hover:text-dark-100"
              >
                선택 취소
              </button>
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </p>
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
              {sessions.map((session) => {
                const selected = session.id === selectedSessionId;

                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => {
                      setSelectedSessionId((currentId) => (
                        currentId === session.id ? null : session.id
                      ));
                      setError("");
                    }}
                    className={[
                      "w-full rounded-2xl border px-4 py-4 text-left transition-colors",
                      selected
                        ? "border-mystery-600 bg-mystery-950/25"
                        : "border-dark-800 bg-dark-950/70 hover:border-dark-600 hover:bg-dark-900",
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-dark-50">{session.sessionName}</p>
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
                );
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-dark-700 bg-dark-950/60 px-4 py-8 text-center text-sm text-dark-500">
              지금은 열려 있는 방이 없습니다. GM이 먼저 방을 만든 뒤 코드를 알려주면 참가할 수 있습니다.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
