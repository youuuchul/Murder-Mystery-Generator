import type { MakerAssistantContext } from "@/lib/ai/maker-assistant-context";
import {
  MAKER_ASSISTANT_TASK_LABELS,
  type MakerAssistantResult,
  type MakerAssistantTask,
} from "@/types/assistant";

const RESPONSE_SHAPE_EXAMPLE: MakerAssistantResult = {
  summary: "전체 상태를 요약한 짧은 설명",
  findings: [
    {
      severity: "warning",
      title: "예시 이슈 제목",
      detail: "왜 이 점이 문제인지 또는 어떤 보강이 필요한지 설명",
      relatedStep: 3,
    },
  ],
  suggestedActions: [
    {
      label: "예시 작업",
      reason: "왜 이 작업을 지금 먼저 해야 하는지 설명",
      step: 3,
    },
  ],
  followUpQuestions: ["추가로 물어볼 만한 질문"],
};

/**
 * 제작 도우미 전용 시스템 프롬프트를 만든다.
 * 모든 task가 동일한 JSON 스키마를 반환하게 강제해 프론트 렌더링을 단순화한다.
 */
export function buildMakerAssistantSystemPrompt(task: MakerAssistantTask): string {
  return [
    "당신은 한국어로 답하는 머더미스터리 시나리오 제작 도우미다.",
    "반드시 제공된 게임 데이터만 근거로 판단하고, 데이터에 없는 사실은 추정이라고 명시한다.",
    "이미 deterministic validation으로 잡히는 단순 필수값 누락만 반복하지 말고, 의미적 모순, 약한 연결, 구체적 보강안을 우선 본다.",
    getTaskGuidelines(task),
    "반드시 JSON 객체만 반환하고, 마크다운/코드펜스/서론/맺음말을 넣지 마라.",
    "JSON shape는 정확히 다음 필드만 사용한다:",
    JSON.stringify(RESPONSE_SHAPE_EXAMPLE, null, 2),
    "제약:",
    "- summary는 2~4문장으로 작성한다.",
    "- findings는 최대 6개로 제한한다.",
    "- suggestedActions는 최대 4개로 제한한다.",
    "- relatedStep이 있으면 1~5 사이 숫자를 사용한다.",
    "- followUpQuestions는 비어 있어도 된다.",
  ].join("\n");
}

/** task별로 모델이 집중해야 할 판단 기준을 추가한다. */
function getTaskGuidelines(task: MakerAssistantTask): string {
  switch (task) {
    case "validate_consistency":
      return [
        "현재 목표는 서사적 모순과 타임라인/단서 간 충돌을 검토하는 것이다.",
        "모순, 애매함, 보강 아이디어를 구분해서 제시하되, 근거가 약하면 추정으로 표시한다.",
      ].join("\n");
    case "suggest_clues":
      return [
        "현재 목표는 기존 배경과 비밀에 맞는 새 단서를 제안하는 것이다.",
        "제안은 바로 입력 가능한 수준으로 구체적이어야 하며, 기존 단서와의 연결 이유를 포함해야 한다.",
      ].join("\n");
    case "suggest_next_steps":
      return [
        "현재 목표는 지금 작업 상태에서 다음 우선순위를 정하는 것이다.",
        "사용자가 다음에 무엇을 채워야 하는지 Step 번호와 이유를 붙여 실무적으로 제안한다.",
      ].join("\n");
    case "chat":
      return [
        "현재 목표는 사용자의 자유 질문에 답하되, 가능한 경우 구체적인 작업 제안으로 연결하는 것이다.",
        "질문이 모호하면 현재 Step과 validation 상태를 기준으로 가장 유용한 방향을 제안한다.",
      ].join("\n");
  }
}

/** task, 사용자 입력, 축약 컨텍스트를 하나의 user prompt 문자열로 합친다. */
export function buildMakerAssistantUserPrompt(params: {
  task: MakerAssistantTask;
  context: MakerAssistantContext;
  message?: string;
}): string {
  const { task, context, message } = params;

  return [
    `Task: ${MAKER_ASSISTANT_TASK_LABELS[task]}`,
    message?.trim() ? `User Request: ${message.trim()}` : "User Request: 빠른 액션 실행",
    "Context JSON:",
    JSON.stringify(context, null, 2),
  ].join("\n\n");
}
