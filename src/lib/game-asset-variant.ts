export const GAME_ASSET_VARIANTS = ["thumb", "display", "large"] as const;

export type GameAssetVariant = typeof GAME_ASSET_VARIANTS[number];

const VARIANT_SUFFIX_PATTERN = /\.(thumb|display|large)$/;

/** 문자열이 지원하는 이미지 파생본 이름인지 확인한다. */
export function isGameAssetVariant(value: string | null): value is GameAssetVariant {
  return value === "thumb" || value === "display" || value === "large";
}

/** 원본 파일명 stem에 variant suffix를 붙인 WEBP 파일명을 만든다. */
export function buildGameAssetVariantFilename(filename: string, variant: GameAssetVariant): string {
  const dotIndex = filename.lastIndexOf(".");
  const stem = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
  const normalizedStem = stem.replace(VARIANT_SUFFIX_PATTERN, "");
  return `${normalizedStem}.${variant}.webp`;
}

/** asset path의 마지막 파일명을 variant 파일명으로 바꾼다. */
export function buildGameAssetVariantPath(assetPath: string[], variant: GameAssetVariant): string[] {
  if (assetPath.length === 0) {
    return assetPath;
  }

  const nextPath = [...assetPath];
  const filename = nextPath[nextPath.length - 1];
  nextPath[nextPath.length - 1] = buildGameAssetVariantFilename(filename, variant);
  return nextPath;
}

/**
 * 내부 게임 asset URL에 variant query를 붙인다.
 * 외부 이미지 URL은 그대로 유지해 직접 링크 입력 케이스를 깨지 않게 한다.
 */
export function withGameAssetVariant(url: string | undefined, variant: GameAssetVariant): string | undefined {
  if (!url || !url.startsWith("/api/games/") || !url.includes("/assets/")) {
    return url;
  }

  const [pathAndQuery, hash = ""] = url.split("#", 2);
  const [pathname, query = ""] = pathAndQuery.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("variant", variant);
  const nextQuery = params.toString();

  return `${pathname}${nextQuery ? `?${nextQuery}` : ""}${hash ? `#${hash}` : ""}`;
}
