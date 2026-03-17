import type { GamePackage, Player, RoundScript, ScriptSegment } from "@/types/game";

/**
 * 스크립트 세그먼트에서 GM 전용 메모/미디어를 제거한다.
 * 플레이어와 참가 페이지에는 나레이션만 전달한다.
 */
function sanitizeSegment(segment: ScriptSegment): ScriptSegment {
  return {
    narration: segment.narration,
  };
}

/**
 * 라운드 스크립트에서 GM 전용 메모/미디어를 제거한다.
 * 라운드 스크립트는 플레이어 화면에서 사용하지 않으므로 메타데이터만 남긴다.
 */
function sanitizeRound(round: RoundScript): RoundScript {
  return {
    round: round.round,
    narration: "",
    unlockedLocationIds: [],
  };
}

/**
 * 특정 플레이어에게 보이지 않아야 하는 캐릭터 민감정보를 제거한다.
 * 현재 플레이어 본인 데이터는 원본 그대로 유지한다.
 */
function sanitizePlayer(player: Player, viewerPlayerId?: string): Player {
  if (viewerPlayerId && player.id === viewerPlayerId) {
    return player;
  }

  return {
    ...player,
    victoryCondition: "uncertain",
    personalGoal: undefined,
    scoreConditions: [],
    story: "",
    secret: "",
    alibi: "",
    timelineEntries: [],
    relatedClues: [],
    cardImage: undefined,
  };
}

/**
 * 엔딩 설정에서 플레이어에게 공개해도 되는 필드만 남긴다.
 * 개인 엔딩은 현재 플레이어 본인 것만 전달하고 작가 노트는 제외한다.
 */
function sanitizeEnding(game: GamePackage, viewerPlayerId?: string): GamePackage["ending"] {
  return {
    branches: game.ending.branches.map((branch) => ({
      ...branch,
      personalEndings: viewerPlayerId
        ? (branch.personalEndings ?? []).filter((ending) => ending.playerId === viewerPlayerId)
        : [],
    })),
    personalEndingsEnabled: false,
    personalEndings: [],
    authorNotesEnabled: false,
    authorNotes: [],
  };
}

/**
 * 참가 페이지/플레이어 화면용 공개 게임 패키지를 만든다.
 * 범인, GM 보드 메모, GM 미디어, 타 플레이어 비밀 정보는 제거된다.
 */
function sanitizeGame(game: GamePackage, viewerPlayerId?: string): GamePackage {
  return {
    ...game,
    story: {
      ...game.story,
      synopsis: "",
      culpritPlayerId: "",
      motive: "",
      method: "",
      gmOverview: "",
      mapImageUrl: undefined,
    },
    players: game.players.map((player) => sanitizePlayer(player, viewerPlayerId)),
    scripts: {
      lobby: sanitizeSegment(game.scripts.lobby),
      opening: sanitizeSegment(game.scripts.opening),
      rounds: game.scripts.rounds.map(sanitizeRound),
      vote: sanitizeSegment(game.scripts.vote),
      ending: sanitizeSegment(game.scripts.ending),
      endingSuccess: game.scripts.endingSuccess
        ? sanitizeSegment(game.scripts.endingSuccess)
        : undefined,
      endingFail: game.scripts.endingFail
        ? sanitizeSegment(game.scripts.endingFail)
        : undefined,
    },
    ending: sanitizeEnding(game, viewerPlayerId),
  };
}

/** 참가 페이지용 공개 게임 */
export function buildPublicGame(game: GamePackage): GamePackage {
  return sanitizeGame(game);
}

/** 플레이어 개인 화면용 게임 */
export function buildGameForPlayer(game: GamePackage, viewerPlayerId: string): GamePackage {
  return sanitizeGame(game, viewerPlayerId);
}
