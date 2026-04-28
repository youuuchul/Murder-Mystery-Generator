import type { GamePackage, RoundScript, ScriptSegment } from "@/types/game";
import { isCulpritIdValid } from "@/lib/culprit";

export type MakerValidationLevel = "warning" | "error";

export interface MakerValidationIssue {
  id: string;
  step: number;
  level: MakerValidationLevel;
  message: string;
  anchor?: string;
}

export interface MakerValidationResult {
  issues: MakerValidationIssue[];
  stepIssues: Record<number, MakerValidationIssue[]>;
}

/**
 * 메이커 편집기의 현재 게임 데이터를 점검해 스텝별 검증 힌트를 생성한다.
 * 저장 자체를 막지는 않고, 사용자가 빠르게 누락 지점을 찾도록 돕는 용도다.
 */
export function validateMakerGame(game: GamePackage): MakerValidationResult {
  const issues: MakerValidationIssue[] = [];
  const playerCount = game.players.length;
  const expectedPlayerCount = game.settings.playerCount;
  const normalizedRounds = ensureRoundScripts(game.rules.roundCount, game.scripts.rounds);

  if (isBlank(game.title)) {
    addIssue(issues, 1, "error", "시나리오 제목을 입력하세요.", {
      id: "settings.title",
      anchor: "step-1-title",
    });
  }

  if (game.settings.tags.length === 0) {
    addIssue(issues, 1, "warning", "태그가 아직 없습니다.", {
      id: "settings.tags",
      anchor: "step-1-tags",
    });
  }

  if (isBlank(game.settings.summary)) {
    addIssue(issues, 1, "error", "라이브러리용 소개글이 아직 없습니다.", {
      id: "settings.summary",
      anchor: "step-1-summary",
    });
  }

  if (isBlank(game.story.victim.name)) {
    addIssue(issues, 2, "error", "피해자 이름이 비어 있습니다.", {
      id: "story.victim.name",
      anchor: "step-2-victim",
    });
  }

  if (game.story.timeline.enabled && game.story.timeline.slots.length === 0) {
    addIssue(issues, 3, "error", "타임라인을 사용하려면 시간대 슬롯을 1개 이상 추가하세요.", {
      id: "timeline.slots.empty",
      anchor: "step-3-timeline",
    });
  }

  const blankTimelineSlots = game.story.timeline.slots.filter((slot) => isBlank(slot.label)).length;
  if (blankTimelineSlots > 0) {
    addIssue(issues, 3, "warning", `이름이 비어 있는 타임라인 슬롯이 ${blankTimelineSlots}개 있습니다.`, {
      id: "timeline.slots.nameless",
      anchor: "step-3-timeline",
    });
  }

  const namelessNpcs = game.story.npcs.filter((npc) => isBlank(npc.name)).length;
  if (namelessNpcs > 0) {
    addIssue(issues, 2, "warning", `이름이 비어 있는 NPC가 ${namelessNpcs}명 있습니다.`, {
      id: "story.npcs.nameless",
      anchor: "step-2-npcs",
    });
  }

  if (playerCount === 0) {
    addIssue(issues, 3, "error", `플레이어 ${expectedPlayerCount}명을 등록해야 합니다.`, {
      id: "players.empty",
      anchor: "step-3-players",
    });
  } else {
    const namelessPlayers = countPlayersBy(game.players, (player) => isBlank(player.name));
    const backgroundlessPlayers = countPlayersBy(game.players, (player) => isBlank(player.background));
    const storylessPlayers = countPlayersBy(game.players, (player) => isBlank(player.story));
    const secretlessPlayers = countPlayersBy(game.players, (player) => isBlank(player.secret));
    // 타임라인 사용 중일 때, 어떤 슬롯에도 "행동 입력"이나 "의도적 비활성" 둘 다 없는 캐릭터만 누락으로 본다.
    // 비활성으로 명시한 캐릭터는 제작자가 N/A 결정을 내린 상태이므로 경고에서 제외한다.
    const timelineMissingPlayers = game.story.timeline.enabled
      ? countPlayersBy(
          game.players,
          (player) => !player.timelineEntries?.some((entry) =>
            !isBlank(entry.action) || entry.inactive === true
          )
        )
      : 0;

    if (playerCount !== expectedPlayerCount) {
      addIssue(
        issues,
        3,
        "error",
        `현재 ${playerCount}명만 등록되어 있습니다. 설정 플레이어 수 ${expectedPlayerCount}명에 맞춰 조정하세요.`,
        {
          id: "players.count-mismatch",
          anchor: "step-1-player-count",
        }
      );
    }

    if (namelessPlayers > 0) {
      addIssue(issues, 3, "error", `이름이 비어 있는 캐릭터가 ${namelessPlayers}명 있습니다.`, {
        id: "players.nameless",
        anchor: "step-3-players",
      });
    }

    if (!isCulpritIdValid(game.story.culpritPlayerId, game.players, game.story)) {
      addIssue(issues, 3, "error", "범인을 지정하세요. 플레이어·NPC·피해자 중에서 선택할 수 있습니다.", {
        id: "story.culprit",
        anchor: "step-3-culprit",
      });
    }

    if (backgroundlessPlayers > 0) {
      addIssue(issues, 3, "warning", `공개 배경이 비어 있는 캐릭터가 ${backgroundlessPlayers}명 있습니다.`, {
        id: "players.background.empty",
        anchor: "step-3-players",
      });
    }

    if (storylessPlayers > 0) {
      addIssue(issues, 3, "warning", `상세 스토리가 비어 있는 캐릭터가 ${storylessPlayers}명 있습니다.`, {
        id: "players.story.empty",
        anchor: "step-3-players",
      });
    }

    if (secretlessPlayers > 0) {
      addIssue(issues, 3, "warning", `비밀 정보가 비어 있는 캐릭터가 ${secretlessPlayers}명 있습니다.`, {
        id: "players.secret.empty",
        anchor: "step-3-players",
      });
    }

    if (timelineMissingPlayers > 0) {
      addIssue(issues, 3, "warning", `행동 타임라인이 비어 있는 캐릭터가 ${timelineMissingPlayers}명 있습니다.`, {
        id: "players.timeline.empty",
        anchor: "step-3-timeline",
      });
    }
  }

  if (game.locations.length === 0) {
    addIssue(issues, 4, "error", "장소를 1개 이상 추가하세요.", {
      id: "locations.empty",
      anchor: "step-4-locations",
    });
  }

  if (game.clues.length === 0) {
    addIssue(issues, 4, "error", "단서를 1개 이상 추가하세요.", {
      id: "clues.empty",
      anchor: "step-4-clues",
    });
  }

  const namelessLocations = game.locations.filter((location) => isBlank(location.name)).length;
  const emptyLocations = game.locations.filter((location) => !game.clues.some((clue) => clue.locationId === location.id)).length;
  const untitledClues = game.clues.filter((clue) => isBlank(clue.title)).length;
  const descriptionlessClues = game.clues.filter((clue) => isBlank(clue.description)).length;

  if (namelessLocations > 0) {
    addIssue(issues, 4, "error", `이름이 비어 있는 장소가 ${namelessLocations}개 있습니다.`, {
      id: "locations.nameless",
      anchor: "step-4-locations",
    });
  }

  if (untitledClues > 0) {
    addIssue(issues, 4, "error", `제목이 비어 있는 단서가 ${untitledClues}개 있습니다.`, {
      id: "clues.untitled",
      anchor: "step-4-clues",
    });
  }

  if (descriptionlessClues > 0) {
    addIssue(issues, 4, "warning", `설명이 비어 있는 단서가 ${descriptionlessClues}개 있습니다.`, {
      id: "clues.description.empty",
      anchor: "step-4-clues",
    });
  }

  if (emptyLocations > 0) {
    addIssue(issues, 4, "warning", `배치된 단서가 없는 장소가 ${emptyLocations}개 있습니다.`, {
      id: "locations.clues.empty",
      anchor: "step-4-locations",
    });
  }

  if (isBlank(game.scripts.opening.narration)) {
    addIssue(issues, 2, "error", "오프닝 스토리 텍스트가 비어 있습니다.", {
      id: "scripts.opening.narration",
      anchor: "step-2-opening",
    });
  }

  const voteQuestions = game.voteQuestions ?? [];
  const customVoteQuestionsWithoutChoices = voteQuestions.filter((question) =>
    question.targetMode === "custom-choices"
    && question.choices.filter((choice) => !isBlank(choice.label)).length === 0
  ).length;
  if (customVoteQuestionsWithoutChoices > 0) {
    addIssue(issues, 6, "error", `커스텀 투표 선택지가 비어 있는 질문이 ${customVoteQuestionsWithoutChoices}개 있습니다.`, {
      id: "vote.custom-choices.empty",
      anchor: "step-6-vote",
    });
  }

  const customVoteQuestionsWithBlankChoices = voteQuestions.filter((question) =>
    question.targetMode === "custom-choices"
    && question.choices.some((choice) => isBlank(choice.label))
  ).length;
  if (customVoteQuestionsWithBlankChoices > 0) {
    addIssue(issues, 6, "warning", `이름이 비어 있는 커스텀 투표 선택지가 ${customVoteQuestionsWithBlankChoices}개 질문에 포함되어 있습니다.`, {
      id: "vote.custom-choices.blank-label",
      anchor: "step-6-vote",
    });
  }

  const round2Questions = voteQuestions.filter((question) => question.voteRound === 2);
  if (game.advancedVotingEnabled && round2Questions.length === 0) {
    addIssue(issues, 6, "warning", "2차 투표가 켜져 있지만 질문이 없습니다.", {
      id: "vote.round2.empty",
      anchor: "step-6-vote",
    });
  }

  const missingRoundNarrations = normalizedRounds.filter((round) => isBlank(round.narration)).length;
  if (missingRoundNarrations > 0) {
    addIssue(issues, 5, "warning", `라운드 이벤트 텍스트가 비어 있는 구간이 ${missingRoundNarrations}개 있습니다.`, {
      id: "scripts.rounds.narration.empty",
      anchor: "step-5-rounds",
    });
  }

  if (game.ending.branches.length === 0) {
    addIssue(issues, 6, "error", "엔딩 분기를 1개 이상 추가하세요.", {
      id: "ending.branches.empty",
      anchor: "step-6-branches",
    });
  }

  const hasCulpritCapturedBranch = game.ending.branches.some((branch) => branch.triggerType === "culprit-captured");
  if (!hasCulpritCapturedBranch) {
    addIssue(issues, 6, "warning", "범인 검거 분기가 아직 없습니다.", {
      id: "ending.branch.culprit-captured.missing",
      anchor: "step-6-branches",
    });
  }

  const hasCulpritEscaped = game.ending.branches.some((branch) => branch.triggerType === "culprit-escaped");
  if (!hasCulpritEscaped) {
    addIssue(issues, 6, "warning", "미검거 분기가 아직 없습니다.", {
      id: "ending.branch.culprit-escaped.missing",
      anchor: "step-6-branches",
    });
  }

  game.ending.branches.forEach((branch, index) => {
    if (!branch.personalEndingsEnabled) {
      return;
    }

    const hasBranchPersonalEnding = (branch.personalEndings ?? []).some((ending) => !isBlank(ending.text));
    if (!hasBranchPersonalEnding) {
      addIssue(
        issues,
        6,
        "warning",
        `${branch.label || `분기 ${index + 1}`}에 개인 엔딩이 켜져 있지만 입력된 텍스트가 없습니다.`,
        {
          id: `ending.branch.${branch.id}.personal-ending.empty`,
          anchor: "step-6-branches",
        }
      );
    }
  });

  if (game.ending.authorNotesEnabled && game.ending.authorNotes.length === 0) {
    addIssue(issues, 6, "warning", "작가 추가 설명 기능이 켜져 있지만 입력된 항목이 없습니다.", {
      id: "ending.author-notes.empty",
      anchor: "step-6-author-notes",
    });
  }

  return {
    issues,
    stepIssues: buildStepIssueMap(issues),
  };
}

