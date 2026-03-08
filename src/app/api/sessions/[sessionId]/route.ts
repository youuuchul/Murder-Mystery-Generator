import { NextResponse } from "next/server";
import { getSession, updateSession, deleteSession } from "@/lib/storage/session-storage";
import { broadcast } from "@/lib/sse/broadcaster";
import type { GamePhase } from "@/types/session";

type Params = { params: { sessionId: string } };

/** GET /api/sessions/[sessionId] — 세션 상태 조회 */
export async function GET(req: Request, { params }: Params) {
  const { sessionId } = params;
  const token = new URL(req.url).searchParams.get("token");

  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  // 플레이어 개인 상태 — token으로 필터링
  if (token) {
    const pState = session.playerStates.find((p) => p.token === token);
    if (!pState) return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    return NextResponse.json({
      sharedState: session.sharedState,
      playerState: pState,
      gameId: session.gameId,
    });
  }

  // GM: 전체 공개 상태 (playerState 개인 데이터 제외)
  return NextResponse.json({
    session: {
      ...session,
      playerStates: session.playerStates.map((p) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        inventoryCount: p.inventory.length,
      })),
    },
  });
}

/** PATCH /api/sessions/[sessionId] — GM 페이즈 제어 */
export async function PATCH(req: Request, { params }: Params) {
  const { sessionId } = params;
  const body = await req.json().catch(() => ({})) as { action?: string };

  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const { sharedState } = session;
  let newPhase: GamePhase = sharedState.phase;
  let message = "";

  if (body.action === "advance_phase") {
    if (sharedState.phase === "lobby") {
      newPhase = "opening";
      message = "오프닝이 시작됩니다.";
      session.startedAt = new Date().toISOString();
    } else if (sharedState.phase === "opening") {
      newPhase = "round-1";
      sharedState.currentRound = 1;
      message = "Round 1 조사 페이즈가 시작됩니다.";
    } else if (sharedState.phase.startsWith("round-")) {
      const cur = sharedState.currentRound;
      // TODO: max round 체크는 game.rules에서 참조, 일단 고정 4라운드
      if (cur >= 4) {
        newPhase = "vote";
        message = "투표 페이즈가 시작됩니다.";
      } else {
        newPhase = `round-${cur + 1}` as GamePhase;
        sharedState.currentRound = cur + 1;
        message = `Round ${cur + 1} 조사 페이즈가 시작됩니다.`;
      }
    } else if (sharedState.phase === "vote") {
      newPhase = "ending";
      message = "엔딩입니다. 진실이 밝혀집니다.";
      session.endedAt = new Date().toISOString();
    }
  } else if (body.action === "end_session") {
    session.endedAt = new Date().toISOString();
    newPhase = "ending";
    message = "GM이 세션을 종료했습니다.";
  }

  sharedState.phase = newPhase;
  sharedState.eventLog.push({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    message,
    type: "phase_changed",
  });

  updateSession(session);
  broadcast(sessionId, "session_update", { sharedState: session.sharedState });

  return NextResponse.json({ session: { id: session.id, sharedState: session.sharedState } });
}

/** DELETE /api/sessions/[sessionId] — 세션 파일 삭제 */
export async function DELETE(_req: Request, { params }: Params) {
  const { sessionId } = params;
  const session = getSession(sessionId);
  if (session) {
    broadcast(sessionId, "session_deleted", {});
  }
  const deleted = deleteSession(sessionId);
  if (!deleted) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
