import { NextResponse } from "next/server";
import { broadcast } from "@/lib/sse/broadcaster";
import { getSession, updateSession } from "@/lib/session-repository";

type Params = { params: { sessionId: string } };

interface RejoinRequestBody {
  playerId?: string;
  playerName?: string;
}

/**
 * POST /api/sessions/[sessionId]/rejoin
 * 잠긴 슬롯에 대해 기존 참가자 이름을 다시 확인한 뒤 새 토큰을 발급한다.
 */
export async function POST(req: Request, { params }: Params) {
  const { sessionId } = params;
  const { playerId, playerName } = await req.json().catch(() => ({})) as RejoinRequestBody;
  const normalizedPlayerName = playerName?.trim();

  if (!playerId || !normalizedPlayerName) {
    return NextResponse.json(
      { error: "playerId, playerName 필수" },
      { status: 400 }
    );
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const slot = session.sharedState.characterSlots.find((item) => item.playerId === playerId);
  if (!slot) {
    return NextResponse.json({ error: "해당 캐릭터 슬롯 없음" }, { status: 404 });
  }

  if (!slot.isLocked || !slot.playerName || !slot.token) {
    return NextResponse.json(
      { error: "아직 참가하지 않은 슬롯입니다. 새 참가로 진행하세요." },
      { status: 409 }
    );
  }

  if (slot.playerName !== normalizedPlayerName) {
    return NextResponse.json(
      { error: "기존 참가 이름이 일치하지 않습니다." },
      { status: 403 }
    );
  }

  const playerState = session.playerStates.find((item) => item.playerId === playerId);
  if (!playerState) {
    return NextResponse.json(
      { error: "기존 참가 정보를 복구할 수 없습니다. GM에게 재참가 허용을 요청하세요." },
      { status: 409 }
    );
  }

  const previousToken = playerState.token;
  const nextToken = crypto.randomUUID();

  playerState.token = nextToken;
  slot.token = nextToken;

  if (previousToken && previousToken in session.votes) {
    session.votes[nextToken] = session.votes[previousToken];
    delete session.votes[previousToken];
  }

  session.sharedState.eventLog.push({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    message: `${normalizedPlayerName}님이 기존 슬롯으로 재접속했습니다.`,
    type: "system",
  });

  updateSession(session);
  broadcast(sessionId, "session_update", { sharedState: session.sharedState });

  return NextResponse.json({
    token: nextToken,
    sessionId,
    gameId: session.gameId,
    playerId,
    playerName: normalizedPlayerName,
    mode: "rejoin",
  });
}
