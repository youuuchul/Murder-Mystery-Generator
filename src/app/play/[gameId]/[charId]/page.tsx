import { cookies } from "next/headers";
import { Suspense } from "react";
import { buildGameForPlayer } from "@/lib/game-sanitizer";
import { getGameCached } from "@/lib/game-repository-cache";
import { buildPlayerSharedBoardContent } from "@/lib/player-shared-board";
import { getPlayerSessionCookieName } from "@/lib/player-session-cookie";
import { getSession } from "@/lib/session-repository";
import PlayerView, {
  type PlayerSessionStateResponse,
} from "./_components/PlayerView";
import PlayLoadingSkeleton from "./_components/PlayLoadingSkeleton";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ gameId: string; charId: string }>;
  searchParams: Promise<{ s?: string }>;
};

/**
 * 플레이어 페이지 서버 쉘.
 *
 * 쿠키에 세션 토큰이 있으면 서버에서 세션 상태를 미리 조회해 PlayerView에 전달한다.
 * 이로 인해 클라이언트는 JS 하이드레이션 이후 추가 fetch 없이 즉시 콘텐츠를 렌더할 수 있다.
 *
 * 쿠키가 없으면(첫 접속자 등) PlayerView가 localStorage를 통해 기존 방식대로 fetch한다.
 */
async function PlayerServerLoader({ sessionId }: { sessionId: string }) {
  if (!sessionId) {
    return <PlayerView />;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(getPlayerSessionCookieName(sessionId))?.value ?? null;
  if (!token) {
    return <PlayerView />;
  }

  const session = await getSession(sessionId);
  if (!session) {
    return <PlayerView initialToken={token} />;
  }

  const pState = session.playerStates.find((p) => p.token === token);
  if (!pState) {
    // 만료/무효 토큰은 클라이언트가 에러 처리를 담당한다.
    return <PlayerView initialToken={token} />;
  }

  const game = await getGameCached(session.gameId);
  if (!game) {
    return <PlayerView initialToken={token} />;
  }

  const initialState: PlayerSessionStateResponse = {
    sharedState: session.sharedState,
    playerState: {
      inventory: pState.inventory ?? [],
      roundAcquired: pState.roundAcquired ?? {},
      roundVisitedLocations: pState.roundVisitedLocations ?? {},
    },
    gameId: session.gameId,
    game: buildGameForPlayer(game, pState.playerId),
    sessionCode: session.sessionCode,
    sessionName: session.sessionName,
    sessionMode: session.mode,
    sharedBoard: buildPlayerSharedBoardContent(game, session.sharedState),
    // isSessionHost는 쿠키+auth 조합이 필요해 SSR에선 보수적으로 false로 두고,
    // 클라이언트 첫 폴링에서 정확한 값으로 교정된다.
    isSessionHost: false,
    endedAt: session.endedAt,
    myVotes: session.advancedVotes?.[token] ?? {},
  };

  return <PlayerView initialState={initialState} initialToken={token} />;
}

export default async function PlayerPage({ params, searchParams }: Props) {
  await params; // gameId/charId는 클라이언트 훅이 URL에서 직접 읽는다.
  const { s: sessionId = "" } = await searchParams;

  return (
    <Suspense fallback={<PlayLoadingSkeleton />}>
      <PlayerServerLoader sessionId={sessionId} />
    </Suspense>
  );
}
