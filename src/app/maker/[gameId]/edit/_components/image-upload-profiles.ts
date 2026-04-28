export type ImageAssetProfile = "cover" | "map" | "round" | "location" | "portrait" | "clue";

interface ImageAssetProfileConfig {
  maxWidth: number;
  maxHeight: number;
  targetBytes: number;
  initialQuality: number;
  minQuality: number;
  previewAspectClassName: string;
  previewImageClassName: string;
}

const PROFILE_CONFIGS: Record<ImageAssetProfile, ImageAssetProfileConfig> = {
  cover: {
    maxWidth: 1600,
    maxHeight: 1000,
    targetBytes: 1_200_000,
    initialQuality: 0.86,
    minQuality: 0.66,
    previewAspectClassName: "aspect-[16/10]",
    previewImageClassName: "object-cover",
  },
  map: {
    maxWidth: 2400,
    maxHeight: 1500,
    targetBytes: 3_000_000,
    initialQuality: 0.9,
    minQuality: 0.72,
    previewAspectClassName: "aspect-[16/9]",
    previewImageClassName: "object-contain",
  },
  round: {
    maxWidth: 1920,
    maxHeight: 1200,
    targetBytes: 1_800_000,
    initialQuality: 0.88,
    minQuality: 0.68,
    previewAspectClassName: "aspect-[16/9]",
    previewImageClassName: "object-contain",
  },
  location: {
    maxWidth: 1600,
    maxHeight: 1200,
    targetBytes: 1_400_000,
    initialQuality: 0.84,
    minQuality: 0.64,
    previewAspectClassName: "aspect-[4/3]",
    previewImageClassName: "object-cover",
  },
  portrait: {
    maxWidth: 1080,
    maxHeight: 1440,
    targetBytes: 900_000,
    initialQuality: 0.86,
    minQuality: 0.68,
    previewAspectClassName: "aspect-[3/4]",
    previewImageClassName: "object-cover object-center",
  },
  clue: {
    maxWidth: 1800,
    maxHeight: 2400,
    targetBytes: 2_400_000,
    initialQuality: 0.9,
    minQuality: 0.74,
    previewAspectClassName: "aspect-[4/5]",
    previewImageClassName: "object-contain",
  },
};

/** 업로드 프로필별 리사이즈/미리보기 규칙을 반환한다. */
export function getImageAssetProfileConfig(profile: ImageAssetProfile): ImageAssetProfileConfig {
  return PROFILE_CONFIGS[profile];
}
