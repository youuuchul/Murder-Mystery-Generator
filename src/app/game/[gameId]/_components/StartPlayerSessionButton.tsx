"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CreateSessionResponse = {
  session: {
    sessionCode: string;
  };
};

type SessionLimitSession = {
  id: string;
  gameId: string;
  gameTitle: string;
  sessionName: string;
  sessionCode: string;
  phase: string;
};

type Props = {
  gameId: string;
};

/**
 * 일부공개 게임 표지에서 "게임 시작" 버튼을 누르면
 * 바로 플레이어 합의 세션을 만들어 참가 퍼널로 이동시킨다.
 * 세션 한도 초과 시에는 기존 세션을 정리하거나 입장할 수 있도록 모달을 띄운다.
 */
export default function StartPlayerSessionButton({ gameId }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [limitSessions, setLimitSessions] = useState<SessionLimitSession[] | null>(null);
  const [limitMessage, setLimitMessage] = useState("");
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  async function handleStart() {
    setCreating(true);
    setError("");

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, mode: "player-consensus" }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          sessions?: SessionLimitSession[];
        };
        if (data.code === "SESSION_LIMIT_EXCEEDED" && data.sessions) {
          setLimitSessions(data.sessions);
          setLimitMessage(data.error ?? "세션 한도에 도달했습니다.");
        } else {
          setError(data.error ?? "방을 만들지 못했습니다. 잠시 후 다시 시도해주세요.");
        }
        return;
      }

      const data = (await response.json()) as CreateSessionResponse;
      router.push(`/join/${data.session.sessionCode}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteLimitSession(sessionId: string) {
    const confirmed = window.confirm("이 세션을 삭제하시겠습니까? 참가 중인 플레이어가 있으면 모두 퇴장됩니다.");
    if (!confirmed) return;

    setDeletingSessionId(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "세션을 삭제하지 못했습니다.");
        return;
      }
      const remaining = (limitSessions ?? []).filter((s) => s.id !== sessionId);
      if (remaining.length === 0) {
        setLimitSessions(null);
        setLimitMessage("");
      } else {
        setLimitSessions(remaining);
      }
    } finally {
      setDeletingSessionId(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { void handleStart(); }}
        disabled={creating}
        className="inline-flex w-full items-center justify-center rounded-xl border border-mystery-600 bg-mystery-700 px-5 py-3.5 text-sm font-medium text-white transition-colors hover:bg-mystery-600 disabled:opacity-50"
      >
        {creating ? "방 만드는 중…" : "게임 시작"}
      </button>

      {error ? (
        <p className="mt-3 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      {limitSessions && limitSessions.length > 0 ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-dark-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-dark-700 bg-dark-900 p-5 shadow-2xl">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-red-400/70">Session Limit</p>
              <h2 className="text-lg font-semibold text-dark-50">세션 한도 초과</h2>
              <p className="text-sm leading-6 text-dark-300">{limitMessage}</p>
            </div>

            <div className="mt-5 max-h-[50vh] space-y-2 overflow-y-auto">
              {limitSessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-dark-700 bg-dark-950/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-dark-200">{s.gameTitle}</p>
                    <p className="mt-0.5 text-xs text-dark-500">{s.sessionName} — {s.phase}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/join/${s.sessionCode}`)}
                      className="rounded-lg border border-dark-600 px-3 py-1.5 text-xs font-medium text-dark-200 transition-colors hover:border-dark-400 hover:text-dark-50"
                    >
                      입장
                    </button>
                    <button
                      type="button"
                      disabled={deletingSessionId === s.id}
                      onClick={() => { void handleDeleteLimitSession(s.id); }}
                      className="rounded-lg border border-red-800 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:border-red-600 hover:text-red-100 disabled:opacity-50"
                    >
                      {deletingSessionId === s.id ? "삭제 중…" : "삭제"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <button
                type="button"
                onClick={() => {
                  setLimitSessions(null);
                  setLimitMessage("");
                }}
                className="w-full rounded-xl border border-dark-700 px-4 py-3 text-sm font-medium text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
