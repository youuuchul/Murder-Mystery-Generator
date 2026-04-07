"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionMode } from "@/types/session";

interface AdminSessionRow {
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
  hostDisplayName?: string | null;
}

interface AdminSessionManagerProps {
  sessions: AdminSessionRow[];
}

function modeLabel(mode: SessionMode): string {
  return mode === "player-consensus" ? "GM 없음" : "GM 진행";
}

function sessionEntryHref(session: AdminSessionRow): string {
  return session.mode === "player-consensus"
    ? `/join/${session.sessionCode}`
    : `/play/${session.gameId}?session=${session.id}`;
}

/**
 * 관리자 세션 목록에서 대량 정리와 개별 진입을 함께 처리한다.
 * 테스트 세션이 빠르게 쌓일 수 있어 검색과 다중 삭제를 우선 제공한다.
 */
export default function AdminSessionManager({ sessions }: AdminSessionManagerProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
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
      || (session.hostDisplayName ?? "").toLowerCase().includes(normalizedQuery)
    ));
  }, [query, sessions]);

  const selectedVisibleCount = filteredSessions.filter((session) => selectedIds.includes(session.id)).length;
  const isDeleting = deletingIds.length > 0;

  function toggleSession(sessionId: string) {
    setSelectedIds((prev) => (
      prev.includes(sessionId)
        ? prev.filter((item) => item !== sessionId)
        : [...prev, sessionId]
    ));
  }

  function toggleAllVisible() {
    const visibleIds = filteredSessions.map((session) => session.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((sessionId) => selectedIds.includes(sessionId));

    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((sessionId) => !visibleIds.includes(sessionId));
      }

      return Array.from(new Set([...prev, ...visibleIds]));
    });
  }

  async function deleteSessions(targetIds: string[]) {
    if (targetIds.length === 0) {
      return;
    }

    setDeletingIds(targetIds);
    setActionError(null);

    try {
      for (const sessionId of targetIds) {
        const response = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
        if (!response.ok) {
          const data = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(data.error ?? "세션 삭제 실패");
        }
      }

      setSelectedIds((prev) => prev.filter((sessionId) => !targetIds.includes(sessionId)));
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "세션 삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingIds([]);
    }
  }

  async function deleteSelectedSessions() {
    if (selectedIds.length === 0) {
      return;
    }

    if (!confirm(`선택한 세션 ${selectedIds.length}개를 삭제할까요?`)) {
      return;
    }

    await deleteSessions(selectedIds);
  }

  async function deleteSingleSession(sessionId: string, sessionName: string) {
    if (!confirm(`"${sessionName}" 세션을 삭제할까요?`)) {
      return;
    }

    await deleteSessions([sessionId]);
  }

  return (
    <section className="rounded-[28px] border border-dark-800 bg-dark-900/90 p-6 sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-mystery-300/70">Admin Sessions</p>
          <h1 className="mt-4 text-3xl font-semibold text-dark-50">세션 관리</h1>
          <p className="mt-3 text-sm leading-6 text-dark-300">
            테스트 세션과 운영 세션을 모아서 보고 정리할 수 있습니다.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="게임, 방 제목, 코드 검색"
            className="min-w-[18rem] rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-100 outline-none transition focus:border-mystery-500"
          />
          <button
            type="button"
            onClick={() => void deleteSelectedSessions()}
            disabled={selectedIds.length === 0 || isDeleting}
            className="rounded-xl border border-red-900/60 bg-red-950/20 px-4 py-3 text-sm font-medium text-red-200 transition-colors hover:bg-red-950/30 disabled:opacity-40"
          >
            {isDeleting && deletingIds.length > 1 ? "삭제 중…" : `선택 삭제 ${selectedIds.length}개`}
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-dark-700 bg-dark-950 px-3 py-1 text-dark-300">
          전체 {sessions.length}개
        </span>
        <span className="rounded-full border border-dark-700 bg-dark-950 px-3 py-1 text-dark-300">
          검색 결과 {filteredSessions.length}개
        </span>
        <span className="rounded-full border border-dark-700 bg-dark-950 px-3 py-1 text-dark-300">
          선택 {selectedIds.length}개
        </span>
      </div>

      {actionError ? (
        <p className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {actionError}
        </p>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-dark-800">
        <div className="grid grid-cols-[auto_1.2fr_1.2fr_0.7fr_0.8fr_0.9fr_0.9fr] gap-3 border-b border-dark-800 bg-dark-950/80 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-dark-500">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={filteredSessions.length > 0 && selectedVisibleCount === filteredSessions.length}
              onChange={toggleAllVisible}
              className="h-4 w-4 rounded border-dark-600 bg-dark-950 text-mystery-500"
            />
          </label>
          <span>게임</span>
          <span>방</span>
          <span>유형</span>
          <span>상태</span>
          <span>참가</span>
          <span>작업</span>
        </div>

        {filteredSessions.length > 0 ? (
          <div className="divide-y divide-dark-800">
            {filteredSessions.map((session) => {
              const isRowDeleting = deletingIds.includes(session.id);

              return (
                <div
                  key={session.id}
                  className="grid grid-cols-[auto_1.2fr_1.2fr_0.7fr_0.8fr_0.9fr_0.9fr] gap-3 px-4 py-4 text-sm text-dark-200"
                >
                  <label className="flex items-start pt-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(session.id)}
                      onChange={() => toggleSession(session.id)}
                      className="h-4 w-4 rounded border-dark-600 bg-dark-950 text-mystery-500"
                    />
                  </label>
                  <div className="space-y-1">
                    <p className="font-medium text-dark-50">{session.gameTitle}</p>
                    <p className="text-xs text-dark-500">{session.createdAtLabel}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-dark-50">{session.sessionName}</p>
                    <p className="font-mono text-xs text-dark-500">{session.sessionCode}</p>
                    {session.hostDisplayName ? (
                      <p className="text-xs text-dark-500">GM {session.hostDisplayName}</p>
                    ) : null}
                  </div>
                  <div>
                    <span className="rounded-full border border-dark-700 px-2 py-1 text-[11px] text-dark-300">
                      {modeLabel(session.mode)}
                    </span>
                  </div>
                  <div className="text-dark-300">{session.phaseLabel}</div>
                  <div className="text-dark-300">
                    {session.lockedPlayerCount} / {session.totalPlayerCount}명
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
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
                      {isRowDeleting ? "삭제 중…" : "삭제"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-16 text-center text-sm text-dark-500">
            조건에 맞는 세션이 없습니다.
          </div>
        )}
      </div>
    </section>
  );
}
