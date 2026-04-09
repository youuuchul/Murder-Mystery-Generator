import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isPubliclyAccessible } from "@/lib/game-access";
import { getGame } from "@/lib/game-repository";
import { getCurrentMakerUser } from "@/lib/maker-user.server";
import { isMakerAdmin } from "@/lib/maker-role";
import type { CoverImagePosition } from "@/types/game";

export const dynamic = "force-dynamic";

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

export default async function GameCoverPage({
  params,
}: {
  params: { gameId: string };
}) {
  const game = await getGame(params.gameId);
  if (!game) notFound();

  const currentUser = await getCurrentMakerUser();
  const isOwnerOrAdmin =
    (currentUser && game.access.ownerId === currentUser.id) ||
    isMakerAdmin(currentUser);

  if (!isPubliclyAccessible(game.access) && !isOwnerOrAdmin) {
    return (
      <div className="min-h-screen bg-dark-950 px-4 py-12 text-dark-50">
        <div className="mx-auto max-w-2xl rounded-3xl border border-dark-800 bg-dark-900/90 p-8 shadow-2xl">
          <h1 className="text-2xl font-semibold">비공개 게임</h1>
          <p className="mt-3 text-sm leading-6 text-dark-400">
            이 게임은 비공개 상태이며, 소유자만 접근할 수 있습니다.
          </p>
          <Link
            href="/library"
            className="mt-6 inline-flex rounded-xl border border-dark-700 px-4 py-2.5 text-sm text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50"
          >
            라이브러리로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  const coverUrl = game.settings.coverImageUrl;
  const coverPos = game.settings.coverImagePosition;
  const diff = game.settings.difficulty;
  const tags = game.settings.tags ?? [];

  return (
    <div className="min-h-screen bg-dark-950 text-dark-50">
      <CoverHero title={game.title} imageUrl={coverUrl} imagePosition={coverPos} />

      <div className="mx-auto max-w-2xl px-4 pb-16">
        <div className="-mt-12 relative z-10 rounded-3xl border border-dark-800 bg-dark-900/95 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${difficultyColor[diff] ?? "text-dark-300 bg-dark-800 border-dark-700"}`}
            >
              {difficultyLabel[diff] ?? diff}
            </span>
            {game.access.visibility === "unlisted" && (
              <span className="rounded-full border border-sky-900 bg-sky-950/40 px-2.5 py-1 text-[11px] font-medium text-sky-300">
                일부 공개
              </span>
            )}
          </div>

          <h1 className="mt-4 text-2xl font-bold leading-tight sm:text-3xl">
            {game.title}
          </h1>

          <p className="mt-4 text-sm leading-7 text-dark-300">
            {game.settings.summary?.trim() || "게임 소개글이 아직 없습니다."}
          </p>

          <div className="mt-6 flex flex-wrap gap-3 text-sm text-dark-400">
            <span className="flex items-center gap-1.5">
              <span className="text-dark-500">인원</span> {game.settings.playerCount}인
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-dark-500">시간</span> {game.settings.estimatedDuration}분
            </span>
          </div>

          {tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-dark-700 bg-dark-900 px-2.5 py-1 text-xs text-dark-300"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Link
              href={`/play/${game.id}`}
              className="inline-flex items-center justify-center rounded-xl border border-mystery-600 bg-mystery-700 px-5 py-3.5 text-sm font-medium text-white transition-colors hover:bg-mystery-600"
            >
              GM으로 진행
            </Link>
            <Link
              href={`/play/${game.id}/join`}
              className="inline-flex items-center justify-center rounded-xl border border-dark-700 bg-dark-900 px-5 py-3.5 text-sm font-medium text-dark-100 transition-colors hover:border-dark-500 hover:bg-dark-800"
            >
              플레이어 참여
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoverHero({
  title,
  imageUrl,
  imagePosition,
}: {
  title: string;
  imageUrl?: string;
  imagePosition?: CoverImagePosition;
}) {
  return (
    <div className="relative h-64 overflow-hidden sm:h-80">
      {imageUrl ? (
        <>
          <Image
            src={imageUrl}
            alt={title}
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{
              objectPosition: `${imagePosition?.x ?? 50}% ${imagePosition?.y ?? 50}%`,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-dark-950/40 to-transparent" />
        </>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(161,113,67,0.25),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(102,40,58,0.22),transparent_35%)]" />
      )}
    </div>
  );
}
