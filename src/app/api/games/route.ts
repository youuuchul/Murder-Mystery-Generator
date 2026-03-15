import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listGames, saveGame } from "@/lib/storage/game-storage";
import type { GamePackage, GameRules } from "@/types/game";

/** 플레이어 수에 따른 기본 게임 규칙 생성 */
function buildDefaultRules(playerCount: number): GameRules {
  // 6인 이상이면 조사 페이즈를 더 길게
  const investigationMin = playerCount >= 6 ? 20 : 15;
  return {
    roundCount: 4,
    phases: [
      { type: "investigation", label: "조사", durationMinutes: investigationMin },
      { type: "discussion", label: "토론", durationMinutes: 10 },
    ],
    privateChat: {
      enabled: true,
      maxGroupSize: Math.min(3, playerCount - 1),
      durationMinutes: 5,
    },
    cardTrading: {
      enabled: true,
    },
    cluesPerRound: 2,
    allowLocationRevisit: false,
  };
}

const CreateGameSchema = z.object({
  title: z.string().min(1, "제목을 입력하세요").max(100),
  settings: z.object({
    playerCount: z.number().int().min(4).max(8),
    difficulty: z.enum(["easy", "normal", "hard"]),
    tags: z.array(z.string().min(1)).min(1),
    estimatedDuration: z.number().int().min(30).max(300),
  }),
});

/** GET /api/games — 게임 목록 */
export async function GET() {
  try {
    const games = listGames();
    return NextResponse.json({ games });
  } catch (error) {
    console.error("[GET /api/games]", error);
    return NextResponse.json({ error: "게임 목록 조회 실패" }, { status: 500 });
  }
}

/** POST /api/games — 새 게임 생성 */
export async function POST(request: NextRequest) {
  try {
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
      settings,
      rules: incomingRules ?? buildDefaultRules(settings.playerCount),
      story: {
        synopsis: "",
        victim: { name: "", background: "", deathCircumstances: "" },
        incident: "",
        location: "",
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
    };

    saveGame(game);

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
