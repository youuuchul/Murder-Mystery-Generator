import type { GameMetadata, GamePackage } from "@/types/game";
import { deleteGameAssets } from "@/lib/game-asset-storage";
import {
  areGamePackagesEquivalent,
  createGameContentBackupSnapshot,
} from "@/lib/game-content-integrity";
import { getGamePublishReadiness } from "@/lib/game-publish";
import { createSupabasePersistenceClient } from "@/lib/supabase/persistence";
import { buildMetadataFromGame, normalizeGame } from "@/lib/game-normalizer";

export interface GameRepository {
  listGames(): Promise<GameMetadata[]>;
  listPublicGames(): Promise<GameMetadata[]>;
  getGame(gameId: string): Promise<GamePackage | null>;
  saveGame(game: GamePackage): Promise<void>;
  deleteGame(gameId: string): Promise<boolean>;
}

// ─── Row types ─────────────────────────────────────────────

interface GamesRow {
  id: string;
  owner_id: string;
  title: string;
  summary: string | null;
  difficulty: string;
  player_count: number;
  estimated_duration: number;
  cover_asset_id: string | null;
  visibility: string;
  lifecycle_status: string;
  tags: string[] | null;
  clue_count: number;
  location_count: number;
  round_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  last_editor_id: string | null;
  // 확장 컬럼
  cover_image_url: string | null;
  cover_image_position_x: number;
  cover_image_position_y: number;
  opening_duration_minutes: number;
  phases: unknown;
  private_chat_config: unknown;
  card_trading_enabled: boolean;
  clues_per_round: number;
  allow_location_revisit: boolean;
  advanced_voting_enabled: boolean;
}

// ─── Helpers ───────────────────────────────────────────────

function buildMetadataFromRow(row: GamesRow): GameMetadata {
  const titlePassed = Boolean(row.title.trim());
  const summaryPassed = Boolean(row.summary?.trim());
  const playersPassed = row.player_count > 0;

  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    access: {
      ownerId: row.owner_id,
      visibility: row.visibility as GamePackage["access"]["visibility"],
      publishedAt: row.published_at ?? undefined,
    },
    settings: {
      playerCount: row.player_count,
      difficulty: row.difficulty as GamePackage["settings"]["difficulty"],
      tags: row.tags ?? [],
      estimatedDuration: row.estimated_duration,
      summary: row.summary ?? undefined,
      coverImageUrl: row.cover_image_url ?? undefined,
      coverImagePosition:
        row.cover_image_url
          ? { x: row.cover_image_position_x, y: row.cover_image_position_y }
          : undefined,
    },
    playerCount: row.player_count,
    clueCount: row.clue_count,
    locationCount: row.location_count,
    publishReadiness: {
      ready: row.lifecycle_status === "ready",
      checklist: [
        { id: "title", label: "제목", passed: titlePassed, detail: "제목이 필요합니다." },
        { id: "summary", label: "라이브러리 소개글", passed: summaryPassed, detail: "라이브러리 소개글이 필요합니다." },
        { id: "players", label: "플레이어 수", passed: playersPassed, detail: "등록된 플레이어 수를 기본 설정 인원 수와 맞춰주세요." },
        { id: "opening", label: "오프닝 기본 스크립트", passed: false, detail: "오프닝 기본 스크립트가 필요합니다." },
        { id: "ending", label: "엔딩", passed: false, detail: "엔딩 분기 또는 엔딩 스크립트가 필요합니다." },
      ],
    },
  };
}

/**
 * games 행에서 정확한 publish readiness를 계산하려면 content가 필요하다.
 * content가 있으면 정규화된 readiness를, 없으면 row 기반 fallback을 반환한다.
 */
function buildMetadataFromRowWithContent(row: GamesRow, game: GamePackage | null): GameMetadata {
  if (game) {
    return buildMetadataFromGame(game);
  }
  return buildMetadataFromRow(row);
}

