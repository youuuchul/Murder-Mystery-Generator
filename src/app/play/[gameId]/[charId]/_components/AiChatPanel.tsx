"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface AiCharacterSlot {
  playerId: string;
  playerName: string | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface AiChatPanelProps {
  sessionId: string;
  token: string;
  callerName: string;
  aiSlots: AiCharacterSlot[];
}

export default function AiChatPanel({ sessionId, token, callerName, aiSlots }: AiChatPanelProps) {
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedChar = aiSlots.find((s) => s.playerId === selectedCharId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!selectedCharId || !draft.trim() || sending) return;

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
      const res = await fetch(`/api/sessions/${sessionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          targetPlayerId: selectedCharId,
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
            content: replyText,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "밀담 요청 실패");
    } finally {
      setSending(false);
    }
  }, [selectedCharId, draft, sending, sessionId, token]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  // 캐릭터 미선택 → 선택 화면
  if (!selectedCharId) {
    return (
      <div className="space-y-3">
        <p className="text-dark-400 text-sm text-center">대화할 캐릭터를 선택하세요</p>
        <div className="grid grid-cols-2 gap-2">
          {aiSlots.map((slot) => (
            <button
              key={slot.playerId}
              type="button"
              onClick={() => {
                setSelectedCharId(slot.playerId);
                setMessages([]);
                setError(null);
              }}
              className="rounded-xl border border-dark-700 bg-dark-900 px-4 py-3 text-sm text-dark-200 transition-colors hover:border-mystery-600 hover:text-dark-100"
            >
              {slot.playerName ?? "AI"}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 채팅 화면
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 16rem)" }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between rounded-t-xl border border-dark-700 bg-dark-900/80 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-dark-100">{selectedChar?.playerName ?? "AI"}</span>
          <span className="rounded-full border border-dark-700 px-2 py-0.5 text-[10px] text-dark-500">AI</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setSelectedCharId(null);
            setMessages([]);
          }}
          className="text-xs text-dark-500 hover:text-dark-300 transition-colors"
        >
          다른 캐릭터
        </button>
      </div>

      {/* 메시지 영역 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto border-x border-dark-700 bg-dark-950/60 px-3 py-3 space-y-3"
      >
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-dark-600 text-xs">{selectedChar?.playerName ?? "AI"}에게 말을 걸어보세요</p>
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
              {msg.role === "assistant" && (
                <p className="text-[10px] text-dark-500 mb-1">{selectedChar?.playerName ?? "AI"}</p>
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
            placeholder={`${selectedChar?.playerName ?? "AI"}에게 말하기...`}
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
