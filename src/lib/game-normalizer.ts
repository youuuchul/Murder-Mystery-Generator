import type {
  AuthorNote,
  Clue,
  ClueCard,
  ClueCondition,
  CoverImagePosition,
  EndingBranch,
  EndingConfig,
  GameMetadata,
  GamePackage,
  GameRules,
  GameSettings,
  Location,
  Player,
  PlayerTimelineEntry,
  Relationship,
  RoundScript,
  ScriptSegment,
  StoryNpc,
  PersonalEnding,
  Story,
  StoryTimeline,
  TimelineEvent,
  TimelineSlot,
} from "@/types/game";
import { buildDefaultPhases, normalizePrivateChatConfig } from "@/lib/game-rules";
import { getGamePublishReadiness } from "@/lib/game-publish";

const LEGACY_TAG_MAP: Record<string, string> = {
  "gothic-mansion": "고딕 저택",
  "city-noir": "도시 누아르",
  fantasy: "판타지",
  historical: "역사",
  scifi: "SF",
  serious: "진지",
  comedy: "코믹",
  horror: "공포",
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asOptionalString(value: unknown): string | undefined {
  const normalized = asTrimmedString(value);
  return normalized || undefined;
}

function normalizeGameVisibility(value: unknown): GamePackage["access"]["visibility"] {
  return value === "private"
    || value === "unlisted"
    || value === "public"
    ? value
    : "private";
}

/** 구형 게임 데이터에도 접근 메타 기본값을 채운다. */
function normalizeGameAccess(access: GamePackage["access"] | undefined): GamePackage["access"] {
  return {
    ownerId: asTrimmedString(access?.ownerId),
    visibility: normalizeGameVisibility(access?.visibility),
    publishedAt: asOptionalString(access?.publishedAt),
  };
}

function normalizeVictoryCondition(value: unknown): Player["victoryCondition"] {
  return value === "avoid-arrest"
    || value === "uncertain"
    || value === "arrest-culprit"
    || value === "personal-goal"
    ? value
    : "arrest-culprit";
}

function normalizeEndingTriggerType(value: unknown): EndingBranch["triggerType"] {
  // 하위호환: 구형 trigger_type → 신형으로 변환
  if (value === "wrong-arrest-fallback" || value === "specific-player-arrested") return "culprit-escaped";
  if (value === "custom-choice-selected") return "custom-choice-matched";

  return value === "culprit-captured"
    || value === "culprit-escaped"
    || value === "custom-choice-matched"
    || value === "custom-choice-fallback"
    || value === "vote-round-2-matched"
    || value === "vote-round-2-fallback"
    ? value
    : "culprit-escaped";
}

/**
 * 새 타임라인 슬롯 기본값을 만든다.
 * 라벨만 주어지면 고유 ID는 여기서 생성한다.
 */
function createTimelineSlot(label = ""): TimelineSlot {
  return {
    id: crypto.randomUUID(),
    label,
  };
}

/**
 * 타임라인 슬롯 1개를 현재 편집기 구조에 맞게 정규화한다.
 * 비어 있는 라벨은 유지하되, 저장 시 상위 단계에서 필터링할 수 있게 한다.
 */
function normalizeTimelineSlot(slot: TimelineSlot | undefined): TimelineSlot {
  return {
    id: asTrimmedString(slot?.id) || crypto.randomUUID(),
    label: asTrimmedString(slot?.label),
  };
}

/**
 * 예전 `TimelineEvent[]` 형식과 현재 `StoryTimeline` 형식을 모두 받아
 * 새 타임라인 설정 객체로 변환한다.
 */
function normalizeStoryTimeline(timeline: Story["timeline"] | TimelineEvent[] | undefined): StoryTimeline {
  if (Array.isArray(timeline)) {
    const legacySlots = timeline
      .map((event) => createTimelineSlot(asTrimmedString(event?.time) || asTrimmedString(event?.description)))
      .filter((slot) => Boolean(slot.label));

    return {
      enabled: legacySlots.length > 0,
      slots: legacySlots,
    };
  }

  const slots = Array.isArray(timeline?.slots)
    ? timeline.slots.map(normalizeTimelineSlot).filter((slot) => Boolean(slot.label))
    : [];

  return {
    enabled: timeline?.enabled ?? false,
    slots,
  };
}

/** 공개 NPC 1개를 현재 편집기 구조로 정리한다. */
function normalizeStoryNpc(npc: StoryNpc | undefined): StoryNpc {
  return {
    id: asTrimmedString(npc?.id) || crypto.randomUUID(),
    name: asTrimmedString(npc?.name),
    background: asTrimmedString(npc?.background),
    imageUrl: asOptionalString(npc?.imageUrl),
  };
}

/**
 * 플레이어 행동 타임라인을 현재 스토리 슬롯과 맞춰 정렬한다.
 * 슬롯이 추가/삭제돼도 플레이어 데이터가 바로 같은 순서를 따르도록 보정한다.
 */
function normalizePlayerTimelineEntries(
  entries: PlayerTimelineEntry[] | undefined,
  slots: TimelineSlot[]
): PlayerTimelineEntry[] {
  const source = Array.isArray(entries) ? entries : [];

  return slots.map((slot) => {
    const matched = source.find((entry) => asTrimmedString(entry?.slotId) === slot.id);
    return {
      slotId: slot.id,
      action: asTrimmedString(matched?.action),
    };
  });
}

/**
 * 구형 `playerId` 관계와 신규 `targetType/targetId` 관계를 함께 받아
 * 플레이어/피해자/NPC 공통 대상 구조로 맞춘다.
 */
function normalizeRelationship(relationship: Relationship | undefined): Relationship {
  const legacyPlayerId = asTrimmedString(relationship?.playerId);
  const targetType = relationship?.targetType === "victim"
    || relationship?.targetType === "npc"
    ? relationship.targetType
    : "player";
  const targetId = asTrimmedString(relationship?.targetId)
    || legacyPlayerId
    || (targetType === "victim" ? "victim" : "");

  return {
    targetType,
    targetId,
    description: asTrimmedString(relationship?.description),
    playerId: legacyPlayerId || undefined,
  };
}

/**
 * 단서/장소 잠금 조건을 현재 런타임에서 다루기 쉬운 형태로 정리한다.
 * 비어 있는 값은 제거하고, 필요한 ID 목록만 남긴다.
 */
function normalizeClueCondition(condition: ClueCondition | undefined): ClueCondition | undefined {
  if (!condition) {
    return undefined;
  }

  const type = condition.type === "character_has_item" ? "character_has_item" : "has_items";

  return {
    type,
    requiredClueIds: Array.isArray(condition.requiredClueIds)
      ? condition.requiredClueIds.map((id) => asTrimmedString(id)).filter(Boolean)
      : [],
    targetCharacterId: type === "character_has_item"
      ? asOptionalString(condition.targetCharacterId)
      : undefined,
    hint: asOptionalString(condition.hint),
  };
}

/** 엔딩 분기 1개를 현재 엔딩 에디터에서 바로 쓸 수 있는 형태로 정리한다. */
function normalizeEndingBranch(
  branch: EndingBranch | undefined,
  fallbackPersonalEndingsEnabled: boolean,
  fallbackPersonalEndings: PersonalEnding[]
): EndingBranch {
  const triggerType = normalizeEndingTriggerType(branch?.triggerType);
  const normalizedPersonalEndings = Array.isArray(branch?.personalEndings)
    ? branch.personalEndings.map(normalizePersonalEnding)
    : fallbackPersonalEndings.map((ending) => ({ ...ending }));
  const derivedPersonalEndingsEnabled = branch?.personalEndingsEnabled
    ?? (Array.isArray(branch?.personalEndings)
      ? branch.personalEndings.some((ending) => (
          Boolean(asTrimmedString(ending?.title)) || Boolean(asTrimmedString(ending?.text))
        ))
      : fallbackPersonalEndingsEnabled);

  const needsQuestion = triggerType === "custom-choice-matched"
    || triggerType === "vote-round-2-matched";
  const needsChoiceIds = triggerType === "custom-choice-matched"
    || triggerType === "vote-round-2-matched";

  // 단수 targetChoiceId → 배열로 마이그레이션
  const choiceIds = Array.isArray(branch?.targetChoiceIds) && branch.targetChoiceIds.length > 0
    ? branch.targetChoiceIds.filter(Boolean)
    : branch?.targetChoiceId
      ? [branch.targetChoiceId]
      : [];

  return {
    id: asTrimmedString(branch?.id) || crypto.randomUUID(),
    label: asTrimmedString(branch?.label),
    triggerType,
    targetPlayerId: asOptionalString(branch?.targetPlayerId),
    targetQuestionId: needsQuestion ? asOptionalString(branch?.targetQuestionId) : undefined,
    targetChoiceIds: needsChoiceIds ? choiceIds : undefined,
    storyText: asTrimmedString(branch?.storyText),
    personalEndingsEnabled: derivedPersonalEndingsEnabled,
    personalEndings: normalizedPersonalEndings,
    videoUrl: asOptionalString(branch?.videoUrl),
    backgroundMusic: asOptionalString(branch?.backgroundMusic),
  };
}

/**
 * Clue 유형을 현재 2종 체계(owned/shared)로 매핑한다.
 * legacy 값(physical/testimony → owned, scene → shared)을 투명하게 흡수한다.
 */
function normalizeClueType(value: unknown): Clue["type"] {
  if (value === "shared" || value === "scene") return "shared";
  if (value === "owned" || value === "physical" || value === "testimony") return "owned";
  return "owned";
}

/** 플레이어 개인 엔딩 1개를 정리한다. */
function normalizePersonalEnding(ending: PersonalEnding | undefined): PersonalEnding {
  return {
    playerId: asTrimmedString(ending?.playerId),
    title: asOptionalString(ending?.title),
    text: asTrimmedString(ending?.text),
  };
}

/** 작가 추가 설명 1개를 정리한다. */
function normalizeAuthorNote(note: AuthorNote | undefined): AuthorNote {
  return {
    id: asTrimmedString(note?.id) || crypto.randomUUID(),
    title: asTrimmedString(note?.title),
    content: asTrimmedString(note?.content),
  };
}

/**
 * 기존 `alibi` 중심 데이터와 신규 `story/timeline` 구조를 함께 받아
 * 현재 플레이어 편집기/플레이 화면에서 바로 쓸 수 있는 형태로 정규화한다.
 */
function normalizePlayer(player: Player | undefined, timelineSlots: TimelineSlot[]): Player {
  const legacyAlibi = asOptionalString(player?.alibi);

  return {
    id: asTrimmedString(player?.id) || crypto.randomUUID(),
    name: asTrimmedString(player?.name),
    victoryCondition: normalizeVictoryCondition(player?.victoryCondition),
    personalGoal: asOptionalString(player?.personalGoal),
    scoreConditions: Array.isArray(player?.scoreConditions)
      ? player.scoreConditions.map((condition) => {
          const rawType = condition?.type;
          const type: "manual" | "culprit-outcome" | "clue-ownership" | "vote-answer" =
            rawType === "culprit-outcome" || rawType === "clue-ownership" || rawType === "vote-answer"
              ? rawType
              : "manual";
          const config = condition?.config && typeof condition.config === "object"
            ? {
                expectedOutcome: condition.config.expectedOutcome === "arrested" || condition.config.expectedOutcome === "escaped"
                  ? condition.config.expectedOutcome
                  : undefined,
                clueId: asOptionalString(condition.config.clueId),
                expectedOwnership: condition.config.expectedOwnership === "has" || condition.config.expectedOwnership === "not-has"
                  ? condition.config.expectedOwnership
                  : undefined,
                questionId: asOptionalString(condition.config.questionId),
                expectedAnswerId: asOptionalString(condition.config.expectedAnswerId),
              }
            : undefined;
          return {
            description: asTrimmedString(condition?.description),
            points: Number.isFinite(condition?.points) ? Number(condition.points) : 0,
            type,
            config,
          };
        })
      : [],
    background: asTrimmedString(player?.background),
    story: asTrimmedString(player?.story) || legacyAlibi || "",
    secret: asTrimmedString(player?.secret),
    alibi: legacyAlibi,
    timelineEntries: normalizePlayerTimelineEntries(player?.timelineEntries, timelineSlots),
    relatedClues: Array.isArray(player?.relatedClues)
      ? player.relatedClues.map((related) => ({
          clueId: asTrimmedString(related?.clueId),
          note: asTrimmedString(related?.note),
        }))
      : [],
    relationships: Array.isArray(player?.relationships)
      ? player.relationships.map(normalizeRelationship)
      : [],
    cardImage: asOptionalString(player?.cardImage),
  };
}

/**
 * 장소 데이터의 공백 문자열과 잘못된 배열 값을 정리한다.
 * 단서 ID 목록은 이후 에디터/플레이 화면에서 그대로 참조한다.
 */
function normalizeLocation(location: Location | undefined): Location {
  return {
    id: asTrimmedString(location?.id) || crypto.randomUUID(),
    name: asTrimmedString(location?.name),
    description: asTrimmedString(location?.description),
    imageUrl: asOptionalString(location?.imageUrl),
    unlocksAtRound: Number.isInteger(location?.unlocksAtRound) ? Number(location?.unlocksAtRound) : null,
    clueIds: Array.isArray(location?.clueIds)
      ? location.clueIds.map((id) => asTrimmedString(id)).filter(Boolean)
      : [],
    ownerPlayerId: asOptionalString(location?.ownerPlayerId),
    accessCondition: normalizeClueCondition(location?.accessCondition),
    previewCluesEnabled: location?.previewCluesEnabled ?? false,
  };
}

/**
 * 단서 이미지를 포함해 단서 카드 원본 데이터를 정규화한다.
 * 오래된 저장본과 섞여도 플레이어 인벤토리에서 바로 쓸 수 있게 보정한다.
 */
function normalizeClue(clue: Clue | undefined): Clue {
  return {
    id: asTrimmedString(clue?.id) || crypto.randomUUID(),
    title: asTrimmedString(clue?.title),
    description: asTrimmedString(clue?.description),
    type: normalizeClueType(clue?.type),
    imageUrl: asOptionalString(clue?.imageUrl),
    locationId: asTrimmedString(clue?.locationId),
    pointsTo: asOptionalString(clue?.pointsTo),
    isSecret: clue?.isSecret === true,
    // owned/shared 모두 조건부 발견 허용 (기존 scene 전용 undefined 처리는 제거)
    condition: normalizeClueCondition(clue?.condition),
    previewTitle: asOptionalString(clue?.previewTitle),
    previewDescription: asOptionalString(clue?.previewDescription),
  };
}

/**
 * 카드셋의 단서 카드 캐시도 이미지 필드를 유지하도록 정리한다.
 * 현재 UI는 주로 `game.clues`를 쓰지만 저장 포맷 일관성을 위해 함께 보정한다.
 */
function normalizeClueCard(card: ClueCard | undefined): ClueCard {
  return {
    clueId: asTrimmedString(card?.clueId),
    title: asTrimmedString(card?.title),
    description: asTrimmedString(card?.description),
    type: normalizeClueType(card?.type),
    imageUrl: asOptionalString(card?.imageUrl),
  };
}

/**
 * 구형 `scripts.endingSuccess/endingFail`를 새 엔딩 분기 기본값으로 옮긴다.
 * 새 `ending.branches`가 비어 있는 경우에만 fallback으로 사용한다.
 */
function buildLegacyEndingBranches(scripts: GamePackage["scripts"] | undefined): EndingBranch[] {
  const branches: EndingBranch[] = [];

  if (asTrimmedString(scripts?.endingSuccess?.narration)) {
    branches.push({
      id: crypto.randomUUID(),
      label: "범인 검거",
      triggerType: "culprit-captured",
      storyText: asTrimmedString(scripts?.endingSuccess?.narration),
      videoUrl: asOptionalString(scripts?.endingSuccess?.videoUrl),
      backgroundMusic: asOptionalString(scripts?.endingSuccess?.backgroundMusic),
    });
  }

  if (asTrimmedString(scripts?.endingFail?.narration)) {
    branches.push({
      id: crypto.randomUUID(),
      label: "오검거 기본 분기",
      triggerType: "culprit-escaped",
      storyText: asTrimmedString(scripts?.endingFail?.narration),
      videoUrl: asOptionalString(scripts?.endingFail?.videoUrl),
      backgroundMusic: asOptionalString(scripts?.endingFail?.backgroundMusic),
    });
  }

  return branches;
}

/** 새 엔딩 설정과 구형 엔딩 스크립트를 함께 받아 현재 엔딩 구조로 정규화한다. */
function normalizeEndingConfig(
  incoming: GamePackage["ending"] | undefined,
  scripts: GamePackage["scripts"] | undefined
): EndingConfig {
  const legacyPersonalEndings = Array.isArray(incoming?.personalEndings)
    ? incoming.personalEndings.map(normalizePersonalEnding)
    : [];
  const fallbackPersonalEndingsEnabled = (incoming?.personalEndingsEnabled ?? false)
    && legacyPersonalEndings.some((ending) => Boolean(ending.title?.trim()) || Boolean(ending.text.trim()));
  const explicitBranches = Array.isArray(incoming?.branches)
    ? incoming.branches.map((branch) => (
        normalizeEndingBranch(branch, fallbackPersonalEndingsEnabled, legacyPersonalEndings)
      ))
    : [];
  const legacyBranches = buildLegacyEndingBranches(scripts);
  const branches = explicitBranches.length > 0
    ? explicitBranches
    : legacyBranches.map((branch) => (
        normalizeEndingBranch(branch, fallbackPersonalEndingsEnabled, legacyPersonalEndings)
      ));

  return {
    branches,
    personalEndingsEnabled: incoming?.personalEndingsEnabled ?? false,
    personalEndings: legacyPersonalEndings,
    authorNotesEnabled: incoming?.authorNotesEnabled ?? false,
    authorNotes: Array.isArray(incoming?.authorNotes)
      ? incoming.authorNotes.map(normalizeAuthorNote)
      : [],
  };
}

function normalizeTags(settings: Partial<GameSettings> & { theme?: string; tone?: string }): string[] {
  const source = Array.isArray(settings.tags) ? settings.tags : [];
  const normalized = source
    .map((tag) => asTrimmedString(tag))
    .filter(Boolean);

  if (normalized.length === 0) {
    const legacyTheme = asTrimmedString(settings.theme);
    const legacyTone = asTrimmedString(settings.tone);

    if (legacyTheme) normalized.push(LEGACY_TAG_MAP[legacyTheme] ?? legacyTheme);
    if (legacyTone) normalized.push(LEGACY_TAG_MAP[legacyTone] ?? legacyTone);
  }

  return Array.from(new Set(normalized));
}

function clampCoverAxis(value: unknown): number {
  if (typeof value !== "number" || Number.isFinite(value) === false) {
    return 50;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeCoverImagePosition(value: unknown): CoverImagePosition | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const source = value as Partial<CoverImagePosition>;
  return {
    x: clampCoverAxis(source.x),
    y: clampCoverAxis(source.y),
  };
}

/** 기존/신규 게임 데이터 모두를 현재 편집기 구조에 맞춰 정규화한다. */
export function normalizeGame(game: GamePackage): GamePackage {
  const settings: GameSettings = {
    playerCount: game.settings?.playerCount ?? 5,
    difficulty: game.settings?.difficulty ?? "normal",
    estimatedDuration: game.settings?.estimatedDuration ?? 120,
    tags: normalizeTags(game.settings ?? {}),
    summary: asOptionalString(game.settings?.summary),
    coverImageUrl: asOptionalString(game.settings?.coverImageUrl),
    coverImagePosition: normalizeCoverImagePosition(game.settings?.coverImagePosition),
  };

  const fallbackPhases = buildDefaultPhases(settings.playerCount);
  const rules: GameRules = {
    roundCount: game.rules?.roundCount ?? 4,
    openingDurationMinutes: game.rules?.openingDurationMinutes ?? 5,
    phases: fallbackPhases.map((phase) => {
      const saved = game.rules?.phases?.find((item) => item.type === phase.type);
      return {
        ...phase,
        durationMinutes: Number.isFinite(saved?.durationMinutes)
          ? Number(saved?.durationMinutes)
          : phase.durationMinutes,
      };
    }),
    privateChat: normalizePrivateChatConfig(settings.playerCount, game.rules?.privateChat),
    cardTrading: {
      enabled: game.rules?.cardTrading?.enabled ?? true,
    },
    cluesPerRound: game.rules?.cluesPerRound ?? 2,
    allowLocationRevisit: game.rules?.allowLocationRevisit ?? false,
  };

  function normalizeSegment(segment: ScriptSegment | undefined): ScriptSegment {
    return {
      narration: asTrimmedString(segment?.narration),
      videoUrl: asOptionalString(segment?.videoUrl),
      backgroundMusic: asOptionalString(segment?.backgroundMusic),
    };
  }

  function normalizeRound(round: RoundScript): RoundScript {
    return {
      round: round.round,
      narration: asTrimmedString(round.narration),
      unlockedLocationIds: [],
      imageUrl: asOptionalString(round.imageUrl),
      videoUrl: asOptionalString(round.videoUrl),
      backgroundMusic: asOptionalString(round.backgroundMusic),
    };
  }

  const scripts = {
    lobby: normalizeSegment(game.scripts?.lobby),
    opening: normalizeSegment(game.scripts?.opening),
    rounds: Array.isArray(game.scripts?.rounds)
      ? [...game.scripts.rounds].map(normalizeRound).sort((a, b) => a.round - b.round)
      : [],
    vote: normalizeSegment(game.scripts?.vote),
    ending: normalizeSegment(game.scripts?.ending),
    endingSuccess: game.scripts?.endingSuccess
      ? normalizeSegment(game.scripts.endingSuccess)
      : undefined,
    endingFail: game.scripts?.endingFail
      ? normalizeSegment(game.scripts.endingFail)
      : undefined,
  };

  const timeline = normalizeStoryTimeline(game.story?.timeline);

  const story: Story = {
    synopsis: asTrimmedString(game.story?.synopsis),
    victim: {
      name: asTrimmedString(game.story?.victim?.name),
      background: asTrimmedString(game.story?.victim?.background),
      imageUrl: asOptionalString(game.story?.victim?.imageUrl),
      deathCircumstances: asOptionalString(game.story?.victim?.deathCircumstances),
    },
    npcs: Array.isArray(game.story?.npcs)
      ? game.story.npcs.map(normalizeStoryNpc)
      : [],
    incident: asTrimmedString(game.story?.incident),
    location: asOptionalString(game.story?.location),
    gmOverview: asOptionalString(game.story?.gmOverview) ?? asOptionalString(game.story?.synopsis),
    mapImageUrl: asOptionalString(game.story?.mapImageUrl),
    timeline,
    culpritPlayerId: asTrimmedString(game.story?.culpritPlayerId),
    motive: asTrimmedString(game.story?.motive),
    method: asTrimmedString(game.story?.method),
  };

  return {
    ...game,
    access: normalizeGameAccess(game.access),
    settings,
    rules,
    story,
    players: Array.isArray(game.players)
      ? game.players.map((player) => normalizePlayer(player, story.timeline.slots))
      : [],
    locations: Array.isArray(game.locations) ? game.locations.map(normalizeLocation) : [],
    clues: Array.isArray(game.clues) ? game.clues.map(normalizeClue) : [],
    cards: {
      characterCards: Array.isArray(game.cards?.characterCards) ? game.cards.characterCards : [],
      clueCards: Array.isArray(game.cards?.clueCards) ? game.cards.clueCards.map(normalizeClueCard) : [],
      eventCards: Array.isArray(game.cards?.eventCards) ? game.cards.eventCards : [],
    },
    scripts,
    ending: normalizeEndingConfig(game.ending, game.scripts),
    advancedVotingEnabled: game.advancedVotingEnabled ?? false,
    voteQuestions: Array.isArray(game.voteQuestions) ? game.voteQuestions : [],
  };
}

/** 라이브러리 카드용 메타데이터를 현재 구조로 생성한다. */
export function buildMetadataFromGame(game: GamePackage): GameMetadata {
  return {
    id: game.id,
    title: game.title,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    access: {
      ownerId: game.access.ownerId,
      visibility: game.access.visibility,
      publishedAt: game.access.publishedAt,
    },
    settings: {
      playerCount: game.settings.playerCount,
      difficulty: game.settings.difficulty,
      tags: game.settings.tags,
      estimatedDuration: game.settings.estimatedDuration,
      summary: game.settings.summary,
      coverImageUrl: game.settings.coverImageUrl,
      coverImagePosition: game.settings.coverImagePosition,
    },
    playerCount: game.players?.length ?? 0,
    clueCount: game.clues.length,
    locationCount: game.locations?.length ?? 0,
    publishReadiness: getGamePublishReadiness(game),
  };
}
