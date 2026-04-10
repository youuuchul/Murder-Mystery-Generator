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

interface SupabaseGameRow {
  id: string;
  owner_id: string;
  title: string;
  summary: string | null;
  difficulty: GamePackage["settings"]["difficulty"];
  player_count: number;
  estimated_duration: number;
  cover_asset_id: string | null;
  visibility: GamePackage["access"]["visibility"];
  lifecycle_status: string;
  tags: string[] | null;
  clue_count: number;
  location_count: number;
  round_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  last_editor_id: string | null;
}

interface SupabaseGameContentRow {
  game_id: string;
  content_json: GamePackage;
}

const SUPABASE_GAME_COLUMNS = [
  "id",
  "owner_id",
  "title",
  "summary",
  "difficulty",
  "player_count",
  "estimated_duration",
  "cover_asset_id",
  "visibility",
  "lifecycle_status",
  "tags",
  "clue_count",
  "location_count",
  "round_count",
  "published_at",
  "created_at",
  "updated_at",
  "last_editor_id",
].join(",");

const SUPABASE_GAME_CONTENT_COLUMNS = [
  "game_id",
  "content_json",
].join(",");

/**
 * Supabase 메타 row에서 content_json이 일시적으로 비어도 관리 화면에서 보이도록
 * 최소 metadata를 복원한다.
 */
function buildFallbackMetadataFromRow(row: SupabaseGameRow): GameMetadata {
  const playersPassed = row.player_count > 0;
  const summaryPassed = Boolean(row.summary?.trim());
  const titlePassed = Boolean(row.title.trim());

  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    access: {
      ownerId: row.owner_id,
      visibility: row.visibility,
      publishedAt: row.published_at ?? undefined,
    },
    settings: {
      playerCount: row.player_count,
      difficulty: row.difficulty,
      tags: row.tags ?? [],
      estimatedDuration: row.estimated_duration,
      summary: row.summary ?? undefined,
      coverImageUrl: undefined,
      coverImagePosition: undefined,
    },
    playerCount: row.player_count,
    clueCount: row.clue_count,
    locationCount: row.location_count,
    publishReadiness: {
      ready: false,
      checklist: [
        {
          id: "title",
          label: "제목",
          passed: titlePassed,
          detail: "제목이 필요합니다.",
        },
        {
          id: "summary",
          label: "라이브러리 소개글",
          passed: summaryPassed,
          detail: "라이브러리 소개글이 필요합니다.",
        },
        {
          id: "players",
          label: "플레이어 수",
          passed: playersPassed,
          detail: "등록된 플레이어 수를 기본 설정 인원 수와 맞춰주세요.",
        },
        {
          id: "opening",
          label: "오프닝 기본 스크립트",
          passed: false,
          detail: "오프닝 기본 스크립트가 필요합니다.",
        },
        {
          id: "ending",
          label: "엔딩",
          passed: false,
          detail: "엔딩 분기 또는 엔딩 스크립트가 필요합니다.",
        },
      ],
    },
  };
}

function normalizeSupabaseGameContent(game: GamePackage): GamePackage {
  return normalizeGame(game);
}

function buildSupabaseGameRow(game: GamePackage): SupabaseGameRow {
  const normalizedGame = normalizeSupabaseGameContent(game);
  const metadata = buildMetadataFromGame(normalizedGame);
  const publishReadiness = getGamePublishReadiness(normalizedGame);

  return {
    id: normalizedGame.id,
    owner_id: normalizedGame.access.ownerId,
    title: normalizedGame.title,
    summary: normalizedGame.settings.summary ?? null,
    difficulty: normalizedGame.settings.difficulty,
    player_count: normalizedGame.settings.playerCount,
    estimated_duration: normalizedGame.settings.estimatedDuration,
    cover_asset_id: null,
    visibility: normalizedGame.access.visibility,
    lifecycle_status: publishReadiness.ready ? "ready" : "draft",
    tags: normalizedGame.settings.tags,
    clue_count: metadata.clueCount,
    location_count: metadata.locationCount,
    round_count: normalizedGame.rules.roundCount,
    published_at: normalizedGame.access.publishedAt ?? null,
    created_at: normalizedGame.createdAt,
    updated_at: normalizedGame.updatedAt,
    last_editor_id: normalizedGame.access.ownerId || null,
  };
}

