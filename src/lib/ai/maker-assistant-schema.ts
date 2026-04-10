import { z } from "zod";
import {
  MAKER_ASSISTANT_CLUE_SUGGESTION_SCOPES,
  MAKER_ASSISTANT_RESPONSE_MODE_PREFERENCES,
  MAKER_ASSISTANT_TASKS,
  type MakerAssistantDraftResult,
  type MakerAssistantGuideResult,
  type MakerAssistantRequest,
  type MakerAssistantResult,
  type MakerAssistantResponseMode,
} from "@/types/assistant";

const taskSchema = z.enum(MAKER_ASSISTANT_TASKS);
const responseModePreferenceSchema = z.enum(MAKER_ASSISTANT_RESPONSE_MODE_PREFERENCES);
const clueSuggestionScopeSchema = z.enum(MAKER_ASSISTANT_CLUE_SUGGESTION_SCOPES);

const gameSchema = z.custom<MakerAssistantRequest["game"]>(
  (value) => typeof value === "object" && value !== null,
  { message: "게임 데이터가 필요합니다." }
);

export const makerAssistantRequestSchema = z.object({
  task: taskSchema,
  game: gameSchema,
  currentStep: z.number().int().min(1).max(6),
  message: z.string().trim().max(4000).optional(),
  previousResponseId: z.string().trim().nullable().optional(),
  responseMode: responseModePreferenceSchema.optional(),
  clueSuggestionContext: z.object({
    scope: clueSuggestionScopeSchema,
    count: z.number().int().min(1).max(5),
    locationId: z.string().trim().nullable(),
    playerId: z.string().trim().nullable(),
  }).optional(),
  conversationHistory: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    task: taskSchema,
    content: z.string().trim().min(1).max(4000),
    responseMode: z.enum(["guide", "draft"]).optional(),
  })).max(8).optional(),
  stream: z.boolean().optional(),
});

const makerAssistantFindingSchema = z.object({
  severity: z.enum(["error", "warning", "idea"]),
  title: z.string().trim().min(1).max(120),
  detail: z.string().trim().min(1).max(1200),
  relatedStep: z.number().int().min(1).max(6).nullable(),
  relatedPlayerId: z.string().trim().min(1).nullable(),
  relatedClueId: z.string().trim().min(1).nullable(),
  relatedSlotId: z.string().trim().min(1).nullable(),
});

const makerAssistantSuggestedActionSchema = z.object({
  label: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(800),
  step: z.number().int().min(1).max(6),
});

const makerAssistantGuideResultSchema = z.object({
  mode: z.literal("guide"),
  summary: z.string().trim().min(1).max(2000),
  findings: z.array(makerAssistantFindingSchema).max(8),
  suggestedActions: z.array(makerAssistantSuggestedActionSchema).max(5),
  followUpQuestions: z.array(z.string().trim().min(1).max(300)).max(4),
});

const makerAssistantDraftResultSchema = z.object({
  mode: z.literal("draft"),
  title: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1).max(6000),
  notes: z.array(z.string().trim().min(1).max(300)).max(4),
});

/**
 * 모델 출력에서 assistant 결과를 복구해 스키마로 검증한다.
 * 기대하는 응답 모드에 맞춰 JSON 우선, 실패 시 line-based 포맷을 해석한다.
 */
