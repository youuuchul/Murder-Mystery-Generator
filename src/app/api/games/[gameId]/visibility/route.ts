import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveEditableGameForUser } from "@/lib/game-access";
import { getGamePublishReadiness, getGamePublishReadinessIssues } from "@/lib/game-publish";
import { getRequestMakerUser } from "@/lib/maker-user.server";
import { getGame, saveGame } from "@/lib/storage/game-storage";
import type { GameVisibility } from "@/types/game";

type Params = { params: Promise<{ gameId: string }> };

const UpdateVisibilitySchema = z.object({
  visibility: z.enum(["draft", "private", "public"]),
});

/** PATCH /api/games/[gameId]/visibility — 공개 상태 변경 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const currentUser = await getRequestMakerUser(request);

  if (!currentUser) {
    return NextResponse.json(
      { error: "제작자 로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const { gameId } = await params;
  const game = getGame(gameId);
  if (!game) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다." }, { status: 404 });
  }

  const editableGame = resolveEditableGameForUser(game, currentUser.id);
  if (!editableGame) {
    return NextResponse.json(
      { error: "이 게임의 공개 상태를 변경할 권한이 없습니다." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdateVisibilitySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "공개 상태 값이 올바르지 않습니다." }, { status: 400 });
  }

  const nextVisibility = parsed.data.visibility as GameVisibility;
  if (nextVisibility === "public") {
    const readiness = getGamePublishReadiness(editableGame.game);
    const issues = getGamePublishReadinessIssues(editableGame.game);

    if (issues.length > 0) {
      return NextResponse.json(
        {
          error: `공개 전 확인이 필요합니다. ${issues[0]}`,
          issues,
          checklist: readiness.checklist,
        },
        { status: 422 }
      );
    }
  }

  const nextGame = {
    ...editableGame.game,
    updatedAt: new Date().toISOString(),
    access: {
      ...editableGame.game.access,
      visibility: nextVisibility,
      publishedAt: nextVisibility === "public"
        ? editableGame.game.access.publishedAt ?? new Date().toISOString()
        : undefined,
    },
  };

  saveGame(nextGame);
  return NextResponse.json({ game: nextGame });
}
