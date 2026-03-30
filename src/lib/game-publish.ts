import type {
  GamePackage,
  GamePublishChecklistItem,
  GamePublishReadiness,
} from "@/types/game";

/**
 * 공개 라이브러리에 올리기 전 필요한 최소 체크리스트를 계산한다.
 * 메이커 전체 검증보다 범위를 좁혀, 공개 전환 직전에 필요한 핵심 항목만 다룬다.
 */
export function getGamePublishReadiness(game: GamePackage): GamePublishReadiness {
  const checklist: GamePublishChecklistItem[] = [
    {
      id: "title",
      label: "제목",
      passed: Boolean(game.title.trim()),
      detail: "제목이 필요합니다.",
    },
    {
      id: "summary",
      label: "라이브러리 소개글",
      passed: Boolean(game.settings.summary?.trim()),
      detail: "라이브러리 소개글이 필요합니다.",
    },
    {
      id: "players",
      label: "플레이어 수",
      passed: game.players.length === game.settings.playerCount,
      detail: "등록된 플레이어 수를 기본 설정 인원 수와 맞춰주세요.",
    },
    {
      id: "opening",
      label: "오프닝 기본 스크립트",
      passed: Boolean(game.scripts.opening.narration.trim()),
      detail: "오프닝 기본 스크립트가 필요합니다.",
    },
    {
      id: "ending",
      label: "엔딩",
      passed: game.ending.branches.length > 0 || Boolean(game.scripts.ending.narration.trim()),
      detail: "엔딩 분기 또는 엔딩 스크립트가 필요합니다.",
    },
  ];

  return {
    ready: checklist.every((item) => item.passed),
    checklist,
  };
}

/** 공개 전환을 막는 실패 사유 목록만 추린다. */
export function getGamePublishReadinessIssues(game: GamePackage): string[] {
  return getGamePublishReadiness(game)
    .checklist
    .filter((item) => !item.passed)
    .map((item) => item.detail);
}
