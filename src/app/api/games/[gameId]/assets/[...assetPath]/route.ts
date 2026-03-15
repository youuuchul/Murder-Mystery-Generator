import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getGame } from "@/lib/storage/game-storage";

type Params = { params: Promise<{ gameId: string; assetPath: string[] }> };

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * 요청된 asset 경로가 게임 자산 폴더 바깥으로 벗어나지 않는지 검증한다.
 * 단순 문자열 결합 대신 `path.resolve` 기준으로 traversal을 차단한다.
 */
function resolveAssetPath(gameId: string, assetPath: string[]): string | null {
  const baseDir = path.resolve(process.cwd(), "data", "games", gameId, "assets");
  const targetPath = path.resolve(baseDir, ...assetPath);

  return targetPath.startsWith(baseDir) ? targetPath : null;
}

/** GET /api/games/[gameId]/assets/[...assetPath] — 업로드한 자산 파일 반환 */
export async function GET(_request: Request, { params }: Params) {
  const { gameId, assetPath } = await params;
  const game = getGame(gameId);

  if (!game) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다." }, { status: 404 });
  }

  const absolutePath = resolveAssetPath(gameId, assetPath);
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const buffer = fs.readFileSync(absolutePath);
    const extension = path.extname(absolutePath).toLowerCase();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error(`[GET /api/games/${gameId}/assets/${assetPath.join("/")}]`, error);
    return NextResponse.json({ error: "파일을 읽는 중 오류가 발생했습니다." }, { status: 500 });
  }
}
