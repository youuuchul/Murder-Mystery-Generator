import { NextRequest, NextResponse } from "next/server";
import {
  applyPlayerAgentOccupancyToCharacterSlots,
  syncPlayerAgentRuntimeStatusForSharedPhase,
} from "@/lib/ai/player-agent/core/player-agent-state";
import { canAccessGmPlay } from "@/lib/game-access";
import { canResumeGmSessionDirectly } from "@/lib/gm-session-access";
import { getGame } from "@/lib/game-repository";
import { isMakerAdmin } from "@/lib/maker-role";
import { getRequestMakerUser } from "@/lib/maker-user.server";
import { markPhaseStarted } from "@/lib/session-phase";
import { mutateSessionWithRetry } from "@/lib/session-mutation";
import { getSession, isSessionConflictError } from "@/lib/session-repository";
import { broadcast } from "@/lib/sse/broadcaster";
import type { VoteTally, VoteReveal, QuestionTally } from "@/types/session";
import type { GamePackage, VoteTargetMode } from "@/types/game";

type Params = { params: { sessionId: string } };
type LoadedGame = NonNullable<Awaited<ReturnType<typeof getGame>>>;
type LoadedSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

async function canAccessGmSession(request: NextRequest, session: LoadedSession): Promise<boolean> {
  const game = await getGame(session.gameId);
  if (!game) {
    return false;
  }

  const currentUser = await getRequestMakerUser(request);
  if (!canAccessGmPlay(game, currentUser)) {
    return false;
  }

  return canResumeGmSessionDirectly(session, {
    currentUserId: currentUser?.id,
    isAdmin: isMakerAdmin(currentUser),
    cookieStore: request.cookies,
  });
}

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

  return game.ending.branches.find((branch) => branch.triggerType === "culprit-escaped")?.id;
}

/** 고급 투표: 주 질문의 최다 득표 선택지 기반으로 엔딩 분기를 찾는다. */
function resolveAdvancedEndingBranchId(
  game: LoadedGame,
  questionTallies: QuestionTally[]
): string | undefined {
  const primaryQuestion = game.voteQuestions.find((q) => q.isPrimary && q.purpose === "ending");
  if (!primaryQuestion) return undefined;

  const primaryTally = questionTallies.find((qt) => qt.questionId === primaryQuestion.id);
  if (!primaryTally || primaryTally.tally.length === 0) return undefined;

  const topTargetId = primaryTally.tally[0].playerId; // playerId 필드에 targetId가 저장됨

  // n:1 매칭: 여러 선택지가 하나의 분기에 연결
  const matchedBranch = game.ending.branches.find((b) =>
    b.triggerType === "custom-choice-matched"
    && b.targetQuestionId === primaryQuestion.id
    && (b.targetChoiceIds ?? []).includes(topTargetId)
  );
  if (matchedBranch) return matchedBranch.id;

  // custom-choice-fallback: 매칭 안 된 나머지
  const fallbackBranch = game.ending.branches.find((b) =>
    b.triggerType === "custom-choice-fallback"
    && b.targetQuestionId === primaryQuestion.id
  );
  if (fallbackBranch) return fallbackBranch.id;

  // players-only/players-and-npcs 모드: 범인 검거/미검거로 fallback
  if (primaryQuestion.targetMode !== "custom-choices") {
    const culpritPlayerId = game.story.culpritPlayerId;
    if (topTargetId === culpritPlayerId) {
      return game.ending.branches.find((b) => b.triggerType === "culprit-captured")?.id;
    }
    return game.ending.branches.find((b) => b.triggerType === "culprit-escaped")?.id;
  }

  return undefined;
}

