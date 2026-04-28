"use client";

import Image from "next/image";
import { withGameAssetVariant } from "@/lib/game-asset-variant";
import type { CoverImagePosition } from "@/types/game";

interface LibraryCoverProps {
  title: string;
  imageUrl?: string;
  imagePosition?: CoverImagePosition;
}

/**
 * 공개 라이브러리와 관리 화면 카드가 같은 표지 비율과 크롭 기준을 쓰도록 맞춘다.
 * 카드 종류가 달라도 같은 게임이면 최대한 같은 인상으로 보이게 유지한다.
 */
export default function LibraryCover({ title, imageUrl, imagePosition }: LibraryCoverProps) {
  return (
    <div className="relative aspect-[16/10] overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(145,84,108,0.28),transparent_34%),linear-gradient(160deg,rgba(16,16,20,1),rgba(10,10,14,1))]">
      {imageUrl ? (
        <>
          <Image
            src={withGameAssetVariant(imageUrl, "thumb") ?? imageUrl}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="absolute inset-0 h-full w-full object-cover object-center"
            style={{
              objectPosition: `${imagePosition?.x ?? 50}% ${imagePosition?.y ?? 50}%`,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-dark-950/20 to-transparent" />
        </>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(161,113,67,0.2),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(102,40,58,0.18),transparent_30%)]" />
      )}
    </div>
  );
}
