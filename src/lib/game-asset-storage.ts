import path from "path";
import { createSupabasePersistenceClient } from "@/lib/supabase/persistence";

export const GAME_ASSET_SCOPES = [
  "covers",
  "locations",
  "story",
  "players",
  "clues",
  "rounds",
] as const;

export type GameAssetScope = typeof GAME_ASSET_SCOPES[number];

export const GAME_ASSET_MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
export const GAME_ASSET_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export const GAME_ASSET_CACHE_CONTROL =
  "public, max-age=31536000, s-maxage=31536000, immutable";

const DEFAULT_GAME_ASSETS_BUCKET = "game-assets";
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export interface UploadGameAssetInput {
  gameId: string;
  scope: GameAssetScope;
  filename: string;
  contentType: string;
  buffer: Buffer;
}

export interface UploadedGameAsset {
  filename: string;
  url: string;
}

export interface ReadGameAssetResult {
  buffer: Buffer;
  contentType: string;
  cacheControl: string;
}

let ensuredBucketName: string | null = null;

/**
 * 게임 자산에 사용할 Supabase Storage bucket 이름을 읽는다.
 * 미설정 시 기본 bucket 이름을 사용해 로컬/배포 환경 설정을 단순하게 유지한다.
 */
export function getGameAssetsBucketName(): string {
  return process.env.SUPABASE_ASSETS_BUCKET?.trim() || DEFAULT_GAME_ASSETS_BUCKET;
}

/**
 * 내부 자산 라우트 URL을 만든다.
 * 저장 backend가 local 이든 supabase 이든 game JSON에는 같은 URL 형식을 기록한다.
 */
export function buildGameAssetUrl(
  gameId: string,
  scope: GameAssetScope,
  filename: string
): string {
  return `/api/games/${gameId}/assets/${scope}/${filename}`;
}

/**
 * 문자열이 허용된 asset scope인지 검사한다.
 */
export function isGameAssetScope(value: string): value is GameAssetScope {
  return (GAME_ASSET_SCOPES as readonly string[]).includes(value);
}

/**
 * GET 라우트에서 받은 path segment를 검증한 뒤 storage object path로 정규화한다.
 * `..` 같은 traversal 입력은 local/supabase 구현 모두에서 동일하게 거부한다.
 */
export function buildGameAssetObjectPath(gameId: string, assetPath: string[]): string | null {
  const normalizedGameId = gameId.trim();
  if (!normalizedGameId) {
    return null;
  }

  const normalizedSegments = assetPath
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (
    normalizedSegments.length === 0
    || normalizedSegments.some((segment) => segment === "." || segment === ".." || segment.includes("/"))
  ) {
    return null;
  }

  return [normalizedGameId, ...normalizedSegments].join("/");
}

/**
 * 업로드 대상의 storage object path를 만든다.
 */
export function buildGameAssetUploadPath(
  gameId: string,
  scope: GameAssetScope,
  filename: string
): string {
  return `${gameId.trim()}/${scope}/${filename}`;
}

/**
 * 로컬 파일 확장자에서 content-type을 추론한다.
 * storage metadata가 비어 있거나 legacy local file fallback을 읽을 때 사용한다.
 */
