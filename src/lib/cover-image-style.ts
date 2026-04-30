import type { CSSProperties } from "react";
import type { CoverImagePosition } from "@/types/game";

export const DEFAULT_COVER_IMAGE_POSITION = {
  x: 50,
  y: 50,
  zoom: 1,
} satisfies Required<CoverImagePosition>;

/**
 * 표지 크롭 렌더링에 필요한 x/y/zoom 기본값을 한 곳에서 맞춘다.
 * 메이커 미리보기, 라이브러리 카드, 공개 상세 화면이 같은 기준으로 잘려야 한다.
 */
export function resolveCoverImagePosition(position?: CoverImagePosition): Required<CoverImagePosition> {
  return {
    x: position?.x ?? DEFAULT_COVER_IMAGE_POSITION.x,
    y: position?.y ?? DEFAULT_COVER_IMAGE_POSITION.y,
    zoom: position?.zoom ?? DEFAULT_COVER_IMAGE_POSITION.zoom,
  };
}

/**
 * object-position과 transform-origin을 같은 지점으로 맞춰 확대 시 크롭 중심이 흔들리지 않게 한다.
 */
export function getCoverImageObjectStyle(position?: CoverImagePosition): CSSProperties {
  const resolved = resolveCoverImagePosition(position);
  return {
    objectPosition: `${resolved.x}% ${resolved.y}%`,
    transform: `scale(${resolved.zoom})`,
    transformOrigin: `${resolved.x}% ${resolved.y}%`,
  };
}
