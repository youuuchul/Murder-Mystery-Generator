import { normalizeGame } from "@/lib/game-normalizer";
import { validateMakerGame } from "@/lib/maker-validation";
import type { GamePackage, PlayerTimelineEntry, TimelineSlot } from "@/types/game";
import type { MakerAssistantTask } from "@/types/assistant";

const STEP_LABELS: Record<number, string> = {
  1: "기본 설정",
  2: "사건 개요 / 오프닝",
  3: "플레이어",
  4: "장소/단서",
  5: "스크립트",
  6: "엔딩",
};

export interface MakerAssistantContext {
  task: MakerAssistantTask;
  currentStep: {
    number: number;
    label: string;
  };
  gameSummary: {
    title: string;
    playerCount: number;
    expectedPlayerCount: number;
    locationCount: number;
    clueCount: number;
    timelineEnabled: boolean;
    timelineSlotCount: number;
  };
  validationSummary: {
    issueCount: number;
    issues: {
      step: number;
      level: "warning" | "error";
      message: string;
    }[];
  };
  completion: {
    playersWithoutBackground: number;
    playersWithoutStory: number;
    playersWithoutSecret: number;
    playersWithoutTimeline: number;
    blankTimelineSlots: number;
    locationsWithoutClues: number;
    cluesWithoutDescription: number;
    roundsWithoutEventText: number;
    namelessNpcs: number;
    endingBranchCount: number;
  };
  story: Record<string, unknown>;
  players?: Record<string, unknown>[];
  locations?: Record<string, unknown>[];
  clues?: Record<string, unknown>[];
}

/**
 * 메이커 편집기의 현재 게임 상태를 task 목적에 맞게 축약한다.
 * 전체 `GamePackage`를 그대로 보내지 않고, 모델이 필요한 필드만 정리한다.
 */
export function buildMakerAssistantContext(
  game: GamePackage,
  task: MakerAssistantTask,
  currentStep: number,
  message?: string
): MakerAssistantContext {
  const normalizedGame = normalizeGame(game);
  const validation = validateMakerGame(normalizedGame);
  const slotMap = new Map(
    normalizedGame.story.timeline.slots.map((slot) => [slot.id, slot.label])
  );

  const context: MakerAssistantContext = {
    task,
    currentStep: {
      number: currentStep,
      label: STEP_LABELS[currentStep] ?? `Step ${currentStep}`,
    },
    gameSummary: {
      title: normalizedGame.title,
      playerCount: normalizedGame.players.length,
      expectedPlayerCount: normalizedGame.settings.playerCount,
      locationCount: normalizedGame.locations.length,
      clueCount: normalizedGame.clues.length,
      timelineEnabled: normalizedGame.story.timeline.enabled,
      timelineSlotCount: normalizedGame.story.timeline.slots.length,
    },
    validationSummary: {
      issueCount: validation.issues.length,
      issues: validation.issues.map((issue) => ({
        step: issue.step,
        level: issue.level,
        message: issue.message,
      })),
    },
    completion: buildCompletionSummary(normalizedGame),
    story: {
      victim: normalizedGame.story.victim,
      npcs: normalizedGame.story.npcs,
      incident: normalizedGame.story.incident,
      culpritPlayerId: normalizedGame.story.culpritPlayerId,
      culpritPlayerName:
        normalizedGame.players.find((player) => player.id === normalizedGame.story.culpritPlayerId)?.name
        ?? "",
      motive: normalizedGame.story.motive,
      method: normalizedGame.story.method,
      endingBranches: normalizedGame.ending.branches.map((branch) => ({
        id: branch.id,
        label: branch.label,
        triggerType: branch.triggerType,
        targetPlayerId: branch.targetPlayerId ?? "",
      })),
      timelineSlots: normalizedGame.story.timeline.slots.map((slot) => ({
        id: slot.id,
        label: slot.label,
      })),
      synopsis: normalizedGame.story.synopsis,
    },
  };

  if (task === "suggest_next_steps") {
    return context;
  }

  // Step별 컨텍스트 최적화: 불필요한 데이터를 줄여 토큰 사용을 절감한다.
  // 채팅 메시지가 타임라인/인물 행동 관련이면 story/secret/timeline이 포함된 full players가 필요하다.
  const mentionsTimelineIntent = typeof message === "string"
    && /(타임라인|시간대|시각표|시간표|행동\s*(?:순서|흐름))/iu.test(message);
  const needsFullPlayers = currentStep === 3
    || task === "validate_consistency"
    || task === "suggest_clues"
    || mentionsTimelineIntent;
  const needsLocations = currentStep === 4 || task === "validate_consistency" || task === "suggest_clues";
  const needsClues = currentStep === 4 || task === "validate_consistency" || task === "suggest_clues";

  if (needsFullPlayers) {
    context.players = normalizedGame.players.map((player) => ({
      id: player.id,
      name: player.name,
      background: player.background,
      story: player.story,
      secret: player.secret,
      victoryCondition: player.victoryCondition,
      personalGoal: player.personalGoal ?? "",
      timeline: mapTimelineEntries(player.timelineEntries, slotMap),
      relatedClues: player.relatedClues,
    }));
  } else if (currentStep !== 1) {
    // Step 1은 players 불필요. 나머지는 이름+ID만 제공 (참조용).
    context.players = normalizedGame.players.map((player) => ({
      id: player.id,
      name: player.name,
      victoryCondition: player.victoryCondition,
    }));
  }

  if (needsLocations) {
    context.locations = normalizedGame.locations.map((location) => ({
      id: location.id,
      name: location.name,
      description: location.description,
      ownerPlayerId: location.ownerPlayerId ?? "",
      unlocksAtRound: location.unlocksAtRound,
      clueIds: location.clueIds,
    }));
  }

  if (needsClues) {
    context.clues = normalizedGame.clues.map((clue) => ({
      id: clue.id,
      title: clue.title,
      description: clue.description,
      type: clue.type,
      // AI가 게임플레이 동작을 이해하도록 동작 기반 라벨을 함께 전달.
      // owned: 획득 시 인벤토리 진입, 카드 건네주기 가능
      // shared: 첫 발견자만 조사회수 1회 차감, 이후 모두에게 공개 (인벤토리 미진입)
      typeLabel: clue.type === "shared"
        ? "공용 단서 — 첫 발견자만 조사회수 1회 차감, 발견 후 전원 공개. 인벤토리 미진입."
        : "획득 단서 — 획득자 인벤토리에 들어감, 카드 건네주기 가능.",
      locationId: clue.locationId,
      locationName:
        normalizedGame.locations.find((location) => location.id === clue.locationId)?.name ?? "",
    }));
  }

  return context;
}

