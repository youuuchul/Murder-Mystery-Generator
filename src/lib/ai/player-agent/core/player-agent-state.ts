import type {
  CharacterSlot,
  PlayerAgentRuntimeStatus,
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

/**
 * 사람이 아직 들어오지 않은 슬롯 중 일부를 AI 플레이어 슬롯으로 켠다.
 * 대기실 시작 직전에만 사용하며, 이미 켜진 슬롯과 기존 기억 상태는 유지한다.
 */
export function enablePlayerAgentSlotsForMissingPlayers(
  state: PlayerAgentSessionState,
  options: {
    unlockedPlayerIds: string[];
    missingPlayerCount: number;
  }
): PlayerAgentSessionState {
  const missingPlayerCount = Math.max(0, options.missingPlayerCount);
  if (missingPlayerCount === 0) {
    return state;
  }

  const unlockedPlayerIds = new Set(options.unlockedPlayerIds);
  let remainingToEnable = missingPlayerCount;
  let changed = false;

  const nextSlots = state.slots.map((slot) => {
    if (remainingToEnable <= 0 || !unlockedPlayerIds.has(slot.playerId) || slot.enabled) {
      return slot;
    }

    remainingToEnable -= 1;
    changed = true;
    return {
      ...slot,
      enabled: true,
      runtimeStatus: "idle" as PlayerAgentRuntimeStatus,
    };
  });

  if (!changed) {
    return state;
  }

  return {
    ...state,
    slots: nextSlots,
  };
}

/**
 * AI 슬롯 활성화 상태를 공개 세션 슬롯 정보에 반영한다.
 * 사람이 점유한 슬롯은 유지하고, AI가 맡은 자리는 참가 목록과 조인 화면에서 보이게 맞춘다.
 */
export function applyPlayerAgentOccupancyToCharacterSlots(
  slots: CharacterSlot[],
  state: PlayerAgentSessionState
): CharacterSlot[] {
  const aiEnabledPlayerIds = new Set(
    state.slots
      .filter((slot) => slot.enabled)
      .map((slot) => slot.playerId)
  );

  return slots.map((slot) => {
    if (slot.token) {
      return {
        ...slot,
        isAiControlled: false,
      };
    }

    if (aiEnabledPlayerIds.has(slot.playerId)) {
      return {
        ...slot,
        playerName: "AI 플레이어",
        token: null,
        isLocked: true,
        isAiControlled: true,
      };
    }

    if (slot.isAiControlled) {
      return {
        ...slot,
        playerName: null,
        token: null,
        isLocked: false,
        isAiControlled: false,
      };
    }

    return slot;
  });
}
