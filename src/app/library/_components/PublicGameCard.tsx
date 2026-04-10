"use client";

import Link from "next/link";
import LibraryCover from "@/app/library/_components/LibraryCover";
import type { GameMetadata } from "@/types/game";

const difficultyLabel: Record<string, string> = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
};

const difficultyColor: Record<string, string> = {
  easy: "text-green-400 bg-green-900/30 border-green-800",
  normal: "text-yellow-400 bg-yellow-900/30 border-yellow-800",
  hard: "text-red-400 bg-red-900/30 border-red-800",
};

interface PublicGameCardProps {
  game: GameMetadata;
  ownerDisplayName?: string;
}

export default function PublicGameCard({ game, ownerDisplayName }: PublicGameCardProps) {
  const diff = game.settings.difficulty;
  const tags = game.settings.tags ?? [];

  return (
    <div className="group overflow-hidden rounded-[24px] border border-dark-800 bg-[linear-gradient(180deg,rgba(18,18,22,0.96),rgba(12,12,16,0.98))] transition-all duration-200 hover:-translate-y-0.5 hover:border-mystery-700 hover:shadow-[0_18px_48px_rgba(52,24,44,0.32)]">
      <LibraryCover
        title={game.title}
        imageUrl={game.settings.coverImageUrl}
        imagePosition={game.settings.coverImagePosition}
      />

      <div className="space-y-4 p-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${difficultyColor[diff] ?? "text-dark-300 bg-dark-800 border-dark-700"}`}
            >
              {difficultyLabel[diff] ?? diff}
            </span>
          </div>
          <h3 className="text-lg font-semibold leading-tight text-dark-50 transition-colors group-hover:text-mystery-300">
            {game.title}
          </h3>
          <p className="min-h-[3.75rem] text-sm leading-6 text-dark-300">
            {game.settings.summary?.trim() || "공개 소개글이 아직 없습니다."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-dark-400">
          <span>인원 {game.settings.playerCount}인</span>
          <span>시간 {game.settings.estimatedDuration}분</span>
          {ownerDisplayName ? <span>제작자 : {ownerDisplayName}</span> : null}
        </div>

        {tags.length > 0 && (
          <TagBadges tags={tags} max={10} visibleMax={5} />
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            href={`/play/${game.id}`}
            className="inline-flex items-center justify-center rounded-xl border border-mystery-600 bg-mystery-700 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-mystery-600"
          >
            GM으로 진행
          </Link>
          <Link
            href={`/play/${game.id}/join`}
            className="inline-flex items-center justify-center rounded-xl border border-dark-700 bg-dark-900 px-4 py-3 text-sm font-medium text-dark-100 transition-colors hover:border-dark-500 hover:bg-dark-800"
          >
            플레이어 참여
          </Link>
        </div>
      </div>
    </div>
  );
}

function TagBadges({ tags, max, visibleMax }: { tags: string[]; max: number; visibleMax: number }) {
  const capped = tags.slice(0, max);
  const visible = capped.slice(0, visibleMax);
  const hiddenCount = capped.length - visible.length;

  return (
    <div className="group/tags relative flex flex-wrap gap-1.5 text-xs">
      {visible.map((tag) => (
        <span key={tag} className="rounded-full border border-dark-700 bg-dark-900 px-2 py-0.5 text-dark-300">
          #{tag}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="rounded-full border border-dark-700 bg-dark-900 px-2 py-0.5 text-dark-500 cursor-default">
          +{hiddenCount}
        </span>
      )}
      {hiddenCount > 0 && (
        <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden flex-wrap gap-1.5 rounded-xl border border-dark-700 bg-dark-900 p-2 shadow-lg group-hover/tags:flex">
          {capped.slice(visibleMax).map((tag) => (
            <span key={tag} className="rounded-full border border-dark-700 bg-dark-800 px-2 py-0.5 text-dark-300">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
