import { getDisplayedVictoryRole } from "@/lib/culprit";
import type { Player, ScoreCondition, ScoreConditionConfig, ScoreConditionType, Story, VictoryCondition } from "@/types/game";
import type { InventoryCard, VoteReveal } from "@/types/session";

/** 승점 조건 자동 판정 결과 */
export interface ScoreConditionResult {
  condition: ScoreCondition;
  achieved: boolean | null; // null = 수동 판정 (표시 안 함)
  points: number;           // 달성 시 획득 점수 (미달성/수동 시 0)
  /** 자동 판정 타입인데 config가 비어 결과를 낼 수 없는 경우 안내 문구 */
  missingConfigReason?: string;
}

/**
 * 승점 조건의 달성 여부를 자동 판정한다.
 * "manual" 타입이거나 판정 불가 시 achieved=null 반환 (화면에 체크 표시 안 함).
 *
 * `clue-collection` `per-clue` 모드는 보유 단서 1개당 points 누적이라 점수가 동적이다.
 * `culprit-outcome`은 `config.expectedOutcome`이 비어 있으면 `displayedRole`로 자동 파생:
 *   - "avoid-arrest" → 범인이 도주(escaped) 시 달성
 *   - "arrest-culprit" → 범인이 검거(arrested) 시 달성
 *   - "uncertain" / 기타 → 판정 불가 (결정이 박히기 전)
 */
export function evaluateScoreCondition(input: {
  condition: ScoreCondition;
  reveal?: VoteReveal;
  inventory?: InventoryCard[];
  myVotes?: Record<string, string>;
  /** 미확신 결정 반영된 displayed role. culprit-outcome 자동 파생에 사용. */
  displayedRole?: VictoryCondition;
}): ScoreConditionResult {
  const result = evaluateConditionRule({
    type: input.condition.type ?? "manual",
    config: input.condition.config,
    points: input.condition.points,
    reveal: input.reveal,
    inventory: input.inventory,
    myVotes: input.myVotes,
    displayedRole: input.displayedRole,
  });
  return {
    condition: input.condition,
    achieved: result.achieved,
    points: result.achieved === true ? result.points : 0,
    missingConfigReason: result.missingConfigReason,
  };
}

/** displayedRole에서 culprit-outcome의 expectedOutcome을 자동 파생. */
function deriveExpectedFromRole(role: VictoryCondition | undefined): "arrested" | "escaped" | null {
  if (role === "avoid-arrest") return "escaped";   // 범인 입장 → 도주 시 승리
  if (role === "arrest-culprit") return "arrested"; // 무고 입장 → 검거 시 승리
  return null; // uncertain(미결정) / personal-goal — 자동 파생 불가
}

/**
 * 단일 조건 규칙(1순위 또는 fallback) 평가.
 * - achieved: true=달성, false=미달성, null=판정 불가(설정 누락 또는 데이터 부족).
 * - points: 달성 시 점수. 대부분 입력 points 그대로지만 `clue-collection per-clue` 모드는 ownedCount * points.
 */
