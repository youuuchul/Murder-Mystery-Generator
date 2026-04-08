import type { GamePackage } from "@/types/game";
import type { CharacterSlot, GameSession, SessionMode } from "@/types/session";
import { createInitialPlayerAgentSessionState } from "@/lib/ai/player-agent/core/player-agent-state";

const SESSION_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * 사람이 읽고 입력하기 쉬운 6자리 세션 코드를 만든다.
 * 0/O, 1/I 같은 혼동 문자는 제외한다.
 */
export function generateSessionCode(): string {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += SESSION_CODE_CHARS[Math.floor(Math.random() * SESSION_CODE_CHARS.length)];
  }
  return code;
}

/**
 * 게임 정의를 바탕으로 새 세션의 기본 슬롯/공용 상태를 만든다.
 * local 파일 저장과 Supabase DB 저장이 같은 초깃값을 공유하도록 분리한다.
 */
export function buildInitialSession(
  game: GamePackage,
  sessionId = crypto.randomUUID(),
  sessionCode = generateSessionCode(),
  now = new Date().toISOString(),
  sessionName = "새 방",
  hostUserId?: string,
  sessionMode: SessionMode = "gm"
): GameSession {
  const nextSessionId = sessionId;
  const slots: CharacterSlot[] = game.players.map((player) => ({
    playerId: player.id,
    playerName: null,
    token: null,
    isLocked: false,
    isAiControlled: false,
  }));

  return {
    id: nextSessionId,
    gameId: game.id,
    sessionName,
    sessionCode,
    mode: sessionMode,
    hostUserId,
    createdAt: now,
    updatedAt: now,
    sharedState: {
      phase: "lobby",
      phaseStartedAt: now,
      currentRound: 0,
      publicClueIds: [],
      acquiredClueIds: [],
      eventLog: [
        {
          id: crypto.randomUUID(),
          timestamp: now,
          message: "세션이 생성됐습니다.",
          type: "system",
        },
      ],
      characterSlots: slots,
      phaseAdvanceRequestPlayerIds: [],
      voteCount: 0,
    },
    playerStates: [],
    votes: {},
    playerAgentState: createInitialPlayerAgentSessionState(
      nextSessionId,
      sessionMode,
      slots.map((slot) => slot.playerId)
    ),
  };
}
