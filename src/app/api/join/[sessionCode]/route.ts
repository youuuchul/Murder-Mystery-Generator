import { NextResponse } from "next/server";
import { getSessionByCode } from "@/lib/storage/session-storage";
import { getGame } from "@/lib/storage/game-storage";

/** GET /api/join/[sessionCode] — 코드로 세션+게임 조회 (참가 페이지용) */
export async function GET(
  _req: Request,
  { params }: { params: { sessionCode: string } }
) {
  const session = getSessionByCode(params.sessionCode);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const game = getGame(session.gameId);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  // 게임 패키지에서 민감 정보 제거 (범인 ID, 비밀, GM 메모 등)
  const safeGame = {
    ...game,
    story: {
      ...game.story,
      synopsis: "",
      culpritPlayerId: "",
      motive: "",
      method: "",
    },
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      background: p.background,
      victoryCondition: p.victoryCondition,
      // secret, alibi, relatedClues 제외
    })),
  };

  return NextResponse.json({ session, game: safeGame });
}
