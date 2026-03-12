"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

interface GameCardProps {
  game: GameMetadata;
}

export default function GameCard({ game }: GameCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`"${game.title}"을(를) 삭제할까요?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/games/${game.id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } catch (err) {
      console.error("삭제 실패:", err);
    } finally {
      setDeleting(false);
    }
  }
  const diff = game.settings.difficulty;
  const tags = game.settings.tags ?? [];

  return (
    <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden hover:border-mystery-700 hover:shadow-lg hover:shadow-mystery-900/20 transition-all duration-200 group">
      {/* 썸네일 영역 */}
      <div className="h-32 bg-gradient-to-br from-mystery-950 via-dark-800 to-dark-900 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-mystery-600 to-transparent" />
        <span className="text-4xl select-none" aria-hidden="true">
          🔍
        </span>
      </div>

      {/* 콘텐츠 */}
      <div className="p-4 space-y-3">
        <h3 className="font-semibold text-dark-50 text-base leading-tight line-clamp-2 group-hover:text-mystery-300 transition-colors">
          {game.title}
        </h3>

        {/* 배지 */}
        <div className="flex flex-wrap gap-1.5">
          <span
            className={`text-xs px-2 py-0.5 rounded-full border font-medium ${difficultyColor[diff] ?? "text-dark-400 bg-dark-800 border-dark-600"}`}
          >
            {difficultyLabel[diff] ?? diff}
          </span>
          {tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded-full border text-dark-300 bg-dark-800 border-dark-600">
              #{tag}
            </span>
          ))}
        </div>

        {/* 통계 */}
        <div className="flex items-center gap-3 text-xs text-dark-400">
          <span title="인원 수">👥 {game.settings.playerCount}인</span>
          <span title="소요 시간">⏱ {game.settings.estimatedDuration}분</span>
          <span title="플레이어">🎭 {game.playerCount}명</span>
          <span title="단서 수">🗝 {game.clueCount}개</span>
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2 pt-1">
          <Link
            href={`/maker/${game.id}/edit`}
            className="flex-1 text-center text-xs py-1.5 px-3 rounded bg-dark-800 hover:bg-dark-700 text-dark-200 hover:text-dark-50 border border-dark-600 transition-colors"
          >
            편집
          </Link>
          <Link
            href={`/play/${game.id}`}
            className="flex-1 text-center text-xs py-1.5 px-3 rounded bg-mystery-700 hover:bg-mystery-600 text-white border border-mystery-600 transition-colors"
          >
            플레이
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs py-1.5 px-2 rounded border border-dark-700 text-dark-500 hover:text-red-400 hover:border-red-800 transition-colors disabled:opacity-50"
            title="삭제"
          >
            {deleting ? "…" : "🗑"}
          </button>
        </div>
      </div>
    </div>
  );
}