/**
 * 스텝에 연결된 이슈 목록 중 가장 높은 심각도를 반환한다.
 * `error`가 하나라도 있으면 `error`, 아니면 `warning`, 없으면 `null`이다.
 */
export function getHighestValidationLevel(
  issues: MakerValidationIssue[] | undefined
): MakerValidationLevel | null {
  if (!issues || issues.length === 0) {
    return null;
  }

  return issues.some((issue) => issue.level === "error") ? "error" : "warning";
}

/**
 * 스텝 번호 기준으로 검증 힌트를 묶어 `StepWizard` 같은 UI가 바로 읽을 수 있게 만든다.
 */
function buildStepIssueMap(issues: MakerValidationIssue[]): Record<number, MakerValidationIssue[]> {
  return issues.reduce<Record<number, MakerValidationIssue[]>>((acc, issue) => {
    const current = acc[issue.step] ?? [];
    acc[issue.step] = [...current, issue];
    return acc;
  }, {});
}

/**
 * 라운드 수와 스크립트 배열 길이가 어긋나도 검증이 가능하도록 라운드 스크립트를 정규화한다.
 */
function ensureRoundScripts(roundCount: number, rounds: RoundScript[]): RoundScript[] {
  const normalized: RoundScript[] = [];

  for (let round = 1; round <= roundCount; round += 1) {
    normalized.push(
      rounds.find((item) => item.round === round) ?? createEmptyRoundScript(round)
    );
  }

  return normalized;
}

