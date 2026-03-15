import { z } from "zod";
import {
  MAKER_ASSISTANT_TASKS,
  type MakerAssistantRequest,
  type MakerAssistantResult,
} from "@/types/assistant";

const taskSchema = z.enum(MAKER_ASSISTANT_TASKS);

const gameSchema = z.custom<MakerAssistantRequest["game"]>(
  (value) => typeof value === "object" && value !== null,
  { message: "게임 데이터가 필요합니다." }
);

export const makerAssistantRequestSchema = z.object({
  task: taskSchema,
  game: gameSchema,
  currentStep: z.number().int().min(1).max(5),
  message: z.string().trim().max(4000).optional(),
  previousResponseId: z.string().trim().nullable().optional(),
});

const makerAssistantFindingSchema = z.object({
  severity: z.enum(["error", "warning", "idea"]),
  title: z.string().trim().min(1).max(120),
  detail: z.string().trim().min(1).max(1200),
  relatedStep: z.number().int().min(1).max(5).nullable(),
  relatedPlayerId: z.string().trim().min(1).nullable(),
  relatedClueId: z.string().trim().min(1).nullable(),
  relatedSlotId: z.string().trim().min(1).nullable(),
});

const makerAssistantSuggestedActionSchema = z.object({
  label: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(800),
  step: z.number().int().min(1).max(5),
});

export const makerAssistantResultSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  findings: z.array(makerAssistantFindingSchema).max(8),
  suggestedActions: z.array(makerAssistantSuggestedActionSchema).max(5),
  followUpQuestions: z.array(z.string().trim().min(1).max(300)).max(4),
});

/**
 * 모델 출력에서 JSON 객체를 추출해 assistant 결과 스키마로 검증한다.
 * 모델이 코드펜스나 설명 문장을 섞어도 첫 JSON 객체를 복구하도록 시도한다.
 */
export function parseMakerAssistantResult(rawText: string): MakerAssistantResult {
  const trimmed = rawText.trim();
  const withoutFence = stripCodeFence(trimmed);

  return makerAssistantResultSchema.parse(
    parseJsonLikeText(withoutFence)
  );
}

/** markdown code fence가 있으면 내부 문자열만 꺼낸다. */
function stripCodeFence(value: string): string {
  if (!value.startsWith("```")) {
    return value;
  }

  const normalized = value
    .replace(/^```[a-zA-Z0-9_-]*\s*/, "")
    .replace(/\s*```$/, "");

  return normalized.trim();
}

/** 완전한 JSON이 아니어도 첫 객체 블록을 찾아 파싱을 시도한다. */
function parseJsonLikeText(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {}

  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");

  if (start === -1 || end === -1 || start >= end) {
    throw new Error("모델 응답에서 JSON 객체를 찾지 못했습니다.");
  }

  return JSON.parse(value.slice(start, end + 1));
}
