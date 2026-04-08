import "server-only";

import { observeOpenAI, type LangfuseConfig } from "@langfuse/openai";
import OpenAI from "openai";
import { warmLangfuseTracing } from "@/lib/ai/langfuse";

type ReasoningEffort = "low" | "medium" | "high";

let rawClient: OpenAI | null = null;
let observedClient: OpenAI | null = null;

/**
 * 서버 전역에서 재사용할 OpenAI client를 지연 생성한다.
 * Route Handler가 여러 번 호출돼도 같은 프로세스 안에서는 1회만 만든다.
 */
export function getOpenAIClient(
  tracingConfig?: Pick<LangfuseConfig, "generationName">
): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  }

  warmLangfuseTracing();

  if (!rawClient) {
    rawClient = new OpenAI({ apiKey });
  }

  if (tracingConfig?.generationName) {
    return observeOpenAI(rawClient, {
      generationName: tracingConfig.generationName,
    });
  }

  if (!observedClient) {
    observedClient = observeOpenAI(rawClient);
  }

  return observedClient;
}

/** 제작 도우미 기본 모델명을 반환한다. */
export function getMakerAssistantModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
}

/** 제작 도우미 reasoning 강도를 env 값에서 읽어 안전한 기본값으로 정리한다. */
export function getMakerAssistantReasoningEffort(): ReasoningEffort {
  const value = process.env.OPENAI_REASONING_EFFORT?.trim();

  if (value === "medium" || value === "high") {
    return value;
  }

  return "low";
}

/** 기능 토글이 꺼져 있으면 API 자체를 비활성화한다. */
export function isMakerAssistantEnabled(): boolean {
  return process.env.OPENAI_ASSISTANT_ENABLED?.trim() !== "false";
}
