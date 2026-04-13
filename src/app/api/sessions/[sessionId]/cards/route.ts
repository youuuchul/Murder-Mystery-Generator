import { NextRequest, NextResponse } from "next/server";
import {
  applyPlayerAgentAutoAcquireReaction,
  tracePlayerAgentAutoAcquireOutcome,
  type PlayerAgentAutoAcquireOutcome,
} from "@/lib/ai/player-agent/actions/auto-actions";
import { canAccessGmPlay } from "@/lib/game-access";
import { canResumeGmSessionDirectly } from "@/lib/gm-session-access";
import { getGame } from "@/lib/game-repository";
import { isMakerAdmin } from "@/lib/maker-role";
import { getRequestMakerUser } from "@/lib/maker-user.server";
import { mutateSessionWithRetry } from "@/lib/session-mutation";
import { getSession, isSessionConflictError } from "@/lib/session-repository";
import { broadcast } from "@/lib/sse/broadcaster";
import type { InventoryCard, PlayerState } from "@/types/session";
import type { ClueCondition } from "@/types/game";

type Params = { params: { sessionId: string } };

async function canAccessGmSession(request: NextRequest, sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session) {
    return false;
  }

  const game = await getGame(session.gameId);
  if (!game) {
    return false;
  }

  const currentUser = await getRequestMakerUser(request);
  if (!canAccessGmPlay(game, currentUser)) {
    return false;
  }

  return canResumeGmSessionDirectly(session, {
    currentUserId: currentUser?.id,
    isAdmin: isMakerAdmin(currentUser),
    cookieStore: request.cookies,
  });
}

