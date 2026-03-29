"use client";

import { useState, type KeyboardEvent } from "react";
import Button from "@/components/ui/Button";
import MakerAssistantMessageList from "./MakerAssistantMessageList";
import {
  MAKER_ASSISTANT_RESPONSE_MODE_LABELS,
  MAKER_ASSISTANT_RESPONSE_MODE_PREFERENCES,
  MAKER_ASSISTANT_TASK_LABELS,
  type MakerAssistantClueSuggestionContext,
  type MakerAssistantChatMessage,
  type MakerAssistantResponseModePreference,
  type MakerAssistantTask,
} from "@/types/assistant";
import type { Location, Player } from "@/types/game";

const QUICK_ACTIONS: Array<{
  task: Exclude<MakerAssistantTask, "chat">;
  label: string;
  detail?: string;
}> = [
  {
    task: "validate_consistency",
    label: "모순 점검",
    detail: "단서 · 타임라인",
  },
  {
    task: "suggest_clues",
    label: "단서 제안",
  },
  {
    task: "suggest_next_steps",
    label: "다음 작업",
    detail: "우선순위 정리",
  },
];

interface MakerAssistantDrawerProps {
  open: boolean;
  pending: boolean;
  gameTitle: string;
  currentStep: number;
  validationIssueCount: number;
  locations: Location[];
  players: Player[];
  draft: string;
  responseMode: MakerAssistantResponseModePreference;
  error: string | null;
  messages: MakerAssistantChatMessage[];
  clueSuggestionContext: MakerAssistantClueSuggestionContext;
  clueSuggestionReady: boolean;
  clueSuggestionSummary: string;
  clueSuggestionHint: string;
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onResponseModeChange: (value: MakerAssistantResponseModePreference) => void;
  onQuickAction: (task: Exclude<MakerAssistantTask, "chat">) => void;
  onClueSuggestionContextChange: (value: MakerAssistantClueSuggestionContext) => void;
  onSend: () => void;
  onReset: () => void;
}

