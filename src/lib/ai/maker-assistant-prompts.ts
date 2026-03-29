import type { MakerAssistantContext } from "@/lib/ai/maker-assistant-context";
import {
  MAKER_ASSISTANT_CLUE_SUGGESTION_SCOPE_LABELS,
  MAKER_ASSISTANT_TASK_LABELS,
  type MakerAssistantClueSuggestionContext,
  type MakerAssistantConversationTurn,
  type MakerAssistantResponseMode,
  type MakerAssistantTask,
} from "@/types/assistant";

type DraftWritingProfile = "narrative_prose" | "descriptive_copy" | "gm_guide";

interface DraftIntent {
  targetLabel: string;
  profile: DraftWritingProfile;
}

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
        "사용자가 지정한 장소, 관련 인물, 제안 개수를 우선 따르고, 맥락이 비어 있으면 전체 게임 기준으로 자연스럽게 보강한다.",
        "guide 모드에서는 각 단서 아이디어를 FINDING 한 항목으로 구분해서 작성하고, 요청 개수에 최대한 맞춘다.",
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
          "스토리, 배경, 오프닝, 엔딩처럼 서사 입력칸이면 게임 설명문이 아니라 소설처럼 자연스러운 산문으로 작성한다.",
          "플레이어 수, 단서 개수, 라운드 번호, 타임라인 시각, 장소 개방 조건 같은 설계 메타데이터를 본문에 그대로 노출하지 않는다. 사용자가 명시적으로 요청한 경우만 예외다.",
          "컨텍스트의 사실을 기계적으로 나열하지 말고, 해당 입력칸 용도에 맞는 문체로 재서술한다.",
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
  conversationHistory?: MakerAssistantConversationTurn[];
  clueSuggestionContext?: MakerAssistantClueSuggestionContext;
}): string {
  const { task, responseMode, context, message, conversationHistory, clueSuggestionContext } = params;
  const draftIntent = responseMode === "draft"
    ? inferDraftIntent(message, context.currentStep.number)
    : null;
  const promptContext = draftIntent
    ? buildDraftPromptContext(context, draftIntent)
    : context;
  const cluePromptContext = task === "suggest_clues" && clueSuggestionContext
    ? buildClueSuggestionPromptContext(context, clueSuggestionContext)
    : null;

  return [
    `Task: ${MAKER_ASSISTANT_TASK_LABELS[task]}`,
    `Response Mode: ${responseMode}`,
    cluePromptContext ? `Clue Suggestion Context:\n${cluePromptContext}` : null,
    responseMode === "draft"
      ? `Draft Focus Hint: ${getDraftFocusHint(context.currentStep.number)}`
      : null,
    draftIntent
      ? [
        `Draft Target: ${draftIntent.targetLabel}`,
        `Draft Profile: ${draftIntent.profile}`,
        "Draft Style Rules:",
        ...getDraftStyleRules(draftIntent),
      ].join("\n")
      : null,
    conversationHistory?.length
      ? `Recent Conversation JSON:\n${JSON.stringify(conversationHistory, null, 2)}`
      : null,
    message?.trim() ? `User Request: ${message.trim()}` : "User Request: 빠른 액션 실행",
    "Context JSON:",
    JSON.stringify(promptContext, null, 2),
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

/** 현재 요청이 어떤 종류의 draft 문안인지 추론해 문체와 금지 요소를 강화한다. */
function inferDraftIntent(message: string | undefined, currentStep: number): DraftIntent {
  const normalized = message?.trim() ?? "";

  if (/(오프닝|스토리\s*텍스트|사건\s*개요|상세\s*스토리|비밀|반전|엔딩|배경|피해자\s*배경|npc\s*소개|인물\s*소개)/iu.test(normalized)) {
    return {
      targetLabel: detectDraftTargetLabel(normalized, currentStep),
      profile: "narrative_prose",
    };
  }

  if (/(gm|진행|가이드|안내|브리핑|낭독|멘트|스크립트|투표\s*안내|라운드\s*이벤트)/iu.test(normalized)) {
    return {
      targetLabel: detectDraftTargetLabel(normalized, currentStep),
      profile: "gm_guide",
    };
  }

  if (/(단서|카드|장소|설명|소개글|소개\s*문구|힌트)/iu.test(normalized)) {
    return {
      targetLabel: detectDraftTargetLabel(normalized, currentStep),
      profile: "descriptive_copy",
    };
  }

  if (currentStep === 5) {
    return { targetLabel: "GM 진행 텍스트", profile: "gm_guide" };
  }

  if (currentStep === 4 || currentStep === 1) {
    return { targetLabel: "설명형 입력 텍스트", profile: "descriptive_copy" };
  }

  return { targetLabel: "서사형 스토리 텍스트", profile: "narrative_prose" };
}

/** draft 문체 프로필별로 모델이 반드시 지켜야 할 구체 규칙을 만든다. */
function getDraftStyleRules(intent: DraftIntent): string[] {
  switch (intent.profile) {
    case "narrative_prose":
      return [
        "- 서사형 산문으로 작성한다. 게임 소개문, 설정 요약문, 운영 가이드 말투를 쓰지 않는다.",
        "- 플레이어 수, 단서 개수, 라운드 번호, 타임라인 시각, 해금 조건, 승리 조건을 그대로 열거하지 않는다.",
        "- '(플레이어 4명)', '(전직 형사)' 같은 설계 메모/괄호 설명을 본문에 직접 넣지 않는다.",
        "- 인물과 사건 정보는 분위기와 장면을 살려 자연스럽게 녹여 쓴다.",
      ];
    case "descriptive_copy":
      return [
        "- 특정 입력칸 설명문답게 간결하고 읽기 쉬운 문장으로 작성한다.",
        "- 설계 메타데이터를 그대로 나열하지 말고, 사용자에게 보여줄 서술 문장으로 다듬는다.",
        "- 규칙 설명이나 운영 안내는 사용자가 명시적으로 원할 때만 넣는다.",
      ];
    case "gm_guide":
      return [
        "- GM이 바로 읽거나 참고할 진행 문안으로 작성한다.",
        "- 진행 순서와 안내가 핵심이므로 직접적인 말투를 사용할 수 있다.",
        "- 다만 설정 요약이나 플레이어 수 같은 불필요한 메타 정보는 반복하지 않는다.",
      ];
  }
}

/** draft 모드에서는 입력칸과 무관한 검증/완성도 메타를 줄이고 필요한 사실만 남긴다. */
function buildDraftPromptContext(context: MakerAssistantContext, intent: DraftIntent): Record<string, unknown> {
  const baseContext: Record<string, unknown> = {
    currentStep: context.currentStep,
    game: {
      title: context.gameSummary.title,
      expectedPlayerCount: context.gameSummary.expectedPlayerCount,
    },
    story: context.story,
  };

  if (intent.profile === "narrative_prose") {
    return {
      ...baseContext,
      players: (context.players ?? []).map((player) => ({
        id: player.id,
        name: player.name,
        background: player.background,
        story: player.story,
        secret: player.secret,
      })),
      locations: (context.locations ?? []).map((location) => ({
        id: location.id,
        name: location.name,
        description: location.description,
      })),
    };
  }

  if (intent.profile === "descriptive_copy") {
    return {
      ...baseContext,
      players: context.players,
      locations: context.locations,
      clues: context.clues,
    };
  }

  return {
    ...baseContext,
    gameSummary: context.gameSummary,
    players: context.players,
    locations: context.locations,
    clues: context.clues,
  };
}

function buildClueSuggestionPromptContext(
  context: MakerAssistantContext,
  clueSuggestionContext: MakerAssistantClueSuggestionContext
): string {
  const parts = [
    `scope: ${MAKER_ASSISTANT_CLUE_SUGGESTION_SCOPE_LABELS[clueSuggestionContext.scope]}`,
    `requested_count: ${clueSuggestionContext.count}`,
  ];

  if (clueSuggestionContext.locationId) {
    parts.push(`location: ${findLocationName(context, clueSuggestionContext.locationId)}`);
    const locationRecord = context.locations?.find((location) => location.id === clueSuggestionContext.locationId);
    const description = readStringField(locationRecord, "description");
    const locationClueTitles = (context.clues ?? [])
      .filter((clue) => clue.locationId === clueSuggestionContext.locationId)
      .map((clue) => readStringField(clue, "title"))
      .filter(Boolean);

    if (description) {
      parts.push(`location_description: ${description}`);
    }

    if (locationClueTitles.length > 0) {
      parts.push(`existing_clues_at_location: ${locationClueTitles.join(", ")}`);
    }
  }

  if (clueSuggestionContext.playerId) {
    parts.push(`player: ${findPlayerName(context, clueSuggestionContext.playerId)}`);
    const playerRecord = context.players?.find((player) => player.id === clueSuggestionContext.playerId);
    const background = readStringField(playerRecord, "background");
    const secret = readStringField(playerRecord, "secret");

    if (background) {
      parts.push(`player_background: ${background}`);
    }

    if (secret) {
      parts.push(`player_secret: ${secret}`);
    }
  }

  return parts.join("\n");
}

function readStringField(record: Record<string, unknown> | undefined, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/** 질문에서 가장 가능성 높은 입력칸 이름을 뽑아 prompt에 짧게 남긴다. */
function detectDraftTargetLabel(message: string, currentStep: number): string {
  if (/오프닝/u.test(message)) return "오프닝 스토리 텍스트";
  if (/피해자\s*배경/u.test(message)) return "피해자 배경";
  if (/npc\s*소개|인물\s*소개/u.test(message)) return "NPC/인물 소개";
  if (/상세\s*스토리/u.test(message)) return "상세 스토리";
  if (/비밀|반전/u.test(message)) return "비밀 / 반전 정보";
  if (/엔딩/u.test(message)) return "엔딩 텍스트";
  if (/단서|카드/u.test(message)) return "단서 카드 텍스트";
  if (/장소/u.test(message)) return "장소 설명";
  if (/소개글/u.test(message)) return "기본 소개글";
  if (/gm|진행|가이드|안내|브리핑|멘트|스크립트/iu.test(message)) return "GM 진행 텍스트";

  switch (currentStep) {
    case 1:
      return "기본 소개글";
    case 2:
      return "오프닝 / 사건 개요 텍스트";
    case 3:
      return "캐릭터 서사 텍스트";
    case 4:
      return "장소 / 단서 설명 텍스트";
    case 5:
      return "GM 진행 텍스트";
    case 6:
      return "엔딩 텍스트";
    default:
      return "입력칸용 문안";
  }
}

function findLocationName(context: MakerAssistantContext, locationId: string): string {
  const location = context.locations?.find((item) => {
    const record = item as { id?: unknown };
    return record.id === locationId;
  }) as { name?: unknown } | undefined;

  return typeof location?.name === "string" && location.name.trim()
    ? location.name.trim()
    : "미선택";
}

function findPlayerName(context: MakerAssistantContext, playerId: string): string {
  const player = context.players?.find((item) => {
    const record = item as { id?: unknown };
    return record.id === playerId;
  }) as { name?: unknown } | undefined;

  return typeof player?.name === "string" && player.name.trim()
    ? player.name.trim()
    : "미선택";
}
