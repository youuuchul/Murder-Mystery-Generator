import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getGameOwnershipState,
  isClaimableLegacyGame,
  isGameOwner,
  reassignGameOwnership,
} from "@/lib/game-access";
import { resolveMakerIdentityTarget } from "@/lib/maker-identity";
import { getRequestMakerUser } from "@/lib/maker-user.server";
import { getGame, saveGame } from "@/lib/storage/game-storage";

type Params = { params: Promise<{ gameId: string }> };

const UpdateGameOwnerSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("claim"),
  }),
  z.object({
    action: z.literal("transfer"),
    target: z.string().trim().min(1, "이관 대상이 필요합니다."),
  }),
]);

/** PATCH /api/games/[gameId]/owner — 귀속 또는 소유권 이관 */
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

  const body = await request.json().catch(() => null);
  const parsed = UpdateGameOwnerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "소유권 변경 요청 값이 올바르지 않습니다." }, { status: 400 });
  }

  if (parsed.data.action === "claim") {
    const ownershipState = getGameOwnershipState(game, currentUser.id);

    if (ownershipState === "readonly") {
      return NextResponse.json(
        { error: "이 게임은 현재 작업자가 귀속할 수 없습니다." },
        { status: 403 }
      );
    }

    if (!isClaimableLegacyGame(game)) {
      return NextResponse.json({
        game,
        owner: {
          id: game.access.ownerId,
          claimedBy: currentUser.displayName,
        },
      });
    }

    const nextGame = reassignGameOwnership(game, currentUser.id);
    saveGame(nextGame);

    return NextResponse.json({
      game: nextGame,
      owner: {
        id: currentUser.id,
        claimedBy: currentUser.displayName,
      },
    });
  }

  if (!isGameOwner(game, currentUser.id)) {
    return NextResponse.json(
      { error: "현재 소유자만 다른 작업자에게 이관할 수 있습니다." },
      { status: 403 }
    );
  }

  const targetIdentity = await resolveMakerIdentityTarget(parsed.data.target);
  if (!targetIdentity) {
    return NextResponse.json(
      { error: "로그인 ID 또는 작업자 키를 다시 확인하세요." },
      { status: 404 }
    );
  }

  if (targetIdentity.id === currentUser.id) {
    return NextResponse.json(
      { error: "현재 작업자 자신에게 다시 이관할 수 없습니다." },
      { status: 400 }
    );
  }

  const nextGame = reassignGameOwnership(game, targetIdentity.id);
  saveGame(nextGame);

  return NextResponse.json({
    game: nextGame,
    owner: {
      id: targetIdentity.id,
      displayName: targetIdentity.displayName,
      matchType: targetIdentity.matchType,
    },
  });
}
