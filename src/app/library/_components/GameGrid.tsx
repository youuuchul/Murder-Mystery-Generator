import type { GameMetadata } from "@/types/game";
import type { GameOwnershipState } from "@/lib/game-access";
import GameCard from "./GameCard";

export interface GameGridItem {
  game: GameMetadata;
  canEdit: boolean;
  canDelete: boolean;
  canPlay: boolean;
  ownershipState: GameOwnershipState;
  ownerDisplayName?: string;
}

interface GameGridProps {
  games: GameGridItem[];
  isAdminViewer?: boolean;
}

export default function GameGrid({ games, isAdminViewer = false }: GameGridProps) {
  if (games.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h3 className="text-xl font-semibold text-dark-300 mb-2">
          아직 만든 게임이 없습니다
        </h3>
        <p className="text-dark-500 text-sm max-w-xs">
          새 게임 만들기 버튼을 눌러 첫 번째 머더미스터리 시나리오를 제작해보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {games.map((item) => (
        <GameCard
          key={item.game.id}
          game={item.game}
          canEdit={item.canEdit}
          canDelete={item.canDelete}
          canPlay={item.canPlay}
          ownershipState={item.ownershipState}
          ownerDisplayName={item.ownerDisplayName}
          isAdminViewer={isAdminViewer}
        />
      ))}
    </div>
  );
}
