/** @screen P-015 — docs/screens.json 참조 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGame } from "@/lib/game-repository";
import { listActiveSessions } from "@/lib/session-repository";
import type { GameSessionSummary } from "@/types/session";
import PlayerSessionEntry from "./_components/PlayerSessionEntry";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const PHASE_LABELS: Record<string, string> = {
  lobby: "대기실",
  opening: "오프닝",
  vote: "투표",
  ending: "엔딩",
};

/**
 * 플레이어 입장 화면에서 사용할 세션 상태 라벨을 만든다.
 */
function formatPlayerSessionPhaseLabel(session: GameSessionSummary): string {
  if (session.phase.startsWith("round-")) {
    const roundNumber = session.phase.split("-")[1];
    const subPhaseLabel = session.currentSubPhase === "discussion" ? "토론" : "조사";
    return `Round ${roundNumber} · ${subPhaseLabel}`;
  }

  return PHASE_LABELS[session.phase] ?? session.phase;
}

/**
 * 플레이어가 방 목록에서 빠르게 구분할 수 있도록 생성 시각을 짧게 포맷한다.
 */
function formatPlayerSessionCreatedAt(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 공개 게임 기준 플레이어 참가 퍼널.
 * 방 목록은 보여주되 실제 입장은 세션 코드 검증을 통과해야만 진행된다.
 */
export default async function PlayJoinPage({
  params,
}: {
  params: { gameId: string };
}) {
  const game = await getGame(params.gameId);
  if (!game || (game.access.visibility !== "public" && game.access.visibility !== "unlisted")) {
    notFound();
  }

  const activeSessions = await listActiveSessions(params.gameId);
  const sessions = activeSessions.map((session) => ({
    id: session.id,
    sessionName: session.sessionName,
    modeLabel: session.mode === "player-consensus" ? "GM 없음" : "GM 진행",
    phaseLabel: formatPlayerSessionPhaseLabel({
      id: session.id,
      sessionName: session.sessionName,
      mode: session.mode,
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      phase: session.sharedState.phase,
      currentRound: session.sharedState.currentRound,
      currentSubPhase: session.sharedState.currentSubPhase,
      lockedPlayerCount: session.sharedState.characterSlots.filter((slot) => slot.isLocked).length,
      totalPlayerCount: session.sharedState.characterSlots.length,
      canResumeDirectly: false,
    }),
    createdAtLabel: formatPlayerSessionCreatedAt(session.createdAt),
    lockedPlayerCount: session.sharedState.characterSlots.filter((slot) => slot.isLocked).length,
    totalPlayerCount: session.sharedState.characterSlots.length,
  }));

  return (
    <div className="min-h-screen bg-dark-950 text-dark-100">
      <header className="sticky top-0 z-10 border-b border-dark-800 bg-dark-950/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          {game.access.visibility === "unlisted" ? (
            <Link
              href={`/game/${game.id}`}
              className="text-sm text-dark-400 transition-colors hover:text-dark-200"
            >
              ← 게임 표지
            </Link>
          ) : (
            <Link
              href="/library"
              className="text-sm text-dark-400 transition-colors hover:text-dark-200"
            >
              ← 라이브러리
            </Link>
          )}
          <span className="text-dark-700">|</span>
          <span className="truncate text-sm font-medium text-dark-300">{game.title}</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PlayerSessionEntry
          gameId={game.id}
          gameTitle={game.title}
          sessions={sessions}
        />
      </main>
    </div>
  );
}
