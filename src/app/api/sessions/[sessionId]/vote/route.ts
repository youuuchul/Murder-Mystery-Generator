import { NextResponse } from "next/server";
import { getGame } from "@/lib/game-repository";
import { getSession, isSessionConflictError, updateSession } from "@/lib/session-repository";
import { broadcast } from "@/lib/sse/broadcaster";
import type { VoteTally, VoteReveal } from "@/types/session";

type Params = { params: { sessionId: string } };
type LoadedGame = NonNullable<Awaited<ReturnType<typeof getGame>>>;
type LoadedSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

function createSessionConflictResponse() {
  return NextResponse.json(
    { error: "다른 변경사항이 먼저 저장됐습니다. 화면을 새로고침한 뒤 다시 시도해주세요." },
    { status: 409 }
  );
}

/**
 * 현재 검거 대상과 설정된 엔딩 분기 목록을 바탕으로 적용할 분기 ID를 찾는다.
 * 동률 GM 선택 UI는 이후 단계에서 붙일 예정이라 현재는 확정된 검거 대상 1명만 받는다.
 */
function resolveEndingBranchId(
  game: LoadedGame,
  arrestedPlayerId: string,
  resultType: "culprit-captured" | "wrong-arrest"
): string | undefined {
  if (resultType === "culprit-captured") {
    return game.ending.branches.find((branch) => branch.triggerType === "culprit-captured")?.id;
  }

  return game.ending.branches.find((branch) => (
    branch.triggerType === "specific-player-arrested"
    && branch.targetPlayerId === arrestedPlayerId
  ))?.id
    ?? game.ending.branches.find((branch) => branch.triggerType === "wrong-arrest-fallback")?.id;
}

/** 현재 세션의 비공개 표 데이터를 정렬된 득표 집계로 변환한다. */
function buildVoteTally(session: LoadedSession): VoteTally[] {
  session.votes = session.votes ?? {};
  const tallyMap = new Map<string, { count: number; voterNames: string[] }>();
  for (const [token, targetPlayerId] of Object.entries(session.votes)) {
    const voter = session.playerStates.find((p) => p.token === token);
    if (!tallyMap.has(targetPlayerId)) tallyMap.set(targetPlayerId, { count: 0, voterNames: [] });
    const entry = tallyMap.get(targetPlayerId)!;
    entry.count++;
    if (voter) entry.voterNames.push(voter.playerName);
  }

  return [...tallyMap.entries()].map(([playerId, data]) => ({
    playerId,
    count: data.count,
    voterNames: data.voterNames,
  })).sort((a, b) => b.count - a.count);
}

/** 최다 득표 동률 후보를 playerId 목록으로 추린다. */
function resolveTiedCandidates(tally: VoteTally[]): string[] {
  const topCount = tally[0]?.count ?? 0;
  if (topCount <= 0) {
    return [];
  }

  return tally
    .filter((entry) => entry.count === topCount)
    .map((entry) => entry.playerId);
}

/**
 * 득표 결과를 엔딩 공개 상태로 바꾸거나, 동률이면 GM 선택 대기 상태로 전환한다.
 * 강제 검거 대상이 전달되면 동률 후보 중 해당 캐릭터를 최종 검거 대상으로 확정한다.
 */
async function revealVotes(
  sessionId: string,
  session: LoadedSession | null,
  forcedArrestedPlayerId?: string
) {
  if (!session) {
    return { requiresTieBreak: false, pendingArrestOptions: [] as string[] };
  }

  const game = await getGame(session.gameId);
  const culpritPlayerId = game?.story.culpritPlayerId ?? "";
  const tally = buildVoteTally(session);
  const tiedCandidates = resolveTiedCandidates(tally);

  if (!forcedArrestedPlayerId && tiedCandidates.length > 1) {
    session.pendingArrestOptions = tiedCandidates;
    session.sharedState.eventLog.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      message: "최다 득표 동률입니다. GM이 최종 검거 대상을 선택해야 합니다.",
      type: "system",
    });

    const persistedSession = await updateSession(session) as LoadedSession;
    broadcast(sessionId, "session_update", { sharedState: persistedSession.sharedState });
    return {
      requiresTieBreak: true,
      pendingArrestOptions: tiedCandidates,
      session: persistedSession,
    };
  }

  const totalVotes = Object.keys(session.votes).length;
  const culpritVotes = tally.find((entry) => entry.playerId === culpritPlayerId)?.count ?? 0;
  const majorityCorrect = totalVotes > 0 && culpritVotes > totalVotes / 2;
  const arrestedPlayerId = forcedArrestedPlayerId ?? tally[0]?.playerId ?? "";
  const resultType = arrestedPlayerId === culpritPlayerId
    ? "culprit-captured"
    : "wrong-arrest";
  const resolvedBranchId = game && arrestedPlayerId
    ? resolveEndingBranchId(game, arrestedPlayerId, resultType)
    : undefined;

  const reveal: VoteReveal = {
    tally,
    culpritPlayerId,
    arrestedPlayerId,
    resultType,
    resolvedBranchId,
    majorityCorrect,
  };
  session.pendingArrestOptions = undefined;
  session.sharedState.voteReveal = reveal;
  session.sharedState.phase = "ending";
  session.sharedState.endingStage = "branch";
  session.endedAt = new Date().toISOString();

  session.sharedState.eventLog.push({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    message: resultType === "culprit-captured"
      ? "범인이 검거됐습니다."
      : "검거된 인물은 있었지만 진범은 아니었습니다.",
    type: "vote_revealed",
  });

  const persistedSession = await updateSession(session) as LoadedSession;
  broadcast(sessionId, "session_update", { sharedState: persistedSession.sharedState });
  return {
    requiresTieBreak: false,
    pendingArrestOptions: [] as string[],
    session: persistedSession,
  };
}

