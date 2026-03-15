"use client";

import type { KeyboardEvent } from "react";
import Button from "@/components/ui/Button";
import MakerAssistantMessageList from "./MakerAssistantMessageList";
import { MAKER_ASSISTANT_TASK_LABELS, type MakerAssistantChatMessage, type MakerAssistantTask } from "@/types/assistant";

const QUICK_ACTIONS: Array<{
  task: Exclude<MakerAssistantTask, "chat">;
  description: string;
}> = [
  {
    task: "validate_consistency",
    description: "단서, 타임라인, 배경 스토리의 의미적 모순을 점검합니다.",
  },
  {
    task: "suggest_clues",
    description: "현재 캐릭터와 사건 설정을 기준으로 단서 아이디어를 제안합니다.",
  },
  {
    task: "suggest_next_steps",
    description: "지금 작업 상태에서 무엇부터 채우면 좋은지 우선순위를 정리합니다.",
  },
];

interface MakerAssistantDrawerProps {
  open: boolean;
  pending: boolean;
  gameTitle: string;
  currentStep: number;
  validationIssueCount: number;
  draft: string;
  error: string | null;
  messages: MakerAssistantChatMessage[];
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onQuickAction: (task: Exclude<MakerAssistantTask, "chat">) => void;
  onSend: () => void;
  onReset: () => void;
}

export default function MakerAssistantDrawer({
  open,
  pending,
  gameTitle,
  currentStep,
  validationIssueCount,
  draft,
  error,
  messages,
  onClose,
  onDraftChange,
  onQuickAction,
  onSend,
  onReset,
}: MakerAssistantDrawerProps) {
  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <div
      className={[
        "pointer-events-none fixed inset-0 z-40 transition-opacity duration-200",
        open ? "opacity-100" : "opacity-0",
      ].join(" ")}
      aria-hidden={!open}
    >
      <button
        type="button"
        onClick={onClose}
        className={[
          "absolute inset-0 bg-black/55 transition-opacity",
          open ? "pointer-events-auto opacity-100" : "opacity-0",
        ].join(" ")}
        aria-label="제작 도우미 닫기"
      />

      <aside
        className={[
          "pointer-events-auto absolute inset-y-0 right-0 flex w-full flex-col border-l border-dark-800 bg-dark-950/98 shadow-2xl backdrop-blur-xl transition-transform duration-200 sm:max-w-[460px]",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <header className="border-b border-dark-800 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.22em] text-mystery-400/80">Maker Assistant</p>
              <h2 className="mt-1 text-lg font-semibold text-dark-50">제작 도우미</h2>
              <p className="mt-1 truncate text-sm text-dark-400">{gameTitle}</p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-dark-700 px-3 py-1 text-xs text-dark-400 transition-colors hover:border-dark-500 hover:text-dark-200"
            >
              닫기
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-dark-700 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-dark-400">
              Step {currentStep}
            </span>
            <span className="rounded-full border border-dark-700 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-dark-400">
              검증 힌트 {validationIssueCount}개
            </span>
            <span className="rounded-full border border-mystery-900/70 bg-mystery-950/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-mystery-300">
              저장 전 상태 포함
            </span>
          </div>
        </header>

        <div className="border-b border-dark-800 px-5 py-4">
          <div className="grid grid-cols-1 gap-2.5">
            {QUICK_ACTIONS.map((item) => (
              <button
                key={item.task}
                type="button"
                onClick={() => onQuickAction(item.task)}
                disabled={pending}
                className="rounded-2xl border border-dark-700 bg-dark-900/60 px-4 py-3 text-left transition-colors hover:border-mystery-700 hover:bg-dark-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <p className="text-sm font-medium text-dark-100">
                  {MAKER_ASSISTANT_TASK_LABELS[item.task]}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-dark-500">
                  {item.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <MakerAssistantMessageList messages={messages} pending={pending} />
        </div>

        <footer className="border-t border-dark-800 px-5 py-4">
          {error ? (
            <div className="mb-3 rounded-xl border border-red-900/70 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="space-y-3">
            <textarea
              rows={4}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="예: 지금 범인 동선이 너무 노골적인지 봐줘."
              className="w-full resize-none rounded-2xl border border-dark-700 bg-dark-900 px-4 py-3 text-sm text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500"
            />

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onReset}
                className="text-xs text-dark-500 transition-colors hover:text-dark-300"
              >
                대화 초기화
              </button>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-dark-600">Cmd/Ctrl + Enter</span>
                <Button onClick={onSend} loading={pending}>
                  보내기
                </Button>
              </div>
            </div>
          </div>
        </footer>
      </aside>
    </div>
  );
}
