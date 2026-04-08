import { NextResponse } from "next/server";
import { clearPhaseAdvanceRequests } from "@/lib/session-phase";
import { mutateSessionWithRetry } from "@/lib/session-mutation";
import { broadcast } from "@/lib/sse/broadcaster";
import { isSessionConflictError } from "@/lib/session-repository";

type Params = { params: { sessionId: string } };
interface JoinRequestBody {
  playerId?: string;
  playerName?: string;
}

/**
 * POST /api/sessions/[sessionId]/join
 * 비어 있는 슬롯에 새로 참가하거나, GM이 재참가 허용으로 풀어둔 슬롯의 진행 상태를 이어받는다.
 */
export async function POST(req: Request, { params }: Params) {
  const { sessionId } = params;
  const { playerId, playerName } = await req.json().catch(() => ({})) as JoinRequestBody;
  const normalizedPlayerName = playerName?.trim();

  if (!playerId || !normalizedPlayerName) {
    return NextResponse.json(
      { error: "playerId, playerName 필수" },
      { status: 400 }
    );
  }

  try {
    const { session: persistedSession, result } = await mutateSessionWithRetry(
      sessionId,
      (session) => {
        const slot = session.sharedState.characterSlots.find((item) => item.playerId === playerId);
        if (!slot) {
          throw new Error("해당 캐릭터 슬롯 없음");
        }

        if (slot.isAiControlled) {
          throw new Error("AI가 맡은 자리입니다.");
        }

        if (slot.isLocked) {
          throw new Error("이미 참가한 슬롯입니다.");
        }

        const existingPlayerState = session.playerStates.find((item) => item.playerId === playerId);
        const previousToken = slot.token ?? existingPlayerState?.token;
        const token = crypto.randomUUID();

        slot.playerName = normalizedPlayerName;
        slot.token = token;
        slot.isLocked = true;
        slot.isAiControlled = false;

        if (existingPlayerState) {
          existingPlayerState.token = token;
          existingPlayerState.playerName = normalizedPlayerName;
        } else {
          session.playerStates.push({
            token,
            playerId,
            playerName: normalizedPlayerName,
            inventory: [],
            transferLog: [],
            roundAcquired: {},
            roundVisitedLocations: {},
          });
        }

        if (previousToken && previousToken in session.votes) {
          session.votes[token] = session.votes[previousToken];
          delete session.votes[previousToken];
        }
        session.sharedState.voteCount = Object.keys(session.votes).length;
        clearPhaseAdvanceRequests(session.sharedState);

        session.sharedState.eventLog.push({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          message: existingPlayerState
            ? `${normalizedPlayerName}님이 기존 진행 상태를 이어서 참가했습니다.`
            : `${normalizedPlayerName}님이 참가했습니다.`,
          type: "player_joined",
        });

        return { token };
      }
    );

    broadcast(sessionId, "session_update", { sharedState: persistedSession.sharedState });

    return NextResponse.json({
      token: result.token,
      sessionId,
      gameId: persistedSession.gameId,
      playerId,
      playerName: normalizedPlayerName,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "해당 캐릭터 슬롯 없음") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof Error && error.message === "이미 참가한 슬롯입니다.") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof Error && error.message === "AI가 맡은 자리입니다.") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (isSessionConflictError(error)) {
      return NextResponse.json(
        { error: "다른 참가 변경이 먼저 반영됐습니다. 잠시 후 다시 시도해주세요." },
        { status: 409 }
      );
    }

    throw error;
  }
}