export function parseMakerAssistantResult(
  rawText: string,
  mode: MakerAssistantResponseMode
): MakerAssistantResult {
  const trimmed = rawText.trim();
  const withoutFence = stripCodeFence(trimmed);

  if (mode === "draft") {
    try {
      return makerAssistantDraftResultSchema.parse(
        normalizeDraftResult(parseJsonLikeText(withoutFence))
      );
    } catch {
      return makerAssistantDraftResultSchema.parse(
        parseDelimitedDraftText(withoutFence)
      );
    }
  }

  try {
    return makerAssistantGuideResultSchema.parse(
      normalizeGuideResult(parseJsonLikeText(withoutFence))
    );
  } catch {
    return makerAssistantGuideResultSchema.parse(
      parseDelimitedGuideText(withoutFence)
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
 * `SUMMARY/FINDING/ACTION/QUESTION` line 포맷을 guide 결과 객체로 변환한다.
 * JSON보다 덜 엄격하지만 assistant UI 렌더링에는 충분한 구조만 추출한다.
 */
function parseDelimitedGuideText(value: string): MakerAssistantGuideResult {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let currentSection: "summary" | "findings" | "actions" | "questions" | null = null;
  const summaryLines: string[] = [];
  const findings: MakerAssistantGuideResult["findings"] = [];
  const suggestedActions: MakerAssistantGuideResult["suggestedActions"] = [];
  const followUpQuestions: string[] = [];

  for (const line of lines) {
    if (line === "SUMMARY:" || line.startsWith("SUMMARY:")) {
      currentSection = "summary";
      const inlineValue = line.replace(/^SUMMARY:\s*/, "");
      if (inlineValue && inlineValue !== line) {
        summaryLines.push(inlineValue);
      }
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
    mode: "guide",
    summary: summaryLines.join(" ").trim() || "요약이 제공되지 않았습니다.",
    findings: findings.filter((item) => item.title.trim() && item.detail.trim()),
    suggestedActions: suggestedActions.filter((item) => item.label.trim() && item.reason.trim()),
    followUpQuestions: followUpQuestions.filter((item) => item.trim().length > 0),
  };
}

/**
 * `TITLE/BODY/NOTE` line 포맷을 draft 결과 객체로 변환한다.
 * 모델이 형식을 일부 놓쳐도 BODY를 최대한 복구해 붙여넣기용 본문을 살린다.
 */
function parseDelimitedDraftText(value: string): MakerAssistantDraftResult {
  const lines = value.split(/\r?\n/);

  let currentSection: "title" | "body" | "notes" | null = null;
  const titleLines: string[] = [];
  const bodyLines: string[] = [];
  const notes: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "TITLE:" || trimmed.startsWith("TITLE:")) {
      currentSection = "title";
      const inlineValue = trimmed.replace(/^TITLE:\s*/, "");
      if (inlineValue && inlineValue !== trimmed) {
        titleLines.push(inlineValue);
      }
      continue;
    }

    if (trimmed === "BODY:" || trimmed.startsWith("BODY:")) {
      currentSection = "body";
      const inlineValue = line.replace(/^\s*BODY:\s*/, "");
      if (inlineValue && inlineValue !== line) {
        bodyLines.push(inlineValue);
      }
      continue;
    }

    if (trimmed === "NOTES:") {
      currentSection = "notes";
      continue;
    }

    if (currentSection === "title") {
      if (trimmed) {
        titleLines.push(trimmed.replace(/^TITLE:\s*/, ""));
      }
      continue;
    }

    if (currentSection === "body") {
      bodyLines.push(line);
      continue;
    }

    if (currentSection === "notes" && trimmed.startsWith("NOTE|")) {
      notes.push(trimmed.slice("NOTE|".length).trim());
    }
  }

  const body = bodyLines.join("\n").trim() || value.trim();
  const title = titleLines.join(" ").trim();

  return {
    mode: "draft",
    title: title || undefined,
    body,
    notes: notes.filter((item) => item.trim().length > 0),
  };
}

/** `FINDING|...` 한 줄을 assistant finding 객체로 변환한다. */
function parseFindingLine(line: string): MakerAssistantGuideResult["findings"][number] {
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
function parseActionLine(line: string): MakerAssistantGuideResult["suggestedActions"][number] {
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

/** JSON 파싱 결과를 guide 스키마 입력 형태로 정리한다. */
function normalizeGuideResult(value: unknown): MakerAssistantGuideResult {
  const record = ensureRecord(value);

  return {
    mode: "guide",
    summary: typeof record.summary === "string" ? record.summary : "",
    findings: Array.isArray(record.findings) ? record.findings : [],
    suggestedActions: Array.isArray(record.suggestedActions) ? record.suggestedActions : [],
    followUpQuestions: Array.isArray(record.followUpQuestions) ? record.followUpQuestions : [],
  };
}

/** JSON 파싱 결과를 draft 스키마 입력 형태로 정리한다. */
function normalizeDraftResult(value: unknown): MakerAssistantDraftResult {
  const record = ensureRecord(value);

  const title = typeof record.title === "string" ? record.title.trim() : "";
  const body = typeof record.body === "string"
    ? record.body
    : typeof record.content === "string"
      ? record.content
      : "";
  const notes = Array.isArray(record.notes)
    ? record.notes
    : Array.isArray(record.followUpQuestions)
      ? record.followUpQuestions
      : [];

  return {
    mode: "draft",
    title: title || undefined,
    body,
    notes: notes.filter((item): item is string => typeof item === "string"),
  };
}

function ensureRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error("assistant 결과 객체를 찾지 못했습니다.");
  }

  return value as Record<string, unknown>;
}
