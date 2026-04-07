import { NextRequest, NextResponse } from "next/server";
import { buildGameForPlayer } from "@/lib/game-sanitizer";
import { ENDING_STAGE_LABELS, getNextEndingStage, normalizeEndingStage } from "@/lib/ending-flow";
import { canAccessGmPlay } from "@/lib/game-access";
import { canResumeGmSessionDirectly } from "@/lib/gm-session-access";
import { getGame } from "@/lib/game-repository";
import { isMakerAdmin } from "@/lib/maker-role";
import { getRequestMakerUser } from "@/lib/maker-user.server";
import { clearPhaseAdvanceRequests } from "@/lib/session-phase";
import { mutateSessionWithRetry } from "@/lib/session-mutation";
import {
  deleteSession,
  getSession,
  isGmManagedSession,
  SessionConflictError,
  isSessionConflictError,
} from "@/lib/session-repository";
import { broadcast } from "@/lib/sse/broadcaster";
import type { EndingStage, GamePhase, GameSession } from "@/types/session";

type Params = { params: { sessionId: string } };

async function canAccessGmSession(request: NextRequest, session: GameSession): Promise<boolean> {
  if (!isGmManagedSession(session)) {
    return false;
  }

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

/** GET /api/sessions/[sessionId] — 세션 상태 조회 */
export async function GET(req: NextRequest, { params }: Params) {
  const { sessionId } = params;
  const token = new URL(req.url).searchParams.get("token");

  const session = await getSession(sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  // 플레이어 개인 상태 — token으로 필터링
  if (token) {
    const pState = session.playerStates.find((p) => p.token === token);
    if (!pState) return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    const game = await getGame(session.gameId);
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    return NextResponse.json({
      sharedState: session.sharedState,
      playerState: pState,
      gameId: session.gameId,
      game: buildGameForPlayer(game, pState.playerId),
      sessionCode: session.sessionCode,
      sessionName: session.sessionName,
    });
  }

  if (!(await canAccessGmSession(req, session))) {
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
    },
  });
}

/** PATCH /api/sessions/[sessionId] — GM 페이즈 제어 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { sessionId } = params;
  const body = await req.json().catch(() => ({})) as {
    action?: string;
    subPhase?: string;
    playerId?: string;
    sessionName?: string;
  };

  const session = await getSession(sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  if (!(await canAccessGmSession(req, session))) {
    return NextResponse.json({ error: "이 세션을 수정할 권한이 없습니다." }, { status: 403 });
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
        let newPhase: GamePhase = sharedState.phase;
        let message = "";

        if (body.action === "advance_phase") {
          if (sharedState.phase === "lobby") {
            newPhase = "opening";
            message = "오프닝이 시작됩니다.";
            latestSession.startedAt = new Date().toISOString();
          } else if (sharedState.phase === "opening") {
            newPhase = "round-1";
            sharedState.currentRound = 1;
            sharedState.currentSubPhase = "investigation";
            message = "Round 1 조사 페이즈가 시작됩니다.";
          } else if (sharedState.phase.startsWith("round-")) {
            const cur = sharedState.currentRound;
            if (cur >= maxRound) {
              newPhase = "vote";
              sharedState.currentSubPhase = undefined;
              message = "투표 페이즈가 시작됩니다.";
            } else {
              newPhase = `round-${cur + 1}` as GamePhase;
              sharedState.currentRound = cur + 1;
              sharedState.currentSubPhase = "investigation";
              message = `Round ${cur + 1} 조사 페이즈가 시작됩니다.`;
            }
          } else if (sharedState.phase === "vote") {
            throw new Error("투표 결과를 먼저 공개하세요.");
          }

          clearPhaseAdvanceRequests(sharedState);
        } else if (body.action === "set_subphase") {
          const sub = normalizeSubPhase(body.subPhase);
          if (sub && sharedState.phase.startsWith("round-")) {
            sharedState.currentSubPhase = sub;
            const labels: Record<string, string> = { investigation: "조사", discussion: "토론" };
            message = `${labels[sub]} 페이즈가 시작됩니다.`;
            clearPhaseAdvanceRequests(sharedState);
          }
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
          message = `${ENDING_STAGE_LABELS[nextStage]} 단계가 공개됩니다.`;
        } else if (body.action === "end_session") {
          throw new Error("세션 강제 종료는 더 이상 사용할 수 없습니다.");
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
        if (message) {
          sharedState.eventLog.push({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            message,
            type: "phase_changed",
          });
        }

        return null;
      }
    );

    broadcast(sessionId, "session_update", { sharedState: persistedSession.sharedState });

    return NextResponse.json({
      session: {
        id: persistedSession.id,
        sessionName: persistedSession.sessionName,
        sharedState: persistedSession.sharedState,
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
        || error.message === "세션 강제 종료는 더 이상 사용할 수 없습니다."
        || error.message === "방 제목을 입력해주세요."
        || error.message === "playerId가 필요합니다."
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

  if (!(await canAccessGmSession(req, session))) {
    return NextResponse.json({ error: "이 세션을 삭제할 권한이 없습니다." }, { status: 403 });
  }

  broadcast(sessionId, "session_deleted", {});
  const deleted = await deleteSession(sessionId);
  if (!deleted) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
