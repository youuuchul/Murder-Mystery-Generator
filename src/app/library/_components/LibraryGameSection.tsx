import PublicGameGrid from "./PublicGameGrid";
import { getLibraryGames, getLibraryOwnerNames } from "./library-data";

/**
 * 공개 시나리오 그리드.
 * Supabase 쿼리(games + owner profiles)가 끝나야 렌더할 수 있으므로 Suspense로 스트리밍한다.
 * getLibraryGames/getLibraryOwnerNames는 React.cache로 dedupe 되어 Badge와 중복 호출 없음.
 */
export default async function LibraryGameSection() {
  const [{ games }, ownerNameMap] = await Promise.all([
    getLibraryGames(),
    getLibraryOwnerNames(),
  ]);
  const publicGameItems = games.map((game) => ({
    game,
    ownerDisplayName: ownerNameMap.get(game.access.ownerId),
  }));

  return <PublicGameGrid games={publicGameItems} />;
}

export function LibraryGameSectionSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            aria-hidden
            className="h-64 animate-pulse rounded-2xl border border-dark-800 bg-dark-900/60"
          />
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-dark-500">시나리오 불러오는 중…</p>
    </>
  );
}
