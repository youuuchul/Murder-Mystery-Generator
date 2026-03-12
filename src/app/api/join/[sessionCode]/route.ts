import { NextResponse } from "next/server";
import { getSessionByCode } from "@/lib/storage/session-storage";
import { getGame } from "@/lib/storage/game-storage";
import { buildPublicGame } from "@/lib/game-sanitizer";

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

  const safeGame = buildPublicGame(game);

  return NextResponse.json({ session, game: safeGame });
}
