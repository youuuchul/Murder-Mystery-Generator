import fs from "fs";
import path from "path";
import {
  createMigrationSupabaseClient,
  parseEnvFile,
} from "./local-data-migration.mjs";

const ROOT_DIR = process.cwd();
const GAMES_DIR = path.join(ROOT_DIR, "data", "games");
const DEFAULT_ASSETS_BUCKET = "game-assets";
const ASSET_CACHE_CONTROL_SECONDS = "31536000";
const MIME_TYPE_BY_EXTENSION = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * 현재 환경설정에서 asset bucket 이름을 읽는다.
 *
 * @returns {string}
 */
export function getLocalAssetMigrationBucketName() {
  const env = parseEnvFile();
  return env.SUPABASE_ASSETS_BUCKET?.trim() || DEFAULT_ASSETS_BUCKET;
}

/**
 * 파일 경로에서 content-type을 추론한다.
 *
 * @param {string} filePath
 * @returns {string}
 */
function inferMimeType(filePath) {
  return MIME_TYPE_BY_EXTENSION[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

/**
 * 로컬 게임 asset 파일 목록을 게임/스코프/파일명 단위로 평탄화한다.
 *
 * @returns {{
 *   gameId: string,
 *   scope: string,
 *   filename: string,
 *   filePath: string,
 *   objectPath: string,
 *   size: number,
 *   contentType: string,
 * }[]}
 */
export function readLocalAssetEntries() {
  if (!fs.existsSync(GAMES_DIR)) {
    return [];
  }

  const assetEntries = [];

  for (const gameId of fs.readdirSync(GAMES_DIR)) {
    const assetsDir = path.join(GAMES_DIR, gameId, "assets");
    if (!fs.existsSync(assetsDir)) {
      continue;
    }

    for (const scope of fs.readdirSync(assetsDir)) {
      const scopeDir = path.join(assetsDir, scope);
      if (!fs.statSync(scopeDir).isDirectory()) {
        continue;
      }

      for (const filename of fs.readdirSync(scopeDir)) {
        const filePath = path.join(scopeDir, filename);
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
          continue;
        }

        assetEntries.push({
          gameId,
          scope,
          filename,
          filePath,
          objectPath: `${gameId}/${scope}/${filename}`,
          size: stat.size,
          contentType: inferMimeType(filePath),
        });
      }
    }
  }

  return assetEntries.sort((left, right) => left.objectPath.localeCompare(right.objectPath));
}

/**
 * 로컬 asset 마이그레이션 dry-run 요약을 만든다.
 *
 * @returns {{
 *   bucketName: string,
 *   assetCount: number,
 *   totalBytes: number,
 *   gameCount: number,
 *   assets: ReturnType<typeof readLocalAssetEntries>,
 * }}
 */
export function buildLocalAssetMigrationPlan() {
  const assets = readLocalAssetEntries();
  const totalBytes = assets.reduce((sum, asset) => sum + asset.size, 0);
  const gameCount = new Set(assets.map((asset) => asset.gameId)).size;

  return {
    bucketName: getLocalAssetMigrationBucketName(),
    assetCount: assets.length,
    totalBytes,
    gameCount,
    assets,
  };
}

/**
 * dry-run 결과를 사람이 읽기 쉬운 텍스트로 정리한다.
 *
 * @param {ReturnType<typeof buildLocalAssetMigrationPlan>} plan
 * @returns {string}
 */
export function formatLocalAssetMigrationPlan(plan) {
  return [
    `bucket: ${plan.bucketName}`,
    `games with assets: ${plan.gameCount}`,
    `asset files: ${plan.assetCount}`,
    `total bytes: ${plan.totalBytes}`,
  ].join("\n");
}

/**
 * service-role client로 game-assets bucket 존재를 보장한다.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} bucketName
 */
async function ensureAssetBucket(supabase, bucketName) {
  const { data, error } = await supabase.storage.getBucket(bucketName);

  if (!data) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: false,
      fileSizeLimit: 15 * 1024 * 1024,
      allowedMimeTypes: Object.values(MIME_TYPE_BY_EXTENSION),
    });

    if (
      createError
      && createError.message.toLowerCase().includes("already exists") === false
    ) {
      throw new Error(`Failed to ensure assets bucket: ${createError.message}`);
    }

    return;
  }

  if (error) {
    throw new Error(`Failed to inspect assets bucket: ${error.message}`);
  }
}

/**
 * dry-run plan을 기준으로 로컬 asset 파일을 Supabase Storage에 복사한다.
 * source local file은 유지하고, storage object만 upsert한다.
 *
 * @param {ReturnType<typeof buildLocalAssetMigrationPlan>} plan
 * @returns {Promise<{
 *   bucketName: string,
 *   uploadedCount: number,
 *   totalBytes: number,
 * }>}
 */
export async function applyLocalAssetMigration(plan) {
  const supabase = createMigrationSupabaseClient();
  await ensureAssetBucket(supabase, plan.bucketName);

  for (const asset of plan.assets) {
    const fileBuffer = fs.readFileSync(asset.filePath);
    const { error } = await supabase.storage.from(plan.bucketName).upload(asset.objectPath, fileBuffer, {
      contentType: asset.contentType,
      cacheControl: ASSET_CACHE_CONTROL_SECONDS,
      upsert: true,
    });

    if (error) {
      throw new Error(`Failed to upload ${asset.objectPath}: ${error.message}`);
    }
  }

  return {
    bucketName: plan.bucketName,
    uploadedCount: plan.assetCount,
    totalBytes: plan.totalBytes,
  };
}
