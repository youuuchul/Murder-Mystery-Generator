import type {
  Clue,
  ClueCard,
  ClueCondition,
  GameMetadata,
  GamePackage,
  GameRules,
  GameSettings,
  Location,
  PhaseConfig,
  Player,
  PlayerTimelineEntry,
  RoundScript,
  ScriptSegment,
  Story,
  StoryTimeline,
  TimelineEvent,
  TimelineSlot,
} from "@/types/game";

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

function normalizeVictoryCondition(value: unknown): Player["victoryCondition"] {
  return value === "avoid-arrest"
    || value === "uncertain"
    || value === "arrest-culprit"
    || value === "personal-goal"
    ? value
    : "arrest-culprit";
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
      ? player.scoreConditions.map((condition) => ({
          description: asTrimmedString(condition?.description),
          points: Number.isFinite(condition?.points) ? Number(condition.points) : 0,
        }))
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
      ? player.relationships.map((relationship) => ({
          playerId: asTrimmedString(relationship?.playerId),
          description: asTrimmedString(relationship?.description),
        }))
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
    type: clue?.type === "testimony"
      || clue?.type === "document"
      || clue?.type === "scene"
      ? clue.type
      : "physical",
    imageUrl: asOptionalString(clue?.imageUrl),
    locationId: asTrimmedString(clue?.locationId),
    pointsTo: asOptionalString(clue?.pointsTo),
    isSecret: clue?.isSecret === true,
    condition: normalizeClueCondition(clue?.condition),
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
    type: card?.type === "testimony"
      || card?.type === "document"
      || card?.type === "scene"
      ? card.type
      : "physical",
    imageUrl: asOptionalString(card?.imageUrl),
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

function defaultPhases(playerCount: number): PhaseConfig[] {
  return [
    {
      type: "investigation",
      label: "조사",
      durationMinutes: playerCount >= 6 ? 20 : 15,
    },
    {
      type: "discussion",
      label: "토론",
      durationMinutes: 10,
    },
  ];
}

/** 기존/신규 게임 데이터 모두를 현재 편집기 구조에 맞춰 정규화한다. */
export function normalizeGame(game: GamePackage): GamePackage {
  const settings: GameSettings = {
    playerCount: game.settings?.playerCount ?? 5,
    difficulty: game.settings?.difficulty ?? "normal",
    estimatedDuration: game.settings?.estimatedDuration ?? 120,
    tags: normalizeTags(game.settings ?? {}),
  };

  const fallbackPhases = defaultPhases(settings.playerCount);
  const rules: GameRules = {
    roundCount: game.rules?.roundCount ?? 4,
    phases: fallbackPhases.map((phase) => {
      const saved = game.rules?.phases?.find((item) => item.type === phase.type);
      return {
        ...phase,
        durationMinutes: saved?.durationMinutes ?? phase.durationMinutes,
      };
    }),
    privateChat: {
      enabled: game.rules?.privateChat?.enabled ?? true,
      maxGroupSize: game.rules?.privateChat?.maxGroupSize ?? Math.min(3, settings.playerCount - 1),
      durationMinutes: game.rules?.privateChat?.durationMinutes ?? 5,
    },
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
      gmNote: asOptionalString(segment?.gmNote),
    };
  }

  function normalizeRound(round: RoundScript): RoundScript {
    return {
      round: round.round,
      narration: asTrimmedString(round.narration),
      unlockedLocationIds: [],
      videoUrl: asOptionalString(round.videoUrl),
      backgroundMusic: asOptionalString(round.backgroundMusic),
      gmNote: asOptionalString(round.gmNote),
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
      deathCircumstances: asTrimmedString(game.story?.victim?.deathCircumstances),
    },
    incident: asTrimmedString(game.story?.incident),
    location: asTrimmedString(game.story?.location),
    gmOverview: asOptionalString(game.story?.gmOverview) ?? asOptionalString(game.story?.synopsis),
    mapImageUrl: asOptionalString(game.story?.mapImageUrl),
    timeline,
    culpritPlayerId: asTrimmedString(game.story?.culpritPlayerId),
    motive: asTrimmedString(game.story?.motive),
    method: asTrimmedString(game.story?.method),
  };

  return {
    ...game,
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
  };
}

/** 라이브러리 카드용 메타데이터를 현재 구조로 생성한다. */
export function buildMetadataFromGame(game: GamePackage): GameMetadata {
  return {
    id: game.id,
    title: game.title,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    settings: {
      playerCount: game.settings.playerCount,
      difficulty: game.settings.difficulty,
      tags: game.settings.tags,
      estimatedDuration: game.settings.estimatedDuration,
    },
    playerCount: game.players?.length ?? 0,
    clueCount: game.clues.length,
    locationCount: game.locations?.length ?? 0,
  };
}