function createSessionConflictResponse() {
  return NextResponse.json(
    { error: "다른 변경사항이 먼저 저장됐습니다. 화면을 새로고침한 뒤 다시 시도해주세요." },
    { status: 409 }
  );
}

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
export async function POST(req: NextRequest, { params }: Params) {
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

    // TODO(Phase 2): 공용 단서는 첫 발견자만 비용을 내고 이후엔 자유 열람하도록 재설계.
    // 현재는 Phase 1 호환을 위해 획득 경로를 거부한다 (기존 scene 동작과 동일).
    if (clue.type === "shared") {
      return NextResponse.json({ error: "공용 단서는 장소에서 직접 확인합니다." }, { status: 400 });
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

    try {
      const { session: persistedSession, result } = await mutateSessionWithRetry(
        sessionId,
        (latestSession) => {
          const latestPlayerState = latestSession.playerStates.find((player) => player.playerId === pState.playerId);
          if (!latestPlayerState) {
            throw new Error("참가 정보를 다시 불러오지 못했습니다. 다시 입장해주세요.");
          }

          const latestLocation = game.locations?.find((item) => item.id === locationId);
          const latestClue = game.clues.find((item) => item.id === clueId);
          if (!latestClue || !latestLocation) {
            throw new Error("단서/장소 없음");
          }

          if (latestPlayerState.inventory.some((item) => item.cardId === clueId)) {
            throw new Error("이미 보유한 단서입니다.");
          }

          latestSession.sharedState.acquiredClueIds = latestSession.sharedState.acquiredClueIds ?? [];
          if (latestSession.sharedState.acquiredClueIds.includes(clueId)) {
            throw new Error("이미 다른 플레이어가 보유한 단서입니다.");
          }

          const latestRoundKey = String(latestSession.sharedState.currentRound);
          const latestCluesPerRound = game.rules?.cluesPerRound ?? 0;
          if (latestCluesPerRound > 0) {
            latestPlayerState.roundAcquired = latestPlayerState.roundAcquired ?? {};
            const acquiredThisRound = latestPlayerState.roundAcquired[latestRoundKey] ?? 0;
            if (acquiredThisRound >= latestCluesPerRound) {
              throw new Error(`이번 라운드 획득 한도(${latestCluesPerRound}개)에 도달했습니다.`);
            }
          }

          const latestAllowRevisit = game.rules?.allowLocationRevisit ?? true;
          if (!latestAllowRevisit) {
            latestPlayerState.roundVisitedLocations = latestPlayerState.roundVisitedLocations ?? {};
            const visited = latestPlayerState.roundVisitedLocations[latestRoundKey] ?? [];
            if (visited.includes(locationId)) {
              throw new Error("이번 라운드에 이미 방문한 장소입니다.");
            }
          }

          latestPlayerState.inventory.push({
            cardId: clueId,
            cardType: "clue",
            acquiredAt: new Date().toISOString(),
          });

          if (!latestSession.sharedState.acquiredClueIds.includes(clueId)) {
            latestSession.sharedState.acquiredClueIds.push(clueId);
          }

          latestPlayerState.roundAcquired = latestPlayerState.roundAcquired ?? {};
          latestPlayerState.roundAcquired[latestRoundKey] = (latestPlayerState.roundAcquired[latestRoundKey] ?? 0) + 1;

          if (!latestAllowRevisit) {
            latestPlayerState.roundVisitedLocations = latestPlayerState.roundVisitedLocations ?? {};
            const visited = latestPlayerState.roundVisitedLocations[latestRoundKey] ?? [];
            if (!visited.includes(locationId)) {
              latestPlayerState.roundVisitedLocations[latestRoundKey] = [...visited, locationId];
            }
          }

          latestSession.sharedState.eventLog.push({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            message: `${latestPlayerState.playerName}님이 단서를 획득했습니다.`,
            type: "card_received",
          });

          // 모든 AI 플레이어가 각각 1개씩 단서를 획득하도록 반복 호출
          const autoAcquireOutcomes: PlayerAgentAutoAcquireOutcome[] = [];
          const aiSlotCount = latestSession.sharedState.characterSlots.filter(
            (slot) => slot.isAiControlled && slot.isLocked
          ).length;

          for (let i = 0; i < aiSlotCount; i++) {
            const outcome = applyPlayerAgentAutoAcquireReaction(
              latestSession,
              game,
              {
                triggerPlayerId: latestPlayerState.playerId,
                trigger: "human_clue_acquired",
              }
            );
            autoAcquireOutcomes.push(outcome);
            if (!outcome.acted) break; // 더 이상 가능한 AI가 없으면 중단
          }

          return { autoAcquireOutcome: autoAcquireOutcomes[0] ?? { acted: false, trigger: "human_clue_acquired" }, autoAcquireOutcomes };
        }
      );

      const persistedPlayerState = persistedSession.playerStates.find((player) => player.playerId === pState.playerId);
      const persistedCard = persistedPlayerState?.inventory.find((item) => item.cardId === clueId);
      if (!persistedPlayerState || !persistedCard) {
        throw new Error("획득한 단서를 다시 불러오지 못했습니다.");
      }

      broadcast(sessionId, "session_update", { sharedState: persistedSession.sharedState });
      broadcast(sessionId, `inventory_${persistedPlayerState.token}`, {
        inventory: persistedPlayerState.inventory,
        roundAcquired: persistedPlayerState.roundAcquired,
        roundVisitedLocations: persistedPlayerState.roundVisitedLocations,
      });

      for (const outcome of result.autoAcquireOutcomes ?? [result.autoAcquireOutcome]) {
        await tracePlayerAgentAutoAcquireOutcome({
          session: {
            id: persistedSession.id,
            gameId: persistedSession.gameId,
            mode: persistedSession.mode,
            sharedState: persistedSession.sharedState,
          },
          outcome,
        });
      }

      return NextResponse.json({ card: persistedCard });
    } catch (error) {
      if (error instanceof Error && error.message === "참가 정보를 다시 불러오지 못했습니다. 다시 입장해주세요.") {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }

      if (error instanceof Error && error.message === "단서/장소 없음") {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }

      if (error instanceof Error && error.message === "이미 보유한 단서입니다.") {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }

      if (error instanceof Error && error.message === "이미 다른 플레이어가 보유한 단서입니다.") {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }

      if (error instanceof Error && error.message === "이번 라운드에 이미 방문한 장소입니다.") {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }

      if (
        error instanceof Error
        && error.message.startsWith("이번 라운드 획득 한도(")
      ) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }

      if (isSessionConflictError(error)) {
        return createSessionConflictResponse();
      }

      throw error;
    }
  }

  // ── GM 단서 배포 ────────────────────────────────────────────
  if (body.action === "distribute") {
    if (!(await canAccessGmSession(req, sessionId))) {
      return NextResponse.json({ error: "이 세션에 단서를 배포할 권한이 없습니다." }, { status: 403 });
    }

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

    try {
      const { session: persistedSession } = await mutateSessionWithRetry(
        sessionId,
        (latestSession) => {
          const latestPlayerState = latestSession.playerStates.find((player) => player.playerId === targetPlayerId);
          if (!latestPlayerState) {
            throw new Error("대상 플레이어 없음");
          }

          if (latestPlayerState.inventory.some((item) => item.cardId === clueId)) {
            throw new Error("이미 보유한 단서");
          }

          latestPlayerState.inventory.push({
            cardId: clueId,
            cardType: "clue",
            acquiredAt: new Date().toISOString(),
          });

          latestSession.sharedState.acquiredClueIds = latestSession.sharedState.acquiredClueIds ?? [];
          if (!latestSession.sharedState.acquiredClueIds.includes(clueId)) {
            latestSession.sharedState.acquiredClueIds.push(clueId);
          }

          latestSession.sharedState.eventLog.push({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            message: `GM이 ${latestPlayerState.playerName}님에게 단서를 배포했습니다.`,
            type: "clue_revealed",
          });

          return null;
        }
      );

      const persistedPlayerState = persistedSession.playerStates.find((player) => player.playerId === targetPlayerId);
      const persistedCard = persistedPlayerState?.inventory.find((item) => item.cardId === clueId);
      if (!persistedPlayerState || !persistedCard) {
        throw new Error("배포한 단서를 다시 불러오지 못했습니다.");
      }

      broadcast(sessionId, "session_update", { sharedState: persistedSession.sharedState });
      broadcast(sessionId, `inventory_${persistedPlayerState.token}`, {
        inventory: persistedPlayerState.inventory,
      });

      return NextResponse.json({ card: persistedCard });
    } catch (error) {
      if (error instanceof Error && error.message === "대상 플레이어 없음") {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }

      if (error instanceof Error && error.message === "이미 보유한 단서") {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }

      if (error instanceof Error && error.message === "배포한 단서를 다시 불러오지 못했습니다.") {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }

      if (isSessionConflictError(error)) {
        return createSessionConflictResponse();
      }

      throw error;
    }
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

    try {
      const { session: persistedSession } = await mutateSessionWithRetry(
        sessionId,
        (latestSession) => {
          const latestFrom = latestSession.playerStates.find((player) => player.playerId === from.playerId);
          const latestTo = latestSession.playerStates.find((player) => player.playerId === to.playerId);
          if (!latestFrom || !latestTo) {
            throw new Error("플레이어 없음");
          }

          const latestCardIndex = latestFrom.inventory.findIndex((item) => item.cardId === cardId);
          if (latestCardIndex === -1) {
            throw new Error("보유하지 않은 카드");
          }

          const [latestCard] = latestFrom.inventory.splice(latestCardIndex, 1);
          latestTo.inventory.push({ ...latestCard, fromPlayerId: latestFrom.playerId });

          const transferEntry = {
            id: crypto.randomUUID(),
            fromToken: latestFrom.token,
            toToken: latestTo.token,
            cardId,
            timestamp: new Date().toISOString(),
          };
          latestFrom.transferLog.push(transferEntry);
          latestTo.transferLog.push(transferEntry);

          latestSession.sharedState.eventLog.push({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            message: `${latestFrom.playerName}님이 ${latestTo.playerName}님에게 카드를 건넸습니다.`,
            type: "card_transferred",
          });

          return null;
        }
      );

      const persistedFrom = persistedSession.playerStates.find((player) => player.playerId === from.playerId);
      const persistedTo = persistedSession.playerStates.find((player) => player.playerId === to.playerId);
      if (!persistedFrom || !persistedTo) {
        throw new Error("카드 이전 결과를 다시 불러오지 못했습니다.");
      }

      broadcast(sessionId, "session_update", { sharedState: persistedSession.sharedState });
      broadcast(sessionId, `inventory_${persistedFrom.token}`, {
        inventory: persistedFrom.inventory,
      });
      broadcast(sessionId, `inventory_${persistedTo.token}`, {
        inventory: persistedTo.inventory,
      });

      return NextResponse.json({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message === "플레이어 없음") {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }

      if (error instanceof Error && error.message === "보유하지 않은 카드") {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }

      if (error instanceof Error && error.message === "카드 이전 결과를 다시 불러오지 못했습니다.") {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }

      if (isSessionConflictError(error)) {
        return createSessionConflictResponse();
      }

      throw error;
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