function buildGamesRowFromPackage(game: GamePackage): Record<string, unknown> {
  const readiness = getGamePublishReadiness(game);

  return {
    id: game.id,
    owner_id: game.access.ownerId,
    title: game.title,
    summary: game.settings.summary ?? null,
    difficulty: game.settings.difficulty,
    player_count: game.settings.playerCount,
    estimated_duration: game.settings.estimatedDuration,
    cover_asset_id: null,
    visibility: game.access.visibility,
    lifecycle_status: readiness.ready ? "ready" : "draft",
    tags: game.settings.tags,
    clue_count: game.clues.length,
    location_count: game.locations.length,
    round_count: game.rules.roundCount,
    published_at: game.access.publishedAt ?? null,
    created_at: game.createdAt,
    updated_at: game.updatedAt,
    last_editor_id: game.access.ownerId || null,
    // 확장 컬럼
    cover_image_url: game.settings.coverImageUrl ?? null,
    cover_image_position_x: game.settings.coverImagePosition?.x ?? 50,
    cover_image_position_y: game.settings.coverImagePosition?.y ?? 50,
    opening_duration_minutes: game.rules.openingDurationMinutes,
    phases: game.rules.phases,
    private_chat_config: game.rules.privateChat,
    card_trading_enabled: game.rules.cardTrading.enabled,
    clues_per_round: game.rules.cluesPerRound,
    allow_location_revisit: game.rules.allowLocationRevisit,
    advanced_voting_enabled: game.advancedVotingEnabled ?? false,
  };
}

// ─── getGame: 정규화 테이블 → GamePackage 복원 ─────────────

