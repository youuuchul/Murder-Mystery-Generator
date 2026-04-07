import { resolveActiveEndingBranch } from "@/lib/ending-flow";
import type { GamePackage } from "@/types/game";
import type { SharedState } from "@/types/session";

export interface PlayerSharedBoardBlock {
  label: string;
  text: string;
}

export interface PlayerSharedBoardContent {
  title: string;
  badge: string;
  narrationBlocks: PlayerSharedBoardBlock[];
  imageUrl?: string;
  videoUrl?: string;
  backgroundMusic?: string;
}

/**
 * 플레이어가 현재 페이즈에서 함께 봐야 하는 공용 콘텐츠만 고른다.
 * 미래 라운드 정보나 GM 메모는 제외하고, 지금 시점에 필요한 텍스트/미디어만 노출한다.
 */
export function buildPlayerSharedBoardContent(
  game: GamePackage,
  sharedState: SharedState
): PlayerSharedBoardContent | null {
  const phase = sharedState.phase;

  if (phase === "lobby") {
    return {
      title: "대기실",
      badge: "Lobby",
      narrationBlocks: game.scripts.lobby.narration
        ? [{ label: "안내", text: game.scripts.lobby.narration }]
        : [],
      imageUrl: game.story.mapImageUrl,
      videoUrl: game.scripts.lobby.videoUrl,
      backgroundMusic: game.scripts.lobby.backgroundMusic,
    };
  }

  if (phase === "opening") {
    return {
      title: "오프닝",
      badge: "Opening",
      narrationBlocks: game.scripts.opening.narration
        ? [{ label: "스토리 텍스트", text: game.scripts.opening.narration }]
        : [],
      imageUrl: game.story.mapImageUrl,
      videoUrl: game.scripts.opening.videoUrl,
      backgroundMusic: game.scripts.opening.backgroundMusic,
    };
  }

  if (phase.startsWith("round-")) {
    const roundNumber = sharedState.currentRound;
    const roundScript = game.scripts.rounds.find((round) => round.round === roundNumber);

    return {
      title: `Round ${roundNumber}`,
      badge: sharedState.currentSubPhase === "discussion" ? "토론" : "조사",
      narrationBlocks: roundScript?.narration
        ? [{ label: `Round ${roundNumber} 안내`, text: roundScript.narration }]
        : [],
      imageUrl: roundScript?.imageUrl ?? game.story.mapImageUrl,
      videoUrl: roundScript?.videoUrl,
      backgroundMusic: roundScript?.backgroundMusic,
    };
  }

  if (phase === "vote") {
    return {
      title: "투표",
      badge: "Vote",
      narrationBlocks: game.scripts.vote.narration
        ? [{ label: "투표 안내", text: game.scripts.vote.narration }]
        : [],
      imageUrl: game.story.mapImageUrl,
      videoUrl: game.scripts.vote.videoUrl,
      backgroundMusic: game.scripts.vote.backgroundMusic,
    };
  }

  if (phase === "ending") {
    const branch = resolveActiveEndingBranch(game, sharedState.voteReveal);

    return {
      title: "엔딩",
      badge: "Ending",
      narrationBlocks: branch?.storyText
        ? [{ label: branch.label || "엔딩", text: branch.storyText }]
        : game.scripts.ending.narration
          ? [{ label: "엔딩", text: game.scripts.ending.narration }]
          : [],
      videoUrl: branch?.videoUrl ?? game.scripts.ending.videoUrl,
      backgroundMusic: branch?.backgroundMusic ?? game.scripts.ending.backgroundMusic,
    };
  }

  return null;
}
