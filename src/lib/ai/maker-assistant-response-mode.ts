import type {
  MakerAssistantResponseMode,
  MakerAssistantResponseModePreference,
  MakerAssistantTask,
} from "@/types/assistant";

const DRAFT_INTENT_PATTERNS = [
  /가안/u,
  /초안/u,
  /문안/u,
  /문구/u,
  /대사/u,
  /소개글/u,
  /소개\s*문장/u,
  /스토리\s*텍스트/u,
  /오프닝\s*(?:문장|텍스트|내레이션)?/u,
  /엔딩\s*(?:문구|텍스트|문장)?/u,
  /(?:써|작성)(?:\s*줘|\s*주세요|\s*주라|\s*줄래)/u,
];

const GUIDE_INTENT_PATTERNS = [
  /검토/u,
  /점검/u,
  /모순/u,
  /봐줘/u,
  /괜찮은지/u,
  /우선순위/u,
  /뭐부터/u,
  /추천/u,
  /정리해/u,
  /문제/u,
  /확인해/u,
];

/**
 * chat 요청의 응답 모드를 결정한다.
 * 빠른 액션은 항상 guide로 고정하고, chat만 사용자 선택 또는 문장 의도에서 추론한다.
 */
export function resolveMakerAssistantResponseMode(params: {
  task: MakerAssistantTask;
  message?: string;
  requestedMode?: MakerAssistantResponseModePreference;
}): MakerAssistantResponseMode {
  const { task, message, requestedMode = "auto" } = params;

  if (task !== "chat") {
    return "guide";
  }

  if (requestedMode === "guide" || requestedMode === "draft") {
    return requestedMode;
  }

  return inferMakerAssistantResponseMode(message);
}

/** chat 자유 질문이 분석형인지 문안 생성형인지 간단한 키워드 규칙으로 추론한다. */
export function inferMakerAssistantResponseMode(message?: string): MakerAssistantResponseMode {
  const normalized = message?.trim() ?? "";

  if (!normalized) {
    return "guide";
  }

  const draftScore = DRAFT_INTENT_PATTERNS.reduce(
    (count, pattern) => count + Number(pattern.test(normalized)),
    0
  );
  const guideScore = GUIDE_INTENT_PATTERNS.reduce(
    (count, pattern) => count + Number(pattern.test(normalized)),
    0
  );

  if (draftScore === 0) {
    return "guide";
  }

  return draftScore >= guideScore ? "draft" : "guide";
}
