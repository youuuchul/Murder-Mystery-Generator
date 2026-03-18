"use client";

import { useState } from "react";
import type { GamePackage } from "@/types/game";
import {
  MAKER_ASSISTANT_TASK_LABELS,
  type MakerAssistantChatMessage,
  type MakerAssistantResponseModePreference,
  type MakerAssistantResponse,
  type MakerAssistantTask,
} from "@/types/assistant";

const QUICK_ACTION_PROMPTS: Record<Exclude<MakerAssistantTask, "chat">, string> = {
  validate_consistency: "현재 게임에서 단서, 타임라인, 배경 설정 간의 의미적 모순과 약한 연결을 점검해줘.",
  suggest_clues: "현재 사건 설명, 캐릭터 배경, 비밀을 기준으로 새 단서 3개를 제안해줘.",
  suggest_next_steps: "현재 작업 상태와 검증 힌트를 기준으로 지금 먼저 해야 할 작업을 3개 추천해줘.",
};

interface UseMakerAssistantParams {
  game: GamePackage;
  currentStep: number;
}

/**
 * 메이커 편집 화면에서 assistant 드로어 상태와 API 호출을 관리한다.
 * 현재 로컬 `game` 상태를 그대로 서버에 보내므로 저장 전 편집 내용도 포함된다.
 */
export default function useMakerAssistant({
  game,
  currentStep,
}: UseMakerAssistantParams) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [responseMode, setResponseMode] = useState<MakerAssistantResponseModePreference>("auto");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<MakerAssistantChatMessage[]>([]);
  const [previousResponseId, setPreviousResponseId] = useState<string | null>(null);

  async function runQuickAction(task: Exclude<MakerAssistantTask, "chat">) {
    await send(task, QUICK_ACTION_PROMPTS[task], QUICK_ACTION_PROMPTS[task], "guide");
  }

  async function sendChat() {
    const trimmed = draft.trim();

    if (!trimmed) {
      return;
    }

    await send("chat", trimmed, trimmed, responseMode);
    setDraft("");
  }

  function resetConversation() {
    setMessages([]);
    setError(null);
    setPreviousResponseId(null);
  }

  async function send(
    task: MakerAssistantTask,
    message: string,
    visibleContent: string,
    requestedMode: MakerAssistantResponseModePreference
  ) {
    if (pending) {
      return;
    }

    setOpen(true);
    setPending(true);
    setError(null);

    const userMessage: MakerAssistantChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      task,
      label: MAKER_ASSISTANT_TASK_LABELS[task],
      content: visibleContent,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      const response = await fetch("/api/maker-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task,
          game,
          currentStep,
          message,
          previousResponseId,
          responseMode: requestedMode,
        }),
      });

      const data = await response.json() as MakerAssistantResponse | { error?: string };

      if (!response.ok) {
        throw new Error(
          typeof data === "object" && data && "error" in data && data.error
            ? data.error
            : "제작 도우미 호출 실패"
        );
      }

      const payload = data as MakerAssistantResponse;

      setPreviousResponseId(payload.previousResponseId);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          task,
          label: MAKER_ASSISTANT_TASK_LABELS[task],
          content: payload.result.mode === "draft" ? payload.result.body : payload.result.summary,
          createdAt: new Date().toISOString(),
          result: payload.result,
        },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "제작 도우미 호출에 실패했습니다."
      );
    } finally {
      setPending(false);
    }
  }

  return {
    open,
    setOpen,
    draft,
    setDraft,
    responseMode,
    setResponseMode,
    pending,
    error,
    messages,
    runQuickAction,
    sendChat,
    resetConversation,
  };
}
