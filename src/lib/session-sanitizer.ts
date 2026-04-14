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
  /**
   * 이전 점유자가 남긴 진행 데이터(인벤토리/획득 기록 등)가 있는 슬롯의 playerId 목록.
   * 슬롯이 해제되어 재참가 가능한 상태일 때 "이어받기" 라벨을 붙이기 위해 내려보낸다.
   * 실제 인벤토리 내용은 포함하지 않는다(스포일러 방지).
   */
  slotsWithPriorProgress: string[];
}

/**
 * 참가 전 화면에는 슬롯 선택에 필요한 최소 세션 정보만 남긴다.
 * playerStates, votes, AI 상태 같은 내부 데이터는 여기서 제거한다.
 */
export function buildJoinSessionPreview(session: GameSession): JoinSessionPreview {
  const slotsWithPriorProgress = session.playerStates
    .filter((ps) => {
      const hasInventory = (ps.inventory?.length ?? 0) > 0;
      const hasRoundActivity = Object.keys(ps.roundAcquired ?? {}).length > 0;
      return hasInventory || hasRoundActivity;
    })
    .map((ps) => ps.playerId);

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
    slotsWithPriorProgress,
  };
}
