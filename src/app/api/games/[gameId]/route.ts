import { NextRequest, NextResponse } from "next/server";
import {
  canDeleteGame,
  canReadGameSource,
  isPubliclyAccessible,
  resolveEditableGameForUser,
} from "@/lib/game-access";
import { deleteGame, getGame, saveGame } from "@/lib/game-repository";
import { getRequestMakerUser } from "@/lib/maker-user.server";
import { buildPublicGame } from "@/lib/game-sanitizer";
import type { GamePackage } from "@/types/game";

type Params = { params: Promise<{ gameId: string }> };

/** GET /api/games/[gameId] — 단일 게임 조회 */
export async function GET(request: NextRequest, { params }: Params) {
  const { gameId } = await params;

  const game = await getGame(gameId);
  if (!game) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다" }, { status: 404 });
  }

  const currentUser = await getRequestMakerUser(request);
  if (currentUser && canReadGameSource(game, currentUser)) {
    return NextResponse.json({ game });
  }

  if (!isPubliclyAccessible(game.access)) {
    return NextResponse.json({ error: "이 게임을 볼 수 없습니다." }, { status: 403 });
  }

  return NextResponse.json({ game: buildPublicGame(game) });
}

/** PUT /api/games/[gameId] — 게임 수정 */
export async function PUT(request: NextRequest, { params }: Params) {
  const { gameId } = await params;
  const currentUser = await getRequestMakerUser(request);

  if (!currentUser) {
    return NextResponse.json(
      { error: "제작자 로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const existing = await getGame(gameId);
  if (!existing) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다" }, { status: 404 });
  }

  try {
    const editableGame = resolveEditableGameForUser(existing, currentUser);

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

    await saveGame(updated);

    /**
     * 저장 직후 canonical source를 다시 읽어 반환한다.
     * local/Supabase 구현 모두 normalize 과정을 거치므로,
     * 클라이언트는 "저장 요청 payload"가 아니라 "실제 저장된 결과"를 기준으로 상태를 맞춘다.
     */
    const persisted = await getGame(gameId);
    if (!persisted) {
      return NextResponse.json({ error: "저장 후 게임을 다시 불러오지 못했습니다." }, { status: 500 });
    }

    return NextResponse.json({ game: persisted });
  } catch (error) {
    console.error(`[PUT /api/games/${gameId}]`, error);
    return NextResponse.json({ error: "게임 수정 실패" }, { status: 500 });
  }
}

/** DELETE /api/games/[gameId] — 게임 삭제 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { gameId } = await params;
  const currentUser = await getRequestMakerUser(request);

  if (!currentUser) {
    return NextResponse.json(
      { error: "제작자 로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const existing = await getGame(gameId);
  if (!existing) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다" }, { status: 404 });
  }

  if (!canDeleteGame(existing, currentUser)) {
    return NextResponse.json(
      { error: "이 게임은 현재 작업자가 삭제할 수 없습니다." },
      { status: 403 }
    );
  }

  const deleted = await deleteGame(gameId);
  if (!deleted) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
