import { NextRequest, NextResponse } from "next/server";
import {
  applyPlayerAgentOccupancyToCharacterSlots,
  enablePlayerAgentSlotsForMissingPlayers,
  syncPlayerAgentRuntimeStatusForSharedPhase,
} from "@/lib/ai/player-agent/core/player-agent-state";
import { buildGameForPlayer } from "@/lib/game-sanitizer";
import { ENDING_STAGE_LABELS, getNextEndingStage, normalizeEndingStage } from "@/lib/ending-flow";
import { canAccessGmPlay } from "@/lib/game-access";
import { canResumeGmSessionDirectly } from "@/lib/gm-session-access";
import { buildPlayerSharedBoardContent } from "@/lib/player-shared-board";
import { getGame } from "@/lib/game-repository";
import { getGameCached } from "@/lib/game-repository-cache";
import { isMakerAdmin } from "@/lib/maker-role";
import { getRequestMakerUser } from "@/lib/maker-user.server";
import {
  clearPhaseAdvanceRequests,
  getCurrentRoundSubPhase,
  getEnabledRoundSubPhases,
  getNextRoundSubPhase,
  getRoundSubPhaseLabel,
  markPhaseStarted,
  applyUncertainResolutionUpdate,
} from "@/lib/session-phase";
import { mutateSessionWithRetry } from "@/lib/session-mutation";
import {
  deleteSession,
  getSession,
  isGmManagedSession,
  SessionConflictError,
  isSessionConflictError,
} from "@/lib/session-repository";
import { hasStoredGmSessionAccess, isSessionHost } from "@/lib/gm-session-access";
import { getSubPhaseDurationSeconds } from "@/lib/session-timer";
import { broadcast } from "@/lib/sse/broadcaster";
import type { EndingStage, GamePhase, GameSession, TimerState, VoteTally, VoteReveal } from "@/types/session";

type Params = { params: { sessionId: string } };

async function canManageSession(request: NextRequest, session: GameSession): Promise<boolean> {
  const game = await getGameCached(session.gameId);
  if (!game) {
    return false;
  }

  const currentUser = await getRequestMakerUser(request);
  if (!canAccessGmPlay(game, currentUser)) {
    return false;
  }

  if (isMakerAdmin(currentUser)) {
    return true;
  }

  if (!isGmManagedSession(session)) {
    return false;
  }

  return canResumeGmSessionDirectly(session, {
    currentUserId: currentUser?.id,
    isAdmin: isMakerAdmin(currentUser),
    cookieStore: request.cookies,
  });
}

function normalizeSubPhase(subPhase?: string): "investigation" | "discussion" | undefined {
  if (subPhase === "discussion" || subPhase === "briefing") return "discussion";
  if (subPhase === "investigation") return "investigation";
  return undefined;
}

function createSessionConflictResponse() {
  return NextResponse.json(
    { error: "다른 변경사항이 먼저 저장됐습니다. 화면을 새로고침한 뒤 다시 시도해주세요." },
    { status: 409 }
  );
}

function buildSessionMutationBaseState(session: GameSession): {
  phase: GamePhase;
  currentRound: number;
  currentSubPhase?: "investigation" | "discussion";
  endingStage: EndingStage;
} {
  return {
    phase: session.sharedState.phase,
    currentRound: session.sharedState.currentRound,
    currentSubPhase: session.sharedState.currentSubPhase,
    endingStage: normalizeEndingStage(session.sharedState.endingStage),
  };
}

function canRetryActionOnLatestSession(
  action: string | undefined,
  session: GameSession,
  expectedBaseState: ReturnType<typeof buildSessionMutationBaseState>
): boolean {
  if (
    action !== "advance_phase"
    && action !== "set_subphase"
    && action !== "advance_ending_stage"
  ) {
    return true;
  }

  const latestBaseState = buildSessionMutationBaseState(session);
  return (
    latestBaseState.phase === expectedBaseState.phase
    && latestBaseState.currentRound === expectedBaseState.currentRound
    && latestBaseState.currentSubPhase === expectedBaseState.currentSubPhase
    && latestBaseState.endingStage === expectedBaseState.endingStage
  );
}