/** POST /api/sessions/[sessionId]/vote — 투표 제출 */
export async function POST(req: Request, { params }: Params) {
  const { sessionId } = params;
  const { token, targetPlayerId } = await req.json().catch(() => ({})) as {
    token?: string;
    targetPlayerId?: string;
  };

  if (!token || !targetPlayerId) {
    return NextResponse.json({ error: "token, targetPlayerId 필수" }, { status: 400 });
  }

  const session = await getSession(sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  if (session.sharedState.phase !== "vote") {
    return NextResponse.json({ error: "투표 페이즈가 아닙니다" }, { status: 400 });
  }

  if ((session.pendingArrestOptions?.length ?? 0) > 0) {
    return NextResponse.json({ error: "GM이 최종 검거 대상을 선택하는 중입니다." }, { status: 400 });
  }

  const voter = session.playerStates.find((p) => p.token === token);
  if (!voter) return NextResponse.json({ error: "Invalid token" }, { status: 403 });

  // 구형 세션 호환 (votes/voteCount 필드 없는 경우)
  session.votes = session.votes ?? {};
  session.sharedState.voteCount = session.sharedState.voteCount ?? 0;

  // 이미 투표했으면 덮어쓰기 (마음 바꾸기 허용)
  const alreadyVoted = token in session.votes;
  session.votes[token] = targetPlayerId;

  if (!alreadyVoted) {
    session.sharedState.voteCount++;
    session.sharedState.eventLog.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      message: `${voter.playerName}님이 투표했습니다.`,
      type: "vote_submitted",
    });
  }

  // 참가한 전체 플레이어 수
  const totalPlayers = session.sharedState.characterSlots.filter((s) => s.isLocked).length;
  const allVoted = session.sharedState.voteCount >= totalPlayers;

  let persistedSession: LoadedSession;

  try {
    persistedSession = await updateSession(session) as LoadedSession;
  } catch (error) {
    if (isSessionConflictError(error)) {
      return createSessionConflictResponse();
    }

    throw error;
  }

  broadcast(sessionId, "session_update", { sharedState: persistedSession.sharedState });

  // 전원 투표 완료 시 자동 공개
  let revealState: Awaited<ReturnType<typeof revealVotes>> | null = null;
  if (allVoted) {
    try {
      revealState = await revealVotes(sessionId, persistedSession);
    } catch (error) {
      if (isSessionConflictError(error)) {
        return createSessionConflictResponse();
      }

      throw error;
    }
  }

  return NextResponse.json({
    ok: true,
    allVoted,
    requiresTieBreak: revealState?.requiresTieBreak ?? false,
  });
}

/** PATCH /api/sessions/[sessionId]/vote — GM 강제 공개 */
export async function PATCH(req: Request, { params }: Params) {
  const { sessionId } = params;
  const { arrestedPlayerId } = await req.json().catch(() => ({})) as {
    arrestedPlayerId?: string;
  };
  const session = await getSession(sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  if (session.sharedState.phase !== "vote") {
    return NextResponse.json({ error: "투표 페이즈가 아닙니다" }, { status: 400 });
  }

  if ((session.pendingArrestOptions?.length ?? 0) > 0) {
    if (!arrestedPlayerId) {
      return NextResponse.json({ error: "동률 후보 중 최종 검거 대상을 선택하세요." }, { status: 400 });
    }

    if (!session.pendingArrestOptions?.includes(arrestedPlayerId)) {
      return NextResponse.json({ error: "선택한 캐릭터는 동률 후보가 아닙니다." }, { status: 400 });
    }
  }

  let revealState;

  try {
    revealState = await revealVotes(sessionId, session, arrestedPlayerId);
  } catch (error) {
    if (isSessionConflictError(error)) {
      return createSessionConflictResponse();
    }

    throw error;
  }

  return NextResponse.json({
    ok: true,
    session: {
      id: revealState.session?.id ?? session.id,
      sharedState: revealState.session?.sharedState ?? session.sharedState,
      pendingArrestOptions: revealState.session?.pendingArrestOptions ?? [],
    },
    requiresTieBreak: revealState.requiresTieBreak,
    pendingArrestOptions: revealState.pendingArrestOptions,
  });
}
