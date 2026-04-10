import { NextRequest, NextResponse } from "next/server";
import {
  propagateAttributes,
  startActiveObservation,
  updateActiveObservation,
} from "@langfuse/tracing";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ZodError } from "zod";
import {
  getMakerAssistantChat,
  isMakerAssistantEnabled,
} from "@/lib/ai/langchain-openai";
import { classifyOpenAIError, isOpenAIApiError } from "@/lib/ai/openai-error";
import { startLangfuseTracing } from "@/lib/ai/langfuse";
import { buildMakerAssistantContext } from "@/lib/ai/maker-assistant-context";
import { resolveMakerAssistantResponseMode } from "@/lib/ai/maker-assistant-response-mode";
import {
  buildMakerAssistantTraceInput,
  buildMakerAssistantTraceOutput,
  getMakerAssistantTraceName,
  getMakerAssistantTraceSessionId,
  getMakerAssistantTraceTags,
} from "@/lib/ai/maker-assistant-tracing";
import {
  buildMakerAssistantSystemPrompt,
  buildMakerAssistantUserPrompt,
} from "@/lib/ai/maker-assistant-prompts";
import {
  makerAssistantRequestSchema,
  parseMakerAssistantResult,
} from "@/lib/ai/maker-assistant-schema";
import { getRequestMakerUser } from "@/lib/maker-user.server";
import type { MakerAssistantResponse, MakerAssistantResult } from "@/types/assistant";

/**
 * reasoning 모델(gpt-5-mini)은 max_completion_tokens에 reasoning + output을 모두 포함한다.
 * Responses API의 max_output_tokens보다 넉넉하게 잡아야 한다.
 */
const PRIMARY_MAX_COMPLETION_TOKENS = 4000;
const PRIMARY_RETRY_MAX_COMPLETION_TOKENS = 8000;
const REPAIR_MAX_COMPLETION_TOKENS = 3000;
const REPAIR_RETRY_MAX_COMPLETION_TOKENS = 5000;

type MakerAssistantResolvedResult = {
  result: MakerAssistantResult;
  repairAttempts: number;
};

/** POST /api/maker-assistant — 메이커 편집 화면용 LLM 제작 도우미 */
export async function POST(request: NextRequest) {
  if (!isMakerAssistantEnabled()) {
    return NextResponse.json(
      { error: "LLM 제작 도우미가 비활성화되어 있습니다." },
      { status: 503 }
    );
  }

  try {
    const currentUser = await getRequestMakerUser(request);

    if (!currentUser) {
      return NextResponse.json(
        { error: "제작자 로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const payload = makerAssistantRequestSchema.parse(await request.json());

    if (payload.task === "chat" && !payload.message?.trim()) {
      return NextResponse.json(
        { error: "질문 내용을 입력하세요." },
        { status: 400 }
      );
    }

    await startLangfuseTracing();

    const context = buildMakerAssistantContext(payload.game, payload.task, payload.currentStep);
    const responseMode = resolveMakerAssistantResponseMode({
      task: payload.task,
      message: payload.message,
      requestedMode: payload.responseMode,
    });
    const traceName = getMakerAssistantTraceName(payload.task, responseMode);
    const sessionId = getMakerAssistantTraceSessionId(currentUser.id, payload.game.id);
    const tags = getMakerAssistantTraceTags(payload.task, responseMode, payload.currentStep);

    const body = await startActiveObservation(traceName, async () => {
      return propagateAttributes({
        userId: currentUser.id,
        sessionId,
        tags,
        traceName,
        metadata: {
          feature: "maker-assistant",
          gameId: payload.game.id,
          currentStep: String(payload.currentStep),
          responseMode,
        },
      }, async () => {
        updateActiveObservation({
          input: buildMakerAssistantTraceInput({
            currentUser,
            payload,
            responseMode,
          }),
          metadata: {
            task: payload.task,
            route: "/api/maker-assistant",
            gameTitle: payload.game.title.slice(0, 200),
          },
        });

        try {
          const systemPrompt = buildMakerAssistantSystemPrompt(payload.task, responseMode);
          const userPrompt = buildMakerAssistantUserPrompt({
            task: payload.task,
            responseMode,
            context,
            message: payload.message,
            conversationHistory: payload.conversationHistory,
            clueSuggestionContext: payload.clueSuggestionContext,
          });

          const rawText = await invokeWithTokenRetry(
            systemPrompt,
            userPrompt,
            {
              initialMaxTokens: PRIMARY_MAX_COMPLETION_TOKENS,
              retryMaxTokens: PRIMARY_RETRY_MAX_COMPLETION_TOKENS,
            }
          );

          const resolved = await resolveMakerAssistantResult(rawText, responseMode, payload.task);

          updateActiveObservation({
            output: buildMakerAssistantTraceOutput({
              result: resolved.result,
              repairAttempts: resolved.repairAttempts,
            }),
            metadata: {
              task: payload.task,
              responseMode,
              repairAttempts: String(resolved.repairAttempts),
            },
          });

          return {
            task: payload.task,
            previousResponseId: null,
            result: resolved.result,
          } satisfies MakerAssistantResponse;
        } catch (error) {
          updateActiveObservation({
            level: "ERROR",
            statusMessage:
              error instanceof Error ? error.message : "maker assistant request failed",
            metadata: {
              task: payload.task,
              route: "/api/maker-assistant",
            },
          });
          throw error;
        }
      });
    });

    return NextResponse.json(body);
  } catch (error) {
    console.error("[POST /api/maker-assistant]", error);

    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "제작 도우미 요청 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes("OPENAI_API_KEY")) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY가 설정되지 않았습니다.", isApiIssue: true },
        { status: 503 }
      );
    }

    if (isOpenAIApiError(error)) {
      const classified = classifyOpenAIError(error);
      return NextResponse.json(
        { error: classified.message, isApiIssue: classified.isApiIssue },
        { status: classified.status }
      );
    }

    const message = error instanceof Error
      ? error.message
      : "제작 도우미 응답 생성 실패";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * LangChain ChatOpenAI로 호출하고, 토큰 한도로 잘리면 한 번 더 넉넉하게 재시도한다.
 * reasoning 모델은 finish_reason='length'로 잘림을 알린다.
 */
async function invokeWithTokenRetry(
  systemPrompt: string,
  userPrompt: string,
  tokenBudget: { initialMaxTokens: number; retryMaxTokens: number }
): Promise<string> {
  const messages = [
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ];

  const firstChat = getMakerAssistantChat(tokenBudget.initialMaxTokens);
  const firstResponse = await firstChat.invoke(messages);
  const firstText = extractContent(firstResponse.content);
  const firstFinish = firstResponse.response_metadata?.finish_reason;

  if (firstFinish !== "length") {
    return firstText;
  }

  // 토큰 잘림 → 더 큰 예산으로 재시도
  const retryChat = getMakerAssistantChat(tokenBudget.retryMaxTokens);
  const retryResponse = await retryChat.invoke(messages);
  const retryText = extractContent(retryResponse.content);
  const retryFinish = retryResponse.response_metadata?.finish_reason;

  if (retryFinish === "length") {
    throw new Error("모델 응답이 길어 중간에 잘렸습니다. 질문 범위를 조금 줄이거나 다시 시도해 주세요.");
  }

  return retryText;
}

/** AIMessage.content에서 텍스트를 추출한다. */
function extractContent(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (trimmed) return trimmed;
    throw new Error("모델 응답이 비어 있습니다. 다시 시도해 주세요.");
  }

  // content block 배열인 경우
  const parts = content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!)
    .join("\n")
    .trim();

  if (!parts) {
    throw new Error("모델 응답에서 텍스트를 찾지 못했습니다.");
  }

  return parts;
}