function buildVoteTally(session: GameSession): VoteTally[] {
  session.votes = session.votes ?? {};
  const tallyMap = new Map<string, { count: number; voterNames: string[] }>();

  for (const [token, targetPlayerId] of Object.entries(session.votes)) {
    const voter = session.playerStates.find((player) => player.token === token);
    if (!tallyMap.has(targetPlayerId)) {
      tallyMap.set(targetPlayerId, { count: 0, voterNames: [] });
    }
    const entry = tallyMap.get(targetPlayerId)!;
    entry.count += 1;
    if (voter) {
      entry.voterNames.push(voter.playerName);
    }
  }

  return [...tallyMap.entries()]
    .map(([playerId, data]) => ({
      playerId,
      count: data.count,
      voterNames: data.voterNames,
    }))
    .sort((a, b) => b.count - a.count);
}

function resolveEndingBranchId(
  game: NonNullable<Awaited<ReturnType<typeof getGame>>>,
  arrestedPlayerId: string,
  resultType: "culprit-captured" | "wrong-arrest"
): string | undefined {
  if (resultType === "culprit-captured") {
    return game.ending.branches.find((branch) => branch.triggerType === "culprit-captured")?.id;
  }

  return game.ending.branches.find((branch) => branch.triggerType === "culprit-escaped")?.id;
}

function pickDeterministicArrestedPlayerId(sessionId: string, candidates: string[]): string {
  const sortedCandidates = [...candidates].sort((a, b) => a.localeCompare(b));
  if (sortedCandidates.length <= 1) {
    return sortedCandidates[0] ?? "";
  }

  const seed = stableHash(`${sessionId}:${sortedCandidates.join(":")}`);
  return sortedCandidates[seed % sortedCandidates.length];
}

/**
 * 과거 버전에서 `player-consensus` 세션이 동률 처리 대기 상태로 멈춘 경우를
 * 조회 시점에 자동 복구해 엔딩으로 진행시킨다.
 */
async function recoverConsensusVoteTieIfNeeded(sessionId: string, session: GameSession): Promise<GameSession> {
  if (
    session.mode !== "player-consensus"
    || session.sharedState.phase !== "vote"
    || (session.pendingArrestOptions?.length ?? 0) === 0
  ) {
    return session;
  }

  const game = await getGame(session.gameId);
  if (!game) {
    return session;
  }

  const { session: persistedSession, result } = await mutateSessionWithRetry(
    sessionId,
    (latestSession) => {
      if (
        latestSession.mode !== "player-consensus"
        || latestSession.sharedState.phase !== "vote"
        || (latestSession.pendingArrestOptions?.length ?? 0) === 0
      ) {
        return { recovered: false };
      }

      const now = new Date().toISOString();
      const arrestedPlayerId = pickDeterministicArrestedPlayerId(
        latestSession.id,
        latestSession.pendingArrestOptions ?? []
      );
      const tally = buildVoteTally(latestSession);
      const culpritPlayerId = game.story.culpritPlayerId;
      const totalVotes = Object.keys(latestSession.votes ?? {}).length;
      const culpritVotes = tally.find((entry) => entry.playerId === culpritPlayerId)?.count ?? 0;
      const majorityCorrect = totalVotes > 0 && culpritVotes > totalVotes / 2;
      const resultType = arrestedPlayerId === culpritPlayerId
        ? "culprit-captured"
        : "wrong-arrest";

      const reveal: VoteReveal = {
        tally,
        culpritPlayerId,
        arrestedPlayerId,
        resultType,
        resolvedBranchId: resolveEndingBranchId(game, arrestedPlayerId, resultType),
        majorityCorrect,
      };

      latestSession.pendingArrestOptions = undefined;
      latestSession.sharedState.voteReveal = reveal;
      latestSession.sharedState.phase = "ending";
      latestSession.sharedState.endingStage = "vote-result";
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
        message: "동률 대기 상태를 복구해 엔딩 단계로 자동 전환했습니다.",
        type: "system",
      });

      return { recovered: true };
    }
  );

  if (result.recovered) {
    broadcast(sessionId, "session_update", { sharedState: persistedSession.sharedState });
  }

  return persistedSession;
}

