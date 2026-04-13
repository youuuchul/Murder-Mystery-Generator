import { getLibraryGames } from "./library-data";

/**
 * 공개 시나리오 / 제작중 개수 배지.
 * Hero 내부에 위치하되 Supabase 쿼리를 기다리지 않고 즉시 hero 전체가 렌더되도록
 * Suspense로 감싼다.
 */
export default async function LibraryCountsBadges() {
  const { games, nonPublicCount } = await getLibraryGames();
  return (
    <>
      <span className="rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1">
        공개 시나리오 {games.length}개
      </span>
      {nonPublicCount > 0 && (
        <span className="rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1">
          제작중 {nonPublicCount}개
        </span>
      )}
    </>
  );
}

export function LibraryCountsBadgesSkeleton() {
  return (
    <>
      <span
        aria-hidden
        className="h-6 w-28 animate-pulse rounded-full border border-dark-700 bg-dark-900/80"
      />
    </>
  );
}
