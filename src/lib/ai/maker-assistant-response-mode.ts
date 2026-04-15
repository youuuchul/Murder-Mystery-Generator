import type {
  MakerAssistantResponseMode,
  MakerAssistantResponseModePreference,
  MakerAssistantTask,
} from "@/types/assistant";

/**
 * draft(문안 생성) 의도 신호.
 * "바로 붙여넣을 텍스트를 만들어줘"에 해당하는 어휘. 생성 동사 + 텍스트형 입력칸 명사를 함께 본다.
 */
const DRAFT_INTENT_PATTERNS = [
  // 명시적인 문안 용어
  /가안/u,
  /초안/u,
  /문안/u,
  /문구/u,
  /대사/u,
  /멘트/u,
  /내레이션/u,
  /독백/u,
  // 입력칸 이름
  /소개글/u,
  /소개\s*문장/u,
  /자기\s*소개/u,
  /스토리\s*텍스트/u,
  /상세\s*스토리/u,
  /배경\s*(?:이야기|설명|스토리|문장)?/u,
  /비밀\s*(?:정보|이야기)?/u,
  /오프닝\s*(?:문장|텍스트|내레이션|스토리)?/u,
  /엔딩\s*(?:문구|텍스트|문장|스토리|내레이션)?/u,
  /개인\s*엔딩/u,
  /피해자\s*배경/u,
  /npc\s*(?:소개|배경|설명)/iu,
  /단서\s*(?:카드|설명|본문|텍스트|힌트)/u,
  /카드\s*(?:텍스트|설명|본문)/u,
  /장소\s*설명/u,
  /라운드\s*(?:멘트|안내|스크립트)/u,
  // 생성 동사 + 요청 어미
  /(?:써|적어|작성|만들|만들어|생성|지어|짜|뽑아|제안|제시)\s*(?:줘|주세요|주라|줄래|다오|달라|드려|드릴)/u,
  // 생성 동사 단독 + 존댓말/명령
  /(?:써|적어|작성|만들|만들어|생성|지어|짜|뽑아|제안|제시)\s*봐/u,
  // 한 줄 요약/한 문장 류
  /한\s*(?:줄|문장|마디)/u,
  /요약해\s*(?:줘|주세요)/u,
];

/**
 * guide(분석/진단) 의도 신호.
 * "지금 뭐가 부족한지, 뭘 먼저 할지"에 해당하는 어휘.
 */
const GUIDE_INTENT_PATTERNS = [
  /검토/u,
  /점검/u,
  /모순/u,
  /봐\s*(?:줘|주세요)/u,
  /괜찮은지/u,
  /문제\s*(?:있|없|없는지|있는지|점)/u,
  /우선순위/u,
  /뭐\s*부터/u,
  /어디서\s*부터/u,
  /다음\s*(?:단계|작업|할\s*일)/u,
  /정리해\s*(?:줘|주세요)/u,
  /확인해\s*(?:줘|주세요)/u,
  /비교해\s*(?:줘|주세요)/u,
  /설명해\s*(?:줘|주세요)/u,
  /알려\s*(?:줘|주세요)/u,
  /가이드/u,
  /리뷰/u,
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

  // draft 신호가 분석 신호보다 명확히 강할 때만 draft. 동률이면 guide로 안전하게.
  if (draftScore === 0 || draftScore <= guideScore) {
    return "guide";
  }

  return "draft";
}
