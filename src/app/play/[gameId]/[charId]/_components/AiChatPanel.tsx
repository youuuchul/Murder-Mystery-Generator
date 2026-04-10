"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface AiCharacterSlot {
  playerId: string;
  playerName: string | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  characterName?: string;
  content: string;
  createdAt: string;
}

interface AiChatPanelProps {
  sessionId: string;
  token: string;
  callerName: string;
  aiSlots: AiCharacterSlot[];
  maxGroupSize: number;
}

export default function AiChatPanel({ sessionId, token, callerName, aiSlots, maxGroupSize }: AiChatPanelProps) {
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const inChat = selectedCharIds.length > 0;
  // 밀담 최대 인원: maxGroupSize에서 플레이어 본인(1명) 제외
  const maxAiInChat = Math.max(1, maxGroupSize - 1);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (selectedCharIds.length === 0 || !draft.trim() || sending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: draft.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setSending(true);
    setError(null);

    try {
      // 선택된 모든 AI 캐릭터에게 순차 전송
      for (const charId of selectedCharIds) {
        const charName = aiSlots.find((s) => s.playerId === charId)?.playerName ?? "AI";
        const res = await fetch(`/api/sessions/${sessionId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            targetPlayerId: charId,
            message: userMsg.content,
          }),
        });

        const data = await res.json() as { reply?: string; error?: string; characterName?: string };

        if (!res.ok) {
          throw new Error(data.error ?? "응답 생성 실패");
        }

        if (data.reply) {
          const replyText = data.reply;
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant" as const,
              characterName: data.characterName ?? charName,
              content: replyText,
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "밀담 요청 실패");
    } finally {
      setSending(false);
    }
  }, [selectedCharIds, draft, sending, sessionId, token, aiSlots]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function toggleCharacter(playerId: string) {
    setSelectedCharIds((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length >= maxAiInChat) {
        return prev; // 최대 인원 도달
      }
      return [...prev, playerId];
    });
  }

  function startChat(playerId: string) {
    setSelectedCharIds([playerId]);
    setMessages([]);
    setError(null);
  }

  // 캐릭터 미선택 → 선택 화면
  if (!inChat) {
    return (
      <div className="space-y-3">
        <p className="text-dark-400 text-sm text-center">대화할 캐릭터를 선택하세요</p>
        <div className="grid grid-cols-2 gap-2">
          {aiSlots.map((slot) => (
            <button
              key={slot.playerId}
              type="button"
              onClick={() => startChat(slot.playerId)}
              className="rounded-xl border border-dark-700 bg-dark-900 px-4 py-3 text-left transition-colors hover:border-mystery-600"
            >
              <p className="text-sm font-medium text-dark-100">{slot.playerName ?? "AI"}</p>
              <p className="mt-0.5 text-[10px] text-dark-500">AI 캐릭터</p>
            </button>
          ))}
        </div>
        {maxGroupSize > 2 && (
          <p className="text-center text-[11px] text-dark-600">
            밀담 시작 후 최대 {maxAiInChat}명까지 추가 가능
          </p>
        )}
      </div>
    );
  }

  const selectedNames = selectedCharIds
    .map((id) => aiSlots.find((s) => s.playerId === id)?.playerName ?? "AI")
    .join(", ");

  // 추가 가능한 캐릭터
  const addableChars = aiSlots.filter(
    (s) => !selectedCharIds.includes(s.playerId) && selectedCharIds.length < maxAiInChat
  );

  // 채팅 화면
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 16rem)" }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between rounded-t-xl border border-dark-700 bg-dark-900/80 px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-dark-100 truncate">{selectedNames}</span>
          <span className="shrink-0 rounded-full border border-dark-700 px-2 py-0.5 text-[10px] text-dark-500">
            {selectedCharIds.length}명
          </span>
        </div>
        <button
          type="button"
          onClick={() => { setSelectedCharIds([]); setMessages([]); }}
          className="shrink-0 text-xs text-dark-500 hover:text-dark-300 transition-colors"
        >
          나가기
        </button>
      </div>

      {/* 참가자 추가 바 */}
      {addableChars.length > 0 && (
        <div className="flex items-center gap-2 border-x border-dark-700 bg-dark-900/40 px-3 py-2 overflow-x-auto">
          <span className="shrink-0 text-[10px] text-dark-600">추가:</span>
          {addableChars.map((slot) => (
            <button
              key={slot.playerId}
              type="button"
              onClick={() => toggleCharacter(slot.playerId)}
              className="shrink-0 rounded-lg border border-dark-700 px-2.5 py-1 text-[11px] text-dark-400 transition-colors hover:border-mystery-600 hover:text-dark-200"
            >
              + {slot.playerName ?? "AI"}
            </button>
          ))}
        </div>
      )}

      {/* 메시지 영역 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto border-x border-dark-700 bg-dark-950/60 px-3 py-3 space-y-3"
      >
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-dark-600 text-xs">{selectedNames}에게 말을 걸어보세요</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={[
                "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-mystery-900/40 text-dark-100 border border-mystery-800/40"
                  : "bg-dark-800/80 text-dark-200 border border-dark-700",
              ].join(" ")}
            >
              {msg.role === "assistant" && msg.characterName && (
                <p className="text-[10px] font-medium text-mystery-400/70 mb-1">{msg.characterName}</p>
              )}
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-dark-800/80 border border-dark-700 px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-dark-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-dark-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-dark-500 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 에러 */}
      {error && (
        <div className="border-x border-dark-700 bg-red-950/20 px-3 py-2">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* 입력 */}
      <div className="rounded-b-xl border border-dark-700 bg-dark-900/80 p-2.5">
        <div className="flex gap-2">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`${selectedNames}에게 말하기...`}
            disabled={sending}
            className="flex-1 resize-none rounded-lg border border-dark-700 bg-dark-950 px-3 py-2 text-sm text-dark-100 placeholder:text-dark-600 focus:outline-none focus:border-mystery-600 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => { void sendMessage(); }}
            disabled={!draft.trim() || sending}
            className="shrink-0 rounded-lg bg-mystery-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mystery-600 disabled:opacity-40"
          >
            전송
          </button>
        </div>
      </div>
    </div>
  );
}
