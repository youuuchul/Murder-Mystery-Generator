import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { canAccessGmPlay, resolveEditableGameForUser } from "@/lib/game-access";
import { canResumeGmSessionDirectly } from "@/lib/gm-session-access";
import { getGame, saveGame } from "@/lib/game-repository";
import { isMakerAdmin } from "@/lib/maker-role";
import { getCurrentMakerUser } from "@/lib/maker-user.server";
import { listActiveSessions } from "@/lib/session-repository";
import type { GameSession, GameSessionSummary } from "@/types/session";
import GMDashboard from "./_components/GMDashboard";

export const dynamic = "force-dynamic";

/**
 * GM 진입 시 보여줄 세션 선택용 경량 요약 정보로 변환한다.
 */
function toSessionSummary(
  session: GameSession,
  options: {
    canResumeDirectly: boolean;
  }
): GameSessionSummary {
  return {
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
    canResumeDirectly: options.canResumeDirectly,
  };
}

export default async function PlayPage({
  params,
  searchParams,
}: {
  params: { gameId: string };
  searchParams?: { session?: string; create?: string };
}) {
  const game = await getGame(params.gameId);
  if (!game) notFound();
  const currentUser = await getCurrentMakerUser();

  if (!canAccessGmPlay(game, currentUser)) {
    return (
      <div className="min-h-screen bg-dark-950 px-4 py-12 text-dark-50">
        <div className="mx-auto max-w-2xl rounded-3xl border border-dark-800 bg-dark-900/90 p-8 shadow-2xl">
          <p className="text-xs uppercase tracking-[0.24em] text-amber-300/80">GM Access</p>
          <h1 className="mt-3 text-2xl font-semibold">이 게임은 바로 플레이할 수 없습니다</h1>
          <p className="mt-3 text-sm leading-6 text-dark-400">
            공개 게임만 누구나 GM 화면에 들어갈 수 있습니다. 비공개 또는 초안 게임은
            소유자 작업자 세션으로만 세션을 시작할 수 있습니다.
          </p>
          <Link
            href="/library"
            className="mt-6 inline-flex rounded-xl border border-dark-700 px-4 py-2.5 text-sm text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50"
          >
            라이브러리로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  const gmGame = currentUser && game.access.visibility !== "public"
    ? resolveEditableGameForUser(game, currentUser)?.game ?? game
    : game;

  if (currentUser && game.access.visibility !== "public") {
    const editableGame = resolveEditableGameForUser(game, currentUser);
    if (editableGame?.claimed) {
      await saveGame(editableGame.game);
    }
  }

  const activeSessions = await listActiveSessions(params.gameId);
  const cookieStore = cookies();
  const requestedSessionId = searchParams?.session;
  /**
   * 기본 진입에서는 세션 선택 화면을 먼저 보여준다.
   * 특정 세션을 명시적으로 고른 경우에만 해당 세션을 바로 연다.
   */
  const currentSession = requestedSessionId
    ? activeSessions.find((item) => (
      item.id === requestedSessionId
      && canResumeGmSessionDirectly(item, {
        currentUserId: currentUser?.id,
        isAdmin: isMakerAdmin(currentUser),
        cookieStore,
      })
    )) ?? null
    : null;
  const initialSessionSummaries = activeSessions.map((session) => (
    toSessionSummary(session, {
      canResumeDirectly: canResumeGmSessionDirectly(session, {
        currentUserId: currentUser?.id,
        isAdmin: isMakerAdmin(currentUser),
        cookieStore,
      }),
    })
  ));

  return (
    <div className="min-h-screen bg-dark-950 text-dark-100">
      <header className="border-b border-dark-800 bg-dark-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/library" className="text-dark-400 hover:text-dark-200 transition-colors text-sm">
            ← 라이브러리
          </Link>
          <span className="text-dark-700">|</span>
          <Link
            href={`/play/${gmGame.id}`}
            className="text-dark-400 hover:text-dark-200 transition-colors text-sm"
          >
            세션 목록
          </Link>
          <span className="text-dark-700">|</span>
          <span className="text-dark-300 text-sm font-medium truncate">{gmGame.title}</span>
          <span className="ml-auto text-xs px-2 py-0.5 rounded border border-dark-700 text-dark-500">GM</span>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-4 sm:p-6">
        <GMDashboard
          game={gmGame}
          initialSession={currentSession}
          initialSessionSummaries={initialSessionSummaries}
          autoCreateSession={searchParams?.create === "1"}
        />
      </main>
    </div>
  );
}
