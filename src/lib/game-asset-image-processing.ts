import sharp from "sharp";
import {
  buildGameAssetVariantFilename,
  type GameAssetVariant,
} from "@/lib/game-asset-variant";
import type { GameAssetScope } from "@/lib/game-asset-storage";

export interface GeneratedGameAssetVariant {
  variant: GameAssetVariant;
  filename: string;
  contentType: "image/webp";
  buffer: Buffer;
}

interface VariantConfig {
  maxWidth: number;
  maxHeight: number;
  quality: number;
}

const DEFAULT_VARIANT_CONFIGS: Record<GameAssetVariant, VariantConfig> = {
  thumb: { maxWidth: 480, maxHeight: 480, quality: 74 },
  display: { maxWidth: 1280, maxHeight: 1280, quality: 78 },
  large: { maxWidth: 2048, maxHeight: 2048, quality: 82 },
};

const SCOPE_VARIANT_CONFIGS: Partial<Record<GameAssetScope, Partial<Record<GameAssetVariant, VariantConfig>>>> = {
  covers: {
    thumb: { maxWidth: 560, maxHeight: 360, quality: 74 },
    display: { maxWidth: 1280, maxHeight: 800, quality: 78 },
    large: { maxWidth: 1600, maxHeight: 1000, quality: 82 },
  },
  players: {
    thumb: { maxWidth: 320, maxHeight: 420, quality: 74 },
    display: { maxWidth: 720, maxHeight: 960, quality: 78 },
    large: { maxWidth: 1280, maxHeight: 1700, quality: 82 },
  },
  clues: {
    thumb: { maxWidth: 360, maxHeight: 480, quality: 74 },
    display: { maxWidth: 960, maxHeight: 1280, quality: 78 },
    large: { maxWidth: 1800, maxHeight: 2400, quality: 84 },
  },
  locations: {
    thumb: { maxWidth: 480, maxHeight: 360, quality: 74 },
    display: { maxWidth: 1280, maxHeight: 960, quality: 78 },
    large: { maxWidth: 1600, maxHeight: 1200, quality: 82 },
  },
  rounds: {
    thumb: { maxWidth: 480, maxHeight: 300, quality: 74 },
    display: { maxWidth: 1280, maxHeight: 800, quality: 78 },
    large: { maxWidth: 1920, maxHeight: 1200, quality: 82 },
  },
  story: {
    thumb: { maxWidth: 480, maxHeight: 480, quality: 74 },
    display: { maxWidth: 1280, maxHeight: 1280, quality: 78 },
    large: { maxWidth: 2048, maxHeight: 2048, quality: 82 },
  },
};

/** scope별 이미지 파생본 생성 규칙을 반환한다. */
function getVariantConfig(scope: GameAssetScope, variant: GameAssetVariant): VariantConfig {
  return SCOPE_VARIANT_CONFIGS[scope]?.[variant] ?? DEFAULT_VARIANT_CONFIGS[variant];
}

/**
 * 업로드된 이미지에서 화면별 파생본을 만든다.
 * 원본보다 커지는 결과는 저장하지 않아 Supabase Storage와 네트워크 비용을 줄인다.
 */
export async function generateGameAssetVariants(input: {
  scope: GameAssetScope;
  filename: string;
  contentType: string;
  buffer: Buffer;
}): Promise<GeneratedGameAssetVariant[]> {
  if (!input.contentType.startsWith("image/") || input.contentType === "image/gif") {
    return [];
  }

  const variants: GeneratedGameAssetVariant[] = [];
  const metadata = await sharp(input.buffer, { failOn: "none" }).metadata();
  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  if (originalWidth <= 0 || originalHeight <= 0) {
    return [];
  }

  for (const variant of ["thumb", "display", "large"] as const) {
    const config = getVariantConfig(input.scope, variant);
    const resized = originalWidth > config.maxWidth || originalHeight > config.maxHeight;
    const buffer = await sharp(input.buffer, { failOn: "none" })
      .rotate()
      .resize({
        width: config.maxWidth,
        height: config.maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: config.quality, effort: 4 })
      .toBuffer();

    if (buffer.length >= input.buffer.length && !resized) {
      continue;
    }

    if (buffer.length > input.buffer.length) {
      continue;
    }

    variants.push({
      variant,
      filename: buildGameAssetVariantFilename(input.filename, variant),
      contentType: "image/webp",
      buffer,
    });
  }

  return variants;
}
