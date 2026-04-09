"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionMode } from "@/types/session";

interface MySessionRow {
  id: string;
  gameId: string;
  gameTitle: string;
  sessionName: string;
  sessionCode: string;
  mode: SessionMode;
  phaseLabel: string;
  createdAtLabel: string;
  lockedPlayerCount: number;
  totalPlayerCount: number;
}

interface MySessionManagerProps {
  sessions: MySessionRow[];
  maxSessions: number;
}

function modeLabel(mode: SessionMode): string {
  return mode === "player-consensus" ? "GM 없음" : "GM 진행";
}

function sessionEntryHref(session: MySessionRow): string {
  return session.mode === "player-consensus"
    ? `/join/${session.sessionCode}`
    : `/play/${session.gameId}?session=${session.id}`;
}

export default function MySessionManager({ sessions, maxSessions }: MySessionManagerProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return sessions;
    }

    return sessions.filter((session) => (
      session.gameTitle.toLowerCase().includes(normalizedQuery)
      || session.sessionName.toLowerCase().includes(normalizedQuery)
      || session.sessionCode.toLowerCase().includes(normalizedQuery)
    ));
  }, [query, sessions]);

  async function deleteSingleSession(sessionId: string, sessionName: string) {
    if (!confirm(`"${sessionName}" 세션을 삭제할까요?`)) {
      return;
    }

    setDeletingId(sessionId);
    setActionError(null);

    try {
      const response = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "세션 삭제 실패");
      }
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "세션 삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-[28px] border border-dark-800 bg-dark-900/90 p-6 sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-mystery-300/70">My Sessions</p>
          <h1 className="mt-4 text-3xl font-semibold text-dark-50">내 세션 관리</h1>
          <p className="mt-3 text-sm leading-6 text-dark-300">
            내가 만든 활성 세션을 관리합니다. 최대 {maxSessions}개까지 동시 운영할 수 있습니다.
          </p>
        </div>

        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="게임, 방 제목, 코드 검색"
          className="min-w-[18rem] rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-100 outline-none transition focus:border-mystery-500"
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-dark-700 bg-dark-950 px-3 py-1 text-dark-300">
          활성 {sessions.length} / {maxSessions}개
        </span>
        {query.trim() ? (
          <span className="rounded-full border border-dark-700 bg-dark-950 px-3 py-1 text-dark-300">
            검색 결과 {filteredSessions.length}개
          </span>
        ) : null}
      </div>

      {actionError ? (
        <p className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {actionError}
        </p>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-dark-800">
        {filteredSessions.length > 0 ? (
          <div className="divide-y divide-dark-800">
            {filteredSessions.map((session) => {
              const isRowDeleting = deletingId === session.id;

              return (
                <div
                  key={session.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium text-dark-50">{session.gameTitle}</p>
                    <p className="text-xs text-dark-400">
                      {session.sessionName} · <span className="font-mono">{session.sessionCode}</span> · {session.createdAtLabel}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-dark-700 px-2 py-0.5 text-[11px] text-dark-300">
                        {modeLabel(session.mode)}
                      </span>
                      <span className="rounded-full border border-dark-700 px-2 py-0.5 text-[11px] text-dark-300">
                        {session.phaseLabel}
                      </span>
                      <span className="text-[11px] text-dark-500">
                        {session.lockedPlayerCount} / {session.totalPlayerCount}명
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={sessionEntryHref(session)}
                      className="rounded-lg border border-dark-700 px-3 py-2 text-xs text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50"
                    >
                      열기
                    </Link>
                    <button
                      type="button"
                      onClick={() => void deleteSingleSession(session.id, session.sessionName)}
                      disabled={isRowDeleting}
                      className="rounded-lg border border-red-900/60 px-3 py-2 text-xs text-red-200 transition-colors hover:bg-red-950/20 disabled:opacity-40"
                    >
                      {isRowDeleting ? "삭제 중..." : "삭제"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-16 text-center text-sm text-dark-500">
            {query.trim() ? "조건에 맞는 세션이 없습니다." : "활성 세션이 없습니다."}
          </div>
        )}
      </div>
    </section>
  );
}
