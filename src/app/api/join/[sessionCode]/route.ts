import { NextResponse } from "next/server";
import { getGame } from "@/lib/game-repository";
import { buildPublicGame } from "@/lib/game-sanitizer";
import { buildJoinSessionPreview } from "@/lib/session-sanitizer";
import { getSessionByCode } from "@/lib/session-repository";

/** GET /api/join/[sessionCode] — 코드로 세션+게임 조회 (참가 페이지용) */
export async function GET(
  _req: Request,
  { params }: { params: { sessionCode: string } }
) {
  const session = await getSessionByCode(params.sessionCode);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const game = await getGame(session.gameId);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const safeGame = buildPublicGame(game);

  return NextResponse.json({ session: buildJoinSessionPreview(session), game: safeGame });
}
