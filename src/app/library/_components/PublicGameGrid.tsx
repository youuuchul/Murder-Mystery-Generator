import type { GameMetadata } from "@/types/game";
import PublicGameCard from "./PublicGameCard";

interface PublicGameGridProps {
  games: Array<{
    game: GameMetadata;
    ownerDisplayName?: string;
  }>;
}

export default function PublicGameGrid({ games }: PublicGameGridProps) {
  if (games.length === 0) {
    return (
      <div className="rounded-[28px] border border-dark-800 bg-dark-900/70 px-6 py-20 text-center">
        <h3 className="text-2xl font-semibold text-dark-100">아직 공개된 게임이 없습니다</h3>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-dark-400">
          제작자 관리 화면에서 게임을 공개하면 이 라이브러리에 바로 나타납니다.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      {games.map((item) => (
        <PublicGameCard
          key={item.game.id}
          game={item.game}
          ownerDisplayName={item.ownerDisplayName}
        />
      ))}
    </div>
  );
}
