import { NextRequest, NextResponse } from "next/server";
import { getGame } from "@/lib/game-repository";
import { mutateSessionWithRetry } from "@/lib/session-mutation";
import { getSession, isSessionConflictError } from "@/lib/session-repository";
import { broadcast } from "@/lib/sse/broadcaster";
import { publishSessionRealtime } from "@/lib/sse/realtime-publisher";

type Params = { params: { sessionId: string; locationId: string } };

/**
 * POST /api/sessions/[sessionId]/locations/[locationId]/unlock
 *
 * `character_has_item` 입장 조건 장소를 영구 잠금 해제한다.
 * - 요청자는 반드시 condition.targetCharacterId 본인이어야 한다.
 * - 본인이 requiredClueIds 를 모두 보유 중이어야 한다.
 * - 성공 시 sharedState.unlockedLocationIds 에 추가하고 location_unlocked 이벤트를 브로드캐스트한다.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { sessionId, locationId } = params;
  const body = (await req.json().catch(() => ({}))) as { token?: string };

  if (!body.token) {
    return NextResponse.json({ error: "token 필수" }, { status: 400 });
  }

  const session = await getSession(sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const game = await getGame(session.gameId);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const pState = session.playerStates.find((p) => p.token === body.token);
  if (!pState) return NextResponse.json({ error: "Invalid token" }, { status: 403 });

  const location = game.locations?.find((l) => l.id === locationId);
  if (!location) return NextResponse.json({ error: "장소 없음" }, { status: 404 });

  const condition = location.accessCondition;
  if (!condition || condition.type !== "character_has_item") {
    return NextResponse.json(
      { error: "이 장소는 열기 액션이 필요하지 않습니다." },
      { status: 400 }
    );
  }

  if (!condition.targetCharacterId) {
    return NextResponse.json(
      { error: "조건 설정 오류: 대상 캐릭터가 지정되지 않았습니다." },
      { status: 400 }
    );
  }

  if (pState.playerId !== condition.targetCharacterId) {
    return NextResponse.json(
      { error: "이 장소는 지정된 캐릭터만 열 수 있습니다." },
      { status: 403 }
    );
  }

  const missing = condition.requiredClueIds.filter(
    (id) => !pState.inventory.some((i) => i.cardId === id)
  );
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "열 수 없습니다: 필요한 단서를 모두 보유하고 있지 않습니다." },
      { status: 403 }
    );
  }

  if (session.sharedState.unlockedLocationIds?.includes(locationId)) {
    return NextResponse.json({ ok: true, alreadyUnlocked: true });
  }

  try {
    const { session: persistedSession } = await mutateSessionWithRetry(
      sessionId,
      (latestSession) => {
        const latestPlayer = latestSession.playerStates.find((p) => p.playerId === pState.playerId);
        if (!latestPlayer) {
          throw new Error("플레이어 없음");
        }

        const stillHas = condition.requiredClueIds.every(
          (id) => latestPlayer.inventory.some((i) => i.cardId === id)
        );
        if (!stillHas) {
          throw new Error("열 수 없습니다");
        }

        latestSession.sharedState.unlockedLocationIds =
          latestSession.sharedState.unlockedLocationIds ?? [];
        if (!latestSession.sharedState.unlockedLocationIds.includes(locationId)) {
          latestSession.sharedState.unlockedLocationIds.push(locationId);
        }

        latestSession.sharedState.eventLog.push({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          message: `${latestPlayer.playerName}님이 「${location.name}」을(를) 열었습니다.`,
          type: "system",
        });

        return null;
      }
    );

    const unlockerCharacter = game.players.find((p) => p.id === pState.playerId);
    const payload = {
      locationId,
      locationName: location.name,
      unlockerPlayerId: pState.playerId,
      unlockerName: pState.playerName,
      unlockerCharacterName: unlockerCharacter?.name ?? null,
    };

    broadcast(sessionId, "session_update", { sharedState: persistedSession.sharedState });
    broadcast(sessionId, "location_unlocked", payload);
    void publishSessionRealtime(sessionId, "location_unlocked", payload);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "플레이어 없음") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error && error.message === "열 수 없습니다") {
      return NextResponse.json(
        { error: "열 수 없습니다: 필요한 단서를 모두 보유하고 있지 않습니다." },
        { status: 403 }
      );
    }
    if (isSessionConflictError(error)) {
      return NextResponse.json(
        { error: "다른 변경사항이 먼저 저장됐습니다. 화면을 새로고침한 뒤 다시 시도해주세요." },
        { status: 409 }
      );
    }
    throw error;
  }
}
