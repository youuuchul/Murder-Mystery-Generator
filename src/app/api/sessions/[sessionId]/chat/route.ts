import { NextRequest, NextResponse } from "next/server";
import {
  propagateAttributes,
  startActiveObservation,
} from "@langfuse/tracing";
import { trace } from "@opentelemetry/api";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getMakerAssistantChat } from "@/lib/ai/langchain-openai";
import { classifyOpenAIError, isOpenAIApiError } from "@/lib/ai/openai-error";
import { startLangfuseTracing, forceFlushLangfuseTracing } from "@/lib/ai/langfuse";
import { buildPlayerAgentVisibleContext } from "@/lib/ai/shared/player-agent-context";
import { getGame } from "@/lib/game-repository";
import { getSession, updateSession } from "@/lib/session-repository";
import type { GameSession, PlayerAgentConversationTurn } from "@/types/session";

type Params = { params: Promise<{ sessionId: string }> };

const MAX_COMPLETION_TOKENS = 2000;
const MAX_CONVERSATION_HISTORY = 10;

/** POST /api/sessions/[sessionId]/chat — AI 캐릭터와 밀담 */
export async function POST(request: NextRequest, { params }: Params) {
  const { sessionId } = await params;

  try {
    const body = await request.json() as {
      token: string;
      targetPlayerId: string;
      message: string;
      turnContext?: Array<{ characterName: string; content: string }>;
    };

    if (!body.token || !body.targetPlayerId || !body.message?.trim()) {
      return NextResponse.json(
        { error: "token, targetPlayerId, message가 필요합니다." },
        { status: 400 }
      );
    }

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
    }

    const game = await getGame(session.gameId);
    if (!game) {
      return NextResponse.json({ error: "게임을 찾을 수 없습니다." }, { status: 404 });
    }

    // 요청자 검증 — 세션에 참가 중인 플레이어인지
    const callerState = session.playerStates?.find((ps) => ps.token === body.token);
    if (!callerState) {
      return NextResponse.json({ error: "세션 참가 정보를 찾을 수 없습니다." }, { status: 403 });
    }

    // 대상 AI 캐릭터 검증
    const targetSlot = session.sharedState.characterSlots.find(
      (slot) => slot.playerId === body.targetPlayerId && slot.isAiControlled && slot.isLocked
    );
    if (!targetSlot) {
      return NextResponse.json({ error: "대상 AI 캐릭터를 찾을 수 없습니다." }, { status: 400 });
    }

    // AI 캐릭터의 PlayerState 찾기 (없으면 빈 상태로 생성)
    let aiPlayerState = session.playerStates?.find((ps) => ps.playerId === body.targetPlayerId);
    if (!aiPlayerState) {
      aiPlayerState = {
        token: `ai-${body.targetPlayerId}-chat`,
        playerId: body.targetPlayerId,
        playerName: targetSlot.playerName ?? "AI",
        inventory: [],
        transferLog: [],
        roundAcquired: {},
        roundVisitedLocations: {},
      };
    }

    // AI 캐릭터 정보 로드
    const aiPlayer = game.players.find((p) => p.id === body.targetPlayerId);
    if (!aiPlayer) {
      return NextResponse.json({ error: "AI 캐릭터 데이터를 찾을 수 없습니다." }, { status: 400 });
    }

    // 대화 이력 로드 (AI 에이전트 상태에서)
    const aiAgentSlot = session.playerAgentState?.slots?.find(
      (slot) => slot.playerId === body.targetPlayerId
    );
    const conversationHistory = aiAgentSlot?.conversationHistory ?? [];

    // AI 컨텍스트 구축 (AI가 볼 수 있는 정보만)
    const aiContext = buildPlayerAgentVisibleContext({
      game,
      session,
      playerState: aiPlayerState,
      conversationHistory,
    });

    // 요청자 캐릭터 이름
    const callerPlayer = game.players.find((p) => p.id === callerState.playerId);
    const callerName = callerPlayer?.name ?? "플레이어";

    await startLangfuseTracing();

    const traceName = `player-agent.chat.${aiPlayer.name}`;
    const reply = await startActiveObservation(traceName, async () => {
      const traceInput = {
        callerName,
        targetName: aiPlayer.name,
        message: body.message.slice(0, 200),
        historyLength: conversationHistory.length,
      };

      return propagateAttributes({
        userId: `player:${callerState.playerId}`,
        sessionId: `player-chat:${sessionId}`,
        tags: ["player-agent", "chat", `ai:${body.targetPlayerId}`],
        traceName,
        metadata: {
          feature: "player-agent-chat",
          gameId: session.gameId,
          sessionId,
          callerPlayerId: callerState.playerId,
          targetPlayerId: body.targetPlayerId,
        },
      }, async () => {
        // async await 전에 span 참조 캡처 (컨텍스트 유실 방지)
        const currentSpan = trace.getActiveSpan();
        currentSpan?.setAttribute("langfuse.observation.input", JSON.stringify(traceInput));

        const systemPrompt = buildChatSystemPrompt(aiContext, aiPlayer.name);

        // 이번 턴에서 앞선 AI 응답을 컨텍스트로 추가 (다자 밀담 체이닝)
        const turnContextMessages = (body.turnContext ?? []).map((tc) =>
          new HumanMessage(`[${tc.characterName}]: ${tc.content}`)
        );

        const messages = [
          new SystemMessage(systemPrompt),
          ...conversationHistory.slice(-MAX_CONVERSATION_HISTORY).map((turn) =>
            turn.role === "user"
              ? new HumanMessage(turn.content)
              : new HumanMessage({ content: turn.content, name: "assistant" })
          ),
          new HumanMessage(`[${callerName}]: ${body.message.trim()}`),
          ...turnContextMessages,
        ];

        const chat = getMakerAssistantChat(MAX_COMPLETION_TOKENS);
        const response = await chat.invoke(messages);
        const content = typeof response.content === "string"
          ? response.content.trim()
          : "";

        if (!content) {
          throw new Error("AI 응답이 비어 있습니다.");
        }

        const traceOutput = { reply: content.slice(0, 200), tokens: response.response_metadata?.tokenUsage };
        // span 참조를 직접 사용 (async 후에도 안전)
        currentSpan?.setAttribute("langfuse.observation.output", JSON.stringify(traceOutput));

        return content;
      });
    });

    // 대화 이력에 추가
    const newHistory: PlayerAgentConversationTurn[] = [
      ...conversationHistory,
      { role: "user" as const, content: `[${callerName}]: ${body.message.trim()}`, createdAt: new Date().toISOString() },
      { role: "assistant" as const, content: reply, createdAt: new Date().toISOString() },
    ].slice(-MAX_CONVERSATION_HISTORY * 2);

    await forceFlushLangfuseTracing().catch(() => {});

    // 세션에 대화 이력 저장
    await saveConversationHistory(session, body.targetPlayerId, newHistory);

    return NextResponse.json({
      reply,
      characterName: aiPlayer.name,
      characterId: body.targetPlayerId,
    });
  } catch (error) {
    console.error(`[POST /api/sessions/${sessionId}/chat]`, error);

    if (isOpenAIApiError(error)) {
      const classified = classifyOpenAIError(error);
      return NextResponse.json(
        { error: classified.message, isApiIssue: classified.isApiIssue },
        { status: classified.status }
      );
    }

    const message = error instanceof Error ? error.message : "밀담 응답 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildChatSystemPrompt(
  context: ReturnType<typeof buildPlayerAgentVisibleContext>,
  characterName: string
): string {
  const { player, inventory, publicState } = context;
  const otherPlayers = publicState.joinedPlayers
    .filter((p) => p.playerId !== player.id)
    .map((p) => p.playerName ?? "알 수 없음")
    .join(", ");

  const relationshipLines = player.relationships.length > 0
    ? player.relationships.map((r) => `- ${r.targetName}: ${r.description}`).join("\n")
    : "없음";

  const scoreLines = player.scoreConditions.length > 0
    ? player.scoreConditions.map((s) => `- ${s.description} (${s.points}점)`).join("\n")
    : "없음";

  return [
    `당신은 머더미스터리 게임의 캐릭터 "${characterName}"입니다.`,
    `아래 설정에 맞는 말투와 성격으로 대화하세요.`,
    "",
    `[캐릭터 배경]`,
    player.background,
    "",
    `[상세 스토리 — 본인만 아는 정보]`,
    player.story,
    "",
    `[비밀]`,
    player.secret,
    "",
    `[인물 관계]`,
    relationshipLines,
    "",
    `[승리 조건] ${player.victoryCondition}`,
    player.personalGoal ? `[개인 목표] ${player.personalGoal}` : "",
    `[승점 조건]`,
    scoreLines,
    "",
    `[보유 단서] ${inventory.length > 0 ? inventory.map((c) => c.title).join(", ") : "없음"}`,
    `[다른 참가자] ${otherPlayers || "없음"}`,
    "",
    "대화 규칙:",
    "- 캐릭터의 성격과 말투를 유지하세요.",
    "- 비밀은 쉽게 드러내지 마세요. 증거나 논리적 추궁에는 부분적으로 인정할 수 있습니다.",
    "- 아직 획득하지 않은 단서 정보를 말하지 마세요.",
    "- '나는 AI입니다' 같은 메타 발언은 하지 마세요.",
    "- 자연스럽고 짧은 대화체로 답하세요 (1-3문장).",
    "- 스토리를 왜곡하지 마세요.",
  ].filter(Boolean).join("\n");
}

