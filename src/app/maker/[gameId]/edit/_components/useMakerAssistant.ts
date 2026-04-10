"use client";

import { useState } from "react";
import type { GamePackage } from "@/types/game";
import {
  MAKER_ASSISTANT_CLUE_SUGGESTION_SCOPE_LABELS,
  MAKER_ASSISTANT_TASK_LABELS,
  type MakerAssistantClueSuggestionContext,
  type MakerAssistantChatMessage,
  type MakerAssistantConversationTurn,
  type MakerAssistantResponseModePreference,
  type MakerAssistantResponse,
  type MakerAssistantResult,
  type MakerAssistantTask,
} from "@/types/assistant";

const QUICK_ACTION_PROMPTS: Record<Exclude<MakerAssistantTask, "chat">, string> = {
  validate_consistency: "현재 게임에서 단서, 타임라인, 배경 설정 간의 의미적 모순과 약한 연결을 점검해줘.",
  suggest_clues: "현재 게임 맥락을 바탕으로 새 단서 아이디어를 제안해줘.",
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
  const [isApiIssue, setIsApiIssue] = useState(false);
  const [messages, setMessages] = useState<MakerAssistantChatMessage[]>([]);
  const [clueSuggestionContext, setClueSuggestionContext] = useState<MakerAssistantClueSuggestionContext>(
    () => createDefaultClueSuggestionContext()
  );
  const normalizedClueSuggestionContext = normalizeClueSuggestionContext(clueSuggestionContext, game);
  const clueSuggestionReady = isClueSuggestionContextReady(normalizedClueSuggestionContext);
  const clueSuggestionSummary = buildClueSuggestionSummary(game, normalizedClueSuggestionContext);
  const clueSuggestionHint = getClueSuggestionHint(normalizedClueSuggestionContext);

  async function runQuickAction(task: Exclude<MakerAssistantTask, "chat">) {
    const isClueSuggestion = task === "suggest_clues";

    if (isClueSuggestion && !clueSuggestionReady) {
      setOpen(true);
      setError(clueSuggestionHint);
      return;
    }

    const message = isClueSuggestion
      ? buildClueSuggestionPrompt(game, normalizedClueSuggestionContext)
      : QUICK_ACTION_PROMPTS[task];
    const visibleContent = isClueSuggestion
      ? clueSuggestionSummary
      : QUICK_ACTION_PROMPTS[task];

    await send(
      task,
      message,
      visibleContent,
      "guide",
      isClueSuggestion ? normalizedClueSuggestionContext : undefined
    );
  }

  async function sendChat() {
    const trimmed = draft.trim();

    if (!trimmed) {
      return;
    }

    const sent = await send("chat", trimmed, trimmed, responseMode);
    if (sent) {
      setDraft("");
    }
  }

  function resetConversation() {
    setMessages([]);
    setError(null);
    setIsApiIssue(false);
  }

  async function send(
    task: MakerAssistantTask,
    message: string,
    visibleContent: string,
    requestedMode: MakerAssistantResponseModePreference,
    clueSuggestionContext?: MakerAssistantClueSuggestionContext
  ): Promise<boolean> {
    if (pending) {
      return false;
    }

    setOpen(true);
    setPending(true);
    setError(null);
    setIsApiIssue(false);

    const userMessage: MakerAssistantChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      task,
      label: MAKER_ASSISTANT_TASK_LABELS[task],
      content: visibleContent,
      createdAt: new Date().toISOString(),
    };

    const conversationHistory = buildConversationHistory(messages);

    setMessages((prev) => [...prev, userMessage]);

    try {
      const response = await fetch("/api/maker-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          game,
          currentStep,
          message,
          responseMode: requestedMode,
          conversationHistory,
          clueSuggestionContext,
          stream: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string; isApiIssue?: boolean };
        if (data.isApiIssue) setIsApiIssue(true);
        throw new Error(data.error || "제작 도우미 호출 실패");
      }

      // SSE 스트리밍 처리
      const streamingMsgId = crypto.randomUUID();
      let streamedText = "";

      // 스트리밍 중 메시지 추가 (실시간 텍스트 표시)
      setMessages((prev) => [
        ...prev,
        {
          id: streamingMsgId,
          role: "assistant",
          task,
          label: MAKER_ASSISTANT_TASK_LABELS[task],
          content: "",
          createdAt: new Date().toISOString(),
          result: undefined,
          streaming: true,
        },
      ]);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("응답 스트림을 열 수 없습니다.");

      let buffer = "";
      let finalResult: MakerAssistantResult | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            const eventType = line.slice(7).trim();
            const nextLine = lines[lines.indexOf(line) + 1];
            if (!nextLine?.startsWith("data: ")) continue;

            const data = JSON.parse(nextLine.slice(6)) as
              | { text: string }
              | { task: string; result: MakerAssistantResult; repairAttempts: number }
              | { error: string; isApiIssue?: boolean };

            if (eventType === "chunk" && "text" in data) {
              streamedText += data.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingMsgId ? { ...m, content: streamedText } : m
                )
              );
            } else if (eventType === "done" && "result" in data) {
              finalResult = data.result;
            } else if (eventType === "error" && "error" in data) {
              if ("isApiIssue" in data && data.isApiIssue) setIsApiIssue(true);
              throw new Error(data.error);
            }
          }
        }
      }

      // 스트리밍 완료 → 파싱된 결과로 교체
      if (finalResult) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingMsgId
              ? {
                  ...m,
                  content: finalResult!.mode === "draft" ? finalResult!.body : finalResult!.summary,
                  result: finalResult!,
                  streaming: false,
                }
              : m
          )
        );
      } else {
        // done 이벤트 없이 스트림 종료 → raw 텍스트 유지
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingMsgId ? { ...m, streaming: false } : m
          )
        );
      }

      return true;
    } catch (requestError) {
      setMessages((prev) => prev.filter((item) => item.id !== userMessage.id));
      setError(
        requestError instanceof Error
          ? requestError.message
          : "제작 도우미 호출에 실패했습니다."
      );
      return false;
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
    isApiIssue,
    messages,
    clueSuggestionContext,
    setClueSuggestionContext,
    clueSuggestionReady,
    clueSuggestionSummary,
    clueSuggestionHint,
    runQuickAction,
    sendChat,
    resetConversation,
  };
}

