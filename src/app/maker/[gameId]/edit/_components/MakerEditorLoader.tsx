import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveEditableGameForUser } from "@/lib/game-access";
import { getGame, saveGame } from "@/lib/game-repository";
import { requireCurrentMakerUser } from "@/lib/maker-user.server";
import MakerEditor from "./MakerEditor";

/**
 * 실제 편집 에디터 로더.
 * getGame(15테이블 조인)과 claim-on-access 저장을 포함하므로 Suspense 안에 두어
 * 바깥 쉘(헤더 back link 등)이 먼저 렌더되도록 분리한다.
 */
export default async function MakerEditorLoader({ gameId }: { gameId: string }) {
  const currentUser = await requireCurrentMakerUser(`/maker/${gameId}/edit`);
  const game = await getGame(gameId);

  if (!game) notFound();

  const editableGame = resolveEditableGameForUser(game, currentUser);
  if (!editableGame) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-dark-800 bg-dark-900/90 p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.24em] text-amber-300/80">Access</p>
        <h1 className="mt-3 text-2xl font-semibold text-dark-50">편집 권한이 없는 게임입니다</h1>
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
    );
  }

  if (editableGame.claimed) {
    await saveGame(editableGame.game);
  }

  return (
    <>
      <div className="flex items-center justify-end pb-2 -mt-2 text-xs text-dark-500">
        마지막 수정: {new Date(editableGame.game.updatedAt).toLocaleDateString("ko-KR")}
      </div>
      <MakerEditor initialGame={editableGame.game} />
    </>
  );
}

export function MakerEditorLoaderSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <div aria-hidden className="h-10 w-full animate-pulse rounded-xl bg-dark-900/60 border border-dark-800" />
      <div aria-hidden className="h-10 w-full animate-pulse rounded-xl bg-dark-900/60 border border-dark-800" />
      <div className="space-y-3">
        <div aria-hidden className="h-5 w-32 animate-pulse rounded bg-dark-800" />
        <div aria-hidden className="h-24 w-full animate-pulse rounded-xl bg-dark-900/60 border border-dark-800" />
        <div aria-hidden className="h-24 w-full animate-pulse rounded-xl bg-dark-900/60 border border-dark-800" />
      </div>
      <p className="text-center text-xs text-dark-500 pt-2">게임을 불러오는 중…</p>
    </div>
  );
}
