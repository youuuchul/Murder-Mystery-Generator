import type {
  GamePackage,
  GamePublishChecklistItem,
  GamePublishReadiness,
} from "@/types/game";
import { validateMakerGame } from "@/lib/maker-validation";

const MAKER_STEP_LABEL: Record<number, string> = {
  1: "기본 설정",
  2: "오프닝 / 배경 설정",
  3: "플레이어",
  4: "단서 카드",
  5: "스크립트",
  6: "투표 & 엔딩",
};

/**
 * 공개 라이브러리에 올리기 전 필요한 최소 체크리스트를 계산한다.
 * 공개 전환 기준은 메이커 편집기의 필수 검증(error)을 그대로 재사용한다.
 * 화면별 카운트와 공개 전환 실패 사유가 서로 갈라지지 않게 단일 규칙을 유지한다.
 */
export function getGamePublishReadiness(game: GamePackage): GamePublishReadiness {
  const makerValidation = validateMakerGame(game);
  const blockingIssues = makerValidation.issues.filter((issue) => issue.level === "error");
  const checklist: GamePublishChecklistItem[] = blockingIssues.map<GamePublishChecklistItem>((issue) => ({
    id: `maker:${issue.id}`,
    label: MAKER_STEP_LABEL[issue.step] ?? `Step ${issue.step}`,
    passed: false,
    detail: issue.message,
  }));

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