/**
 * Responses API의 server-side conversation state 대신,
 * 최근 대화 몇 턴을 직접 prompt에 붙일 수 있도록 가벼운 이력만 추린다.
 */
function buildConversationHistory(messages: MakerAssistantChatMessage[]): MakerAssistantConversationTurn[] {
  return messages.slice(-8).map((message) => ({
    role: message.role,
    task: message.task,
    content: message.content,
    responseMode: message.result?.mode,
  }));
}

function createDefaultClueSuggestionContext(): MakerAssistantClueSuggestionContext {
  return {
    scope: "all",
    count: 3,
    locationId: null,
    playerId: null,
  };
}

function normalizeClueSuggestionContext(
  context: MakerAssistantClueSuggestionContext,
  game: GamePackage
): MakerAssistantClueSuggestionContext {
  const count = clamp(context.count, 1, 5);
  const locationId = game.locations.some((location) => location.id === context.locationId)
    ? context.locationId
    : null;
  const playerId = game.players.some((player) => player.id === context.playerId)
    ? context.playerId
    : null;

  return {
    scope: context.scope,
    count,
    locationId,
    playerId,
  };
}

function buildClueSuggestionSummary(game: GamePackage, context: MakerAssistantClueSuggestionContext): string {
  const parts = [MAKER_ASSISTANT_CLUE_SUGGESTION_SCOPE_LABELS[context.scope]];

  switch (context.scope) {
    case "location":
      parts.push(findLocationName(game, context.locationId));
      break;
    case "player":
      parts.push(findPlayerName(game, context.playerId));
      break;
    case "location_and_player":
      parts.push(findLocationName(game, context.locationId));
      parts.push(findPlayerName(game, context.playerId));
      break;
    default:
      break;
  }

  parts.push(`요청 ${context.count}개`);
  return parts.join(" · ");
}

function buildClueSuggestionPrompt(game: GamePackage, context: MakerAssistantClueSuggestionContext): string {
  const scopeLine = buildClueSuggestionSummary(game, context);
  const locationName = findLocationName(game, context.locationId);
  const playerName = findPlayerName(game, context.playerId);
  const detailLines: string[] = [];

  if (context.scope === "location" || context.scope === "location_and_player") {
    detailLines.push(`- 중심 장소: ${locationName}`);
  }

  if (context.scope === "player" || context.scope === "location_and_player") {
    detailLines.push(`- 관련 인물: ${playerName}`);
  }

  return [
    `Clue Context: ${scopeLine}`,
    `위 맥락에 맞는 단서 아이디어를 ${context.count}개 제안해줘.`,
    detailLines.length ? `추가 조건:\n${detailLines.join("\n")}` : null,
    "각 제안은 단서 제목, 단서 유형, 발견 장소, 왜 이 단서가 필요한지까지 바로 입력 가능한 수준으로 구체적으로 적어줘.",
  ].join("\n");
}

function findLocationName(game: GamePackage, locationId: string | null): string {
  if (!locationId) {
    return "장소 선택 필요";
  }

  return game.locations.find((location) => location.id === locationId)?.name?.trim() || "장소 선택 필요";
}

function findPlayerName(game: GamePackage, playerId: string | null): string {
  if (!playerId) {
    return "인물 선택 필요";
  }

  return game.players.find((player) => player.id === playerId)?.name?.trim() || "인물 선택 필요";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isClueSuggestionContextReady(context: MakerAssistantClueSuggestionContext): boolean {
  switch (context.scope) {
    case "location":
      return Boolean(context.locationId);
    case "player":
      return Boolean(context.playerId);
    case "location_and_player":
      return Boolean(context.locationId && context.playerId);
    default:
      return true;
  }
}

function getClueSuggestionHint(context: MakerAssistantClueSuggestionContext): string {
  switch (context.scope) {
    case "location":
      return context.locationId
        ? ""
        : "장소 범위로 단서를 제안받으려면 장소를 먼저 고르세요.";
    case "player":
      return context.playerId
        ? ""
        : "인물 범위로 단서를 제안받으려면 관련 인물을 먼저 고르세요.";
    case "location_and_player":
      if (!context.locationId && !context.playerId) {
        return "장소 + 인물 범위는 장소와 관련 인물을 모두 골라야 합니다.";
      }
      if (!context.locationId) {
        return "장소 + 인물 범위는 장소를 먼저 골라야 합니다.";
      }
      if (!context.playerId) {
        return "장소 + 인물 범위는 관련 인물을 먼저 골라야 합니다.";
      }
      return "";
    default:
      return "현재 사건 전체를 기준으로 단서를 제안합니다.";
  }
}
