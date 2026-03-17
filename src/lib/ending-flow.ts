import type { EndingBranch, GamePackage, PersonalEnding } from "@/types/game";
import type { EndingStage, VoteReveal } from "@/types/session";

export const ENDING_STAGE_LABELS: Record<EndingStage, string> = {
  branch: "분기 엔딩",
  personal: "개인 엔딩",
  "author-notes": "작가 노트",
  complete: "공개 완료",
};

function hasText(value?: string): boolean {
  return Boolean(value?.trim());
}

/** 세션에 저장된 엔딩 단계를 안전한 기본값과 함께 정규화한다. */
export function normalizeEndingStage(stage?: EndingStage): EndingStage {
  if (stage === "personal" || stage === "author-notes" || stage === "complete") {
    return stage;
  }

  return "branch";
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

/** 현재 게임 설정에서 가능한 엔딩 단계 순서를 계산한다. */
export function getEndingStageOrder(game: GamePackage, reveal?: VoteReveal): EndingStage[] {
  const stages: EndingStage[] = ["branch"];

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
    return game.ending.branches.find((branch) => (
      branch.triggerType === "specific-player-arrested"
      && branch.targetPlayerId === reveal.arrestedPlayerId
    )) ?? game.ending.branches.find((branch) => branch.triggerType === "wrong-arrest-fallback");
  }

  return undefined;
}
