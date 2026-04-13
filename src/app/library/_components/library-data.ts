import { cache } from "react";
import { countNonPublicGames, listPublicGames } from "@/lib/game-repository";
import { getMakerAuthGateway } from "@/lib/maker-auth-gateway";

const makerAuthGateway = getMakerAuthGateway();

/**
 * Library 하위 Suspense 서브컴포넌트들이 동일 데이터를 여러 번 가져오지 않도록
 * React.cache로 요청 단위 dedupe 한다.
 * 같은 렌더 트리 내에서는 한 번만 DB 왕복이 발생한다.
 */
export const getLibraryGames = cache(async () => {
  const [games, nonPublicCount] = await Promise.all([
    listPublicGames(),
    countNonPublicGames(),
  ]);
  return { games, nonPublicCount };
});

export const getLibraryOwnerNames = cache(async () => {
  const { games } = await getLibraryGames();
  const uniqueOwnerIds = Array.from(
    new Set(games.map((game) => game.access.ownerId).filter(Boolean))
  );
  const ownerRecords = await Promise.all(
    uniqueOwnerIds.map((id) => makerAuthGateway.getUserById(id).catch(() => null))
  );
  return new Map(
    ownerRecords
      .filter((user): user is NonNullable<typeof user> => Boolean(user))
      .map((user) => [user.id, user.displayName])
  );
});
