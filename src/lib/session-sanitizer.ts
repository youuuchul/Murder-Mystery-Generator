import type { GameSession } from "@/types/session";

export interface JoinSessionPreview {
  id: string;
  gameId: string;
  sessionName: string;
  sessionCode: string;
  mode: GameSession["mode"];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
  sharedState: Pick<GameSession["sharedState"], "phase" | "currentRound" | "currentSubPhase" | "characterSlots">;
}

/**
 * 참가 전 화면에는 슬롯 선택에 필요한 최소 세션 정보만 남긴다.
 * playerStates, votes, AI 상태 같은 내부 데이터는 여기서 제거한다.
 */
export function buildJoinSessionPreview(session: GameSession): JoinSessionPreview {
  return {
    id: session.id,
    gameId: session.gameId,
    sessionName: session.sessionName,
    sessionCode: session.sessionCode,
    mode: session.mode,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    sharedState: {
      phase: session.sharedState.phase,
      currentRound: session.sharedState.currentRound,
      currentSubPhase: session.sharedState.currentSubPhase,
      characterSlots: session.sharedState.characterSlots,
    },
  };
}
