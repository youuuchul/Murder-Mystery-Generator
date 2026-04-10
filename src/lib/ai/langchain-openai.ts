import "server-only";

import { ChatOpenAI } from "@langchain/openai";
import { warmLangfuseTracing } from "@/lib/ai/langfuse";

let cachedModel: ChatOpenAI | null = null;

/**
 * LangChain ChatOpenAI 인스턴스를 지연 생성한다.
 * gpt-5-mini 같은 reasoning 모델은 temperature를 지원하지 않으므로 설정하지 않는다.
 * max_completion_tokens는 호출별로 다르게 지정하므로 여기서는 기본값만 둔다.
 */
export function getMakerAssistantChat(maxCompletionTokens: number): ChatOpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  }

  warmLangfuseTracing();

  // 호출마다 token budget이 다르므로 항상 새 인스턴스 생성
  return new ChatOpenAI({
    apiKey,
    model: getMakerAssistantModelName(),
    modelKwargs: {
      max_completion_tokens: maxCompletionTokens,
    },
  });
}

/** 제작 도우미 기본 모델명을 반환한다. */
export function getMakerAssistantModelName(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
}

/** 기능 토글이 꺼져 있으면 API 자체를 비활성화한다. */
export function isMakerAssistantEnabled(): boolean {
  return process.env.OPENAI_ASSISTANT_ENABLED?.trim() !== "false";
}

/**
 * 캐시된 기본 ChatOpenAI 인스턴스. repair 같은 반복 호출에서 재사용한다.
 * max_completion_tokens는 호출별로 달라야 하므로 기본값(4000)으로만 설정.
 */
export function getDefaultMakerAssistantChat(): ChatOpenAI {
  if (!cachedModel) {
    cachedModel = getMakerAssistantChat(4000);
  }
  return cachedModel;
}
