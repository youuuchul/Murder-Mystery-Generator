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
import { createSession, isGmManagedSession, listActiveSessions } from "@/lib/session-repository";
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

interface CreateSessionRequestBody {
  gameId?: string;
  mode?: GameSession["mode"];
}

/** POST /api/sessions — 세션 생성 */
export async function POST(req: NextRequest) {
  const { gameId, mode } = await req.json().catch(() => ({})) as CreateSessionRequestBody;
  if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });

  const game = await getGame(gameId);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  const currentUser = await getRequestMakerUser(req);
  const sessionMode = mode === "player-consensus" ? "player-consensus" : "gm";

  if (sessionMode === "gm" && !canAccessGmPlay(game, currentUser)) {
    return NextResponse.json(
      { error: "이 게임은 현재 작업자가 세션을 시작할 수 없습니다." },
      { status: 403 }
    );
  }

  if (sessionMode === "player-consensus" && game.access.visibility !== "public") {
    return NextResponse.json(
      { error: "GM 없이 직접 여는 방은 공개 게임에서만 만들 수 있습니다." },
      { status: 403 }
    );
  }

  const sessionGame = sessionMode === "gm" && currentUser && game.access.visibility !== "public"
    ? resolveEditableGameForUser(game, currentUser)?.game ?? game
    : game;

  if (sessionMode === "gm" && currentUser && game.access.visibility !== "public") {
    const editableGame = resolveEditableGameForUser(game, currentUser);
    if (editableGame?.claimed) {
      await saveGame(editableGame.game);
    }
  }

  if (!sessionGame.players || sessionGame.players.length === 0) {
    return NextResponse.json({ error: "플레이어를 먼저 등록해주세요." }, { status: 422 });
  }

  const session = await createSession(sessionGame, {
    hostUserId: sessionMode === "gm" ? currentUser?.id : undefined,
    sessionMode,
  });
  const response = NextResponse.json({ session }, { status: 201 });
  if (sessionMode === "gm") {
    applyGmSessionAccessCookie(response, req.cookies.get(GM_SESSION_ACCESS_COOKIE_NAME)?.value, session);
  }
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

  const sessions = (await listActiveSessions(gameId))
    .map((session) => (
      toSessionSummary(session, {
        canResumeDirectly: isGmManagedSession(session)
          ? canResumeGmSessionDirectly(session, {
              currentUserId: currentUser?.id,
              isAdmin: isMakerAdmin(currentUser),
              cookieStore: req.cookies,
            })
          : false,
      })
    ));
  return NextResponse.json({ sessions });
}
