import { NextResponse } from "next/server";
import { getSession, updateSession } from "@/lib/storage/session-storage";
import { broadcast } from "@/lib/sse/broadcaster";

type Params = { params: { sessionId: string } };

/** POST /api/sessions/[sessionId]/join — 플레이어 참가 */
export async function POST(req: Request, { params }: Params) {
  const { sessionId } = params;
  const { playerId, playerName } = await req.json().catch(() => ({})) as {
    playerId?: string;
    playerName?: string;
  };

  if (!playerId || !playerName?.trim()) {
    return NextResponse.json(
      { error: "playerId, playerName 필수" },
      { status: 400 }
    );
  }

  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const slot = session.sharedState.characterSlots.find((s) => s.playerId === playerId);
  if (!slot) return NextResponse.json({ error: "해당 캐릭터 슬롯 없음" }, { status: 404 });
  if (slot.isLocked) {
    return NextResponse.json({ error: "이미 참가한 슬롯입니다." }, { status: 409 });
  }

  const token = crypto.randomUUID();

  // 슬롯 잠금
  slot.playerName = playerName.trim();
  slot.token = token;
  slot.isLocked = true;

  // PlayerState 생성
  session.playerStates.push({
    token,
    playerId,
    playerName: playerName.trim(),
    inventory: [],
    transferLog: [],
    roundAcquired: {},
    roundVisitedLocations: {},
  });

  // 이벤트 로그
  session.sharedState.eventLog.push({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    message: `${playerName.trim()}님이 참가했습니다.`,
    type: "player_joined",
  });

  updateSession(session);
  broadcast(sessionId, "session_update", { sharedState: session.sharedState });

  return NextResponse.json({
    token,
    sessionId,
    gameId: session.gameId,
    playerId,
    playerName: playerName.trim(),
  });
}