/** 고급 투표: targetId가 유효한 대상인지 검증 */
function validateVoteTarget(game: GamePackage, targetMode: VoteTargetMode, targetId: string): boolean {
  switch (targetMode) {
    case "players-only":
      return game.players.some((p) => p.id === targetId);
    case "players-and-npcs":
      return game.players.some((p) => p.id === targetId)
        || game.story.npcs.some((n) => n.id === targetId);
    case "custom-choices":
      return game.voteQuestions.some((q) =>
        q.choices.some((c) => c.id === targetId)
      );
  }
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

/** 고급 투표: 질문별 득표 집계 */
function buildAdvancedVoteTallies(session: LoadedSession): QuestionTally[] {
  const advVotes = session.advancedVotes ?? {};
  const allQuestionIds = new Set<string>();
  for (const qv of Object.values(advVotes)) {
    for (const qId of Object.keys(qv)) allQuestionIds.add(qId);
  }

  return [...allQuestionIds].map((questionId) => {
    const tallyMap = new Map<string, { count: number; voterNames: string[] }>();
    for (const [token, qvMap] of Object.entries(advVotes)) {
      const targetId = qvMap[questionId];
      if (!targetId) continue;
      const voter = session.playerStates.find((p) => p.token === token);
      if (!tallyMap.has(targetId)) tallyMap.set(targetId, { count: 0, voterNames: [] });
      const entry = tallyMap.get(targetId)!;
      entry.count++;
      if (voter) entry.voterNames.push(voter.playerName);
    }
    return {
      questionId,
      tally: [...tallyMap.entries()]
        .map(([playerId, data]) => ({ playerId, count: data.count, voterNames: data.voterNames }))
        .sort((a, b) => b.count - a.count),
    };
  });
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
 * 플레이어 합의 세션에서 동률이 나오면 안정적으로 같은 후보를 고르기 위한 해시 선택기.
 * 세션 ID 기반이라 같은 세션에서 반복 호출해도 결과가 바뀌지 않는다.
 */
function pickDeterministicArrestedPlayerId(
  sessionId: string,
  candidatePlayerIds: string[]
): string {
  const sortedCandidates = [...candidatePlayerIds].sort((a, b) => a.localeCompare(b));
  if (sortedCandidates.length <= 1) {
    return sortedCandidates[0] ?? "";
  }

  const seed = stableHash(`${sessionId}:${sortedCandidates.join(":")}`);
  return sortedCandidates[seed % sortedCandidates.length];
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

  const { session: persistedSession, result } = await mutateSessionWithRetry(
    sessionId,
    async (latestSession) => {
      const now = new Date().toISOString();
      const game = await getGame(latestSession.gameId);
      const culpritPlayerId = game?.story.culpritPlayerId ?? "";
      const isAdvanced = game?.advancedVotingEnabled && Object.keys(latestSession.advancedVotes ?? {}).length > 0;

      // 고급 투표: 질문별 집계 후 primary 기반으로 엔딩 분기 결정
      if (isAdvanced && game) {
        const questionTallies = buildAdvancedVoteTallies(latestSession as LoadedSession);
        const resolvedBranchId = resolveAdvancedEndingBranchId(game, questionTallies);

        // primary question의 최다 득표로 arrestedPlayerId 결정 (players 모드일 때)
        const primaryQ = game.voteQuestions.find((q) => q.isPrimary);
        const primaryTally = questionTallies.find((qt) => qt.questionId === primaryQ?.id);
        const topTargetId = primaryTally?.tally[0]?.playerId;

        const resultType = topTargetId === culpritPlayerId ? "culprit-captured" : "wrong-arrest";
        const reveal: VoteReveal = {
          tally: primaryTally?.tally ?? [],
          culpritPlayerId,
          arrestedPlayerId: topTargetId,
          resultType: primaryQ?.targetMode === "custom-choices" ? undefined : resultType,
          resolvedBranchId,
          voteRound: 1,
          questionTallies,
        };
        latestSession.pendingArrestOptions = undefined;
        latestSession.sharedState.voteReveal = reveal;
        latestSession.sharedState.phase = "ending";
        latestSession.sharedState.endingStage = "branch";
        markPhaseStarted(latestSession.sharedState, now);
        if (latestSession.playerAgentState) {
          latestSession.playerAgentState = syncPlayerAgentRuntimeStatusForSharedPhase(
            latestSession.playerAgentState, latestSession.sharedState
          );
          latestSession.sharedState.characterSlots = applyPlayerAgentOccupancyToCharacterSlots(
            latestSession.sharedState.characterSlots, latestSession.playerAgentState
          );
        }
        latestSession.sharedState.eventLog.push({
          id: crypto.randomUUID(), timestamp: now,
          message: "투표 결과가 공개됐습니다.", type: "vote_revealed",
        });
        return { requiresTieBreak: false, pendingArrestOptions: [] as string[] };
      }

      // 기본 투표 로직
      const tally = buildVoteTally(latestSession as LoadedSession);
      const tiedCandidates = resolveTiedCandidates(tally);
      const resolvedForcedArrestedPlayerId = forcedArrestedPlayerId
        || (
          tiedCandidates.length > 1 && latestSession.mode === "player-consensus"
            ? pickDeterministicArrestedPlayerId(latestSession.id, tiedCandidates)
            : undefined
        );

      if (!resolvedForcedArrestedPlayerId && tiedCandidates.length > 1) {
        latestSession.pendingArrestOptions = tiedCandidates;
        latestSession.sharedState.eventLog.push({
          id: crypto.randomUUID(),
          timestamp: now,
          message: "최다 득표 동률입니다. GM이 최종 검거 대상을 선택해야 합니다.",
          type: "system",
        });

        return {
          requiresTieBreak: true,
          pendingArrestOptions: tiedCandidates,
        };
      }

      const totalVotes = Object.keys(latestSession.votes).length;
      const culpritVotes = tally.find((entry) => entry.playerId === culpritPlayerId)?.count ?? 0;
      const majorityCorrect = totalVotes > 0 && culpritVotes > totalVotes / 2;
      const arrestedPlayerId = resolvedForcedArrestedPlayerId ?? tally[0]?.playerId ?? "";
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
      latestSession.pendingArrestOptions = undefined;
      latestSession.sharedState.voteReveal = reveal;
      latestSession.sharedState.phase = "ending";
      latestSession.sharedState.endingStage = "branch";
      markPhaseStarted(latestSession.sharedState, now);
      if (latestSession.playerAgentState) {
        latestSession.playerAgentState = syncPlayerAgentRuntimeStatusForSharedPhase(
          latestSession.playerAgentState,
          latestSession.sharedState
        );
        latestSession.sharedState.characterSlots = applyPlayerAgentOccupancyToCharacterSlots(
          latestSession.sharedState.characterSlots,
          latestSession.playerAgentState
        );
      }

      latestSession.sharedState.eventLog.push({
        id: crypto.randomUUID(),
        timestamp: now,
        message: resultType === "culprit-captured"
          ? "범인이 검거됐습니다."
          : "검거된 인물은 있었지만 진범은 아니었습니다.",
        type: "vote_revealed",
      });

      if (tiedCandidates.length > 1 && latestSession.mode === "player-consensus") {
        latestSession.sharedState.eventLog.push({
          id: crypto.randomUUID(),
          timestamp: now,
          message: "최다 득표 동률이 발생해 플레이어 합의 세션 규칙으로 검거 대상을 자동 확정했습니다.",
          type: "system",
        });
      }

      return {
        requiresTieBreak: false,
        pendingArrestOptions: [] as string[],
      };
    }
  );

  broadcast(sessionId, "session_update", { sharedState: persistedSession.sharedState });
  return {
    requiresTieBreak: result.requiresTieBreak,
    pendingArrestOptions: result.pendingArrestOptions,
    session: persistedSession,
  };
}

/** POST /api/sessions/[sessionId]/vote — 투표 제출 */
export async function POST(req: NextRequest, { params }: Params) {
  const { sessionId } = params;
  const body = await req.json().catch(() => ({})) as {
    token?: string;
    targetPlayerId?: string;
    /** 고급 투표: 질문별 투표 */
    questionVotes?: Record<string, string>;
  };
  const { token, targetPlayerId, questionVotes } = body;

  if (!token || (!targetPlayerId && !questionVotes)) {
    return NextResponse.json({ error: "token 및 투표 대상 필수" }, { status: 400 });
  }

  try {
    const { session: persistedSession, result } = await mutateSessionWithRetry(
      sessionId,
      async (latestSession) => {
        if (latestSession.sharedState.phase !== "vote") {
          throw new Error("투표 페이즈가 아닙니다");
        }

        if ((latestSession.pendingArrestOptions?.length ?? 0) > 0) {
          if (latestSession.mode !== "player-consensus") {
            throw new Error("GM이 최종 검거 대상을 선택하는 중입니다.");
          }

          return {
            allVoted: true,
            forcedArrestedPlayerId: pickDeterministicArrestedPlayerId(
              latestSession.id,
              latestSession.pendingArrestOptions ?? []
            ),
          };
        }

        const voter = latestSession.playerStates.find((player) => player.token === token);
        if (!voter) {
          throw new Error("Invalid token");
        }

        const game = await getGame(latestSession.gameId);
        if (!game) {
          throw new Error("Game not found");
        }

        const isAdvanced = game.advancedVotingEnabled && questionVotes && Object.keys(questionVotes).length > 0;

        if (isAdvanced) {
          // 고급 투표: 질문별 저장
          latestSession.advancedVotes = latestSession.advancedVotes ?? {};
          const alreadyVoted = token in (latestSession.advancedVotes ?? {});
          latestSession.advancedVotes[token] = questionVotes;

          if (!alreadyVoted) {
            latestSession.sharedState.voteCount = (latestSession.sharedState.voteCount ?? 0) + 1;
            latestSession.sharedState.eventLog.push({
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              message: `${voter.playerName}님이 투표했습니다.`,
              type: "vote_submitted",
            });
          }
        } else {
          // 기본 투표
          latestSession.votes = latestSession.votes ?? {};
          latestSession.sharedState.voteCount = latestSession.sharedState.voteCount ?? 0;

          const alreadyVoted = token in latestSession.votes;
          latestSession.votes[token] = targetPlayerId!;

          if (!alreadyVoted) {
            latestSession.sharedState.voteCount++;
            latestSession.sharedState.eventLog.push({
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              message: `${voter.playerName}님이 투표했습니다.`,
              type: "vote_submitted",
            });
          }
        }

        const totalPlayers = latestSession.sharedState.characterSlots.filter(
          (slot) => slot.isLocked && !slot.isAiControlled
        ).length;
        return {
          allVoted: (latestSession.sharedState.voteCount ?? 0) >= totalPlayers,
          forcedArrestedPlayerId: undefined,
          isAdvanced,
        };
      }
    );

    broadcast(sessionId, "session_update", { sharedState: persistedSession.sharedState });

    let revealState: Awaited<ReturnType<typeof revealVotes>> | null = null;
    if (result.allVoted) {
      revealState = await revealVotes(sessionId, persistedSession, result.forcedArrestedPlayerId);
    }

    return NextResponse.json({
      ok: true,
      allVoted: result.allVoted,
      requiresTieBreak: revealState?.requiresTieBreak ?? false,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Game not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof Error && error.message === "투표 페이즈가 아닙니다") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof Error && error.message === "GM이 최종 검거 대상을 선택하는 중입니다.") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof Error && error.message === "Invalid token") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (isSessionConflictError(error)) {
      return createSessionConflictResponse();
    }

    throw error;
  }
}

function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** PATCH /api/sessions/[sessionId]/vote — GM 강제 공개 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { sessionId } = params;
  const { arrestedPlayerId } = await req.json().catch(() => ({})) as {
    arrestedPlayerId?: string;
  };
  const session = await getSession(sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  if (!(await canAccessGmSession(req, session))) {
    return NextResponse.json({ error: "이 세션 결과를 공개할 권한이 없습니다." }, { status: 403 });
  }

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
