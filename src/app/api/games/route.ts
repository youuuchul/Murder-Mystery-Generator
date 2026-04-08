import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canReadGameSource, canViewAllGames } from "@/lib/game-access";
import { buildDefaultGameRules } from "@/lib/game-rules";
import { listGames, saveGame } from "@/lib/game-repository";
import { getRequestMakerUser } from "@/lib/maker-user.server";
import type { GamePackage, GameRules } from "@/types/game";

const CreateGameSchema = z.object({
  title: z.string().min(1, "제목을 입력하세요").max(100),
  settings: z.object({
    playerCount: z.number().int().min(1).max(8),
    difficulty: z.enum(["easy", "normal", "hard"]),
    tags: z.array(z.string().min(1)).min(1),
    estimatedDuration: z.number().int().min(30).max(300),
    summary: z.string().max(220).optional(),
    coverImageUrl: z.string().url().optional(),
    coverImagePosition: z.object({
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
    }).optional(),
  }),
});

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

    const { title, settings } = parsed.data;
    const incomingRules = (body as { rules?: GameRules }).rules;
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
      settings,
      rules: incomingRules ?? buildDefaultGameRules(settings.playerCount),
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
