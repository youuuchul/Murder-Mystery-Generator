import { NextResponse } from "next/server";
import { getGame } from "@/lib/storage/game-storage";
import { createSession, listActiveSessions } from "@/lib/storage/session-storage";
import type { GameSession, GameSessionSummary } from "@/types/session";

/**
 * 세션 목록 화면에서 필요한 최소 요약 정보만 추린다.
 * 전체 playerStates/votes를 내보내지 않아도 GM이 세션을 구분할 수 있다.
 */
function toSessionSummary(session: GameSession): GameSessionSummary {
  return {
    id: session.id,
    sessionCode: session.sessionCode,
    createdAt: session.createdAt,
    startedAt: session.startedAt,
    phase: session.sharedState.phase,
    currentRound: session.sharedState.currentRound,
    currentSubPhase: session.sharedState.currentSubPhase,
    lockedPlayerCount: session.sharedState.characterSlots.filter((slot) => slot.isLocked).length,
    totalPlayerCount: session.sharedState.characterSlots.length,
  };
}

/** POST /api/sessions — 세션 생성 */
export async function POST(req: Request) {
  const { gameId } = await req.json().catch(() => ({})) as { gameId?: string };
  if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });

  const game = getGame(gameId);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (!game.players || game.players.length === 0) {
    return NextResponse.json({ error: "플레이어를 먼저 등록해주세요." }, { status: 422 });
  }

  const session = createSession(game);
  return NextResponse.json({ session }, { status: 201 });
}

/** GET /api/sessions?gameId=xxx — 활성 세션 목록 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId");
  if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });

  const sessions = listActiveSessions(gameId).map(toSessionSummary);
  return NextResponse.json({ sessions });
}
