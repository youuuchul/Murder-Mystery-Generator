export type ImageAssetProfile = "cover" | "map" | "round" | "location" | "portrait" | "clue";

interface ImageAssetProfileConfig {
  maxWidth: number;
  maxHeight: number;
  targetBytes: number;
  initialQuality: number;
  minQuality: number;
  recommendedRatioLabel: string;
  previewAspectClassName: string;
  previewImageClassName: string;
}

const PROFILE_CONFIGS: Record<ImageAssetProfile, ImageAssetProfileConfig> = {
  cover: {
    maxWidth: 1920,
    maxHeight: 1080,
    targetBytes: 2_500_000,
    initialQuality: 0.88,
    minQuality: 0.68,
    recommendedRatioLabel: "권장 16:9",
    previewAspectClassName: "aspect-[16/9]",
    previewImageClassName: "object-cover",
  },
  map: {
    maxWidth: 2560,
    maxHeight: 1600,
    targetBytes: 4_500_000,
    initialQuality: 0.9,
    minQuality: 0.72,
    recommendedRatioLabel: "권장 16:9",
    previewAspectClassName: "aspect-[16/9]",
    previewImageClassName: "object-contain",
  },
  round: {
    maxWidth: 2560,
    maxHeight: 1600,
    targetBytes: 4_500_000,
    initialQuality: 0.9,
    minQuality: 0.72,
    recommendedRatioLabel: "권장 16:9",
    previewAspectClassName: "aspect-[16/9]",
    previewImageClassName: "object-contain",
  },
  location: {
    maxWidth: 1800,
    maxHeight: 1350,
    targetBytes: 3_000_000,
    initialQuality: 0.86,
    minQuality: 0.66,
    recommendedRatioLabel: "권장 4:3",
    previewAspectClassName: "aspect-[4/3]",
    previewImageClassName: "object-cover",
  },
  portrait: {
    maxWidth: 1200,
    maxHeight: 1600,
    targetBytes: 2_000_000,
    initialQuality: 0.88,
    minQuality: 0.7,
    recommendedRatioLabel: "권장 3:4",
    previewAspectClassName: "aspect-[3/4]",
    previewImageClassName: "object-cover object-center",
  },
  clue: {
    maxWidth: 2400,
    maxHeight: 2400,
    targetBytes: 5_000_000,
    initialQuality: 0.92,
    minQuality: 0.76,
    recommendedRatioLabel: "권장 4:5 또는 원본 비율",
    previewAspectClassName: "aspect-[4/5]",
    previewImageClassName: "object-contain",
  },
};

/** 업로드 프로필별 리사이즈/미리보기 규칙을 반환한다. */
export function getImageAssetProfileConfig(profile: ImageAssetProfile): ImageAssetProfileConfig {
  return PROFILE_CONFIGS[profile];
}
