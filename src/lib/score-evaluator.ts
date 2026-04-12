import type { Player, ScoreCondition } from "@/types/game";
import type { InventoryCard, VoteReveal } from "@/types/session";

/** 승점 조건 자동 판정 결과 */
export interface ScoreConditionResult {
  condition: ScoreCondition;
  achieved: boolean | null; // null = 수동 판정 (표시 안 함)
  points: number;           // 달성 시 획득 점수 (미달성/수동 시 0)
}

/**
 * 승점 조건의 달성 여부를 자동 판정한다.
 * "manual" 타입이거나 판정 불가 시 achieved=null 반환 (화면에 체크 표시 안 함).
 */
export function evaluateScoreCondition({
  condition,
  reveal,
  inventory,
  myVotes,
}: {
  condition: ScoreCondition;
  reveal?: VoteReveal;
  inventory?: InventoryCard[];
  myVotes?: Record<string, string>;
}): ScoreConditionResult {
  const type = condition.type ?? "manual";

  if (type === "manual") {
    return { condition, achieved: null, points: 0 };
  }

  if (type === "culprit-outcome") {
    if (!reveal?.resultType) {
      return { condition, achieved: null, points: 0 };
    }
    const expected = condition.config?.expectedOutcome ?? "arrested";
    const actual = reveal.resultType === "culprit-captured" ? "arrested" : "escaped";
    const achieved = expected === actual;
    return { condition, achieved, points: achieved ? condition.points : 0 };
  }

  if (type === "clue-ownership") {
    const clueId = condition.config?.clueId;
    if (!clueId || !inventory) {
      return { condition, achieved: null, points: 0 };
    }
    const hasIt = inventory.some((item) => item.cardId === clueId);
    const expected = condition.config?.expectedOwnership ?? "has";
    const achieved = expected === "has" ? hasIt : !hasIt;
    return { condition, achieved, points: achieved ? condition.points : 0 };
  }

  if (type === "vote-answer") {
    const questionId = condition.config?.questionId;
    const expectedAnswerId = condition.config?.expectedAnswerId;
    if (!questionId || !expectedAnswerId || !myVotes) {
      return { condition, achieved: null, points: 0 };
    }
    const myAnswer = myVotes[questionId];
    const achieved = myAnswer === expectedAnswerId;
    return { condition, achieved, points: achieved ? condition.points : 0 };
  }

  return { condition, achieved: null, points: 0 };
}

/**
 * 플레이어의 모든 승점 조건을 판정하고 총점을 계산한다.
 */
export function evaluatePlayerScore({
  player,
  reveal,
  inventory,
  myVotes,
}: {
  player: Player;
  reveal?: VoteReveal;
  inventory?: InventoryCard[];
  myVotes?: Record<string, string>;
}): {
  results: ScoreConditionResult[];
  totalPoints: number;
  hasAnyAutoJudged: boolean;
} {
  const results = player.scoreConditions.map((condition) =>
    evaluateScoreCondition({ condition, reveal, inventory, myVotes })
  );
  const totalPoints = results.reduce((sum, r) => sum + r.points, 0);
  const hasAnyAutoJudged = results.some((r) => r.achieved !== null);
  return { results, totalPoints, hasAnyAutoJudged };
}
