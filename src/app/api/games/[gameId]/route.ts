import { NextRequest, NextResponse } from "next/server";
import { resolveEditableGameForUser } from "@/lib/game-access";
import { getMakerUserFromCookieStore } from "@/lib/maker-user";
import { getGame, saveGame, deleteGame } from "@/lib/storage/game-storage";
import { buildPublicGame } from "@/lib/game-sanitizer";
import type { GamePackage } from "@/types/game";

type Params = { params: Promise<{ gameId: string }> };

/** GET /api/games/[gameId] — 단일 게임 조회 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { gameId } = await params;

  const game = getGame(gameId);
  if (!game) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json({ game: buildPublicGame(game) });
}

/** PUT /api/games/[gameId] — 게임 수정 */
export async function PUT(request: NextRequest, { params }: Params) {
  const { gameId } = await params;
  const currentUser = getMakerUserFromCookieStore(request.cookies);

  if (!currentUser) {
    return NextResponse.json(
      { error: "제작자 로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const existing = getGame(gameId);
  if (!existing) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다" }, { status: 404 });
  }

  try {
    const editableGame = resolveEditableGameForUser(existing, currentUser.id);

    if (!editableGame) {
      return NextResponse.json(
        { error: "이 게임은 현재 작업자가 수정할 수 없습니다." },
        { status: 403 }
      );
    }

    const body = await request.json();

    // 부분 업데이트: 기존 게임과 병합
    const updated: GamePackage = {
      ...editableGame.game,
      ...body,
      id: existing.id, // ID 변경 방지
      createdAt: existing.createdAt, // 생성일 변경 방지
      access: editableGame.game.access, // 소유권/공개 상태는 별도 단계에서만 수정
      updatedAt: new Date().toISOString(),
    };

    saveGame(updated);

    return NextResponse.json({ game: updated });
  } catch (error) {
    console.error(`[PUT /api/games/${gameId}]`, error);
    return NextResponse.json({ error: "게임 수정 실패" }, { status: 500 });
  }
}

/** DELETE /api/games/[gameId] — 게임 삭제 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { gameId } = await params;
  const currentUser = getMakerUserFromCookieStore(request.cookies);

  if (!currentUser) {
    return NextResponse.json(
      { error: "제작자 로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const existing = getGame(gameId);
  if (!existing) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다" }, { status: 404 });
  }

  const editableGame = resolveEditableGameForUser(existing, currentUser.id);
  if (!editableGame) {
    return NextResponse.json(
      { error: "이 게임은 현재 작업자가 삭제할 수 없습니다." },
      { status: 403 }
    );
  }

  const deleted = deleteGame(gameId);
  if (!deleted) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
