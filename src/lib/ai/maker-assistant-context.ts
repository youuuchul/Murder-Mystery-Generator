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
  currentStep: number
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

  context.locations = normalizedGame.locations.map((location) => ({
    id: location.id,
    name: location.name,
    description: location.description,
    ownerPlayerId: location.ownerPlayerId ?? "",
    unlocksAtRound: location.unlocksAtRound,
    clueIds: location.clueIds,
  }));

  context.clues = normalizedGame.clues.map((clue) => ({
    id: clue.id,
    title: clue.title,
    description: clue.description,
    type: clue.type,
    locationId: clue.locationId,
    locationName:
      normalizedGame.locations.find((location) => location.id === clue.locationId)?.name ?? "",
  }));

  return context;
}

/** 다음 작업 추천용 밀도를 계산해 우선 보완해야 할 빈 영역을 숫자로 보여준다. */
function buildCompletionSummary(game: GamePackage): MakerAssistantContext["completion"] {
  return {
    playersWithoutBackground: game.players.filter((player) => !player.background.trim()).length,
    playersWithoutStory: game.players.filter((player) => !player.story.trim()).length,
    playersWithoutSecret: game.players.filter((player) => !player.secret.trim()).length,
    playersWithoutTimeline: game.story.timeline.enabled
      ? game.players.filter((player) => !player.timelineEntries.some((entry) => entry.action.trim())).length
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
): Array<{ slotId: string; slotLabel: string; action: string }> {
  return entries.map((entry) => ({
    slotId: entry.slotId,
    slotLabel: slotMap.get(entry.slotId) ?? "",
    action: entry.action,
  }));
}
