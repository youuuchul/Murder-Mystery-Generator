import type { MakerAssistantContext } from "@/lib/ai/maker-assistant-context";
import {
  MAKER_ASSISTANT_TASK_LABELS,
  type MakerAssistantResponseMode,
  type MakerAssistantTask,
} from "@/types/assistant";

const GUIDE_RESPONSE_FORMAT_GUIDE = [
  "반드시 아래 텍스트 형식으로만 답하라.",
  "SUMMARY:",
  "요약 문장 2~4개를 이어서 작성",
  "",
  "FINDINGS:",
  "FINDING|warning|3|null|null|null|예시 제목|예시 상세 설명",
  "",
  "ACTIONS:",
  "ACTION|3|예시 작업|왜 지금 이 작업을 해야 하는지",
  "",
  "QUESTIONS:",
  "QUESTION|다음에 물어볼 질문",
  "",
  "규칙:",
  "- 각 FINDING, ACTION, QUESTION은 한 줄이어야 한다.",
  "- relatedStep, relatedPlayerId, relatedClueId, relatedSlotId가 없으면 null을 사용한다.",
  "- title, detail, label, reason, question 안에는 | 문자를 쓰지 말고 필요하면 / 로 바꾼다.",
  "- 해당 항목이 없으면 섹션 제목만 남기고 다음 섹션으로 넘어간다.",
  "- JSON, 마크다운, 코드펜스는 금지한다.",
].join("\n");

const DRAFT_RESPONSE_FORMAT_GUIDE = [
  "반드시 아래 텍스트 형식으로만 답하라.",
  "TITLE:",
  "짧은 제목 1줄 또는 비워둘 수 있음",
  "",
  "BODY:",
  "바로 붙여넣을 본문 전체",
  "",
  "NOTES:",
  "NOTE|짧은 메모",
  "",
  "규칙:",
  "- BODY에는 실제 삽입용 문안만 작성한다.",
  "- 분석, 진단, 머리말, 사족, 마무리 문장, 불릿 목록은 금지한다.",
  "- 필요한 맥락 메모가 있으면 NOTES에 최대 3개까지 남긴다.",
  "- NOTES가 없으면 섹션 제목만 남기고 끝낸다.",
  "- JSON, 마크다운, 코드펜스는 금지한다.",
].join("\n");

/**
 * 제작 도우미 전용 시스템 프롬프트를 만든다.
 * guide/draft 응답 모드에 맞게 출력 형식과 금지사항을 분리한다.
 */
export function buildMakerAssistantSystemPrompt(
  task: MakerAssistantTask,
  responseMode: MakerAssistantResponseMode
): string {
  return [
    "당신은 한국어로 답하는 머더미스터리 시나리오 제작 도우미다.",
    "반드시 제공된 게임 데이터만 근거로 판단하고, 데이터에 없는 사실은 추정이라고 명시한다.",
    "이미 deterministic validation으로 잡히는 단순 필수값 누락만 반복하지 말고, 의미적 모순, 약한 연결, 구체적 보강안을 우선 본다.",
    getTaskGuidelines(task, responseMode),
    responseMode === "draft" ? DRAFT_RESPONSE_FORMAT_GUIDE : GUIDE_RESPONSE_FORMAT_GUIDE,
    "제약:",
    responseMode === "draft"
      ? "- draft 본문은 1~4문단 정도의 밀도로 작성한다."
      : "- summary는 2~4문장으로 작성한다.",
    responseMode === "draft"
      ? "- notes는 최대 3개로 제한한다."
      : "- findings는 최대 6개로 제한한다.",
    responseMode === "draft"
      ? "- title은 선택값이며, 없으면 비워둘 수 있다."
      : "- suggestedActions는 최대 4개로 제한한다.",
    "- relatedStep이 있으면 1~6 사이 숫자를 사용한다.",
  ].join("\n");
}

/** task별로 모델이 집중해야 할 판단 기준을 추가한다. */
function getTaskGuidelines(task: MakerAssistantTask, responseMode: MakerAssistantResponseMode): string {
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
      if (responseMode === "draft") {
        return [
          "현재 목표는 사용자가 편집 입력칸에 바로 붙여넣을 문안을 만드는 것이다.",
          "상황 분석이나 작업 우선순위 설명을 본문에 섞지 말고, 실제 문안부터 완성도 있게 작성한다.",
          "요청 대상이 다소 모호하면 현재 Step 맥락에서 가장 가능성 높은 입력칸을 가정하고, 필요한 가정만 NOTES에 짧게 남긴다.",
        ].join("\n");
      }
      return [
        "현재 목표는 사용자의 자유 질문에 답하되, 가능한 경우 구체적인 작업 제안으로 연결하는 것이다.",
        "질문이 모호하면 현재 Step과 validation 상태를 기준으로 가장 유용한 방향을 제안한다.",
      ].join("\n");
  }
}

/** task, 사용자 입력, 축약 컨텍스트를 하나의 user prompt 문자열로 합친다. */
export function buildMakerAssistantUserPrompt(params: {
  task: MakerAssistantTask;
  responseMode: MakerAssistantResponseMode;
  context: MakerAssistantContext;
  message?: string;
}): string {
  const { task, responseMode, context, message } = params;

  return [
    `Task: ${MAKER_ASSISTANT_TASK_LABELS[task]}`,
    `Response Mode: ${responseMode}`,
    responseMode === "draft"
      ? `Draft Focus Hint: ${getDraftFocusHint(context.currentStep.number)}`
      : null,
    message?.trim() ? `User Request: ${message.trim()}` : "User Request: 빠른 액션 실행",
    "Context JSON:",
    JSON.stringify(context, null, 2),
  ].filter(Boolean).join("\n\n");
}

/** draft 생성 시 현재 step에서 주로 쓰는 입력칸 후보를 한 줄 힌트로 제공한다. */
function getDraftFocusHint(currentStep: number): string {
  switch (currentStep) {
    case 1:
      return "기본 소개글, 게임 소개 문구, 첫 인상용 설명 텍스트";
    case 2:
      return "오프닝 내레이션, 사건 개요, 피해자 배경, NPC 소개";
    case 3:
      return "캐릭터 배경, 상세 스토리, 비밀/반전 정보";
    case 4:
      return "장소 설명, 단서 카드 본문, 조건 힌트";
    case 5:
      return "라운드 진행 멘트, GM 가이드, 투표 안내 문구";
    case 6:
      return "분기 엔딩, 개인 엔딩, 결과 설명 문안";
    default:
      return "현재 편집 중인 step에 맞는 삽입용 문안";
  }
}
