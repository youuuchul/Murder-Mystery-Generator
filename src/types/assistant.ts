import type { GamePackage } from "@/types/game";

export const MAKER_ASSISTANT_TASKS = [
  "validate_consistency",
  "suggest_clues",
  "suggest_next_steps",
  "chat",
] as const;

export type MakerAssistantTask = (typeof MAKER_ASSISTANT_TASKS)[number];

export const MAKER_ASSISTANT_TASK_LABELS: Record<MakerAssistantTask, string> = {
  validate_consistency: "모순 점검",
  suggest_clues: "단서 제안",
  suggest_next_steps: "다음 작업 추천",
  chat: "자유 질문",
};

export interface MakerAssistantFinding {
  severity: "error" | "warning" | "idea";
  title: string;
  detail: string;
  relatedStep?: number | null;
  relatedPlayerId?: string | null;
  relatedClueId?: string | null;
  relatedSlotId?: string | null;
}

export interface MakerAssistantSuggestedAction {
  label: string;
  reason: string;
  step: number;
}

export interface MakerAssistantResult {
  summary: string;
  findings: MakerAssistantFinding[];
  suggestedActions: MakerAssistantSuggestedAction[];
  followUpQuestions: string[];
}

export interface MakerAssistantRequest {
  task: MakerAssistantTask;
  game: GamePackage;
  currentStep: number;
  message?: string;
  previousResponseId?: string | null;
}

export interface MakerAssistantResponse {
  task: MakerAssistantTask;
  previousResponseId: string | null;
  result: MakerAssistantResult;
}

export interface MakerAssistantChatMessage {
  id: string;
  role: "user" | "assistant";
  task: MakerAssistantTask;
  label: string;
  content: string;
  createdAt: string;
  result?: MakerAssistantResult;
}