async function listSupabaseMetadata(
  visibility?: GamePackage["access"]["visibility"]
): Promise<GameMetadata[]> {
  const supabase = createSupabasePersistenceClient();
  let gameQuery = supabase
    .from("games")
    .select(SUPABASE_GAME_COLUMNS)
    .order("updated_at", { ascending: false });

  if (visibility) {
    gameQuery = gameQuery.eq("visibility", visibility);
  }

  const { data: gameRows, error: gameError } = await gameQuery;
  if (gameError) {
    throw new Error(`Failed to list Supabase games: ${gameError.message}`);
  }

  const rows = (gameRows ?? []) as unknown as SupabaseGameRow[];
  if (rows.length === 0) {
    return [];
  }

  const { data: contentRows, error: contentError } = await supabase
    .from("game_content")
    .select(SUPABASE_GAME_CONTENT_COLUMNS)
    .in("game_id", rows.map((row) => row.id));

  if (contentError) {
    throw new Error(`Failed to load Supabase game content: ${contentError.message}`);
  }

  const contentByGameId = new Map(
    ((contentRows ?? []) as unknown as SupabaseGameContentRow[]).map((row) => [row.game_id, row.content_json])
  );

  return rows.map((row) => {
    const content = contentByGameId.get(row.id);
    if (!content) {
      return buildFallbackMetadataFromRow(row);
    }

    return buildMetadataFromGame(normalizeSupabaseGameContent(content));
  });
}

/**
 * Supabase `games + game_content` 하이브리드 저장소 구현.
 * 목록은 `games` 메타를 기준으로 정렬/필터링하고, publish readiness는 `content_json`에서 다시 계산한다.
 */
const supabaseGameRepository: GameRepository = {
  async listGames() {
    return listSupabaseMetadata();
  },

  async listPublicGames() {
    return listSupabaseMetadata("public");
  },

  async getGame(gameId) {
    const normalizedGameId = gameId.trim();
    if (!normalizedGameId) {
      return null;
    }

    const supabase = createSupabasePersistenceClient();
    const { data, error } = await supabase
      .from("game_content")
      .select(SUPABASE_GAME_CONTENT_COLUMNS)
      .eq("game_id", normalizedGameId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load Supabase game content: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return normalizeSupabaseGameContent((data as unknown as SupabaseGameContentRow).content_json);
  },

  async saveGame(game) {
    const supabase = createSupabasePersistenceClient();
    const normalizedGame = normalizeSupabaseGameContent(game);
    const metadataRow = buildSupabaseGameRow(normalizedGame);
    const { data: existingContentRow, error: existingContentError } = await supabase
      .from("game_content")
      .select(SUPABASE_GAME_CONTENT_COLUMNS)
      .eq("game_id", normalizedGame.id)
      .maybeSingle();

    if (existingContentError) {
      throw new Error(`Failed to load current Supabase game content before save: ${existingContentError.message}`);
    }

    const existingGame = existingContentRow
      ? normalizeSupabaseGameContent((existingContentRow as unknown as SupabaseGameContentRow).content_json)
      : null;

    if (existingGame && !areGamePackagesEquivalent(existingGame, normalizedGame)) {
      await createGameContentBackupSnapshot(existingGame, {
        reason: "pre-save",
      });
    }

    const { error: gameError } = await supabase
      .from("games")
      .upsert(metadataRow, { onConflict: "id" });

    if (gameError) {
      throw new Error(`Failed to upsert Supabase game metadata: ${gameError.message}`);
    }

    const { error: contentError } = await supabase
      .from("game_content")
      .upsert({
        game_id: normalizedGame.id,
        content_json: normalizedGame,
        schema_version: 1,
      }, { onConflict: "game_id" });

    if (contentError) {
      throw new Error(`Failed to upsert Supabase game content: ${contentError.message}`);
    }
  },

  async deleteGame(gameId) {
    const normalizedGameId = gameId.trim();
    if (!normalizedGameId) {
      return false;
    }

    const supabase = createSupabasePersistenceClient();
    const { data: existingContentRow, error: existingContentError } = await supabase
      .from("game_content")
      .select(SUPABASE_GAME_CONTENT_COLUMNS)
      .eq("game_id", normalizedGameId)
      .maybeSingle();

    if (existingContentError) {
      throw new Error(`Failed to load current Supabase game content before delete: ${existingContentError.message}`);
    }

    if (existingContentRow) {
      await createGameContentBackupSnapshot(
        normalizeSupabaseGameContent((existingContentRow as unknown as SupabaseGameContentRow).content_json),
        { reason: "pre-delete" }
      );
    }

    const { data, error } = await supabase
      .from("games")
      .delete()
      .eq("id", normalizedGameId)
      .select("id");

    if (error) {
      throw new Error(`Failed to delete Supabase game: ${error.message}`);
    }

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
