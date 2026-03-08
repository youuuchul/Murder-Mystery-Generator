import { NextResponse } from "next/server";
import { getGame } from "@/lib/storage/game-storage";
import { createSession, listActiveSessions } from "@/lib/storage/session-storage";

/** POST /api/sessions — 세션 생성 */
export async function POST(req: Request) {
  const { gameId } = await req.json().catch(() => ({})) as { gameId?: string };
  if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });

  const game = getGame(gameId);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (!game.players || game.players.length === 0) {
    return NextResponse.json({ error: "플레이어를 먼저 등록해주세요." }, { status: 422 });
  }

  const session = createSession(game);
  return NextResponse.json({ session }, { status: 201 });
}

/** GET /api/sessions?gameId=xxx — 활성 세션 목록 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId");
  if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });

  const sessions = listActiveSessions(gameId);
  return NextResponse.json({ sessions });
}
