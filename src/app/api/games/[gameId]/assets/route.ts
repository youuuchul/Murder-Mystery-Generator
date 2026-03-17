import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getGame } from "@/lib/storage/game-storage";

type Params = { params: Promise<{ gameId: string }> };
type AssetScope = "covers" | "locations";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * 특정 게임의 에셋 업로드 디렉토리를 만든 뒤 절대 경로를 반환한다.
 * 표지 이미지와 장소 이미지를 같은 API에서 다루되 저장 경로만 분리한다.
 */
function ensureAssetDir(gameId: string, scope: AssetScope): string {
  const dir = path.join(process.cwd(), "data", "games", gameId, "assets", scope);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** 폼데이터의 에셋 분류를 읽어 안전한 저장 경로 이름으로 정규화한다. */
function normalizeAssetScope(value: FormDataEntryValue | null): AssetScope {
  return value === "covers" ? "covers" : "locations";
}

/**
 * MIME 타입을 안전한 파일 확장자로 변환한다.
 * 지원하지 않는 형식은 빈 문자열을 반환해 업로드를 막는다.
 */
function extensionFromMimeType(mimeType: string): string {
  return MIME_EXTENSION_MAP[mimeType] ?? "";
}

/** POST /api/games/[gameId]/assets — 게임 이미지 업로드 */
export async function POST(request: NextRequest, { params }: Params) {
  const { gameId } = await params;
  const game = getGame(gameId);

  if (!game) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const scope = normalizeAssetScope(formData.get("scope"));

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "업로드할 이미지 파일이 필요합니다." }, { status: 400 });
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ error: "이미지는 5MB 이하만 업로드할 수 있습니다." }, { status: 400 });
    }

    const extension = extensionFromMimeType(file.type);
    if (!extension) {
      return NextResponse.json(
        { error: "PNG, JPG, WEBP, GIF 형식만 업로드할 수 있습니다." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const dir = ensureAssetDir(gameId, scope);
    const absolutePath = path.join(dir, filename);

    fs.writeFileSync(absolutePath, buffer);

    return NextResponse.json({
      url: `/api/games/${gameId}/assets/${scope}/${filename}`,
      filename,
    });
  } catch (error) {
    console.error(`[POST /api/games/${gameId}/assets]`, error);
    return NextResponse.json({ error: "이미지 업로드에 실패했습니다." }, { status: 500 });
  }
}
