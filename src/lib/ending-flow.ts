import type { EndingBranch, GamePackage, PersonalEnding } from "@/types/game";
import type { EndingStage, VoteReveal } from "@/types/session";

export const ENDING_STAGE_LABELS: Record<EndingStage, string> = {
  "vote-result": "투표 결과",
  branch: "분기 엔딩",
  "vote-round-2-pre-story": "2차 투표 안내",
  "vote-round-2": "2차 투표",
  "branch-2": "2차 분기 엔딩",
  personal: "개인 엔딩",
  "author-notes": "작가 후기",
  complete: "공개 완료",
};

function hasText(value?: string): boolean {
  return Boolean(value?.trim());
}

/** 세션에 저장된 엔딩 단계를 안전한 기본값과 함께 정규화한다. */
export function normalizeEndingStage(stage?: EndingStage): EndingStage {
  if (
    stage === "vote-result"
    || stage === "branch"
    || stage === "vote-round-2-pre-story"
    || stage === "vote-round-2"
    || stage === "branch-2"
    || stage === "personal"
    || stage === "author-notes"
    || stage === "complete"
  ) {
    return stage;
  }

  return "vote-result";
}

/** 개인 엔딩 단계가 실제로 필요한지 판단한다. */
export function hasPersonalEndingStage(game: GamePackage, reveal?: VoteReveal): boolean {
  const branch = resolveActiveEndingBranch(game, reveal);
  return Boolean(branch?.personalEndingsEnabled)
    && resolveBranchPersonalEndings(branch).some((ending) => hasText(ending.text));
}

/** 작가 노트 단계가 실제로 필요한지 판단한다. */
export function hasAuthorNotesStage(game: GamePackage): boolean {
  return game.ending.authorNotesEnabled
    && game.ending.authorNotes.some((note) => hasText(note.title) || hasText(note.content));
}

/** 고급 투표에서 2차 투표 질문이 존재하는지 판단한다. */
function hasSecondVoteRound(game: GamePackage): boolean {
  return game.advancedVotingEnabled
    && game.voteQuestions.some((q) => q.voteRound === 2);
}

/**
 * 1차 엔딩 투표가 커스텀 선택지 모드인지 판단한다.
 * custom-choices일 때는 `advancedVotingEnabled` 플래그와 무관하게
 * 선택지 기반 분기 엔딩(custom-choice-matched / fallback)을 사용해야 한다.
 */
export function hasCustomChoiceEnding(game: GamePackage): boolean {
  const primaryEndingQuestion = game.voteQuestions.find(
    (q) => q.purpose === "ending" && q.voteRound === 1
  );
  return primaryEndingQuestion?.targetMode === "custom-choices";
}

/**
 * 메이커·플레이·API 모든 경로에서 "선택지 기반 고급 엔딩 UI/로직"을 사용해야 하는지 판단.
 * advancedVotingEnabled(2차 투표 포함) 또는 1차 엔딩 투표의 custom-choices 모드면 true.
 */
export function shouldUseAdvancedEndingPath(game: GamePackage): boolean {
  return Boolean(game.advancedVotingEnabled) || hasCustomChoiceEnding(game);
}

/** 현재 게임 설정에서 가능한 엔딩 단계 순서를 계산한다. */
export function getEndingStageOrder(game: GamePackage, reveal?: VoteReveal): EndingStage[] {
  const stages: EndingStage[] = ["vote-result", "branch"];

  if (hasSecondVoteRound(game)) {
    const round2Q = game.voteQuestions.find((q) => q.voteRound === 2);
    if (round2Q?.preStoryText?.trim()) {
      stages.push("vote-round-2-pre-story");
    }
    stages.push("vote-round-2");
    stages.push("branch-2");
  }

  if (hasPersonalEndingStage(game, reveal)) {
    stages.push("personal");
  }

  if (hasAuthorNotesStage(game)) {
    stages.push("author-notes");
  }

  stages.push("complete");
  return stages;
}

/** 현재 단계 다음에 공개할 엔딩 단계를 반환한다. */
export function getNextEndingStage(
  game: GamePackage,
  currentStage?: EndingStage,
  reveal?: VoteReveal
): EndingStage | null {
  const stages = getEndingStageOrder(game, reveal);
  const current = normalizeEndingStage(currentStage);
  const index = stages.indexOf(current);

  if (index === -1 || index >= stages.length - 1) {
    return null;
  }

  return stages[index + 1];
}

/** 현재 활성 분기에서 실제로 표시할 개인 엔딩 목록만 골라낸다. */
export function resolveBranchPersonalEndings(branch?: EndingBranch): PersonalEnding[] {
  return branch?.personalEndings?.filter((ending) => hasText(ending.text)) ?? [];
}

/** 투표 결과와 엔딩 설정을 바탕으로 현재 표시할 분기 엔딩을 찾는다. */
export function resolveActiveEndingBranch(
  game: GamePackage,
  reveal?: VoteReveal
): EndingBranch | undefined {
  if (!reveal) {
    return undefined;
  }

  if (reveal.resolvedBranchId) {
    return game.ending.branches.find((branch) => branch.id === reveal.resolvedBranchId);
  }

  if (reveal.resultType === "culprit-captured") {
    return game.ending.branches.find((branch) => branch.triggerType === "culprit-captured");
  }

  if (reveal.arrestedPlayerId) {
    return game.ending.branches.find((branch) => branch.triggerType === "culprit-escaped");
  }

  return undefined;
}