function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** GET /api/sessions/[sessionId] — 세션 상태 조회 */
export async function GET(req: NextRequest, { params }: Params) {
  const { sessionId } = params;
  const token = new URL(req.url).searchParams.get("token");

  const rawSession = await getSession(sessionId);
  const session = rawSession
    ? await recoverConsensusVoteTieIfNeeded(sessionId, rawSession)
    : null;
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  // 플레이어 개인 상태 — token으로 필터링
  if (token) {
    const pState = session.playerStates.find((p) => p.token === token);
    if (!pState) return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    const game = await getGameCached(session.gameId);
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    const currentUser = await getRequestMakerUser(req);
    const hostByUserId = isSessionHost(session, currentUser?.id);
    const hostByCookie = !hostByUserId && hasStoredGmSessionAccess(session, req.cookies);
    const hostByPlayerToken =
      session.mode === "player-consensus"
      && Boolean(session.hostPlayerId)
      && pState.playerId === session.hostPlayerId;
    return NextResponse.json({
      sharedState: session.sharedState,
      playerState: pState,
      gameId: session.gameId,
      game: buildGameForPlayer(game, pState.playerId),
      sessionCode: session.sessionCode,
      sessionName: session.sessionName,
      sessionMode: session.mode,
      sharedBoard: buildPlayerSharedBoardContent(game, session.sharedState),
      isSessionHost: hostByUserId || hostByCookie || hostByPlayerToken,
      endedAt: session.endedAt,
      /** 본인의 개인 투표 답변 (personal 질문 승점 판정용) */
      myVotes: session.advancedVotes?.[token] ?? {},
    });
  }

  if (!(await canManageSession(req, session))) {
    return NextResponse.json({ error: "이 세션을 열 권한이 없습니다." }, { status: 403 });
  }

  // GM: 전체 공개 상태 (playerState 개인 데이터 제외)
  return NextResponse.json({
    session: {
      ...session,
      playerStates: session.playerStates.map((p) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        inventoryCount: p.inventory.length,
      })),
      playerAgentState: undefined,
      votes: undefined,
    },
  });
}

const TIMER_ACTIONS = new Set(["start_timer"]);