export default function MakerAssistantDrawer({
  open,
  pending,
  gameTitle,
  currentStep,
  validationIssueCount,
  locations,
  players,
  draft,
  responseMode,
  error,
  messages,
  clueSuggestionContext,
  clueSuggestionReady,
  clueSuggestionSummary,
  clueSuggestionHint,
  onClose,
  onDraftChange,
  onResponseModeChange,
  onQuickAction,
  onClueSuggestionContextChange,
  onSend,
  onReset,
}: MakerAssistantDrawerProps) {
  const [clueContextOpen, setClueContextOpen] = useState(false);

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
        <header className="border-b border-dark-800 px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-mystery-400/80 sm:text-xs">
                Maker Assistant
              </p>
              <h2 className="mt-1 text-base font-semibold text-dark-50 sm:text-[17px]">제작 도우미</h2>
              <p className="mt-1 truncate text-xs text-dark-400 sm:text-sm">{gameTitle}</p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-dark-700 px-2.5 py-1 text-[11px] text-dark-400 transition-colors hover:border-dark-500 hover:text-dark-200 sm:px-3 sm:text-xs"
            >
              닫기
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-dark-700 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-dark-400">
              Step {currentStep}
            </span>
            <span className="rounded-full border border-dark-700 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-dark-400">
              검증 힌트 {validationIssueCount}개
            </span>
            <span className="rounded-full border border-mystery-900/70 bg-mystery-950/20 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-mystery-300">
              저장 전 상태 포함
            </span>
          </div>
        </header>

        <div className="border-b border-dark-800 px-4 py-2.5 sm:px-5 sm:py-3">
          <div className="rounded-2xl border border-dark-700 bg-dark-950/55">
            <button
              type="button"
              onClick={() => setClueContextOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-dark-900/35 sm:px-4 sm:py-2.5"
            >
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.16em] text-dark-600">
                  단서 제안 맥락
                </p>
                <p className="mt-1 line-clamp-1 text-xs font-medium text-dark-100">
                  {clueSuggestionSummary}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-dark-700 bg-dark-900/80 px-2 py-1 text-[10px] text-dark-400">
                {clueContextOpen ? "접기" : "조정"}
              </span>
            </button>

            {clueContextOpen && (
              <div className="border-t border-dark-800 px-3 py-3">
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-dark-600">
                      범위
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {CLUE_SCOPE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            onClueSuggestionContextChange({
                              ...clueSuggestionContext,
                              scope: option.value,
                            })
                          }
                          disabled={pending}
                          className={[
                            "rounded-full border px-2.5 py-1.5 text-[11px] transition-colors",
                            clueSuggestionContext.scope === option.value
                              ? "border-mystery-700 bg-mystery-950/30 text-mystery-200"
                              : "border-dark-700 text-dark-500 hover:border-dark-500 hover:text-dark-300",
                          ].join(" ")}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(clueSuggestionContext.scope === "location" || clueSuggestionContext.scope === "location_and_player") && (
                    <div>
                      <label className="block text-[10px] uppercase tracking-[0.16em] text-dark-600">
                        장소
                      </label>
                      <select
                        value={clueSuggestionContext.locationId ?? ""}
                        onChange={(event) =>
                          onClueSuggestionContextChange({
                            ...clueSuggestionContext,
                            locationId: event.target.value || null,
                          })
                        }
                        disabled={pending || locations.length === 0}
                        className="mt-2 w-full rounded-xl border border-dark-700 bg-dark-900 px-3 py-2 text-sm text-dark-100 focus:outline-none focus:ring-2 focus:ring-mystery-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="">선택하세요</option>
                        {locations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name || "(이름 없음)"}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {(clueSuggestionContext.scope === "player" || clueSuggestionContext.scope === "location_and_player") && (
                    <div>
                      <label className="block text-[10px] uppercase tracking-[0.16em] text-dark-600">
                        관련 인물
                      </label>
                      <select
                        value={clueSuggestionContext.playerId ?? ""}
                        onChange={(event) =>
                          onClueSuggestionContextChange({
                            ...clueSuggestionContext,
                            playerId: event.target.value || null,
                          })
                        }
                        disabled={pending || players.length === 0}
                        className="mt-2 w-full rounded-xl border border-dark-700 bg-dark-900 px-3 py-2 text-sm text-dark-100 focus:outline-none focus:ring-2 focus:ring-mystery-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="">선택하세요</option>
                        {players.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name || "(이름 없음)"}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] uppercase tracking-[0.16em] text-dark-600">
                      요청 개수
                    </label>
                    <select
                      value={clueSuggestionContext.count}
                      onChange={(event) =>
                        onClueSuggestionContextChange({
                          ...clueSuggestionContext,
                          count: Number(event.target.value),
                        })
                      }
                      disabled={pending}
                    className="mt-2 w-full rounded-xl border border-dark-700 bg-dark-900 px-3 py-2 text-sm text-dark-100 focus:outline-none focus:ring-2 focus:ring-mystery-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {[1, 2, 3, 4, 5].map((count) => (
                        <option key={count} value={count}>
                          {count}개
                        </option>
                      ))}
                    </select>
                  </div>

                  {!clueSuggestionReady && clueSuggestionHint ? (
                    <p className="rounded-xl border border-amber-900/70 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
                      {clueSuggestionHint}
                    </p>
                  ) : (
                    <p className="text-[11px] leading-relaxed text-dark-500">
                      선택한 맥락은 `단서 제안` 빠른 액션과 채팅 로그 요약에 함께 반영됩니다.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-b border-dark-800 px-4 py-2 sm:px-5 sm:py-2.5">
          <div className="grid grid-cols-3 gap-2">
            {QUICK_ACTIONS.map((item) => {
              const disabled = pending || (item.task === "suggest_clues" && !clueSuggestionReady);

              return (
                <button
                  key={item.task}
                  type="button"
                  onClick={() => onQuickAction(item.task)}
                  disabled={disabled}
                  className="rounded-2xl border border-dark-700 bg-dark-900/60 px-3 py-2 text-left transition-colors hover:border-mystery-700 hover:bg-dark-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <p className="text-[11px] font-medium text-dark-100 sm:text-xs">
                    {item.label}
                  </p>
                  {item.task === "suggest_clues" ? (
                    <p className="mt-1 line-clamp-1 text-[10px] text-mystery-300/80">
                      {clueSuggestionSummary}
                    </p>
                  ) : item.detail ? (
                    <p className="mt-1 line-clamp-1 text-[10px] text-dark-500">
                      {item.detail}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2.5 sm:px-5 sm:py-3">
          <MakerAssistantMessageList messages={messages} pending={pending} />
        </div>

        <footer className="border-t border-dark-800 px-4 py-3 sm:px-5 sm:py-3.5">
          {error ? (
            <div className="mb-3 rounded-xl border border-red-900/70 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="space-y-2">
            <textarea
              rows={3}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={getComposerPlaceholder(responseMode)}
              className="w-full resize-none rounded-2xl border border-dark-700 bg-dark-900 px-4 py-2.5 text-sm text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500"
            />

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.16em] text-dark-600">응답 모드</span>
              {MAKER_ASSISTANT_RESPONSE_MODE_PREFERENCES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onResponseModeChange(mode)}
                  disabled={pending}
                  className={[
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    responseMode === mode
                      ? "border-mystery-700 bg-mystery-950/30 text-mystery-200"
                      : "border-dark-700 text-dark-500 hover:border-dark-500 hover:text-dark-300",
                  ].join(" ")}
                >
                  {MAKER_ASSISTANT_RESPONSE_MODE_LABELS[mode]}
                </button>
              ))}
            </div>

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

function getComposerPlaceholder(responseMode: MakerAssistantResponseModePreference): string {
  switch (responseMode) {
    case "guide":
      return "예: 지금 범인 동선이 너무 노골적인지 봐줘.";
    case "draft":
      return "예: Step 2 오프닝 스토리 텍스트 초안을 3문단으로 써줘.";
    default:
      return "예: 지금 범인 동선이 너무 노골적인지 봐줘. / 오프닝 문구 가안을 써줘.";
  }
}

const CLUE_SCOPE_OPTIONS = [
  { value: "all" as const, label: "전체" },
  { value: "location" as const, label: "장소" },
  { value: "player" as const, label: "인물" },
  { value: "location_and_player" as const, label: "장소 + 인물" },
];
