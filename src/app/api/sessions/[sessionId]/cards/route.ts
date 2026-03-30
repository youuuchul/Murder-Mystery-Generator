import { NextResponse } from "next/server";
import { getGame } from "@/lib/game-repository";
import { getSession, updateSession } from "@/lib/session-repository";
import { broadcast } from "@/lib/sse/broadcaster";
import type { InventoryCard, PlayerState } from "@/types/session";
import type { ClueCondition } from "@/types/game";

type Params = { params: { sessionId: string } };

/**
 * 단서/장소 조건 평가 — 현재 인벤토리 상태 기반 (동적 체크)
 * - has_items:          요청 플레이어가 지정 단서를 현재 보유
 * - character_has_item: 특정 캐릭터가 지정 단서를 현재 보유
 */
function evaluateCondition(
  condition: ClueCondition,
  pState: PlayerState,
  allPlayerStates: PlayerState[]
): { ok: boolean; reason: string } {
  if (condition.type === "has_items") {
    const missing = condition.requiredClueIds.filter(
      (id) => !pState.inventory.some((i) => i.cardId === id)
    );
    if (missing.length > 0) {
      return { ok: false, reason: "조건 미충족: 필요한 아이템을 현재 보유하고 있지 않습니다." };
    }
    return { ok: true, reason: "" };
  }

  if (condition.type === "character_has_item") {
    if (!condition.targetCharacterId) {
      return { ok: false, reason: "조건 설정 오류: 대상 캐릭터가 지정되지 않았습니다." };
    }
    const targetState = allPlayerStates.find((p) => p.playerId === condition.targetCharacterId);
    if (!targetState) {
      return { ok: false, reason: "대상 캐릭터가 게임에 참여하지 않았습니다." };
    }
    const missing = condition.requiredClueIds.filter(
      (id) => !targetState.inventory.some((i) => i.cardId === id)
    );
    if (missing.length > 0) {
      return { ok: false, reason: "조건 미충족: 대상 캐릭터가 필요한 아이템을 보유하고 있지 않습니다." };
    }
    return { ok: true, reason: "" };
  }

  return { ok: false, reason: "알 수 없는 조건 유형" };
}

/**
 * POST /api/sessions/[sessionId]/cards
 *
 * action: "acquire"    — 플레이어가 장소에서 단서 획득
 * action: "distribute" — legacy GM 단서 배포
 * action: "transfer"   — 플레이어 간 카드 이전
 */