async function loadGamePackageFromTables(gameId: string): Promise<GamePackage | null> {
  const supabase = createSupabasePersistenceClient();

  // 1. games 기본 행
  const { data: gameRow, error: gameError } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .maybeSingle();

  if (gameError) throw new Error(`Failed to load game: ${gameError.message}`);
  if (!gameRow) return null;
  const g = gameRow as unknown as GamesRow;

  // 2. 병렬 쿼리
  const [
    storyResult,
    slotsResult,
    npcsResult,
    playersResult,
    timelineEntriesResult,
    relationshipsResult,
    relatedCluesResult,
    locationsResult,
    cluesResult,
    scriptsResult,
    cardsResult,
    endingConfigResult,
    branchesResult,
    personalEndingsResult,
    authorNotesResult,
    voteQuestionsResult,
    voteQuestionChoicesResult,
  ] = await Promise.all([
    supabase.from("game_stories").select("*").eq("game_id", gameId).maybeSingle(),
    supabase.from("game_timeline_slots").select("*").eq("game_id", gameId).order("sort_order"),
    supabase.from("game_npcs").select("*").eq("game_id", gameId).order("sort_order"),
    supabase.from("game_players").select("*").eq("game_id", gameId).order("sort_order"),
    supabase.from("player_timeline_entries").select("*").eq("game_id", gameId),
    supabase.from("player_relationships").select("*").eq("game_id", gameId).order("sort_order"),
    supabase.from("player_related_clues").select("*").eq("game_id", gameId),
    supabase.from("game_locations").select("*").eq("game_id", gameId).order("sort_order"),
    supabase.from("game_clues").select("*").eq("game_id", gameId).order("sort_order"),
    supabase.from("game_scripts").select("*").eq("game_id", gameId),
    supabase.from("game_cards").select("*").eq("game_id", gameId).order("card_type,sort_order"),
    supabase.from("game_ending_config").select("*").eq("game_id", gameId).maybeSingle(),
    supabase.from("game_ending_branches").select("*").eq("game_id", gameId).order("sort_order"),
    supabase.from("branch_personal_endings").select("*").eq("game_id", gameId),
    supabase.from("game_author_notes").select("*").eq("game_id", gameId).order("sort_order"),
    supabase.from("game_vote_questions").select("*").eq("game_id", gameId).order("sort_order"),
    supabase.from("game_vote_question_choices").select("*").eq("game_id", gameId).order("sort_order"),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storyRow = storyResult.data as any;
  const slots = (slotsResult.data ?? []) as Array<{ id: string; slot_label: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const npcs = (npcsResult.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRows = (playersResult.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timelineEntries = (timelineEntriesResult.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const relationships = (relationshipsResult.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const relatedClues = (relatedCluesResult.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const locationRows = (locationsResult.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clueRows = (cluesResult.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scriptRows = (scriptsResult.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardRows = (cardsResult.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const endingConfig = endingConfigResult.data as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const branchRows = (branchesResult.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const personalEndingRows = (personalEndingsResult.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authorNoteRows = (authorNotesResult.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const voteQuestionRows = (voteQuestionsResult.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const voteChoiceRows = (voteQuestionChoicesResult.data ?? []) as any[];

  // 3. 인덱스 맵 구축
  const timelineByPlayer = new Map<string, Array<{ slotId: string; action: string }>>();
  for (const te of timelineEntries) {
    const list = timelineByPlayer.get(te.player_id) ?? [];
    list.push({ slotId: te.slot_id, action: te.action });
    timelineByPlayer.set(te.player_id, list);
  }

  const relsByPlayer = new Map<string, Array<{ targetType: "player" | "victim" | "npc"; targetId: string; description: string }>>();
  for (const r of relationships) {
    const list = relsByPlayer.get(r.player_id) ?? [];
    list.push({ targetType: r.target_type as "player" | "victim" | "npc", targetId: r.target_id, description: r.description });
    relsByPlayer.set(r.player_id, list);
  }

  const rcByPlayer = new Map<string, Array<{ clueId: string; note: string }>>();
  for (const rc of relatedClues) {
    const list = rcByPlayer.get(rc.player_id) ?? [];
    list.push({ clueId: rc.clue_id, note: rc.note });
    rcByPlayer.set(rc.player_id, list);
  }

  const peByBranch = new Map<string, Array<{ playerId: string; title?: string; text: string }>>();
  for (const pe of personalEndingRows) {
    const list = peByBranch.get(pe.branch_id) ?? [];
    list.push({ playerId: pe.player_id, title: pe.title ?? undefined, text: pe.body_text });
    peByBranch.set(pe.branch_id, list);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const choicesByQuestion = new Map<string, any[]>();
  for (const vc of voteChoiceRows) {
    const list = choicesByQuestion.get(vc.question_id) ?? [];
    list.push(vc);
    choicesByQuestion.set(vc.question_id, list);
  }

  // 4. GamePackage 조합
  const phases = Array.isArray(g.phases) ? g.phases : [];
  const privateChatConfig = (g.private_chat_config && typeof g.private_chat_config === "object")
    ? g.private_chat_config as { enabled: boolean; maxGroupSize: number; durationMinutes: number }
    : { enabled: false, maxGroupSize: 2, durationMinutes: 5 };

  // scripts 복원
  const scriptMap = new Map<string, typeof scriptRows[number]>();
  const roundScripts: typeof scriptRows = [];
  for (const s of scriptRows) {
    if (s.phase === "round") {
      roundScripts.push(s);
    } else {
      scriptMap.set(s.phase, s);
    }
  }
  roundScripts.sort((a: { round_number: number }, b: { round_number: number }) => a.round_number - b.round_number);

  function toScriptSegment(row: typeof scriptRows[number] | undefined) {
    if (!row) return { narration: "" };
    return {
      narration: row.narration || "",
      videoUrl: row.video_url || undefined,
      backgroundMusic: row.background_music || undefined,
      gmNote: row.gm_note || undefined,
    };
  }

  // locations → clueIds 매핑
  const clueIdsByLocation = new Map<string, string[]>();
  for (const c of clueRows) {
    if (c.location_id) {
      const list = clueIdsByLocation.get(c.location_id) ?? [];
      list.push(c.id);
      clueIdsByLocation.set(c.location_id, list);
    }
  }

  const rawPackage: GamePackage = {
    id: g.id,
    title: g.title,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
    access: {
      ownerId: g.owner_id,
      visibility: g.visibility as GamePackage["access"]["visibility"],
      publishedAt: g.published_at ?? undefined,
    },
    settings: {
      playerCount: g.player_count,
      difficulty: g.difficulty as GamePackage["settings"]["difficulty"],
      estimatedDuration: g.estimated_duration,
      tags: g.tags ?? [],
      summary: g.summary ?? undefined,
      coverImageUrl: g.cover_image_url ?? undefined,
      coverImagePosition: g.cover_image_url
        ? { x: g.cover_image_position_x, y: g.cover_image_position_y }
        : undefined,
    },
    rules: {
      roundCount: g.round_count,
      openingDurationMinutes: g.opening_duration_minutes,
      phases: phases as GamePackage["rules"]["phases"],
      privateChat: privateChatConfig,
      cardTrading: { enabled: g.card_trading_enabled },
      cluesPerRound: g.clues_per_round,
      allowLocationRevisit: g.allow_location_revisit,
    },
    story: {
      synopsis: storyRow?.synopsis ?? "",
      victim: {
        name: storyRow?.victim_name ?? "",
        background: storyRow?.victim_background ?? "",
        imageUrl: storyRow?.victim_image_url ?? undefined,
      },
      npcs: npcs.map((n) => ({
        id: n.id,
        name: n.name,
        background: n.background,
        imageUrl: n.image_url ?? undefined,
      })),
      incident: storyRow?.incident ?? "",
      gmOverview: storyRow?.gm_overview ?? undefined,
      mapImageUrl: storyRow?.map_image_url ?? undefined,
      timeline: {
        enabled: storyRow?.timeline_enabled ?? false,
        slots: slots.map((s) => ({ id: s.id, label: s.slot_label })),
      },
      culpritPlayerId: storyRow?.culprit_player_id ?? "",
      motive: storyRow?.motive ?? "",
      method: storyRow?.method ?? "",
    },
    players: playerRows.map((p) => ({
      id: p.id,
      name: p.name,
      victoryCondition: p.victory_condition,
      personalGoal: p.personal_goal ?? undefined,
      scoreConditions: Array.isArray(p.score_conditions) ? p.score_conditions : [],
      background: p.background,
      story: p.story,
      secret: p.secret,
      timelineEntries: timelineByPlayer.get(p.id) ?? [],
      relatedClues: rcByPlayer.get(p.id) ?? [],
      relationships: relsByPlayer.get(p.id) ?? [],
      cardImage: p.card_image ?? undefined,
    })),
    locations: locationRows.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      imageUrl: l.image_url ?? undefined,
      unlocksAtRound: l.unlocks_at_round ?? null,
      clueIds: clueIdsByLocation.get(l.id) ?? [],
      ownerPlayerId: l.owner_player_id ?? undefined,
      accessCondition: l.access_condition ?? undefined,
      previewCluesEnabled: l.preview_clues_enabled ?? false,
    })),
    clues: clueRows.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      type: c.type,
      imageUrl: c.image_url ?? undefined,
      locationId: c.location_id ?? "",
      condition: c.condition ?? undefined,
      previewTitle: c.preview_title ?? undefined,
      previewDescription: c.preview_description ?? undefined,
    })),
    cards: {
      characterCards: cardRows
        .filter((c) => c.card_type === "character")
        .map((c) => ({ playerId: c.player_id, frontText: c.front_text ?? "", backText: c.back_text ?? "" })),
      clueCards: cardRows
        .filter((c) => c.card_type === "clue")
        .map((c) => ({
          clueId: c.clue_id,
          title: c.clue_title ?? "",
          description: c.clue_description ?? "",
          type: c.clue_type ?? "owned",
          imageUrl: c.clue_image_url ?? undefined,
        })),
      eventCards: cardRows
        .filter((c) => c.card_type === "event")
        .map((c) => ({
          round: c.round_number,
          title: c.event_title ?? "",
          description: c.event_description ?? "",
          unlockedLocationIds: c.unlocked_location_ids ?? [],
        })),
    },
    scripts: {
      lobby: toScriptSegment(scriptMap.get("lobby")),
      opening: toScriptSegment(scriptMap.get("opening")),
      rounds: roundScripts.map((s) => ({
        round: s.round_number,
        narration: s.narration || "",
        unlockedLocationIds: s.unlocked_location_ids ?? [],
        imageUrl: s.image_url ?? undefined,
        videoUrl: s.video_url ?? undefined,
        backgroundMusic: s.background_music ?? undefined,
        gmNote: s.gm_note ?? undefined,
      })),
      vote: toScriptSegment(scriptMap.get("vote")),
      ending: toScriptSegment(scriptMap.get("ending")),
      endingSuccess: scriptMap.has("ending_success") ? toScriptSegment(scriptMap.get("ending_success")) : undefined,
      endingFail: scriptMap.has("ending_fail") ? toScriptSegment(scriptMap.get("ending_fail")) : undefined,
    },
    ending: {
      branches: branchRows.map((b) => ({
        id: b.id,
        label: b.label,
        triggerType: b.trigger_type,
        targetPlayerId: b.target_player_id ?? undefined,
        targetQuestionId: b.trigger_question_id ?? undefined,
        targetChoiceId: b.trigger_choice_id ?? undefined,
        targetChoiceIds: Array.isArray(b.trigger_choice_ids) ? b.trigger_choice_ids : [],
        storyText: b.story_text,
        personalEndingsEnabled: b.personal_endings_enabled ?? false,
        personalEndings: peByBranch.get(b.id) ?? [],
        videoUrl: b.video_url ?? undefined,
        backgroundMusic: b.background_music ?? undefined,
      })),
      personalEndingsEnabled: false,
      personalEndings: [],
      authorNotesEnabled: endingConfig?.author_notes_enabled ?? false,
      authorNotes: authorNoteRows.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
      })),
    },
    advancedVotingEnabled: g.advanced_voting_enabled ?? false,
    voteQuestions: voteQuestionRows.map((q) => ({
      id: q.id,
      voteRound: q.vote_round ?? 1,
      label: q.label ?? "",
      description: q.description ?? undefined,
      targetMode: q.target_mode ?? "players-only",
      purpose: q.purpose ?? "ending",
      sortOrder: q.sort_order ?? 0,
      triggerCondition: q.trigger_condition ?? undefined,
      preStoryText: q.pre_story_text ?? undefined,
      preStoryVideoUrl: q.pre_story_video_url ?? undefined,
      preStoryBackgroundMusic: q.pre_story_background_music ?? undefined,
      choices: (choicesByQuestion.get(q.id) ?? []).map((c: { id: string; label: string; description?: string }) => ({
        id: c.id,
        label: c.label ?? "",
        description: c.description ?? undefined,
      })),
    })),
  };

  return normalizeGame(rawPackage);
}

// ─── saveGame: GamePackage → 정규화 테이블 분산 저장 ────────

async function saveGameToTables(game: GamePackage): Promise<void> {
  const supabase = createSupabasePersistenceClient();
  const normalizedGame = normalizeGame(game);
  const gameId = normalizedGame.id;

  // 기존 데이터 비교 (백업용)
  const existingGame = await loadGamePackageFromTables(gameId);
  if (existingGame && !areGamePackagesEquivalent(existingGame, normalizedGame)) {
    await createGameContentBackupSnapshot(existingGame, { reason: "pre-save" });
  }

  // 1. games 메타 행
  const gamesRow = buildGamesRowFromPackage(normalizedGame);
  const { error: gameError } = await supabase.from("games").upsert(gamesRow, { onConflict: "id" });
  if (gameError) throw new Error(`Failed to upsert games: ${gameError.message}`);

  // 2. game_stories
  const story = normalizedGame.story;
  const { error: storyError } = await supabase.from("game_stories").upsert({
    game_id: gameId,
    synopsis: story.synopsis,
    incident: story.incident,
    gm_overview: story.gmOverview ?? null,
    map_image_url: story.mapImageUrl ?? null,
    victim_name: story.victim.name,
    victim_background: story.victim.background,
    victim_image_url: story.victim.imageUrl ?? null,
    culprit_player_id: story.culpritPlayerId,
    motive: story.motive,
    method: story.method,
    timeline_enabled: story.timeline.enabled,
  }, { onConflict: "game_id" });
  if (storyError) throw new Error(`Failed to upsert game_stories: ${storyError.message}`);

  // 3. timeline_slots — delete + insert
  await supabase.from("game_timeline_slots").delete().eq("game_id", gameId);
  if (story.timeline.slots.length > 0) {
    const { error } = await supabase.from("game_timeline_slots").insert(
      story.timeline.slots.map((s, i) => ({ id: s.id, game_id: gameId, slot_label: s.label, sort_order: i }))
    );
    if (error) throw new Error(`Failed to insert game_timeline_slots: ${error.message}`);
  }

  // 4. npcs — delete + insert
  await supabase.from("game_npcs").delete().eq("game_id", gameId);
  if (story.npcs.length > 0) {
    const { error } = await supabase.from("game_npcs").insert(
      story.npcs.map((n, i) => ({ id: n.id, game_id: gameId, name: n.name, background: n.background, image_url: n.imageUrl ?? null, sort_order: i }))
    );
    if (error) throw new Error(`Failed to insert game_npcs: ${error.message}`);
  }

  // 5. players — delete + insert (with child tables)
  await supabase.from("player_related_clues").delete().eq("game_id", gameId);
  await supabase.from("player_relationships").delete().eq("game_id", gameId);
  await supabase.from("player_timeline_entries").delete().eq("game_id", gameId);
  await supabase.from("game_players").delete().eq("game_id", gameId);

  if (normalizedGame.players.length > 0) {
    const { error: pError } = await supabase.from("game_players").insert(
      normalizedGame.players.map((p, i) => ({
        id: p.id, game_id: gameId, name: p.name, background: p.background,
        story: p.story, secret: p.secret, victory_condition: p.victoryCondition,
        personal_goal: p.personalGoal ?? null, score_conditions: p.scoreConditions,
        card_image: p.cardImage ?? null, sort_order: i,
      }))
    );
    if (pError) throw new Error(`Failed to insert game_players: ${pError.message}`);

    // timeline entries
    const teRows = normalizedGame.players.flatMap((p) =>
      p.timelineEntries.filter((te) => te.slotId && te.action).map((te) => ({
        game_id: gameId, player_id: p.id, slot_id: te.slotId, action: te.action,
      }))
    );
    if (teRows.length > 0) {
      const { error } = await supabase.from("player_timeline_entries").insert(teRows);
      if (error) throw new Error(`Failed to insert player_timeline_entries: ${error.message}`);
    }

    // relationships
    const relRows = normalizedGame.players.flatMap((p) =>
      p.relationships.map((r, i) => ({
        game_id: gameId, player_id: p.id, target_type: r.targetType,
        target_id: r.targetId, description: r.description, sort_order: i,
      }))
    );
    if (relRows.length > 0) {
      const { error } = await supabase.from("player_relationships").insert(relRows);
      if (error) throw new Error(`Failed to insert player_relationships: ${error.message}`);
    }

    // related clues
    const rcRows = normalizedGame.players.flatMap((p) =>
      p.relatedClues.filter((rc) => rc.clueId).map((rc) => ({
        game_id: gameId, player_id: p.id, clue_id: rc.clueId, note: rc.note,
      }))
    );
    if (rcRows.length > 0) {
      const { error } = await supabase.from("player_related_clues").insert(rcRows);
      if (error) throw new Error(`Failed to insert player_related_clues: ${error.message}`);
    }
  }

  // 6. locations — delete + insert
  await supabase.from("game_locations").delete().eq("game_id", gameId);
  if (normalizedGame.locations.length > 0) {
    const { error } = await supabase.from("game_locations").insert(
      normalizedGame.locations.map((l, i) => ({
        id: l.id, game_id: gameId, name: l.name, description: l.description,
        image_url: l.imageUrl ?? null, unlocks_at_round: l.unlocksAtRound ?? null,
        owner_player_id: l.ownerPlayerId ?? null, access_condition: l.accessCondition ?? null,
        preview_clues_enabled: l.previewCluesEnabled ?? false,
        sort_order: i,
      }))
    );
    if (error) throw new Error(`Failed to insert game_locations: ${error.message}`);
  }

  // 7. clues — delete + insert
  await supabase.from("game_clues").delete().eq("game_id", gameId);
  if (normalizedGame.clues.length > 0) {
    const { error } = await supabase.from("game_clues").insert(
      normalizedGame.clues.map((c, i) => ({
        id: c.id, game_id: gameId, title: c.title, description: c.description,
        type: c.type, image_url: c.imageUrl ?? null, location_id: c.locationId ?? null,
        condition: c.condition ?? null,
        preview_title: c.previewTitle ?? null, preview_description: c.previewDescription ?? null,
        sort_order: i,
      }))
    );
    if (error) throw new Error(`Failed to insert game_clues: ${error.message}`);
  }

  // 8. scripts — delete + insert
  await supabase.from("game_scripts").delete().eq("game_id", gameId);
  const scriptRows: Array<Record<string, unknown>> = [];
  const { scripts } = normalizedGame;

  for (const [phase, seg] of Object.entries({
    lobby: scripts.lobby, opening: scripts.opening, vote: scripts.vote,
    ending: scripts.ending, ending_success: scripts.endingSuccess, ending_fail: scripts.endingFail,
  })) {
    if (!seg) continue;
    scriptRows.push({
      game_id: gameId, phase, round_number: 0,
      narration: seg.narration || "", video_url: seg.videoUrl ?? null,
      background_music: seg.backgroundMusic ?? null, gm_note: seg.gmNote ?? null,
      unlocked_location_ids: [],
    });
  }
  for (const rs of scripts.rounds) {
    scriptRows.push({
      game_id: gameId, phase: "round", round_number: rs.round,
      narration: rs.narration || "", image_url: rs.imageUrl ?? null,
      video_url: rs.videoUrl ?? null, background_music: rs.backgroundMusic ?? null,
      gm_note: rs.gmNote ?? null, unlocked_location_ids: rs.unlockedLocationIds ?? [],
    });
  }
  if (scriptRows.length > 0) {
    const { error } = await supabase.from("game_scripts").insert(scriptRows);
    if (error) throw new Error(`Failed to insert game_scripts: ${error.message}`);
  }

  // 9. cards — delete + insert
  await supabase.from("game_cards").delete().eq("game_id", gameId);
  const cardRows: Array<Record<string, unknown>> = [];
  for (const [i, cc] of normalizedGame.cards.characterCards.entries()) {
    cardRows.push({ game_id: gameId, card_type: "character", player_id: cc.playerId, front_text: cc.frontText, back_text: cc.backText, sort_order: i });
  }
  for (const [i, cc] of normalizedGame.cards.clueCards.entries()) {
    cardRows.push({ game_id: gameId, card_type: "clue", clue_id: cc.clueId, clue_title: cc.title, clue_description: cc.description, clue_type: cc.type, clue_image_url: cc.imageUrl ?? null, sort_order: i });
  }
  for (const [i, ec] of normalizedGame.cards.eventCards.entries()) {
    cardRows.push({ game_id: gameId, card_type: "event", round_number: ec.round, event_title: ec.title, event_description: ec.description, unlocked_location_ids: ec.unlockedLocationIds ?? [], sort_order: i });
  }
  if (cardRows.length > 0) {
    const { error } = await supabase.from("game_cards").insert(cardRows);
    if (error) throw new Error(`Failed to insert game_cards: ${error.message}`);
  }

  // 10. ending config
  const { error: ecError } = await supabase.from("game_ending_config").upsert({
    game_id: gameId,
    author_notes_enabled: normalizedGame.ending.authorNotesEnabled,
  }, { onConflict: "game_id" });
  if (ecError) throw new Error(`Failed to upsert game_ending_config: ${ecError.message}`);

  // 11. ending branches + personal endings
  await supabase.from("branch_personal_endings").delete().eq("game_id", gameId);
  await supabase.from("game_ending_branches").delete().eq("game_id", gameId);

  if (normalizedGame.ending.branches.length > 0) {
    const { error } = await supabase.from("game_ending_branches").insert(
      normalizedGame.ending.branches.map((b, i) => ({
        id: b.id, game_id: gameId, label: b.label, trigger_type: b.triggerType,
        target_player_id: b.targetPlayerId ?? null, story_text: b.storyText,
        personal_endings_enabled: b.personalEndingsEnabled ?? false,
        video_url: b.videoUrl ?? null, background_music: b.backgroundMusic ?? null,
        trigger_question_id: b.targetQuestionId ?? null,
        trigger_choice_id: b.targetChoiceId ?? null,
        trigger_choice_ids: b.targetChoiceIds ?? [],
        sort_order: i,
      }))
    );
    if (error) throw new Error(`Failed to insert game_ending_branches: ${error.message}`);

    const peRows = normalizedGame.ending.branches.flatMap((b) =>
      (b.personalEndings ?? []).map((pe) => ({
        game_id: gameId, branch_id: b.id, player_id: pe.playerId,
        title: pe.title ?? null, body_text: pe.text,
      }))
    );
    if (peRows.length > 0) {
      const { error: peError } = await supabase.from("branch_personal_endings").insert(peRows);
      if (peError) throw new Error(`Failed to insert branch_personal_endings: ${peError.message}`);
    }
  }

  // 12. author notes
  await supabase.from("game_author_notes").delete().eq("game_id", gameId);
  if (normalizedGame.ending.authorNotes.length > 0) {
    const { error } = await supabase.from("game_author_notes").insert(
      normalizedGame.ending.authorNotes.map((n, i) => ({
        id: n.id, game_id: gameId, title: n.title, content: n.content, sort_order: i,
      }))
    );
    if (error) throw new Error(`Failed to insert game_author_notes: ${error.message}`);
  }

  // 13. vote questions + choices — delete + insert
  await supabase.from("game_vote_question_choices").delete().eq("game_id", gameId);
  await supabase.from("game_vote_questions").delete().eq("game_id", gameId);

  if (normalizedGame.voteQuestions.length > 0) {
    const { error: vqError } = await supabase.from("game_vote_questions").insert(
      normalizedGame.voteQuestions.map((q, i) => ({
        id: q.id, game_id: gameId, vote_round: q.voteRound,
        label: q.label, description: q.description ?? null,
        target_mode: q.targetMode, purpose: q.purpose ?? "ending",
        sort_order: i, trigger_condition: q.triggerCondition ?? null,
        pre_story_text: q.preStoryText ?? null,
        pre_story_video_url: q.preStoryVideoUrl ?? null,
        pre_story_background_music: q.preStoryBackgroundMusic ?? null,
      }))
    );
    if (vqError) throw new Error(`Failed to insert game_vote_questions: ${vqError.message}`);

    const choiceRows = normalizedGame.voteQuestions.flatMap((q) =>
      q.choices.map((c, ci) => ({
        id: c.id, game_id: gameId, question_id: q.id,
        label: c.label, description: c.description ?? null,
        sort_order: ci,
      }))
    );
    if (choiceRows.length > 0) {
      const { error: vcError } = await supabase.from("game_vote_question_choices").insert(choiceRows);
      if (vcError) throw new Error(`Failed to insert game_vote_question_choices: ${vcError.message}`);
    }
  }
}

// ─── Repository 구현 ───────────────────────────────────────

async function listGameMetadata(
  visibility?: GamePackage["access"]["visibility"]
): Promise<GameMetadata[]> {
  const supabase = createSupabasePersistenceClient();
  let query = supabase
    .from("games")
    .select("*")
    .order("updated_at", { ascending: false });

  if (visibility) {
    query = query.eq("visibility", visibility);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(`Failed to list games: ${error.message}`);

  return (rows ?? []).map((row) => buildMetadataFromRow(row as unknown as GamesRow));
}

const supabaseGameRepository: GameRepository = {
  async listGames() {
    return listGameMetadata();
  },

  async listPublicGames() {
    return listGameMetadata("public");
  },

  async getGame(gameId) {
    const normalizedGameId = gameId.trim();
    if (!normalizedGameId) return null;
    return loadGamePackageFromTables(normalizedGameId);
  },

  async saveGame(game) {
    await saveGameToTables(game);
  },

  async deleteGame(gameId) {
    const normalizedGameId = gameId.trim();
    if (!normalizedGameId) return false;

    // 백업
    const existing = await loadGamePackageFromTables(normalizedGameId);
    if (existing) {
      await createGameContentBackupSnapshot(existing, { reason: "pre-delete" });
    }

    const supabase = createSupabasePersistenceClient();
    const { data, error } = await supabase
      .from("games")
      .delete()
      .eq("id", normalizedGameId)
      .select("id");

    if (error) throw new Error(`Failed to delete game: ${error.message}`);

    const deleted = (data?.length ?? 0) > 0;
    if (deleted) {
      try {
        await deleteGameAssets(normalizedGameId);
      } catch (assetError) {
        console.error(`[game-repository] asset cleanup failed for ${normalizedGameId}`, assetError);
      }
    }

    return deleted;
  },
};

// ─── Exports ───────────────────────────────────────────────

export function getGameRepository(): GameRepository {
  return supabaseGameRepository;
}

export function listGames(): Promise<GameMetadata[]> {
  return getGameRepository().listGames();
}

export function listPublicGames(): Promise<GameMetadata[]> {
  return getGameRepository().listPublicGames();
}

export async function countNonPublicGames(): Promise<number> {
  const supabase = createSupabasePersistenceClient();
  const { count, error } = await supabase
    .from("games")
    .select("id", { count: "exact", head: true })
    .neq("visibility", "public");
  if (error) throw new Error(`Failed to count games: ${error.message}`);
  return count ?? 0;
}

export function getGame(gameId: string): Promise<GamePackage | null> {
  return getGameRepository().getGame(gameId);
}

export function saveGame(game: GamePackage): Promise<void> {
  return getGameRepository().saveGame(game);
}

export function deleteGame(gameId: string): Promise<boolean> {
  return getGameRepository().deleteGame(gameId);
}