function evaluateConditionRule(input: {
  type: ScoreConditionType;
  config?: ScoreConditionConfig;
  points: number;
  reveal?: VoteReveal;
  inventory?: InventoryCard[];
  myVotes?: Record<string, string>;
  displayedRole?: VictoryCondition;
}): { achieved: boolean | null; points: number; missingConfigReason?: string } {
  const { type, config, points, reveal, inventory, myVotes, displayedRole } = input;

  if (type === "manual") {
    return { achieved: null, points: 0 };
  }

  if (type === "culprit-outcome") {
    if (!reveal?.resultType) return { achieved: null, points: 0 };
    // expectedOutcome이 명시되어 있으면 그대로, 없으면 displayedRole 기반 자동 파생.
    const expected = config?.expectedOutcome ?? deriveExpectedFromRole(displayedRole);
    if (!expected) {
      return {
        achieved: null,
        points: 0,
        missingConfigReason: "승리 조건이 결정되지 않아 자동 판정을 건너뜁니다.",
      };
    }
    const actual = reveal.resultType === "culprit-captured" ? "arrested" : "escaped";
    const achieved = expected === actual;
    return { achieved, points: achieved ? points : 0 };
  }

  if (type === "vote-answer") {
    const questionId = config?.questionId;
    const expectedAnswerId = config?.expectedAnswerId;
    if (!questionId || !expectedAnswerId) {
      return { achieved: null, points: 0, missingConfigReason: "대상 질문 또는 기대 답변이 지정되지 않아 자동 판정을 건너뜁니다." };
    }
    if (!myVotes) return { achieved: null, points: 0 };
    const achieved = myVotes[questionId] === expectedAnswerId;
    return { achieved, points: achieved ? points : 0 };
  }

  if (type === "target-player-not-arrested") {
    const targetId = config?.targetPlayerId;
    if (!targetId) {
      return { achieved: null, points: 0, missingConfigReason: "대상 플레이어가 지정되지 않아 자동 판정을 건너뜁니다." };
    }
    if (!reveal) return { achieved: null, points: 0 };
    const achieved = reveal.arrestedPlayerId !== targetId;
    return { achieved, points: achieved ? points : 0 };
  }

  if (type === "target-player-arrested") {
    const targetId = config?.targetPlayerId;
    if (!targetId) {
      return { achieved: null, points: 0, missingConfigReason: "대상 플레이어가 지정되지 않아 자동 판정을 건너뜁니다." };
    }
    if (!reveal) return { achieved: null, points: 0 };
    const achieved = reveal.arrestedPlayerId === targetId;
    return { achieved, points: achieved ? points : 0 };
  }

  if (type === "clue-collection") {
    const clueIds = config?.clueIds ?? [];
    if (clueIds.length === 0) {
      return { achieved: null, points: 0, missingConfigReason: "대상 단서가 선택되지 않아 자동 판정을 건너뜁니다." };
    }
    if (!inventory) return { achieved: null, points: 0 };
    const ownedSet = new Set(inventory.map((item) => item.cardId));
    const ownedCount = clueIds.filter((id) => ownedSet.has(id)).length;
    const mode = config?.clueCountMode ?? "all";

    if (mode === "all") {
      const achieved = ownedCount === clueIds.length;
      return { achieved, points: achieved ? points : 0 };
    }
    if (mode === "per-clue") {
      // 보유 단서 1개당 points 누적. 1개 이상이면 달성, 0개면 미달성.
      const totalPoints = points * ownedCount;
      return { achieved: ownedCount > 0, points: totalPoints };
    }
    // "at-least-n" 기본
    const threshold = config?.clueCountThreshold ?? 1;
    const achieved = ownedCount >= threshold;
    return { achieved, points: achieved ? points : 0 };
  }

  return { achieved: null, points: 0 };
}

/**
 * 플레이어의 모든 승점 조건을 판정하고 총점을 계산한다.
 *
 * 게임 단위 `scoringEnabled === false`면 평가 자체를 skip — 빈 results + 0점 반환.
 * scoreConditions 데이터는 보존되지만 UI 계산에서 무시. 메이커가 다시 켜면 그대로 동작.
 *
 * `story`와 `uncertainResolutions`로 displayedRole 계산 — culprit-outcome 자동 파생에 사용.
 * 미확신 캐릭터의 결정이 박혀 있으면 그 결정 기반으로 점수 판정.
 */
export function evaluatePlayerScore({
  player,
  story,
  reveal,
  inventory,
  myVotes,
  scoringEnabled = true,
  uncertainResolutions,
}: {
  player: Player;
  story?: Story;
  reveal?: VoteReveal;
  inventory?: InventoryCard[];
  myVotes?: Record<string, string>;
  scoringEnabled?: boolean;
  uncertainResolutions?: Record<string, "culprit" | "innocent">;
}): {
  results: ScoreConditionResult[];
  totalPoints: number;
  hasAnyAutoJudged: boolean;
} {
  if (!scoringEnabled) {
    return { results: [], totalPoints: 0, hasAnyAutoJudged: false };
  }
  const displayedRole = story ? getDisplayedVictoryRole(player, story, uncertainResolutions) : undefined;
  const results = player.scoreConditions.map((condition) =>
    evaluateScoreCondition({ condition, reveal, inventory, myVotes, displayedRole })
  );
  const totalPoints = results.reduce((sum, r) => sum + r.points, 0);
  const hasAnyAutoJudged = results.some((r) => r.achieved !== null);
  return { results, totalPoints, hasAnyAutoJudged };
}
