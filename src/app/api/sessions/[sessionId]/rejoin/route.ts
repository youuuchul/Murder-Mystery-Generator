import { NextResponse } from "next/server";
import { mutateSessionWithRetry } from "@/lib/session-mutation";
import { broadcast } from "@/lib/sse/broadcaster";
import { isSessionConflictError } from "@/lib/session-repository";

type Params = { params: { sessionId: string } };

interface RejoinRequestBody {
  playerId?: string;
  playerName?: string;
}

/**
 * POST /api/sessions/[sessionId]/rejoin
 * 잠긴 슬롯에 대해 기존 참가자 이름을 다시 확인한 뒤 새 토큰을 발급한다.
 */
export async function POST(req: Request, { params }: Params) {
  const { sessionId } = params;
  const { playerId, playerName } = await req.json().catch(() => ({})) as RejoinRequestBody;
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

        if (!slot.isLocked || !slot.playerName || !slot.token) {
          throw new Error("아직 참가하지 않은 슬롯입니다. 새 참가로 진행하세요.");
        }

        if (slot.playerName !== normalizedPlayerName) {
          throw new Error("기존 참가 이름이 일치하지 않습니다.");
        }

        const playerState = session.playerStates.find((item) => item.playerId === playerId);
        if (!playerState) {
          throw new Error("기존 참가 정보를 복구할 수 없습니다. GM에게 재참가 허용을 요청하세요.");
        }

        const previousToken = playerState.token;
        const nextToken = crypto.randomUUID();

        playerState.token = nextToken;
        slot.token = nextToken;

        if (previousToken && previousToken in session.votes) {
          session.votes[nextToken] = session.votes[previousToken];
          delete session.votes[previousToken];
        }

        session.sharedState.eventLog.push({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          message: `${normalizedPlayerName}님이 기존 슬롯으로 재접속했습니다.`,
          type: "system",
        });

        return { nextToken };
      }
    );

    broadcast(sessionId, "session_update", { sharedState: persistedSession.sharedState });

    return NextResponse.json({
      token: result.nextToken,
      sessionId,
      gameId: persistedSession.gameId,
      playerId,
      playerName: normalizedPlayerName,
      mode: "rejoin",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "해당 캐릭터 슬롯 없음") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof Error && error.message === "아직 참가하지 않은 슬롯입니다. 새 참가로 진행하세요.") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof Error && error.message === "AI가 맡은 자리입니다.") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof Error && error.message === "기존 참가 이름이 일치하지 않습니다.") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (
      error instanceof Error
      && error.message === "기존 참가 정보를 복구할 수 없습니다. GM에게 재참가 허용을 요청하세요."
    ) {
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