export function inferGameAssetContentType(filename: string): string {
  return CONTENT_TYPE_BY_EXTENSION[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}

/**
 * 서버 전용 secret key client로 game-assets bucket 존재를 보장한다.
 * 업로드 전 한 번만 확인해 Vercel cold start마다 중복 생성 요청을 줄인다.
 */
async function ensureSupabaseAssetsBucket(): Promise<string> {
  const bucketName = getGameAssetsBucketName();
  if (ensuredBucketName === bucketName) {
    return bucketName;
  }

  const supabase = createSupabasePersistenceClient();
  const { data } = await supabase.storage.getBucket(bucketName);

  if (data) {
    ensuredBucketName = bucketName;
    return bucketName;
  }

  const { error: createError } = await supabase.storage.createBucket(bucketName, {
    public: false,
    fileSizeLimit: GAME_ASSET_MAX_FILE_SIZE_BYTES,
    allowedMimeTypes: [...GAME_ASSET_ALLOWED_MIME_TYPES],
  });

  if (
    createError
    && createError.message.toLowerCase().includes("already exists") === false
  ) {
    throw new Error(`Failed to ensure Supabase assets bucket: ${createError.message}`);
  }

  ensuredBucketName = bucketName;
  return bucketName;
}

/**
 * Supabase Storage에 게임 자산을 저장한다.
 * game JSON에는 내부 API URL만 기록해 provider 전환과 레거시 데이터 호환을 유지한다.
 */
async function uploadSupabaseGameAsset(input: UploadGameAssetInput): Promise<UploadedGameAsset> {
  const bucketName = await ensureSupabaseAssetsBucket();
  const supabase = createSupabasePersistenceClient();
  const objectPath = buildGameAssetUploadPath(input.gameId, input.scope, input.filename);
  const { error } = await supabase.storage.from(bucketName).upload(objectPath, input.buffer, {
    contentType: input.contentType,
    cacheControl: "31536000",
    upsert: false,
  });

  if (error) {
    throw new Error(`Failed to upload asset to Supabase Storage: ${error.message}`);
  }

  return {
    filename: input.filename,
    url: buildGameAssetUrl(input.gameId, input.scope, input.filename),
  };
}

/**
 * Supabase Storage에서 자산 파일을 읽는다.
 */
async function readSupabaseGameAsset(
  gameId: string,
  assetPath: string[]
): Promise<ReadGameAssetResult | null> {
  const objectPath = buildGameAssetObjectPath(gameId, assetPath);
  if (!objectPath) {
    return null;
  }

  const supabase = createSupabasePersistenceClient();
  const bucketName = getGameAssetsBucketName();
  const { data, error } = await supabase.storage.from(bucketName).download(objectPath);

  if (error || !data) {
    return null;
  }

  return {
    buffer: Buffer.from(await data.arrayBuffer()),
    contentType: data.type || inferGameAssetContentType(assetPath[assetPath.length - 1] ?? ""),
    cacheControl: GAME_ASSET_CACHE_CONTROL,
  };
}

/**
 * Supabase bucket 아래 gameId prefix 전체를 재귀적으로 순회해 삭제 대상 object path를 모은다.
 */
async function collectSupabaseAssetPaths(prefix: string): Promise<string[]> {
  const supabase = createSupabasePersistenceClient();
  const bucketName = getGameAssetsBucketName();
  const queue = [prefix];
  const objectPaths: string[] = [];

  while (queue.length > 0) {
    const currentPrefix = queue.shift();
    if (!currentPrefix) {
      continue;
    }

    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage.from(bucketName).list(currentPrefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) {
        throw new Error(`Failed to list Supabase assets: ${error.message}`);
      }

      const entries = data ?? [];
      for (const entry of entries) {
        const nextPath = `${currentPrefix}/${entry.name}`;
        if (entry.id) {
          objectPaths.push(nextPath);
        } else {
          queue.push(nextPath);
        }
      }

      if (entries.length < 100) {
        break;
      }

      offset += entries.length;
    }
  }

  return objectPaths;
}

/**
 * 배열을 Storage remove batch 크기에 맞게 나눈다.
 */
function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

/**
 * Supabase Storage에서 특정 게임의 asset prefix 전체를 삭제한다.
 */
async function deleteSupabaseGameAssets(gameId: string): Promise<boolean> {
  const normalizedGameId = gameId.trim();
  if (!normalizedGameId) {
    return false;
  }

  const bucketName = getGameAssetsBucketName();
  const supabase = createSupabasePersistenceClient();
  const objectPaths = await collectSupabaseAssetPaths(normalizedGameId);

  if (objectPaths.length === 0) {
    return false;
  }

  for (const batch of chunkValues(objectPaths, 100)) {
    const { error } = await supabase.storage.from(bucketName).remove(batch);
    if (error) {
      throw new Error(`Failed to delete Supabase assets: ${error.message}`);
    }
  }

  return true;
}

export async function uploadGameAsset(input: UploadGameAssetInput): Promise<UploadedGameAsset> {
  return uploadSupabaseGameAsset(input);
}

export async function readGameAsset(
  gameId: string,
  assetPath: string[]
): Promise<ReadGameAssetResult | null> {
  return readSupabaseGameAsset(gameId, assetPath);
}

export async function deleteGameAssets(gameId: string): Promise<boolean> {
  return deleteSupabaseGameAssets(gameId);
}