async function saveConversationHistory(
  session: GameSession,
  targetPlayerId: string,
  history: PlayerAgentConversationTurn[]
): Promise<void> {
  // playerAgentState가 없으면 대화 이력만 로컬에서 관리 (세션 업데이트 생략)
  if (!session.playerAgentState) return;

  const slotExists = session.playerAgentState.slots.some((slot) => slot.playerId === targetPlayerId);

  const updatedSlots = slotExists
    ? session.playerAgentState.slots.map((slot) => {
        if (slot.playerId === targetPlayerId) {
          return { ...slot, conversationHistory: history };
        }
        return slot;
      })
    : [
        ...session.playerAgentState.slots,
        {
          playerId: targetPlayerId,
          enabled: true,
          runtimeStatus: "idle" as const,
          conversationHistory: history,
          knownCardIds: [],
          actionState: {},
        },
      ];

  try {
    const updatedSession: GameSession = {
      ...session,
      playerAgentState: {
        ...session.playerAgentState,
        slots: updatedSlots,
      },
      updatedAt: new Date().toISOString(),
    };

    await updateSession(updatedSession);
  } catch (error) {
    // 세션 업데이트 실패해도 채팅 응답은 정상 반환 (대화 이력은 다음에 다시 시도)
    console.error("[chat] Failed to save conversation history:", error);
  }
}
