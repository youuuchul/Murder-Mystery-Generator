import { NextRequest, NextResponse } from "next/server";
import { canAccessGmPlay, resolveEditableGameForUser } from "@/lib/game-access";
import {
  applyGmSessionAccessCookie,
  canResumeGmSessionDirectly,
  GM_SESSION_ACCESS_COOKIE_NAME,
} from "@/lib/gm-session-access";
import { getGame, saveGame } from "@/lib/game-repository";
import { isMakerAdmin } from "@/lib/maker-role";
import { getRequestMakerUser } from "@/lib/maker-user.server";
import { createSession, listActiveSessions } from "@/lib/session-repository";
import type { GameSession, GameSessionSummary } from "@/types/session";

/**
 * 세션 목록 화면에서 필요한 최소 요약 정보만 추린다.
 * 전체 playerStates/votes를 내보내지 않아도 GM이 세션을 구분할 수 있다.
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

/** POST /api/sessions — 세션 생성 */
export async function POST(req: NextRequest) {
  const { gameId } = await req.json().catch(() => ({})) as { gameId?: string };
  if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });

  const game = await getGame(gameId);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  const currentUser = await getRequestMakerUser(req);

  if (!canAccessGmPlay(game, currentUser)) {
    return NextResponse.json(
      { error: "이 게임은 현재 작업자가 세션을 시작할 수 없습니다." },
      { status: 403 }
    );
  }

  const sessionGame = currentUser && game.access.visibility !== "public"
    ? resolveEditableGameForUser(game, currentUser.id)?.game ?? game
    : game;

  if (currentUser && game.access.visibility !== "public") {
    const editableGame = resolveEditableGameForUser(game, currentUser.id);
    if (editableGame?.claimed) {
      await saveGame(editableGame.game);
    }
  }

  if (!sessionGame.players || sessionGame.players.length === 0) {
    return NextResponse.json({ error: "플레이어를 먼저 등록해주세요." }, { status: 422 });
  }

  const session = await createSession(sessionGame, {
    hostUserId: currentUser?.id,
  });
  const response = NextResponse.json({ session }, { status: 201 });
  applyGmSessionAccessCookie(response, req.cookies.get(GM_SESSION_ACCESS_COOKIE_NAME)?.value, session);
  return response;
}

/** GET /api/sessions?gameId=xxx — 활성 세션 목록 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId");
  if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });

  const game = await getGame(gameId);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const currentUser = await getRequestMakerUser(req);
  if (!canAccessGmPlay(game, currentUser)) {
    return NextResponse.json(
      { error: "이 게임의 세션 목록을 볼 권한이 없습니다." },
      { status: 403 }
    );
  }

  const sessions = (await listActiveSessions(gameId)).map((session) => (
    toSessionSummary(session, {
      canResumeDirectly: canResumeGmSessionDirectly(session, {
        currentUserId: currentUser?.id,
        isAdmin: isMakerAdmin(currentUser),
        cookieStore: req.cookies,
      }),
    })
  ));
  return NextResponse.json({ sessions });
}
