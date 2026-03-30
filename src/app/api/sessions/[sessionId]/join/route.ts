import { NextResponse } from "next/server";
import { broadcast } from "@/lib/sse/broadcaster";
import { getSession, updateSession } from "@/lib/session-repository";

type Params = { params: { sessionId: string } };
interface JoinRequestBody {
  playerId?: string;
  playerName?: string;
}

/**
 * POST /api/sessions/[sessionId]/join
 * 비어 있는 슬롯에 새로 참가하거나, GM이 재참가 허용으로 풀어둔 슬롯의 진행 상태를 이어받는다.
 */
export async function POST(req: Request, { params }: Params) {
  const { sessionId } = params;
  const { playerId, playerName } = await req.json().catch(() => ({})) as JoinRequestBody;
  const normalizedPlayerName = playerName?.trim();

  if (!playerId || !normalizedPlayerName) {
    return NextResponse.json(
      { error: "playerId, playerName 필수" },
      { status: 400 }
    );
  }

  const session = await getSession(sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const slot = session.sharedState.characterSlots.find((s) => s.playerId === playerId);
  if (!slot) return NextResponse.json({ error: "해당 캐릭터 슬롯 없음" }, { status: 404 });
  if (slot.isLocked) {
    return NextResponse.json({ error: "이미 참가한 슬롯입니다." }, { status: 409 });
  }

  const existingPlayerState = session.playerStates.find((item) => item.playerId === playerId);
  const previousToken = slot.token ?? existingPlayerState?.token;
  const token = crypto.randomUUID();

  // 슬롯 잠금
  slot.playerName = normalizedPlayerName;
  slot.token = token;
  slot.isLocked = true;

  if (existingPlayerState) {
    existingPlayerState.token = token;
    existingPlayerState.playerName = normalizedPlayerName;
  } else {
    session.playerStates.push({
      token,
      playerId,
      playerName: normalizedPlayerName,
      inventory: [],
      transferLog: [],
      roundAcquired: {},
      roundVisitedLocations: {},
    });
  }

  if (previousToken && previousToken in session.votes) {
    session.votes[token] = session.votes[previousToken];
    delete session.votes[previousToken];
  }
  session.sharedState.voteCount = Object.keys(session.votes).length;

  // 이벤트 로그
  session.sharedState.eventLog.push({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    message: existingPlayerState
      ? `${normalizedPlayerName}님이 기존 진행 상태를 이어서 참가했습니다.`
      : `${normalizedPlayerName}님이 참가했습니다.`,
    type: "player_joined",
  });

  await updateSession(session);
  broadcast(sessionId, "session_update", { sharedState: session.sharedState });

  return NextResponse.json({
    token,
    sessionId,
    gameId: session.gameId,
    playerId,
    playerName: normalizedPlayerName,
  });
}
