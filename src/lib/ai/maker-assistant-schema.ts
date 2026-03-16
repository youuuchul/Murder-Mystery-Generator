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
 * 모델 출력에서 assistant 결과를 복구해 스키마로 검증한다.
 * 우선 JSON을 시도하고, 실패하면 line-based 포맷을 해석한다.
 */
export function parseMakerAssistantResult(rawText: string): MakerAssistantResult {
  const trimmed = rawText.trim();
  const withoutFence = stripCodeFence(trimmed);

  try {
    return makerAssistantResultSchema.parse(
      parseJsonLikeText(withoutFence)
    );
  } catch {
    return makerAssistantResultSchema.parse(
      parseDelimitedAssistantText(withoutFence)
    );
  }
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

/**
 * `SUMMARY/FINDING/ACTION/QUESTION` line 포맷을 결과 객체로 변환한다.
 * JSON보다 덜 엄격하지만 assistant UI 렌더링에는 충분한 구조만 추출한다.
 */
function parseDelimitedAssistantText(value: string): MakerAssistantResult {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let currentSection: "summary" | "findings" | "actions" | "questions" | null = null;
  const summaryLines: string[] = [];
  const findings: MakerAssistantResult["findings"] = [];
  const suggestedActions: MakerAssistantResult["suggestedActions"] = [];
  const followUpQuestions: string[] = [];

  for (const line of lines) {
    if (line === "SUMMARY:") {
      currentSection = "summary";
      continue;
    }

    if (line === "FINDINGS:") {
      currentSection = "findings";
      continue;
    }

    if (line === "ACTIONS:") {
      currentSection = "actions";
      continue;
    }

    if (line === "QUESTIONS:") {
      currentSection = "questions";
      continue;
    }

    if (currentSection === "summary") {
      summaryLines.push(line.replace(/^SUMMARY:\s*/, ""));
      continue;
    }

    if (currentSection === "findings" && line.startsWith("FINDING|")) {
      findings.push(parseFindingLine(line));
      continue;
    }

    if (currentSection === "actions" && line.startsWith("ACTION|")) {
      suggestedActions.push(parseActionLine(line));
      continue;
    }

    if (currentSection === "questions" && line.startsWith("QUESTION|")) {
      followUpQuestions.push(line.slice("QUESTION|".length).trim());
    }
  }

  return {
    summary: summaryLines.join(" ").trim() || "요약이 제공되지 않았습니다.",
    findings: findings.filter((item) => item.title.trim() && item.detail.trim()),
    suggestedActions: suggestedActions.filter((item) => item.label.trim() && item.reason.trim()),
    followUpQuestions: followUpQuestions.filter((item) => item.trim().length > 0),
  };
}

/** `FINDING|...` 한 줄을 assistant finding 객체로 변환한다. */
function parseFindingLine(line: string): MakerAssistantResult["findings"][number] {
  const parts = line.split("|");
  const [
    ,
    severityRaw,
    stepRaw,
    playerIdRaw,
    clueIdRaw,
    slotIdRaw,
    titleRaw,
    ...detailParts
  ] = parts;

  return {
    severity: severityRaw === "error" || severityRaw === "idea" ? severityRaw : "warning",
    title: (titleRaw ?? "").trim(),
    detail: detailParts.join("|").trim(),
    relatedStep: parseNullableStep(stepRaw),
    relatedPlayerId: parseNullableString(playerIdRaw),
    relatedClueId: parseNullableString(clueIdRaw),
    relatedSlotId: parseNullableString(slotIdRaw),
  };
}

/** `ACTION|...` 한 줄을 assistant action 객체로 변환한다. */
function parseActionLine(line: string): MakerAssistantResult["suggestedActions"][number] {
  const parts = line.split("|");
  const [, stepRaw, labelRaw, ...reasonParts] = parts;

  return {
    step: parseNullableStep(stepRaw) ?? 1,
    label: (labelRaw ?? "").trim(),
    reason: reasonParts.join("|").trim(),
  };
}

function parseNullableString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return !trimmed || trimmed.toLowerCase() === "null" ? null : trimmed;
}

function parseNullableStep(value: string | undefined): number | null {
  const trimmed = value?.trim();

  if (!trimmed || trimmed.toLowerCase() === "null") {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}
