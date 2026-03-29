import { notFound } from "next/navigation";
import Link from "next/link";
import { getGame } from "@/lib/storage/game-storage";
import MakerEditor from "./_components/MakerEditor";

type Props = { params: Promise<{ gameId: string }> };

export default async function EditGamePage({ params }: Props) {
  const { gameId } = await params;
  const game = getGame(gameId);

  if (!game) notFound();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(87,100,91,0.08),transparent_18%),radial-gradient(circle_at_bottom_right,rgba(42,13,18,0.12),transparent_28%),linear-gradient(180deg,rgba(15,9,12,1),rgba(23,15,18,1))]">
      <header className="sticky top-0 z-10 border-b border-dark-700 bg-[rgba(15,9,12,0.88)] backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/library" className="text-dark-400 hover:text-dark-200 transition-colors text-sm">
              ← 라이브러리
            </Link>
            <span className="text-dark-700">|</span>
            <span className="text-dark-200 font-medium text-sm truncate max-w-xs">
              {game.title}
            </span>
          </div>
          <span className="text-xs text-dark-500">
            마지막 수정: {new Date(game.updatedAt).toLocaleDateString("ko-KR")}
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <MakerEditor initialGame={game} />
      </main>
    </div>
  );
}
