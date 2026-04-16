import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canReadGameSource, canViewAllGames } from "@/lib/game-access";
import { buildDefaultGameRules } from "@/lib/game-rules";
import { listGames, saveGame } from "@/lib/game-repository";
import { getRequestMakerUser } from "@/lib/maker-user.server";
import type { GamePackage } from "@/types/game";

/**
 * 신규 게임 생성은 "제목 + 소개글"만 받는 가벼운 셸을 만들고,
 * 나머지 설정/규칙/스토리 블록은 기본값으로 채워 곧바로 편집 화면에서 이어 작성한다.
 */
const CreateGameSchema = z.object({
  title: z.string().min(1, "제목을 입력하세요").max(100),
  summary: z.string().max(220).optional(),
});

const DEFAULT_PLAYER_COUNT = 5;
const DEFAULT_ESTIMATED_DURATION = 120;

/** GET /api/games — 현재 권한에 맞는 게임 목록 */
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getRequestMakerUser(request);
    if (!currentUser) {
      return NextResponse.json({ error: "제작자 로그인이 필요합니다." }, { status: 401 });
    }

    const allGames = await listGames();
    const games = canViewAllGames(currentUser)
      ? allGames
      : allGames.filter((game) => canReadGameSource(game, currentUser));

    return NextResponse.json({ games });
  } catch (error) {
    console.error("[GET /api/games]", error);
    return NextResponse.json({ error: "게임 목록 조회 실패" }, { status: 500 });
  }
}

/** POST /api/games — 새 게임 생성 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getRequestMakerUser(request);

    if (!currentUser) {
      return NextResponse.json(
        { error: "제작자 로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = CreateGameSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값 오류", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { title, summary } = parsed.data;
    const now = new Date().toISOString();

    const game: GamePackage = {
      id: generateId(),
      title,
      createdAt: now,
      updatedAt: now,
      access: {
        ownerId: currentUser.id,
        visibility: "private",
        publishedAt: undefined,
      },
      settings: {
        playerCount: DEFAULT_PLAYER_COUNT,
        difficulty: "normal",
        tags: [],
        estimatedDuration: DEFAULT_ESTIMATED_DURATION,
        summary: summary?.trim() || undefined,
      },
      rules: buildDefaultGameRules(DEFAULT_PLAYER_COUNT),
      story: {
        synopsis: "",
        victim: { name: "", background: "", imageUrl: undefined },
        npcs: [],
        incident: "",
        gmOverview: "",
        mapImageUrl: undefined,
        timeline: {
          enabled: false,
          slots: [],
        },
        culpritPlayerId: "",
        motive: "",
        method: "",
      },
      players: [],
      locations: [],
      clues: [],
      cards: {
        characterCards: [],
        clueCards: [],
        eventCards: [],
      },
      scripts: {
        lobby: { narration: "" },
        opening: { narration: "" },
        rounds: [],
        vote: { narration: "" },
        ending: { narration: "" },
      },
      ending: {
        branches: [],
        personalEndingsEnabled: false,
        personalEndings: [],
        authorNotesEnabled: false,
        authorNotes: [],
      },
      advancedVotingEnabled: false,
      voteQuestions: [],
    };

    await saveGame(game);

    return NextResponse.json({ game }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/games]", error);
    return NextResponse.json({ error: "게임 생성 실패" }, { status: 500 });
  }
}

function generateId(): string {
  // crypto.randomUUID() — Node 14.17+
  return crypto.randomUUID();
}
