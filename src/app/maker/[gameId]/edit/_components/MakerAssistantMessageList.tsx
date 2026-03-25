"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAKER_ASSISTANT_RESPONSE_MODE_LABELS,
  MAKER_ASSISTANT_TASK_LABELS,
  type MakerAssistantChatMessage,
  type MakerAssistantDraftResult,
  type MakerAssistantFinding,
  type MakerAssistantGuideResult,
} from "@/types/assistant";

interface MakerAssistantMessageListProps {
  messages: MakerAssistantChatMessage[];
  pending: boolean;
}

export default function MakerAssistantMessageList({
  messages,
  pending,
}: MakerAssistantMessageListProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  if (messages.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-dark-700 bg-dark-950/60 p-4">
          <p className="text-sm font-medium text-dark-100">현재 편집 상태 기준으로 바로 도와줍니다.</p>
          <p className="mt-2 text-sm leading-relaxed text-dark-400">
            저장하지 않은 내용도 함께 읽습니다. Step을 옮기지 않고 지금 보고 있는 화면에서
            모순 점검, 단서 제안, 다음 작업 우선순위를 받을 수 있습니다.
          </p>
        </div>
        <div className="rounded-2xl border border-dashed border-dark-700 bg-dark-950/40 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-dark-600">예시 질문</p>
          <ul className="mt-3 space-y-2 text-sm text-dark-300">
            <li>이 타임라인에서 범인 동선이 너무 튀는지 봐줘.</li>
            <li>이 캐릭터 비밀에 맞는 문서형 단서 3개 제안해줘.</li>
            <li>지금 상태에서 뭘 먼저 채우면 좋은지 순서대로 알려줘.</li>
            <li>Step 2 오프닝 텍스트 초안을 바로 붙여넣을 수 있게 써줘.</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => (
        message.role === "user" ? (
          <section
            key={message.id}
            className="ml-6 rounded-2xl border border-dark-700 bg-dark-900/90 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-dark-500">
                {MAKER_ASSISTANT_TASK_LABELS[message.task]}
              </p>
              <p className="text-[11px] text-dark-600">
                {formatTimestamp(message.createdAt)}
              </p>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-dark-100 whitespace-pre-line">
              {message.content}
            </p>
          </section>
        ) : (
          <section
            key={message.id}
            className="mr-6 rounded-2xl border border-mystery-900/70 bg-[linear-gradient(155deg,rgba(46,16,58,0.78),rgba(15,23,42,0.92))] p-4 shadow-lg shadow-mystery-950/20"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-mystery-300/80">
                  {message.label}
                </p>
                <p className="mt-1 text-sm font-medium text-dark-50">AI 응답</p>
              </div>
              <div className="text-right">
                {message.result ? (
                  <p className="text-[11px] text-mystery-300/80">
                    {MAKER_ASSISTANT_RESPONSE_MODE_LABELS[message.result.mode]}
                  </p>
                ) : null}
                <p className="text-[11px] text-dark-500">
                  {formatTimestamp(message.createdAt)}
                </p>
              </div>
            </div>
            {message.result ? renderAssistantResult(message.id, message.result) : (
              <p className="mt-3 text-sm leading-relaxed text-dark-100 whitespace-pre-line">
                {message.content}
              </p>
            )}
          </section>
        )
      ))}

      {pending && (
        <div className="mr-6 rounded-2xl border border-dark-700 bg-dark-900/70 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-dark-600">AI 응답 생성 중</p>
          <div className="mt-3 flex items-center gap-2 text-sm text-dark-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-mystery-400" />
            현재 편집 상태를 읽고 있습니다.
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFindingClasses(finding: MakerAssistantFinding): string {
  switch (finding.severity) {
    case "error":
      return "border-red-900/70 bg-red-950/30 text-red-100";
    case "warning":
      return "border-amber-900/70 bg-amber-950/25 text-amber-100";
    case "idea":
      return "border-mystery-900/70 bg-mystery-950/25 text-mystery-100";
  }
}

function renderAssistantResult(messageId: string, result: MakerAssistantGuideResult | MakerAssistantDraftResult) {
  if (result.mode === "draft") {
    return <DraftResultPanel messageId={messageId} result={result} />;
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm leading-relaxed text-dark-100 whitespace-pre-line">
        {result.summary}
      </p>

      {result.findings.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-dark-500">
            주요 포인트
          </p>
          <div className="space-y-2">
            {result.findings.map((finding, index) => (
              <article
                key={`${messageId}-finding-${index}`}
                className={[
                  "rounded-xl border px-3 py-3",
                  getFindingClasses(finding),
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{finding.title}</p>
                  {finding.relatedStep ? (
                    <span className="text-[11px] uppercase tracking-[0.18em] opacity-80">
                      Step {finding.relatedStep}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed opacity-90">
                  {finding.detail}
                </p>
              </article>
            ))}
          </div>
        </div>
      )}

      {result.suggestedActions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-dark-500">
            추천 액션
          </p>
          <div className="space-y-2">
            {result.suggestedActions.map((action, index) => (
              <article
                key={`${messageId}-action-${index}`}
                className="rounded-xl border border-dark-700 bg-dark-950/40 px-3 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-dark-100">{action.label}</p>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-mystery-300">
                    Step {action.step}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-dark-400">
                  {action.reason}
                </p>
              </article>
            ))}
          </div>
        </div>
      )}

      {result.followUpQuestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-dark-500">
            이어서 물어볼 것
          </p>
          <ul className="space-y-2 text-sm text-dark-300">
            {result.followUpQuestions.map((question, index) => (
              <li key={`${messageId}-follow-up-${index}`}>{question}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DraftResultPanel({
  messageId,
  result,
}: {
  messageId: string;
  result: MakerAssistantDraftResult;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(result.body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      alert("복사에 실패했습니다. 브라우저 권한을 확인해주세요.");
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {result.title ? (
        <div className="rounded-xl border border-dark-700 bg-dark-950/30 px-3 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-dark-500">제목</p>
          <p className="mt-2 text-sm font-medium text-dark-50">{result.title}</p>
        </div>
      ) : null}
      <div className="rounded-xl border border-mystery-900/60 bg-black/15 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-mystery-300/80">붙여넣기용 본문</p>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-lg border border-mystery-700/70 bg-mystery-950/30 px-3 py-1.5 text-xs font-medium text-mystery-200 transition-colors hover:border-mystery-600 hover:bg-mystery-950/45"
          >
            {copied ? "복사됨" : "본문 복사"}
          </button>
        </div>
        <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-dark-50 font-sans">
          {result.body}
        </pre>
      </div>
      {result.notes.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-dark-500">짧은 메모</p>
          <ul className="space-y-2 text-sm text-dark-300">
            {result.notes.map((note, index) => (
              <li key={`${messageId}-note-${index}`}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
