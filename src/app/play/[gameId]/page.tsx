import { notFound } from "next/navigation";
import Link from "next/link";
import { getGame } from "@/lib/storage/game-storage";
import { listActiveSessions } from "@/lib/storage/session-storage";
import GMDashboard from "./_components/GMDashboard";

export const dynamic = "force-dynamic";

export default async function PlayPage({
  params,
}: {
  params: { gameId: string };
}) {
  const game = getGame(params.gameId);
  if (!game) notFound();

  const activeSessions = listActiveSessions(params.gameId);
  const currentSession = activeSessions[0] ?? null;

  return (
    <div className="min-h-screen bg-dark-950 text-dark-100">
      <header className="border-b border-dark-800 bg-dark-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/library" className="text-dark-400 hover:text-dark-200 transition-colors text-sm">
            ← 라이브러리
          </Link>
          <span className="text-dark-700">|</span>
          <span className="text-dark-300 text-sm font-medium truncate">{game.title}</span>
          <span className="ml-auto text-xs px-2 py-0.5 rounded border border-dark-700 text-dark-500">GM</span>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-4 sm:p-6">
        <GMDashboard game={game} initialSession={currentSession} />
      </main>
    </div>
  );
}
