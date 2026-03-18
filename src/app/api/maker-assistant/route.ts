import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  getMakerAssistantModel,
  getMakerAssistantReasoningEffort,
  getOpenAIClient,
  isMakerAssistantEnabled,
} from "@/lib/ai/openai";
import { buildMakerAssistantContext } from "@/lib/ai/maker-assistant-context";
import { resolveMakerAssistantResponseMode } from "@/lib/ai/maker-assistant-response-mode";
import {
  buildMakerAssistantSystemPrompt,
  buildMakerAssistantUserPrompt,
} from "@/lib/ai/maker-assistant-prompts";
import {
  makerAssistantRequestSchema,
  parseMakerAssistantResult,
} from "@/lib/ai/maker-assistant-schema";
import type { MakerAssistantResponse, MakerAssistantResult } from "@/types/assistant";

/** POST /api/maker-assistant — 메이커 편집 화면용 LLM 제작 도우미 */
export async function POST(request: NextRequest) {
  if (!isMakerAssistantEnabled()) {
    return NextResponse.json(
      { error: "LLM 제작 도우미가 비활성화되어 있습니다." },
      { status: 503 }
    );
  }

  try {
    const payload = makerAssistantRequestSchema.parse(await request.json());

    if (payload.task === "chat" && !payload.message?.trim()) {
      return NextResponse.json(
        { error: "질문 내용을 입력하세요." },
        { status: 400 }
      );
    }

    const client = getOpenAIClient();
    const context = buildMakerAssistantContext(payload.game, payload.task, payload.currentStep);
    const responseMode = resolveMakerAssistantResponseMode({
      task: payload.task,
      message: payload.message,
      requestedMode: payload.responseMode,
    });

    const response = await client.responses.create({
      model: getMakerAssistantModel(),
      store: false,
      instructions: buildMakerAssistantSystemPrompt(payload.task, responseMode),
      input: buildMakerAssistantUserPrompt({
        task: payload.task,
        responseMode,
        context,
        message: payload.message,
        conversationHistory: payload.conversationHistory,
      }),
      reasoning: {
        effort: getMakerAssistantReasoningEffort(),
      },
      max_output_tokens: 900,
    });

    const rawText = extractResponseText(response);
    const result = await resolveMakerAssistantResult(client, rawText, responseMode);

    const body: MakerAssistantResponse = {
      task: payload.task,
      previousResponseId: null,
      result,
    };

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
        { error: "OPENAI_API_KEY가 설정되지 않았습니다." },
        { status: 503 }
      );
    }

    const message = error instanceof Error
      ? error.message
      : "제작 도우미 응답 생성 실패";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 1차 응답이 이미 올바른 JSON이면 바로 사용하고,
 * 형식이 깨졌다면 2차 정규화 패스로 구조화된 결과만 다시 추출한다.
 */
async function resolveMakerAssistantResult(
  client: ReturnType<typeof getOpenAIClient>,
  rawText: string,
  responseMode: "guide" | "draft"
): Promise<MakerAssistantResult> {
  try {
    return parseMakerAssistantResult(rawText, responseMode);
  } catch (parseError) {
    console.warn("[maker-assistant] repairing malformed JSON output", parseError);
  }

  let repairSource = rawText;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const repaired = await client.responses.create({
      model: getMakerAssistantModel(),
      store: false,
      instructions: buildRepairInstructions(responseMode),
      input: repairSource,
      reasoning: {
        effort: "low",
      },
      max_output_tokens: 900,
    });

    const repairedText = extractResponseText(repaired);

    try {
      return parseMakerAssistantResult(repairedText, responseMode);
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

/** raw response의 message/output_text 블록을 합쳐 텍스트 본문만 꺼낸다. */
function extractResponseText(response: {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const parts: string[] = [];

  for (const item of response.output ?? []) {
    if (item.type !== "message") {
      continue;
    }

    for (const block of item.content ?? []) {
      if (block.type === "output_text" && typeof block.text === "string") {
        parts.push(block.text);
      }
    }
  }

  const combined = parts.join("\n").trim();

  if (!combined) {
    throw new Error("모델 응답에서 텍스트를 찾지 못했습니다.");
  }

  return combined;
}
