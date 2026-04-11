import { NextResponse } from "next/server";
import {
  applyPlayerAgentOccupancyToCharacterSlots,
  enablePlayerAgentSlotsForMissingPlayers,
  syncPlayerAgentRuntimeStatusForSharedPhase,
} from "@/lib/ai/player-agent/core/player-agent-state";
import { ENDING_STAGE_LABELS, getNextEndingStage, normalizeEndingStage } from "@/lib/ending-flow";
import { getGame } from "@/lib/game-repository";
import {
  applySessionAdvanceStep,
  clearPhaseAdvanceRequests,
  type SessionAdvanceRequestAction,
} from "@/lib/session-phase";
import { mutateSessionWithRetry } from "@/lib/session-mutation";
import { getSession, isSessionConflictError } from "@/lib/session-repository";
import { broadcast } from "@/lib/sse/broadcaster";

type Params = { params: { sessionId: string } };

interface PhaseRequestBody {
  token?: string;
  action?: SessionAdvanceRequestAction;
  fillMissingWithAi?: boolean;
}

/**
 * 플레이어가 다음 단계 진행 요청을 누르거나 취소한다.
 * 현재 참가 중인 인원이 모두 요청하면 GM 없이도 다음 스텝으로 진행된다.
 */
export async function POST(req: Request, { params }: Params) {
  const { sessionId } = params;
  const {
    token,
    action = "request",
    fillMissingWithAi = false,
  } = await req.json().catch(() => ({})) as PhaseRequestBody;

  if (!token) {
    return NextResponse.json({ error: "token이 필요합니다." }, { status: 400 });
  }

  const existingSession = await getSession(sessionId);
  if (!existingSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const game = await getGame(existingSession.gameId);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  try {
    const { session: persistedSession, result } = await mutateSessionWithRetry(
      sessionId,
      (latestSession) => {
        if (latestSession.sharedState.phase === "vote") {
          throw new Error("이 단계에서는 진행 요청을 사용할 수 없습니다.");
        }

        const playerState = latestSession.playerStates.find((item) => item.token === token);
        if (!playerState) {
          throw new Error("Invalid token");
        }

        const slot = latestSession.sharedState.characterSlots.find((item) => item.playerId === playerState.playerId);
        if (!slot?.isLocked) {
          throw new Error("현재 참가 중인 플레이어만 요청할 수 있습니다.");
        }

        const requestedPlayerIds = new Set(latestSession.sharedState.phaseAdvanceRequestPlayerIds ?? []);
        if (action === "withdraw") {
          requestedPlayerIds.delete(playerState.playerId);
        } else {
          requestedPlayerIds.add(playerState.playerId);
        }

        latestSession.sharedState.phaseAdvanceRequestPlayerIds = [...requestedPlayerIds];

        const joinedPlayerIds = latestSession.sharedState.characterSlots
          .filter((item) => item.isLocked && !item.isAiControlled)
          .map((item) => item.playerId);

        const allJoinedPlayersRequested = joinedPlayerIds.length > 0
          && joinedPlayerIds.every((playerId) => requestedPlayerIds.has(playerId));

        if (allJoinedPlayersRequested && action === "request") {
          if (latestSession.sharedState.phase === "ending") {
            if (latestSession.mode !== "player-consensus") {
              throw new Error("GM이 있는 세션은 플레이어 요청으로 엔딩 단계를 넘길 수 없습니다.");
            }

            if (!game || !latestSession.sharedState.voteReveal) {
              throw new Error("엔딩 결과 데이터가 없습니다.");
            }

            const currentStage = normalizeEndingStage(latestSession.sharedState.endingStage);
            const nextStage = getNextEndingStage(game, currentStage, latestSession.sharedState.voteReveal);

            if (!nextStage) {
              throw new Error("더 진행할 엔딩 단계가 없습니다.");
            }

            latestSession.sharedState.endingStage = nextStage;
            clearPhaseAdvanceRequests(latestSession.sharedState);

            // 2차 투표 진입 시 투표 상태 리셋
            if (nextStage === "vote-round-2") {
              latestSession.sharedState.currentVoteRound = 2;
              latestSession.sharedState.voteCount = 0;
              latestSession.advancedVotes = {};
            }

            if (nextStage === "complete") {
              latestSession.endedAt = new Date().toISOString();
            }

            latestSession.sharedState.eventLog.push({
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              message: nextStage === "complete"
                ? "게임이 종료됐습니다."
                : `${ENDING_STAGE_LABELS[nextStage]} 단계가 공개됩니다.`,
              type: "phase_changed",
            });
          } else {
            if (fillMissingWithAi && latestSession.sharedState.phase === "lobby" && latestSession.playerAgentState) {
              latestSession.playerAgentState = enablePlayerAgentSlotsForMissingPlayers(
                latestSession.playerAgentState,
                {
                  unlockedPlayerIds: latestSession.sharedState.characterSlots
                    .filter((item) => !item.isLocked)
                    .map((item) => item.playerId),
                  missingPlayerCount: Math.max(0, latestSession.sharedState.characterSlots.length - joinedPlayerIds.length),
                }
              );
            }

            applySessionAdvanceStep(latestSession, game);
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
          }

          return {
            advanced: true,
            requested: false,
          };
        }

        if (joinedPlayerIds.length === 0) {
          clearPhaseAdvanceRequests(latestSession.sharedState);
        }

        return {
          advanced: false,
          requested: action === "request",
        };
      }
    );

    broadcast(sessionId, "session_update", { sharedState: persistedSession.sharedState });

    return NextResponse.json({
      ok: true,
      advanced: result.advanced,
      requested: result.requested,
      sharedState: persistedSession.sharedState,
    });
  } catch (error) {
    if (
      error instanceof Error
      && (
        error.message === "token이 필요합니다."
        || error.message === "이 단계에서는 진행 요청을 사용할 수 없습니다."
        || error.message === "현재 참가 중인 플레이어만 요청할 수 있습니다."
        || error.message === "GM이 있는 세션은 플레이어 요청으로 엔딩 단계를 넘길 수 없습니다."
        || error.message === "엔딩 결과 데이터가 없습니다."
        || error.message === "더 진행할 엔딩 단계가 없습니다."
      )
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof Error && error.message === "Invalid token") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (isSessionConflictError(error)) {
      return NextResponse.json(
        { error: "다른 변경사항이 먼저 저장됐습니다. 화면을 새로고침한 뒤 다시 시도해주세요." },
        { status: 409 }
      );
    }

    throw error;
  }
}