/** 다음 작업 추천용 밀도를 계산해 우선 보완해야 할 빈 영역을 숫자로 보여준다. */
function buildCompletionSummary(game: GamePackage): MakerAssistantContext["completion"] {
  return {
    playersWithoutBackground: game.players.filter((player) => !player.background.trim()).length,
    playersWithoutStory: game.players.filter((player) => !player.story.trim()).length,
    playersWithoutSecret: game.players.filter((player) => !player.secret.trim()).length,
    playersWithoutTimeline: game.story.timeline.enabled
      ? game.players.filter((player) =>
          !player.timelineEntries.some((entry) => entry.action.trim() || entry.inactive === true)
        ).length
      : 0,
    blankTimelineSlots: game.story.timeline.slots.filter((slot) => !slot.label.trim()).length,
    locationsWithoutClues: game.locations.filter((location) => location.clueIds.length === 0).length,
    cluesWithoutDescription: game.clues.filter((clue) => !clue.description.trim()).length,
    roundsWithoutEventText: game.scripts.rounds.filter((round) => !round.narration.trim()).length,
    namelessNpcs: game.story.npcs.filter((npc) => !npc.name.trim()).length,
    endingBranchCount: game.ending.branches.length,
  };
}

/** 슬롯 ID 기준으로 저장된 행동 타임라인을 사람이 읽기 쉬운 형태로 변환한다. */
function mapTimelineEntries(
  entries: PlayerTimelineEntry[],
  slotMap: Map<string, string>
): Array<{ slotId: string; slotLabel: string; action: string; inactive: boolean; status: "filled" | "inactive" | "empty" }> {
  return entries.map((entry) => {
    const inactive = entry.inactive === true;
    const hasAction = entry.action.trim().length > 0;
    return {
      slotId: entry.slotId,
      slotLabel: slotMap.get(entry.slotId) ?? "",
      action: entry.action,
      inactive,
      // 모델이 "미입력"과 "의도적 N/A"를 혼동하지 않도록 명시적 상태 문자열을 함께 넘긴다.
      status: inactive ? "inactive" : hasAction ? "filled" : "empty",
    };
  });
}
