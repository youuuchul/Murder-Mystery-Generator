import Link from "next/link";
import { listGames } from "@/lib/storage/game-storage";
import GameGrid from "./_components/GameGrid";

export const dynamic = "force-dynamic"; // 항상 서버에서 최신 목록 렌더링

export default function LibraryPage() {
  const games = listGames();

  return (
    <div className="min-h-screen bg-dark-950">
      {/* 헤더 */}
      <header className="border-b border-dark-800 bg-dark-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-dark-50">
              Murder Mystery
            </h1>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              href="/rulebook"
              className="text-sm text-dark-400 hover:text-dark-100 px-3 py-1.5 transition-colors"
            >
              룰북
            </Link>
            <Link
              href="/maker/new"
              className="text-sm bg-mystery-700 hover:bg-mystery-600 text-white px-4 py-1.5 rounded-md border border-mystery-600 transition-colors"
            >
              + 새 게임 만들기
            </Link>
          </nav>
        </div>
      </header>

      {/* 메인 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-dark-50">게임 라이브러리</h2>
            <p className="text-sm text-dark-500 mt-1">
              {games.length > 0
                ? `${games.length}개의 시나리오`
                : "제작된 시나리오가 없습니다"}
            </p>
          </div>
        </div>

        <GameGrid games={games} />
      </main>
    </div>
  );
}
