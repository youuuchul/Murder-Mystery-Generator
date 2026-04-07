import { notFound } from "next/navigation";
import Link from "next/link";
import { resolveEditableGameForUser } from "@/lib/game-access";
import { getGameContentSourceStatus } from "@/lib/game-content-integrity";
import { getGame, saveGame } from "@/lib/game-repository";
import { requireCurrentMakerUser } from "@/lib/maker-user.server";
import MakerEditor from "./_components/MakerEditor";

type Props = { params: Promise<{ gameId: string }> };

export default async function EditGamePage({ params }: Props) {
  const { gameId } = await params;
  const currentUser = await requireCurrentMakerUser(`/maker/${gameId}/edit`);
  const game = await getGame(gameId);

  if (!game) notFound();

  const editableGame = resolveEditableGameForUser(game, currentUser);
  if (!editableGame) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(87,100,91,0.08),transparent_18%),radial-gradient(circle_at_bottom_right,rgba(42,13,18,0.12),transparent_28%),linear-gradient(180deg,rgba(15,9,12,1),rgba(23,15,18,1))] px-4 py-12 text-dark-50">
        <div className="mx-auto max-w-2xl rounded-3xl border border-dark-800 bg-dark-900/90 p-8 shadow-2xl">
          <p className="text-xs uppercase tracking-[0.24em] text-amber-300/80">Access</p>
          <h1 className="mt-3 text-2xl font-semibold">편집 권한이 없는 게임입니다</h1>
          <p className="mt-3 text-sm leading-6 text-dark-400">
            현재 작업자 세션은 이 게임의 소유자가 아닙니다. 라이브러리로 돌아가
            다른 게임을 선택하거나, 소유자 계정으로 다시 로그인하세요.
          </p>
          <Link
            href="/library/manage"
            className="mt-6 inline-flex rounded-xl border border-dark-700 px-4 py-2.5 text-sm text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50"
          >
            내 게임 관리로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  if (editableGame.claimed) {
    await saveGame(editableGame.game);
  }

  const sourceStatus = getGameContentSourceStatus(gameId, editableGame.game);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(87,100,91,0.08),transparent_18%),radial-gradient(circle_at_bottom_right,rgba(42,13,18,0.12),transparent_28%),linear-gradient(180deg,rgba(15,9,12,1),rgba(23,15,18,1))]">
      <header className="sticky top-0 z-10 border-b border-dark-700 bg-[rgba(15,9,12,0.88)] backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/library/manage" className="text-dark-400 hover:text-dark-200 transition-colors text-sm">
              ← 내 게임 관리
            </Link>
            <span className="text-dark-700">|</span>
            <span className="text-dark-200 font-medium text-sm truncate max-w-xs">
              {editableGame.game.title}
            </span>
          </div>
          <span className="text-xs text-dark-500">
            마지막 수정: {new Date(editableGame.game.updatedAt).toLocaleDateString("ko-KR")}
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className={`mb-6 rounded-2xl border px-5 py-4 ${
          sourceStatus.localBackupDiffers
            ? "border-amber-800/70 bg-amber-950/20"
            : "border-dark-700/80 bg-dark-900/60"
        }`}>
          <p className="text-[11px] uppercase tracking-[0.22em] text-dark-500">Save Source</p>
          <p className="mt-2 text-sm text-dark-100">
            {sourceStatus.primaryProvider === "supabase"
              ? "지금 보고 있는 내용은 Supabase에 저장된 버전입니다."
              : "지금 보고 있는 내용은 이 기기에 저장된 버전입니다."}
          </p>
          {sourceStatus.primaryProvider === "supabase" && sourceStatus.localBackupAvailable && (
            <p className={`mt-2 text-xs ${
              sourceStatus.localBackupDiffers ? "text-amber-200" : "text-dark-400"
            }`}>
              {sourceStatus.localBackupDiffers
                ? "같은 게임의 로컬 백업본과 내용이 다릅니다. 예전 엔딩이나 스크립트를 찾는 중이면 저장 전에 먼저 확인하세요."
                : "로컬 백업본과 현재 저장본이 같습니다."}
            </p>
          )}
        </div>
        <MakerEditor initialGame={editableGame.game} />
      </main>
    </div>
  );
}