/** PATCH /api/sessions/[sessionId] — GM 페이즈 제어 + 타이머 제어 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { sessionId } = params;
  const body = await req.json().catch(() => ({})) as {
    action?: string;
    subPhase?: string;
    playerId?: string;
    sessionName?: string;
    fillMissingWithAi?: boolean;
    token?: string;
  };

  const session = await getSession(sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const isTimerAction = TIMER_ACTIONS.has(body.action ?? "");
  const canManage = await canManageSession(req, session);

  if (!canManage) {
    if (isTimerAction) {
      const currentUser = await getRequestMakerUser(req);
      const hostById = isSessionHost(session, currentUser?.id);
      const hostByCookie = !hostById && hasStoredGmSessionAccess(session, req.cookies);
      const requesterPlayerState = body.token
        ? session.playerStates.find((playerState) => playerState.token === body.token)
        : undefined;
      const hostByPlayerToken =
        session.mode === "player-consensus"
        && Boolean(session.hostPlayerId)
        && requesterPlayerState?.playerId === session.hostPlayerId;
      if (!hostById && !hostByCookie && !hostByPlayerToken) {
        return NextResponse.json({ error: "타이머를 조작할 권한이 없습니다." }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: "이 세션을 수정할 권한이 없습니다." }, { status: 403 });
    }
  }

  const game = await getGame(session.gameId);
  const maxRound = game?.rules?.roundCount ?? 4;
  const expectedBaseState = buildSessionMutationBaseState(session);
  try {
    const { session: persistedSession } = await mutateSessionWithRetry(
      sessionId,
      (latestSession, attempt) => {
        if (attempt > 1 && !canRetryActionOnLatestSession(body.action, latestSession, expectedBaseState)) {
          throw new SessionConflictError();
        }

        const { sharedState } = latestSession;
        const now = new Date().toISOString();
        let newPhase: GamePhase = sharedState.phase;
        let message = "";

        if (body.action === "advance_phase") {
          if (sharedState.phase === "lobby") {
            if (body.fillMissingWithAi && latestSession.playerAgentState) {
              const lockedPlayerCount = sharedState.characterSlots.filter((slot) => slot.isLocked).length;
              latestSession.playerAgentState = enablePlayerAgentSlotsForMissingPlayers(
                latestSession.playerAgentState,
                {
                  unlockedPlayerIds: sharedState.characterSlots
                    .filter((slot) => !slot.isLocked)
                    .map((slot) => slot.playerId),
                  missingPlayerCount: Math.max(0, sharedState.characterSlots.length - lockedPlayerCount),
                }
              );
            }

            newPhase = "opening";
            message = "오프닝이 시작됩니다.";
            latestSession.startedAt = now;
            markPhaseStarted(sharedState, now);
            sharedState.timerState = undefined;
          } else if (sharedState.phase === "opening") {
            newPhase = "round-1";
            sharedState.currentRound = 1;
            sharedState.currentSubPhase = getCurrentRoundSubPhase(game?.rules);
            message = `Round 1 ${getRoundSubPhaseLabel(sharedState.currentSubPhase)} 페이즈가 시작됩니다.`;
            markPhaseStarted(sharedState, now);
            sharedState.timerState = undefined;
          } else if (sharedState.phase.startsWith("round-")) {
            const cur = sharedState.currentRound;
            const nextSubPhase = getNextRoundSubPhase(game?.rules, sharedState.currentSubPhase);

            if (nextSubPhase) {
              sharedState.currentSubPhase = nextSubPhase;
              markPhaseStarted(sharedState, now);
              sharedState.timerState = undefined;
              message = `${getRoundSubPhaseLabel(nextSubPhase)} 페이즈가 시작됩니다.`;
            } else if (cur >= maxRound) {
              newPhase = "vote";
              sharedState.currentSubPhase = undefined;
              message = "투표 페이즈가 시작됩니다.";
              markPhaseStarted(sharedState, now);
              sharedState.timerState = undefined;
            } else {
              newPhase = `round-${cur + 1}` as GamePhase;
              sharedState.currentRound = cur + 1;
              sharedState.currentSubPhase = getCurrentRoundSubPhase(game?.rules);
              message = `Round ${cur + 1} ${getRoundSubPhaseLabel(sharedState.currentSubPhase)} 페이즈가 시작됩니다.`;
              markPhaseStarted(sharedState, now);
              sharedState.timerState = undefined;
            }
          } else if (sharedState.phase === "vote") {
            throw new Error("투표 결과를 먼저 공개하세요.");
          }

          clearPhaseAdvanceRequests(sharedState);
          // GM 직접 phase advance 시에도 미확신 트리거 평가 — round-reached 발동 가능.
          if (game) applyUncertainResolutionUpdate(latestSession, game);
        } else if (body.action === "set_subphase") {
          const sub = normalizeSubPhase(body.subPhase);
          const enabledSubPhases = getEnabledRoundSubPhases(game?.rules);
          if (sub && enabledSubPhases.includes(sub) && sharedState.phase.startsWith("round-")) {
            sharedState.currentSubPhase = sub;
            markPhaseStarted(sharedState, now);
            sharedState.timerState = undefined;
            message = `${getRoundSubPhaseLabel(sub)} 페이즈가 시작됩니다.`;
            clearPhaseAdvanceRequests(sharedState);
          }
        } else if (body.action === "start_timer") {
          if (!sharedState.phase.startsWith("round-")) {
            throw new Error("라운드 페이즈에서만 타이머를 시작할 수 있습니다.");
          }
          const subPhase = sharedState.currentSubPhase ?? "investigation";
          const durationSeconds = getSubPhaseDurationSeconds(game?.rules, subPhase);
          sharedState.timerState = {
            startedAt: now,
            durationSeconds,
            label: getRoundSubPhaseLabel(subPhase as "investigation" | "discussion"),
          };
        } else if (body.action === "reset_timer") {
          sharedState.timerState = undefined;
        } else if (body.action === "advance_ending_stage") {
          if (sharedState.phase !== "ending") {
            throw new Error("엔딩 페이즈가 아닙니다.");
          }

          if (!game || !sharedState.voteReveal) {
            throw new Error("엔딩 결과 데이터가 없습니다.");
          }

          const currentStage = normalizeEndingStage(sharedState.endingStage);
          const nextStage = getNextEndingStage(game, currentStage, sharedState.voteReveal);

          if (!nextStage) {
            throw new Error("더 진행할 엔딩 단계가 없습니다.");
          }

          sharedState.endingStage = nextStage;

          // 2차 투표 진입 시 투표 상태 리셋
          if (nextStage === "vote-round-2") {
            sharedState.currentVoteRound = 2;
            sharedState.voteCount = 0;
            latestSession.advancedVotes = {};
          }

          message = `${ENDING_STAGE_LABELS[nextStage]} 단계가 공개됩니다.`;
        } else if (body.action === "end_session") {
          if (sharedState.phase !== "ending") {
            throw new Error("엔딩 페이즈에서만 게임을 종료할 수 있습니다.");
          }

          const currentStage = normalizeEndingStage(sharedState.endingStage);
          if (currentStage !== "complete") {
            throw new Error("모든 엔딩 단계를 공개한 뒤 종료할 수 있습니다.");
          }

          latestSession.endedAt = now;
          message = "게임이 종료됐습니다.";
        } else if (body.action === "update_session_name") {
          const normalizedSessionName = body.sessionName?.trim();
          if (!normalizedSessionName) {
            throw new Error("방 제목을 입력해주세요.");
          }

          latestSession.sessionName = normalizedSessionName.slice(0, 40);
        } else if (body.action === "unlock_slot") {
          if (!body.playerId) {
            throw new Error("playerId가 필요합니다.");
          }

          const slot = sharedState.characterSlots.find((item) => item.playerId === body.playerId);
          if (!slot) {
            throw new Error("해당 캐릭터 슬롯을 찾을 수 없습니다.");
          }

          const releasedPlayerName = slot.playerName ?? "플레이어";
          const releasedToken = slot.token;
          const playerState = latestSession.playerStates.find((item) => item.playerId === body.playerId);
          const standbyToken = playerState ? crypto.randomUUID() : null;

          slot.playerName = null;
          slot.token = null;
          slot.isLocked = false;
          slot.isAiControlled = false;
          slot.aiRuntimeStatus = undefined;

          if (latestSession.playerAgentState) {
            latestSession.playerAgentState = {
              ...latestSession.playerAgentState,
              slots: latestSession.playerAgentState.slots.map((item) => (
                item.playerId === body.playerId
                  ? {
                      ...item,
                      enabled: false,
                      runtimeStatus: "idle",
                    }
                  : item
              )),
            };
          }

          if (playerState && standbyToken) {
            playerState.token = standbyToken;
          }

          if (releasedToken && standbyToken && releasedToken in latestSession.votes) {
            latestSession.votes[standbyToken] = latestSession.votes[releasedToken];
            delete latestSession.votes[releasedToken];
          } else if (releasedToken && !playerState) {
            delete latestSession.votes[releasedToken];
          }
          sharedState.voteCount = Object.keys(latestSession.votes).length;
          clearPhaseAdvanceRequests(sharedState);

          sharedState.eventLog.push({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            message: `${releasedPlayerName}님의 슬롯 잠금이 해제됐습니다. 진행 상태는 유지한 채 다시 참가할 수 있습니다.`,
            type: "system",
          });
        }

        sharedState.phase = newPhase;
        if (
          latestSession.playerAgentState
          && (
            body.action === "advance_phase"
            || body.action === "set_subphase"
            || body.action === "advance_ending_stage"
            || body.action === "unlock_slot"
          )
        ) {
          latestSession.playerAgentState = syncPlayerAgentRuntimeStatusForSharedPhase(
            latestSession.playerAgentState,
            sharedState
          );
          sharedState.characterSlots = applyPlayerAgentOccupancyToCharacterSlots(
            sharedState.characterSlots,
            latestSession.playerAgentState
          );
        }

        if (message) {
          sharedState.eventLog.push({
            id: crypto.randomUUID(),
            timestamp: now,
            message,
            type: "phase_changed",
          });
        }

        return {};
      }
    );

    broadcast(sessionId, "session_update", {
      sharedState: persistedSession.sharedState,
      endedAt: persistedSession.endedAt,
    });

    return NextResponse.json({
      session: {
        id: persistedSession.id,
        sessionName: persistedSession.sessionName,
        sharedState: persistedSession.sharedState,
        endedAt: persistedSession.endedAt,
      },
    });
  } catch (error) {
    if (
      error instanceof Error
      && (
        error.message === "투표 결과를 먼저 공개하세요."
        || error.message === "엔딩 페이즈가 아닙니다."
        || error.message === "엔딩 결과 데이터가 없습니다."
        || error.message === "더 진행할 엔딩 단계가 없습니다."
        || error.message === "엔딩 페이즈에서만 게임을 종료할 수 있습니다."
        || error.message === "모든 엔딩 단계를 공개한 뒤 종료할 수 있습니다."
        || error.message === "방 제목을 입력해주세요."
        || error.message === "playerId가 필요합니다."
        || error.message === "라운드 페이즈에서만 타이머를 시작할 수 있습니다."
      )
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof Error && error.message === "해당 캐릭터 슬롯을 찾을 수 없습니다.") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (isSessionConflictError(error)) {
      return createSessionConflictResponse();
    }

    throw error;
  }
}

/** DELETE /api/sessions/[sessionId] — 세션 파일 삭제 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { sessionId } = params;
  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const canManage = await canManageSession(req, session);
  if (!canManage) {
    const currentUser = await getRequestMakerUser(req);
    const hostById = isSessionHost(session, currentUser?.id);
    const hostByCookie = !hostById && hasStoredGmSessionAccess(session, req.cookies);
    if (!hostById && !hostByCookie) {
      return NextResponse.json({ error: "이 세션을 삭제할 권한이 없습니다." }, { status: 403 });
    }
  }

  broadcast(sessionId, "session_deleted", {});
  const deleted = await deleteSession(sessionId);
  if (!deleted) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