/**
 * 1차 응답이 이미 올바른 JSON이면 바로 사용하고,
 * 형식이 깨졌다면 2차 정규화 패스로 구조화된 결과만 다시 추출한다.
 */
async function resolveMakerAssistantResult(
  rawText: string,
  responseMode: "guide" | "draft",
  task: MakerAssistantResponse["task"]
): Promise<MakerAssistantResolvedResult> {
  try {
    return {
      result: parseMakerAssistantResult(rawText, responseMode),
      repairAttempts: 0,
    };
  } catch (parseError) {
    console.warn("[maker-assistant] repairing malformed JSON output", parseError);
  }

  let repairSource = rawText;
  let repairAttempts = 0;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const repairedText = await invokeWithTokenRetry(
      buildRepairInstructions(responseMode),
      repairSource,
      {
        initialMaxTokens: REPAIR_MAX_COMPLETION_TOKENS,
        retryMaxTokens: REPAIR_RETRY_MAX_COMPLETION_TOKENS,
      }
    );

    try {
      repairAttempts = attempt;
      return {
        result: parseMakerAssistantResult(repairedText, responseMode),
        repairAttempts,
      };
    } catch (repairError) {
      console.warn(`[maker-assistant] repair attempt ${attempt} failed`, repairError);
      repairSource = repairedText;
    }
  }

  throw new Error("모델 응답을 유효한 JSON 결과로 복구하지 못했습니다.");
}

/** 파싱 실패 시 기대 모드에 맞는 line 포맷으로만 다시 정리하도록 모델에 지시한다. */
function buildRepairInstructions(responseMode: "guide" | "draft"): string {
  if (responseMode === "draft") {
    return [
      "주어진 초안 텍스트를 아래 draft line 포맷으로만 다시 정리하라.",
      "JSON, 마크다운, 코드펜스, 분석 문장, 머리말은 금지한다.",
      "TITLE:",
      "짧은 제목 또는 비워둘 수 있음",
      "BODY:",
      "실제 삽입용 본문",
      "NOTES:",
      "NOTE|짧은 메모",
    ].join("\n");
  }

  return [
    "주어진 초안 텍스트를 아래 guide line 포맷으로만 다시 정리하라.",
    "JSON, 마크다운, 코드펜스, 설명 문장은 금지한다.",
    "SUMMARY:",
    "요약 문장",
    "FINDINGS:",
    "FINDING|warning|3|null|null|null|제목|상세 설명",
    "ACTIONS:",
    "ACTION|3|작업 라벨|이유",
    "QUESTIONS:",
    "QUESTION|추가 질문",
    "필드 값이 없으면 null을 사용하고, title/detail/label/reason/question 안에는 | 문자를 쓰지 말라.",
  ].join("\n");
}
