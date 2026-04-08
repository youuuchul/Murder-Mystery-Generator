import type { PlayerAgentConversationTurn } from "@/lib/ai/shared/player-agent-context";
import type { GameSession } from "@/types/session";

export type PlayerAgentRuntimeStatus = "idle" | "thinking" | "responding" | "acting" | "cooldown";

export interface PlayerAgentActionState {
  lastClueAcquiredAt?: string;
  lastVoteSubmittedAt?: string;
  lastTradeDecisionAt?: string;
  deferredReason?: string;
}

export interface PlayerAgentSlotState {
  playerId: string;
  enabled: boolean;
  runtimeStatus: PlayerAgentRuntimeStatus;
  conversationHistory: PlayerAgentConversationTurn[];
  knownCardIds: string[];
  actionState: PlayerAgentActionState;
}

export interface PlayerAgentSessionState {
  sessionId: string;
  sessionMode: GameSession["mode"];
  slots: PlayerAgentSlotState[];
}

/**
 * AI 플레이어 세션 상태의 첫 기본값을 만든다.
 * 아직 LLM 호출은 붙이지 않고, 이후 챗/행동 파이프라인이 공유할 메모리 구조만 고정한다.
 */
export function createEmptyPlayerAgentSessionState(
  sessionId: string,
  sessionMode: GameSession["mode"]
): PlayerAgentSessionState {
  return {
    sessionId,
    sessionMode,
    slots: [],
  };
}
