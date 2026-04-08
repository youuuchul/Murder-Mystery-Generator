import type {
  MakerAssistantRequest,
  MakerAssistantResponseMode,
  MakerAssistantResult,
  MakerAssistantTask,
} from "@/types/assistant";
import type { AppUser } from "@/types/auth";

type MakerAssistantTraceInputParams = {
  currentUser: AppUser;
  payload: MakerAssistantRequest;
  responseMode: MakerAssistantResponseMode;
};

type MakerAssistantTraceOutputParams = {
  result: MakerAssistantResult;
  repairAttempts: number;
};

/**
 * Langfuse 에서 한눈에 찾기 쉬운 메이커 도우미 trace 이름을 만든다.
 * task 별 목적이 드러나야 대시보드에서 validate/chat/draft 흐름을 바로 구분할 수 있다.
 */
export function getMakerAssistantTraceName(
  task: MakerAssistantTask,
  responseMode: MakerAssistantResponseMode
): string {
  const taskLabel = task.replace(/_/g, "-");
  return `maker-assistant.${taskLabel}.${responseMode}`;
}

/** 같은 작업자와 같은 게임에서 일어난 메이커 AI 요청을 한 세션으로 묶는다. */
export function getMakerAssistantTraceSessionId(
  userId: string,
  gameId: string
): string {
  return `maker-assistant:${userId}:${gameId}`.slice(0, 200);
}

/** 태스크와 화면 단계별 trace 필터링을 쉽게 하도록 짧은 태그 세트를 만든다. */
export function getMakerAssistantTraceTags(
  task: MakerAssistantTask,
  responseMode: MakerAssistantResponseMode,
  currentStep: number
): string[] {
  return [
    "maker-assistant",
    `task:${task.replace(/_/g, "-")}`,
    `mode:${responseMode}`,
    `step:${currentStep}`,
  ];
}

/**
 * 전체 게임 JSON 대신 trace 에 필요한 최소 요청 요약만 남긴다.
 * 스포일러/대용량 prompt 원문을 trace input 으로 그대로 남기지 않기 위한 경계다.
 */
export function buildMakerAssistantTraceInput({
  currentUser,
  payload,
  responseMode,
}: MakerAssistantTraceInputParams): Record<string, unknown> {
  return {
    task: payload.task,
    responseMode,
    currentStep: payload.currentStep,
    user: {
      id: currentUser.id,
      displayName: currentUser.displayName,
      role: currentUser.role,
    },
    game: {
      id: payload.game.id,
      title: payload.game.title,
      visibility: payload.game.access.visibility,
      playerCount: payload.game.players.length,
      locationCount: payload.game.locations.length,
      clueCount: payload.game.clues.length,
      roundCount: payload.game.rules.roundCount,
    },
    messagePreview: buildPreview(payload.message, 240),
    conversationTurnCount: payload.conversationHistory?.length ?? 0,
    clueSuggestionScope: payload.clueSuggestionContext?.scope ?? null,
    clueSuggestionCount: payload.clueSuggestionContext?.count ?? null,
    clueSuggestionLocationId: payload.clueSuggestionContext?.locationId ?? null,
    clueSuggestionPlayerId: payload.clueSuggestionContext?.playerId ?? null,
  };
}

/**
 * 결과 trace 에도 전체 생성문 대신 요약만 남긴다.
 * guide/draft 모드별 핵심 개수와 짧은 미리보기만 있으면 운영 분석에는 충분하다.
 */
export function buildMakerAssistantTraceOutput({
  result,
  repairAttempts,
}: MakerAssistantTraceOutputParams): Record<string, unknown> {
  if (result.mode === "guide") {
    return {
      mode: result.mode,
      repairAttempts,
      summaryPreview: buildPreview(result.summary, 220),
      findingsCount: result.findings.length,
      warningCount: result.findings.filter((item) => item.severity === "warning").length,
      errorCount: result.findings.filter((item) => item.severity === "error").length,
      suggestedActionCount: result.suggestedActions.length,
      followUpQuestionCount: result.followUpQuestions.length,
    };
  }

  return {
    mode: result.mode,
    repairAttempts,
    title: result.title ?? null,
    bodyPreview: buildPreview(result.body, 220),
    bodyLength: result.body.length,
    noteCount: result.notes.length,
  };
}

/** UI/trace 에 동시에 쓰기 편한 짧은 generation 이름을 만든다. */
export function getMakerAssistantGenerationName(
  stage: "primary" | "repair",
  task: MakerAssistantTask,
  responseMode: MakerAssistantResponseMode
): string {
  return `maker-assistant.${stage}.${task.replace(/_/g, "-")}.${responseMode}`;
}

function buildPreview(value: string | undefined | null, maxLength: number): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
