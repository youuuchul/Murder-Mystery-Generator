import type { GamePackage, GameRules, GameSettings, GameMetadata, PhaseConfig, RoundScript, ScriptSegment, Story } from "@/types/game";

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
    timeline: [],
    culpritPlayerId: asTrimmedString(game.story?.culpritPlayerId),
    motive: asTrimmedString(game.story?.motive),
    method: asTrimmedString(game.story?.method),
  };

  return {
    ...game,
    settings,
    rules,
    story,
    players: game.players ?? [],
    locations: game.locations ?? [],
    clues: game.clues ?? [],
    cards: game.cards ?? {
      characterCards: [],
      clueCards: [],
      eventCards: [],
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
