"use client";

import Link from "next/link";
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
}

export default function PublicGameCard({ game }: PublicGameCardProps) {
  const diff = game.settings.difficulty;
  const tags = game.settings.tags ?? [];

  return (
    <div className="group overflow-hidden rounded-[24px] border border-dark-800 bg-[linear-gradient(180deg,rgba(18,18,22,0.96),rgba(12,12,16,0.98))] transition-all duration-200 hover:-translate-y-0.5 hover:border-mystery-700 hover:shadow-[0_18px_48px_rgba(52,24,44,0.32)]">
      <div className="relative h-56 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(145,84,108,0.28),transparent_34%),linear-gradient(160deg,rgba(16,16,20,1),rgba(10,10,14,1))] sm:h-64">
        {game.settings.coverImageUrl ? (
          <>
            <img
              src={game.settings.coverImageUrl}
              alt={game.title}
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-dark-950/20 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(161,113,67,0.2),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(102,40,58,0.18),transparent_30%)]" />
        )}
      </div>

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
          {tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full border border-dark-700 bg-dark-900 px-2 py-0.5 text-dark-300">
              #{tag}
            </span>
          ))}
        </div>

        <Link
          href={`/play/${game.id}`}
          className="inline-flex w-full items-center justify-center rounded-xl border border-mystery-600 bg-mystery-700 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-mystery-600"
        >
          게임 시작하기
        </Link>
      </div>
    </div>
  );
}