export async function POST(req: Request, { params }: Params) {
  const { sessionId } = params;
  const body = await req.json().catch(() => ({})) as {
    action?: string;
    clueId?: string;
    locationId?: string;
    token?: string;
    targetPlayerId?: string; // distribute/transfer 대상
    cardId?: string;         // transfer용
  };

  const session = await getSession(sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const game = await getGame(session.gameId);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  // ── 단서 획득 ──────────────────────────────────────────────
  if (body.action === "acquire") {
    const { token, clueId, locationId } = body;
    if (!token || !clueId || !locationId) {
      return NextResponse.json({ error: "token, clueId, locationId 필수" }, { status: 400 });
    }

    const pState = session.playerStates.find((p) => p.token === token);
    if (!pState) return NextResponse.json({ error: "Invalid token" }, { status: 403 });

    const clue = game.clues.find((c) => c.id === clueId);
    const location = game.locations?.find((l) => l.id === locationId);
    if (!clue || !location) return NextResponse.json({ error: "단서/장소 없음" }, { status: 404 });

    // 장소 소유자 접근 불가
    if (location.ownerPlayerId === pState.playerId) {
      return NextResponse.json({ error: "자신의 공간 단서는 획득 불가" }, { status: 403 });
    }

    // 장소 입장 조건 체크
    if (location.accessCondition) {
      const condResult = evaluateCondition(location.accessCondition, pState, session.playerStates);
      if (!condResult.ok) {
        return NextResponse.json(
          { error: `[장소 입장 불가] ${condResult.reason}` },
          { status: 403 }
        );
      }
    }

    // 라운드 잠금 확인
    const phase = session.sharedState.phase;
    if (location.unlocksAtRound !== null) {
      const curRound = session.sharedState.currentRound;
      if (curRound < (location.unlocksAtRound ?? 0)) {
        return NextResponse.json({ error: "아직 해제되지 않은 장소" }, { status: 403 });
      }
    }
    if (!phase.startsWith("round-")) {
      return NextResponse.json({ error: "조사 페이즈가 아닙니다" }, { status: 400 });
    }

    // 현장 단서는 공개형이므로 장소 화면에서 바로 확인한다.
    if (clue.type === "scene") {
      return NextResponse.json({ error: "현장 단서는 획득하지 않고 장소에서 바로 확인합니다." }, { status: 400 });
    }

    // 단서 획득 조건 체크
    if (clue.condition) {
      const condResult = evaluateCondition(clue.condition, pState, session.playerStates);
      if (!condResult.ok) {
        return NextResponse.json({ error: condResult.reason }, { status: 403 });
      }
    }

    // 이미 보유 여부 (본인)
    if (pState.inventory.some((i) => i.cardId === clueId)) {
      return NextResponse.json({ error: "이미 보유한 단서입니다." }, { status: 409 });
    }

    // 다른 플레이어가 이미 보유 중
    session.sharedState.acquiredClueIds = session.sharedState.acquiredClueIds ?? [];
    if (session.sharedState.acquiredClueIds.includes(clueId)) {
      return NextResponse.json({ error: "이미 다른 플레이어가 보유한 단서입니다." }, { status: 409 });
    }

    const roundKey = String(session.sharedState.currentRound);

    // 라운드당 획득 수 제한
    const cluesPerRound = game.rules?.cluesPerRound ?? 0;
    if (cluesPerRound > 0) {
      // 기존 세션 호환 (필드 없을 수 있음)
      pState.roundAcquired = pState.roundAcquired ?? {};
      const acquiredThisRound = pState.roundAcquired[roundKey] ?? 0;
      if (acquiredThisRound >= cluesPerRound) {
        return NextResponse.json(
          { error: `이번 라운드 획득 한도(${cluesPerRound}개)에 도달했습니다.` },
          { status: 403 }
        );
      }
    }

    // 동일 장소 재방문 제한
    const allowRevisit = game.rules?.allowLocationRevisit ?? true;
    if (!allowRevisit) {
      pState.roundVisitedLocations = pState.roundVisitedLocations ?? {};
      const visited = pState.roundVisitedLocations[roundKey] ?? [];
      if (visited.includes(locationId)) {
        return NextResponse.json(
          { error: "이번 라운드에 이미 방문한 장소입니다." },
          { status: 403 }
        );
      }
    }

    const card: InventoryCard = {
      cardId: clueId,
      cardType: "clue",
      acquiredAt: new Date().toISOString(),
    };
    pState.inventory.push(card);

    // 전체 획득 목록에 추가 (장소 동기화용 — 양도해도 제거하지 않음)
    if (!session.sharedState.acquiredClueIds.includes(clueId)) {
      session.sharedState.acquiredClueIds.push(clueId);
    }

    // 획득 수 / 방문 장소 기록 업데이트
    pState.roundAcquired = pState.roundAcquired ?? {};
    pState.roundAcquired[roundKey] = (pState.roundAcquired[roundKey] ?? 0) + 1;

    if (!allowRevisit) {
      pState.roundVisitedLocations = pState.roundVisitedLocations ?? {};
      const visited = pState.roundVisitedLocations[roundKey] ?? [];
      if (!visited.includes(locationId)) {
        pState.roundVisitedLocations[roundKey] = [...visited, locationId];
      }
    }
    session.sharedState.eventLog.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      message: `${pState.playerName}님이 단서를 획득했습니다.`,
      type: "card_received",
    });

    await updateSession(session);
    broadcast(sessionId, "session_update", { sharedState: session.sharedState });
    broadcast(sessionId, `inventory_${token}`, {
      inventory: pState.inventory,
      roundAcquired: pState.roundAcquired,
      roundVisitedLocations: pState.roundVisitedLocations,
    });
    return NextResponse.json({ card });
  }

  // ── GM 단서 배포 ────────────────────────────────────────────
  if (body.action === "distribute") {
    const { clueId, targetPlayerId } = body;
    if (!clueId || !targetPlayerId) {
      return NextResponse.json({ error: "clueId, targetPlayerId 필수" }, { status: 400 });
    }

    const pState = session.playerStates.find((p) => p.playerId === targetPlayerId);
    if (!pState) return NextResponse.json({ error: "대상 플레이어 없음" }, { status: 404 });

    if (pState.inventory.some((i) => i.cardId === clueId)) {
      return NextResponse.json({ error: "이미 보유한 단서" }, { status: 409 });
    }

    const card: InventoryCard = {
      cardId: clueId,
      cardType: "clue",
      acquiredAt: new Date().toISOString(),
    };
    pState.inventory.push(card);

    if (!session.sharedState.acquiredClueIds.includes(clueId)) {
      session.sharedState.acquiredClueIds.push(clueId);
    }

    session.sharedState.eventLog.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      message: `GM이 ${pState.playerName}님에게 단서를 배포했습니다.`,
      type: "clue_revealed",
    });

    await updateSession(session);
    broadcast(sessionId, "session_update", { sharedState: session.sharedState });
    broadcast(sessionId, `inventory_${pState.token}`, { inventory: pState.inventory });
    return NextResponse.json({ card });
  }

  // ── 카드 이전 ───────────────────────────────────────────────
  if (body.action === "transfer") {
    const { token, cardId, targetPlayerId } = body;
    if (!token || !cardId || !targetPlayerId) {
      return NextResponse.json({ error: "token, cardId, targetPlayerId 필수" }, { status: 400 });
    }

    const from = session.playerStates.find((p) => p.token === token);
    const to = session.playerStates.find((p) => p.playerId === targetPlayerId);
    if (!from || !to) return NextResponse.json({ error: "플레이어 없음" }, { status: 404 });

    const cardIdx = from.inventory.findIndex((i) => i.cardId === cardId);
    if (cardIdx === -1) return NextResponse.json({ error: "보유하지 않은 카드" }, { status: 404 });

    if (!game.rules?.cardTrading?.enabled) {
      return NextResponse.json({ error: "카드 이전이 허용되지 않은 게임입니다." }, { status: 403 });
    }

    const [card] = from.inventory.splice(cardIdx, 1);
    const transferred: InventoryCard = { ...card, fromPlayerId: from.playerId };
    to.inventory.push(transferred);

    const transferEntry = {
      id: crypto.randomUUID(),
      fromToken: token,
      toToken: to.token,
      cardId,
      timestamp: new Date().toISOString(),
    };
    from.transferLog.push(transferEntry);
    to.transferLog.push(transferEntry);

    session.sharedState.eventLog.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      message: `${from.playerName}님이 ${to.playerName}님에게 카드를 건넸습니다.`,
      type: "card_transferred",
    });

    await updateSession(session);
    broadcast(sessionId, "session_update", { sharedState: session.sharedState });
    broadcast(sessionId, `inventory_${token}`, { inventory: from.inventory });
    broadcast(sessionId, `inventory_${to.token}`, { inventory: to.inventory });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
