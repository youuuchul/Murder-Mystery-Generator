import { NextResponse } from "next/server";
import { readGameAsset } from "@/lib/game-asset-storage";
import {
  buildGameAssetVariantPath,
  isGameAssetVariant,
} from "@/lib/game-asset-variant";

type Params = { params: Promise<{ gameId: string; assetPath: string[] }> };

/** GET /api/games/[gameId]/assets/[...assetPath] — 업로드한 자산 파일 반환 */
export async function GET(request: Request, { params }: Params) {
  const { gameId, assetPath } = await params;
  const url = new URL(request.url);
  const variant = url.searchParams.get("variant");
  const asset = isGameAssetVariant(variant)
    ? await readGameAsset(gameId, buildGameAssetVariantPath(assetPath, variant))
      ?? await readGameAsset(gameId, assetPath)
    : await readGameAsset(gameId, assetPath);

  if (!asset) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    return new NextResponse(new Uint8Array(asset.buffer), {
      headers: {
        "Content-Type": asset.contentType,
        "Cache-Control": asset.cacheControl,
      },
    });
  } catch (error) {
    console.error(`[GET /api/games/${gameId}/assets/${assetPath.join("/")}]`, error);
    return NextResponse.json({ error: "파일을 읽는 중 오류가 발생했습니다." }, { status: 500 });
  }
}
