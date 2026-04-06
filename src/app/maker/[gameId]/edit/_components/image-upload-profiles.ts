export type ImageAssetProfile = "cover" | "map" | "round" | "location" | "portrait" | "clue";

interface ImageAssetProfileConfig {
  maxWidth: number;
  maxHeight: number;
  targetBytes: number;
  initialQuality: number;
  minQuality: number;
  recommendedRatioLabel: string;
  recommendedDimensionsLabel: string;
  outputHintLabel: string;
  cropHint?: string;
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
    recommendedRatioLabel: "권장 16:10",
    recommendedDimensionsLabel: "권장 1600×1000 이상",
    outputHintLabel: "업로드 시 WEBP · 약 1.2MB 이하",
    cropHint: "라이브러리 카드에서는 중앙 기준 16:10으로 잘려 보일 수 있습니다.",
    previewAspectClassName: "aspect-[16/10]",
    previewImageClassName: "object-cover",
  },
  map: {
    maxWidth: 2400,
    maxHeight: 1500,
    targetBytes: 3_000_000,
    initialQuality: 0.9,
    minQuality: 0.72,
    recommendedRatioLabel: "권장 16:9",
    recommendedDimensionsLabel: "권장 1920×1080 이상",
    outputHintLabel: "업로드 시 WEBP · 약 3MB 이하",
    previewAspectClassName: "aspect-[16/9]",
    previewImageClassName: "object-contain",
  },
  round: {
    maxWidth: 1920,
    maxHeight: 1200,
    targetBytes: 1_800_000,
    initialQuality: 0.88,
    minQuality: 0.68,
    recommendedRatioLabel: "권장 16:9",
    recommendedDimensionsLabel: "권장 1920×1080 이상",
    outputHintLabel: "업로드 시 WEBP · 약 1.8MB 이하",
    previewAspectClassName: "aspect-[16/9]",
    previewImageClassName: "object-contain",
  },
  location: {
    maxWidth: 1600,
    maxHeight: 1200,
    targetBytes: 1_400_000,
    initialQuality: 0.84,
    minQuality: 0.64,
    recommendedRatioLabel: "권장 4:3",
    recommendedDimensionsLabel: "권장 1600×1200 이상",
    outputHintLabel: "업로드 시 WEBP · 약 1.4MB 이하",
    previewAspectClassName: "aspect-[4/3]",
    previewImageClassName: "object-cover",
  },
  portrait: {
    maxWidth: 1080,
    maxHeight: 1440,
    targetBytes: 900_000,
    initialQuality: 0.86,
    minQuality: 0.68,
    recommendedRatioLabel: "권장 3:4",
    recommendedDimensionsLabel: "권장 1080×1440 이상",
    outputHintLabel: "업로드 시 WEBP · 약 900KB 이하",
    previewAspectClassName: "aspect-[3/4]",
    previewImageClassName: "object-cover object-center",
  },
  clue: {
    maxWidth: 1800,
    maxHeight: 2400,
    targetBytes: 2_400_000,
    initialQuality: 0.9,
    minQuality: 0.74,
    recommendedRatioLabel: "권장 4:5 또는 원본 비율",
    recommendedDimensionsLabel: "권장 1500×2000 이상",
    outputHintLabel: "업로드 시 WEBP · 약 2.4MB 이하",
    cropHint: "문서형 단서는 글자가 너무 작아지지 않도록 여백 포함 원본을 권장합니다.",
    previewAspectClassName: "aspect-[4/5]",
    previewImageClassName: "object-contain",
  },
};

/** 업로드 프로필별 리사이즈/미리보기 규칙을 반환한다. */
export function getImageAssetProfileConfig(profile: ImageAssetProfile): ImageAssetProfileConfig {
  return PROFILE_CONFIGS[profile];
}
