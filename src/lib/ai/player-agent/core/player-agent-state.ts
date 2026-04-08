import type {
  PlayerAgentSessionState,
  PlayerAgentSlotState,
  SessionMode,
} from "@/types/session";

/**
 * AI 플레이어 슬롯 하나의 기본 상태를 만든다.
 * 캐릭터별 대화 이력과 행동 메모리는 이 구조를 기준으로 누적한다.
 */
export function createPlayerAgentSlotState(playerId: string): PlayerAgentSlotState {
  return {
    playerId,
    enabled: false,
    runtimeStatus: "idle",
    conversationHistory: [],
    knownCardIds: [],
    actionState: {},
  };
}

/**
 * AI 플레이어 세션 상태의 첫 기본값을 만든다.
 * 아직 LLM 호출은 붙이지 않고, 이후 챗/행동 파이프라인이 공유할 메모리 구조만 고정한다.
 */
export function createInitialPlayerAgentSessionState(
  sessionId: string,
  sessionMode: SessionMode,
  playerIds: string[]
): PlayerAgentSessionState {
  return {
    sessionId,
    sessionMode,
    slots: playerIds.map((playerId) => createPlayerAgentSlotState(playerId)),
  };
}

/**
 * 저장된 AI 플레이어 상태를 현재 세션 캐릭터 구성 기준으로 보정한다.
 * 예전 세션이나 캐릭터 구성이 바뀐 데이터도 읽을 수 있게 맞춘다.
 */
export function normalizePlayerAgentSessionState(
  state: PlayerAgentSessionState | undefined,
  sessionId: string,
  sessionMode: SessionMode,
  playerIds: string[]
): PlayerAgentSessionState {
  if (!state) {
    return createInitialPlayerAgentSessionState(sessionId, sessionMode, playerIds);
  }

  const slotByPlayerId = new Map(state.slots.map((slot) => [slot.playerId, slot]));

  return {
    sessionId,
    sessionMode,
    slots: playerIds.map((playerId) => {
      const existingSlot = slotByPlayerId.get(playerId);
      if (!existingSlot) {
        return createPlayerAgentSlotState(playerId);
      }

      return {
        playerId,
        enabled: existingSlot.enabled === true,
        runtimeStatus: existingSlot.runtimeStatus ?? "idle",
        conversationHistory: Array.isArray(existingSlot.conversationHistory)
          ? existingSlot.conversationHistory
          : [],
        knownCardIds: Array.isArray(existingSlot.knownCardIds)
          ? existingSlot.knownCardIds
          : [],
        actionState: existingSlot.actionState ?? {},
      };
    }),
  };
}
