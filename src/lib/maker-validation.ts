import type { GamePackage, RoundScript, ScriptSegment } from "@/types/game";

export type MakerValidationLevel = "warning" | "error";

export interface MakerValidationIssue {
  step: number;
  level: MakerValidationLevel;
  message: string;
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
    addIssue(issues, 1, "error", "시나리오 제목을 입력하세요.");
  }

  if (playerCount > 0 && playerCount !== expectedPlayerCount) {
    addIssue(
      issues,
      1,
      "error",
      `설정 플레이어 수 ${expectedPlayerCount}명과 등록 캐릭터 ${playerCount}명이 일치하지 않습니다.`
    );
  }

  if (game.settings.tags.length === 0) {
    addIssue(issues, 1, "warning", "태그가 아직 없습니다.");
  }

  if (isBlank(game.story.victim.name)) {
    addIssue(issues, 2, "error", "피해자 이름이 비어 있습니다.");
  }

  if (isBlank(game.story.incident)) {
    addIssue(issues, 2, "error", "플레이어 공개 사건 설명을 작성하세요.");
  }

  if (isBlank(game.story.location)) {
    addIssue(issues, 2, "error", "배경 장소를 입력하세요.");
  }

  if (game.story.timeline.enabled && game.story.timeline.slots.length === 0) {
    addIssue(issues, 2, "error", "타임라인을 사용하려면 시간대 슬롯을 1개 이상 추가하세요.");
  }

  const blankTimelineSlots = game.story.timeline.slots.filter((slot) => isBlank(slot.label)).length;
  if (blankTimelineSlots > 0) {
    addIssue(issues, 2, "warning", `이름이 비어 있는 타임라인 슬롯이 ${blankTimelineSlots}개 있습니다.`);
  }

  if (playerCount === 0) {
    addIssue(issues, 2, "warning", "플레이어를 추가해야 범인을 지정할 수 있습니다.");
  } else if (isBlank(game.story.culpritPlayerId)) {
    addIssue(issues, 2, "error", "범인을 지정하세요.");
  }

  if (playerCount === 0) {
    addIssue(issues, 3, "error", `플레이어 ${expectedPlayerCount}명을 등록해야 합니다.`);
  } else {
    const namelessPlayers = countPlayersBy(game.players, (player) => isBlank(player.name));
    const backgroundlessPlayers = countPlayersBy(game.players, (player) => isBlank(player.background));
    const storylessPlayers = countPlayersBy(game.players, (player) => isBlank(player.story));
    const secretlessPlayers = countPlayersBy(game.players, (player) => isBlank(player.secret));
    const timelineMissingPlayers = game.story.timeline.enabled
      ? countPlayersBy(
          game.players,
          (player) => !player.timelineEntries?.some((entry) => !isBlank(entry.action))
        )
      : 0;

    if (playerCount !== expectedPlayerCount) {
      addIssue(
        issues,
        3,
        "error",
        `현재 ${playerCount}명만 등록되어 있습니다. 설정 플레이어 수 ${expectedPlayerCount}명에 맞춰 조정하세요.`
      );
    }

    if (namelessPlayers > 0) {
      addIssue(issues, 3, "error", `이름이 비어 있는 캐릭터가 ${namelessPlayers}명 있습니다.`);
    }

    if (backgroundlessPlayers > 0) {
      addIssue(issues, 3, "warning", `공개 배경이 비어 있는 캐릭터가 ${backgroundlessPlayers}명 있습니다.`);
    }

    if (storylessPlayers > 0) {
      addIssue(issues, 3, "warning", `상세 스토리가 비어 있는 캐릭터가 ${storylessPlayers}명 있습니다.`);
    }

    if (secretlessPlayers > 0) {
      addIssue(issues, 3, "warning", `비밀 / 반전 정보가 비어 있는 캐릭터가 ${secretlessPlayers}명 있습니다.`);
    }

    if (timelineMissingPlayers > 0) {
      addIssue(issues, 3, "warning", `행동 타임라인이 비어 있는 캐릭터가 ${timelineMissingPlayers}명 있습니다.`);
    }
  }

  if (game.locations.length === 0) {
    addIssue(issues, 4, "error", "장소를 1개 이상 추가하세요.");
  }

  if (game.clues.length === 0) {
    addIssue(issues, 4, "error", "단서를 1개 이상 추가하세요.");
  }

  const namelessLocations = game.locations.filter((location) => isBlank(location.name)).length;
  const emptyLocations = game.locations.filter((location) => !game.clues.some((clue) => clue.locationId === location.id)).length;
  const untitledClues = game.clues.filter((clue) => isBlank(clue.title)).length;
  const descriptionlessClues = game.clues.filter((clue) => isBlank(clue.description)).length;

  if (namelessLocations > 0) {
    addIssue(issues, 4, "error", `이름이 비어 있는 장소가 ${namelessLocations}개 있습니다.`);
  }

  if (untitledClues > 0) {
    addIssue(issues, 4, "error", `제목이 비어 있는 단서가 ${untitledClues}개 있습니다.`);
  }

  if (descriptionlessClues > 0) {
    addIssue(issues, 4, "warning", `설명이 비어 있는 단서가 ${descriptionlessClues}개 있습니다.`);
  }

  if (emptyLocations > 0) {
    addIssue(issues, 4, "warning", `배치된 단서가 없는 장소가 ${emptyLocations}개 있습니다.`);
  }

  if (isBlank(game.scripts.opening.narration)) {
    addIssue(issues, 5, "error", "오프닝 나레이션이 비어 있습니다.");
  }

  if (isBlank(game.scripts.vote.narration)) {
    addIssue(issues, 5, "error", "투표 안내 나레이션이 비어 있습니다.");
  }

  if (isBlank(game.scripts.ending.narration)) {
    addIssue(issues, 5, "warning", "공통 엔딩 나레이션이 비어 있습니다.");
  }

  if (isBlank(game.scripts.lobby.narration)) {
    addIssue(issues, 5, "warning", "대기실 나레이션이 비어 있습니다.");
  }

  const missingRoundNarrations = normalizedRounds.filter((round) => isBlank(round.narration)).length;
  if (missingRoundNarrations > 0) {
    addIssue(issues, 5, "warning", `라운드 나레이션이 비어 있는 구간이 ${missingRoundNarrations}개 있습니다.`);
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
    gmNote: undefined,
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
    gmNote: undefined,
  };
}

/**
 * 스텝별 검증 배열에 새 메시지를 추가한다.
 */
function addIssue(
  issues: MakerValidationIssue[],
  step: number,
  level: MakerValidationLevel,
  message: string
): void {
  issues.push({ step, level, message });
}