/**
 * 비어 있는 문자열과 공백-only 문자열을 동일하게 처리한다.
 */
function isBlank(value: string | undefined | null): boolean {
  return !value?.trim();
}

/**
 * 조건에 맞는 캐릭터 수를 세는 간단한 헬퍼다.
 */
function countPlayersBy(
  players: GamePackage["players"],
  predicate: (player: GamePackage["players"][number]) => boolean
): number {
  return players.filter(predicate).length;
}

/**
 * 검증용 기본 라운드 스크립트를 만든다.
 */
function createEmptyRoundScript(round: number): RoundScript {
  return {
    round,
    narration: "",
    unlockedLocationIds: [],
    videoUrl: undefined,
    backgroundMusic: undefined,
  };
}

/**
 * 공통 세그먼트의 빈 값을 정규화할 때 사용하는 기본 템플릿이다.
 * 현재는 타입 문서화 목적이 커서 유지한다.
 */
export function createEmptyScriptSegment(): ScriptSegment {
  return {
    narration: "",
    videoUrl: undefined,
    backgroundMusic: undefined,
  };
}

/**
 * 스텝별 검증 배열에 새 메시지를 추가한다.
 */
function addIssue(
  issues: MakerValidationIssue[],
  step: number,
  level: MakerValidationLevel,
  message: string,
  options: {
    id?: string;
    anchor?: string;
  } = {}
): void {
  issues.push({
    id: options.id ?? `${step}:${message}`,
    step,
    level,
    message,
    anchor: options.anchor,
  });
}
