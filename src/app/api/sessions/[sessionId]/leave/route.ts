import { NextRequest, NextResponse } from "next/server";
import { getGame } from "@/lib/game-repository";
import { deleteSession, getSession, updateSession } from "@/lib/session-repository";
import { isSessionHost, hasStoredGmSessionAccess } from "@/lib/gm-session-access";
import { getRequestMakerUser } from "@/lib/maker-user.server";
import { broadcast } from "@/lib/sse/broadcaster";

type Params = { params: { sessionId: string } };

/**
 * POST /api/sessions/[sessionId]/leave
 *
 * 플레이어 또는 GM이 세션에서 퇴장한다.
 * unlisted 게임의 경우 세션 파괴 정책이 적용된다:
 *   - GM 퇴장 → 세션 즉시 파괴
 *   - 플레이어 퇴장 + 마지막 참여자 → 세션 파괴
 *   - 플레이어 퇴장 + 다른 참여자 있음 → 슬롯 해제만
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { sessionId } = params;
  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : null;

  const game = await getGame(session.gameId);
  if (!game) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다." }, { status: 404 });
  }

  const isUnlisted = game.access.visibility === "unlisted";

  const currentUser = await getRequestMakerUser(request);
  const isGm =
    isSessionHost(session, currentUser?.id) ||
    hasStoredGmSessionAccess(session, request.cookies);

  // GM 퇴장: unlisted면 세션 즉시 파괴
  if (isGm) {
    if (isUnlisted) {
      broadcast(sessionId, "session_deleted", {});
      await deleteSession(sessionId);
      return NextResponse.json({ action: "destroyed", reason: "gm_left_unlisted" });
    }
    // public/private GM 퇴장은 세션 유지 (기존 동작)
    return NextResponse.json({ action: "none", reason: "gm_left_non_unlisted" });
  }

  // 플레이어 퇴장: 토큰으로 슬롯 식별
  if (!token) {
    return NextResponse.json({ error: "토큰이 필요합니다." }, { status: 400 });
  }

  const slot = session.sharedState.characterSlots.find(
    (s) => s.token === token && s.isLocked
  );
  if (!slot) {
    return NextResponse.json({ error: "해당 슬롯을 찾을 수 없습니다." }, { status: 404 });
  }

  // 남은 참여자 수 계산 (본인 제외, AI 제외)
  const otherLockedHumans = session.sharedState.characterSlots.filter(
    (s) => s.isLocked && s.token !== token && !s.isAiControlled
  );

  if (isUnlisted && otherLockedHumans.length === 0) {
    // 마지막 참여자 → 세션 파괴
    broadcast(sessionId, "session_deleted", {});
    await deleteSession(sessionId);
    return NextResponse.json({ action: "destroyed", reason: "last_player_left_unlisted" });
  }

  // 슬롯 해제 (세션 유지)
  slot.playerName = null;
  slot.token = null;
  slot.isLocked = false;
  slot.isAiControlled = false;
  slot.aiRuntimeStatus = undefined;

  session.updatedAt = new Date().toISOString();
  await updateSession(session);

  broadcast(sessionId, "slot_unlocked", { playerId: slot.playerId });

  return NextResponse.json({
    action: isUnlisted ? "unlocked_unlisted" : "unlocked",
    reason: "player_left",
  });
}
