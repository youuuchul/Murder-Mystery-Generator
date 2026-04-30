"use client";

import { useState } from "react";
import { getCoverImageObjectStyle, resolveCoverImagePosition } from "@/lib/cover-image-style";
import { canUsePrivateChat, normalizePrivateChatConfig } from "@/lib/game-rules";
import { withGameAssetVariant } from "@/lib/game-asset-variant";
import ImageAssetField from "./ImageAssetField";
import type { CoverImagePosition, GamePackage, GameSettings, GameRules, PhaseConfig } from "@/types/game";

interface SettingsEditorProps {
  game: GamePackage;
  onChange: (partial: Partial<GamePackage>) => void;
}

const TAG_SUGGESTION_GROUPS: { label: string; tags: string[] }[] = [
  {
    label: "유통",
    tags: ["독점 제공", "오리지널", "IP 기반", "펀딩 예정", "펀딩 중"],
  },
  {
    label: "장르",
    tags: ["판타지", "현대", "SF", "역사", "중세", "공포", "힐링"],
  },
  {
    label: "제작",
    tags: ["AI 일러스트", "수작업 일러스트", "혼합 일러스트", "BGM 포함", "동영상 포함", "텍스트 중시", "추리 중시"],
  },
];

const MIN_PLAYER_COUNT = 1;
const MAX_PLAYER_COUNT = 15;

const DIFFICULTIES = [
  { value: "easy", label: "쉬움" },
  { value: "normal", label: "보통" },
  { value: "hard", label: "어려움" },
] as const;

const inputClass =
  "bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";

function formatDuration(minutes: number): string {
  return minutes === 0 ? "없음" : `${minutes}분`;
}

function getTimerTotalMinutes(rules: GameRules): number {
  const roundTotal = rules.phases.reduce((sum, phase) => sum + phase.durationMinutes, 0);
  return rules.openingDurationMinutes + roundTotal * rules.roundCount;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function parseBoundedNumber(rawValue: string, min: number, max: number): number {
  const numericValue = Number(rawValue.replace(/[^\d]/g, ""));
  return clampNumber(numericValue, min, max);
}

function NumberInputField({
  label,
  value,
  min,
  max,
  formatValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const displayValue = formatValue ? formatValue(value) : String(value);
  const unitLabel = formatValue ? displayValue.replace(String(value), "") : "";

  return (
    <div className="rounded-2xl border border-dark-800 bg-dark-950/35 p-3">
      <div className="mb-2 text-xs font-medium text-dark-500">{label}</div>
      <div className="relative rounded-lg border border-dark-600 bg-dark-800 transition focus-within:border-transparent focus-within:ring-2 focus-within:ring-mystery-500">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(event) => onChange(parseBoundedNumber(event.target.value, min, max))}
          className="w-full rounded-lg bg-transparent px-3 py-2 pr-12 text-center text-sm font-semibold text-dark-100 outline-none"
        />
        {unitLabel ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-dark-500">{unitLabel}</span>
        ) : null}
      </div>
    </div>
  );
}

function TimeInputField({
  label,
  value,
  min = 5,
  max = 60,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const quickOptions = Array.from({ length: Math.floor(max / 5) + 1 }, (_, index) => index * 5)
    .filter((option) => option >= min);
  const selectValue = quickOptions.includes(value) ? String(value) : "";

  return (
    <div className="rounded-2xl border border-dark-800 bg-dark-950/35 p-3">
      <div className="mb-2 text-xs font-medium text-dark-500">{label}</div>
      <div className="grid grid-cols-[minmax(0,1fr)_120px] overflow-hidden rounded-lg border border-dark-600 bg-dark-800 transition focus-within:border-transparent focus-within:ring-2 focus-within:ring-mystery-500">
        <label className="relative block min-w-0">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value}
            onChange={(event) => onChange(parseBoundedNumber(event.target.value, min, max))}
            className="w-full bg-transparent px-3 py-2 pr-9 text-center text-sm font-semibold text-dark-100 outline-none"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-dark-500">분</span>
        </label>
        <select
          value={selectValue}
          onChange={(event) => {
            if (!event.target.value) return;
            onChange(Number(event.target.value));
          }}
          className="h-full w-full border-l border-dark-600 bg-dark-900 px-3 py-2 text-xs text-dark-200 outline-none transition-colors hover:bg-dark-800"
          aria-label={`${label} 빠른 선택`}
        >
          <option value="">빠른 선택</option>
          {quickOptions.map((option) => (
            <option key={option} value={option}>
              {option}분
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function SettingsEditor({ game, onChange }: SettingsEditorProps) {
  const settings = game.settings;
  const rules = game.rules;
  const characterCount = game.players?.length ?? 0;

  const [tagInput, setTagInput] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);

  const privateChat = normalizePrivateChatConfig(settings.playerCount, rules?.privateChat);
  const canConfigurePrivateChat = canUsePrivateChat(settings.playerCount);
  const roundTotalMin = rules.phases.reduce((sum, phase) => sum + phase.durationMinutes, 0);
  const timerTotalMin = getTimerTotalMinutes(rules);
  const voteEndingMin = Math.max(0, settings.estimatedDuration - timerTotalMin);
  const displayedEstimatedDuration = timerTotalMin + voteEndingMin;
  const investigationPhase = rules.phases.find((phase) => phase.type === "investigation");
  const discussionPhase = rules.phases.find((phase) => phase.type === "discussion");
  const investigationMinutes = investigationPhase?.durationMinutes ?? 0;
  const discussionMinutes = discussionPhase?.durationMinutes ?? 0;
  const splitRoundPhases = discussionMinutes > 0;

  function updateSettings<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    if (key === "playerCount") {
      const nextPlayerCount = value as number;
      const nextRules = {
        ...rules,
        phases: rules.phases.map((phase) => (
          phase.type === "discussion" && nextPlayerCount <= 1
            ? { ...phase, durationMinutes: 0 }
            : phase
        )),
        privateChat: normalizePrivateChatConfig(nextPlayerCount, privateChat),
      };
      onChange({
        settings: { ...settings, [key]: value, estimatedDuration: getTimerTotalMinutes(nextRules) + voteEndingMin },
        rules: nextRules,
      });
      return;
    }
    onChange({ settings: { ...settings, [key]: value } });
  }

  function updateRules(partial: Partial<GameRules>) {
    const nextRules = { ...rules, ...partial };
    onChange({
      rules: nextRules,
      settings: { ...settings, estimatedDuration: getTimerTotalMinutes(nextRules) + voteEndingMin },
    });
  }

  function updatePhaseDuration(type: PhaseConfig["type"], durationMinutes: number) {
    updateRules({
      phases: rules.phases.map((phase) => (
        phase.type === type ? { ...phase, durationMinutes } : phase
      )),
    });
  }

  function updateRoundPhaseMode(split: boolean) {
    if (split === splitRoundPhases) return;

    const currentRoundMinutes = Math.max(5, investigationMinutes + discussionMinutes);
    if (!split) {
      const mergedMinutes = Math.min(60, currentRoundMinutes);
      updateRules({
        phases: rules.phases.map((phase) => {
          if (phase.type === "investigation") return { ...phase, durationMinutes: mergedMinutes };
          if (phase.type === "discussion") return { ...phase, durationMinutes: 0 };
          return phase;
        }),
      });
      return;
    }

    const nextDiscussionMinutes = Math.min(10, Math.max(5, currentRoundMinutes - 5));
    const nextInvestigationMinutes = Math.max(5, currentRoundMinutes - nextDiscussionMinutes);
    updateRules({
      phases: rules.phases.map((phase) => {
        if (phase.type === "investigation") return { ...phase, durationMinutes: nextInvestigationMinutes };
        if (phase.type === "discussion") return { ...phase, durationMinutes: nextDiscussionMinutes };
        return phase;
      }),
    });
  }

  function updatePrivateChat(partial: Partial<GameRules["privateChat"]>) {
    updateRules({ privateChat: normalizePrivateChatConfig(settings.playerCount, { ...privateChat, ...partial }) });
  }

  function updateVoteEndingMinutes(nextMinutes: number) {
    onChange({ settings: { ...settings, estimatedDuration: timerTotalMin + Math.max(0, nextMinutes) } });
  }

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || settings.tags.includes(tag) || settings.tags.length >= 10) return;
    updateSettings("tags", [...settings.tags, tag]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    updateSettings("tags", settings.tags.filter((item) => item !== tag));
  }

  /**
   * 표지 이미지를 업로드하고 설정값에 내부 에셋 URL을 연결한다.
   * 썸네일/표시용 변형은 업로드 API에서 함께 생성된다.
   */
  async function handleCoverUpload(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("scope", "covers");

    setUploadingCover(true);
    try {
      const res = await fetch(`/api/games/${game.id}/assets`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error ?? "표지 업로드 실패");
        return;
      }

      updateSettings("coverImageUrl", data.url);
    } catch (error) {
      console.error("표지 업로드 실패:", error);
      alert("표지 업로드 중 오류가 발생했습니다.");
    } finally {
      setUploadingCover(false);
    }
  }

  const roundBlockMin = roundTotalMin * rules.roundCount;
  const playerCountMismatch = characterCount > 0 && characterCount !== settings.playerCount;
  const coverImagePosition = resolveCoverImagePosition(settings.coverImagePosition);
  const coverPreviewUrl = settings.coverImageUrl
    ? withGameAssetVariant(settings.coverImageUrl, "display") ?? settings.coverImageUrl
    : undefined;
  const coverZoomPercent = Math.round(coverImagePosition.zoom * 100);
  const availableTagSuggestionGroups = TAG_SUGGESTION_GROUPS
    .map((group) => ({
      ...group,
      tags: group.tags.filter((tag) => !settings.tags.includes(tag)),
    }))
    .filter((group) => group.tags.length > 0);
  const hasAvailableTagSuggestions = availableTagSuggestionGroups.length > 0;
  const tagLimitReached = settings.tags.length >= 10;
  const canDecreasePlayerCount = settings.playerCount > MIN_PLAYER_COUNT;
  const canIncreasePlayerCount = settings.playerCount < MAX_PLAYER_COUNT;

  function updateCoverImagePosition(partial: Partial<CoverImagePosition>) {
    updateSettings("coverImagePosition", { ...coverImagePosition, ...partial });
  }

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-xl font-bold text-dark-50">기본 설정</h2>
      </div>

      <div data-maker-anchor="step-1-title">
        <label className="block text-sm font-medium text-dark-200 mb-2">시나리오 제목</label>
        <input
          type="text"
          value={game.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="예: 저택의 밤, 사라진 다이아몬드"
          className={`w-full ${inputClass}`}
        />
      </div>

      <div data-maker-anchor="step-1-summary">
        <label className="block text-sm font-medium text-dark-200 mb-2">소개글</label>
        <textarea
          rows={3}
          value={settings.summary ?? ""}
          onChange={(e) => updateSettings("summary", e.target.value || undefined)}
          placeholder="스포일러 없이 분위기와 배경을 짧게 적으세요."
          maxLength={220}
          className={`w-full ${inputClass} resize-none`}
        />
        <div className="mt-1 flex items-center justify-end">
          <span className="shrink-0 text-[11px] text-dark-600">{(settings.summary ?? "").length}/220</span>
        </div>
      </div>

      <div className="rounded-xl border border-dark-800 bg-dark-900/50 p-5 space-y-4">
        <ImageAssetField
          title="표지 이미지"
          description="라이브러리 카드에 표시됩니다."
          value={settings.coverImageUrl}
          alt={game.title || "시나리오 표지 미리보기"}
          profile="cover"
          onChange={(nextValue) => updateSettings("coverImageUrl", nextValue)}
          onUpload={handleCoverUpload}
          uploading={uploadingCover}
          uploadLabel="표지 업로드"
          emptyStateLabel="표지 이미지 없음"
        />

        {settings.coverImageUrl ? (
          <div className="rounded-xl border border-dark-800 bg-dark-950/40 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-dark-200">표지 크롭</p>
              </div>
              <button
                type="button"
                onClick={() => updateCoverImagePosition({ x: 50, y: 50, zoom: 1 })}
                className="rounded-lg border border-dark-700 px-3 py-2 text-xs text-dark-300 transition-colors hover:border-dark-500 hover:text-dark-100"
              >
                중앙
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div>
                <div className="overflow-hidden rounded-2xl border border-dark-700 bg-dark-950/60">
                  <div className="relative aspect-[16/10]">
                    <img
                      src={coverPreviewUrl}
                      alt={game.title || "표지 위치 미리보기"}
                      className="h-full w-full object-cover"
                      style={getCoverImageObjectStyle(coverImagePosition)}
                    />
                    <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-dark-800 bg-dark-900/55 p-4 space-y-4">
                <label className="block space-y-2">
                  <div className="flex items-center justify-between gap-3 text-xs text-dark-400">
                    <span>좌우</span>
                    <span>{coverImagePosition.x}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={coverImagePosition.x}
                    onChange={(event) => updateCoverImagePosition({ x: Number(event.target.value) })}
                    className="w-full accent-mystery-500"
                  />
                </label>

                <label className="block space-y-2">
                  <div className="flex items-center justify-between gap-3 text-xs text-dark-400">
                    <span>상하</span>
                    <span>{coverImagePosition.y}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={coverImagePosition.y}
                    onChange={(event) => updateCoverImagePosition({ y: Number(event.target.value) })}
                    className="w-full accent-mystery-500"
                  />
                </label>

                <label className="block space-y-2">
                  <div className="flex items-center justify-between gap-3 text-xs text-dark-400">
                    <span>확대</span>
                    <span>{coverZoomPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={2.5}
                    step={0.05}
                    value={coverImagePosition.zoom}
                    onChange={(event) => updateCoverImagePosition({ zoom: Number(event.target.value) })}
                    className="w-full accent-mystery-500"
                  />
                </label>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div data-maker-anchor="step-1-tags">
        <label className="block text-sm font-medium text-dark-200 mb-3">
          태그
          <span className="ml-2 text-xs font-normal text-dark-500">{settings.tags.length}/10</span>
        </label>
        <div className="rounded-xl border border-dark-800 bg-dark-900/45 p-4 space-y-3">
          {settings.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {settings.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`${tag} 태그 제거`}
                  className="rounded-full border border-mystery-700 bg-mystery-950/30 px-3 py-1 text-xs font-medium text-mystery-200 hover:bg-mystery-950/50 transition-colors"
                >
                  # {tag} ×
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              disabled={tagLimitReached}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              className={`flex-1 ${inputClass}`}
            />
            <button
              type="button"
              onClick={() => addTag(tagInput)}
              disabled={tagLimitReached || !tagInput.trim()}
              className="rounded-lg border border-dark-600 bg-dark-800 px-4 py-2 text-sm text-dark-200 hover:bg-dark-700 transition-colors disabled:cursor-default disabled:opacity-40"
            >
              추가
            </button>
          </div>

          {hasAvailableTagSuggestions && !tagLimitReached ? (
            <details className="group rounded-lg border border-dark-800 bg-dark-950/35">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs text-dark-400 transition-colors hover:text-dark-200">
                <span>추천 태그</span>
              </summary>
              <div className="space-y-2 border-t border-dark-800 px-3 py-3">
                {availableTagSuggestionGroups.map((group) => (
                  <div key={group.label} className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-[11px] text-dark-600">{group.label}</span>
                    {group.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => addTag(tag)}
                        className="rounded-full border border-dark-700 bg-dark-800/60 px-3 py-1 text-xs text-dark-300 hover:border-dark-500 hover:text-dark-100 transition-colors"
                      >
                        # {tag}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div
          data-maker-anchor="step-1-player-count"
          className="rounded-xl border border-dark-800 bg-dark-900/45 p-4"
        >
          <label className="block text-sm font-medium text-dark-200 mb-3">플레이어 수</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => updateSettings("playerCount", Math.max(MIN_PLAYER_COUNT, settings.playerCount - 1))}
              disabled={!canDecreasePlayerCount}
              className="w-10 h-10 rounded-lg border border-dark-600 bg-dark-800 text-dark-200 hover:bg-dark-700 flex items-center justify-center text-lg font-bold transition-colors disabled:cursor-default disabled:opacity-35"
            >
              −
            </button>
            <span className="flex-1 rounded-lg border border-dark-800 bg-dark-950/45 py-2 text-center text-xl font-bold text-dark-50">
              {settings.playerCount}
              <span className="text-sm font-normal text-dark-400 ml-1">명</span>
            </span>
            <button
              type="button"
              onClick={() => updateSettings("playerCount", Math.min(MAX_PLAYER_COUNT, settings.playerCount + 1))}
              disabled={!canIncreasePlayerCount}
              className="w-10 h-10 rounded-lg border border-dark-600 bg-dark-800 text-dark-200 hover:bg-dark-700 flex items-center justify-center text-lg font-bold transition-colors disabled:cursor-default disabled:opacity-35"
            >
              +
            </button>
          </div>

          {characterCount > 0 && playerCountMismatch && (
            <div className="mt-2 rounded-lg border border-yellow-800 bg-yellow-950/30 px-3 py-2 text-xs text-yellow-400">
              현재 캐릭터 {characterCount}명. 플레이어 탭에서 수를 맞춰주세요.
            </div>
          )}

          <div className="mt-4 border-t border-dark-800 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-dark-200">밀담</p>
              </div>
              <button
                type="button"
                onClick={() => canConfigurePrivateChat && updatePrivateChat({ enabled: !privateChat.enabled })}
                disabled={!canConfigurePrivateChat}
                className={[
                  "relative h-6 w-11 rounded-full transition-colors",
                  privateChat.enabled && canConfigurePrivateChat ? "bg-mystery-600" : "bg-dark-600",
                  !canConfigurePrivateChat ? "cursor-not-allowed opacity-50" : "",
                ].join(" ")}
                aria-label="밀담 사용 여부"
              >
                <span
                  className={[
                    "absolute left-0 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform",
                    privateChat.enabled && canConfigurePrivateChat ? "translate-x-6" : "translate-x-1",
                  ].join(" ")}
                />
              </button>
            </div>

            {canConfigurePrivateChat && privateChat.enabled ? (
              <div className="mt-3">
                <NumberInputField
                  label="최대 인원"
                  value={privateChat.maxGroupSize}
                  min={2}
                  max={Math.max(2, settings.playerCount - 1)}
                  formatValue={(value) => `${value}인`}
                  onChange={(value) => updatePrivateChat({ maxGroupSize: value })}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-dark-800 bg-dark-900/45 p-4">
          <label className="block text-sm font-medium text-dark-200 mb-3">표기 난이도</label>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTIES.map((difficulty) => (
              <button
                key={difficulty.value}
                type="button"
                onClick={() => updateSettings("difficulty", difficulty.value)}
                className={[
                  "flex items-center justify-center rounded-lg border px-3 py-3 text-sm font-medium transition-all",
                  settings.difficulty === difficulty.value
                    ? "border-mystery-600 bg-mystery-950/50 text-mystery-200"
                    : "border-dark-700 bg-dark-800/50 text-dark-400 hover:border-dark-500",
                ].join(" ")}
              >
                {difficulty.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div data-maker-anchor="step-1-duration" className="rounded-2xl border border-dark-800 bg-dark-900/50 p-5 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block text-sm font-medium text-dark-200">예상 소요 시간</label>
          <p className="text-3xl font-bold tracking-tight text-dark-50">
            총 {displayedEstimatedDuration}분
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <div className="rounded-2xl border border-dark-800 bg-dark-950/25 p-4">
            <p className="mb-3 text-sm font-semibold text-dark-100">오프닝</p>
            <TimeInputField
              label="시간"
              value={rules.openingDurationMinutes}
              min={5}
              max={60}
              onChange={(value) => updateRules({ openingDurationMinutes: value })}
            />
          </div>

          <div className="rounded-2xl border border-dark-800 bg-dark-950/25 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-dark-100">라운드</p>
              <span className="text-xs text-dark-500">{formatDuration(roundBlockMin)}</span>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl border border-dark-800 bg-dark-950/35 p-1">
              <button
                type="button"
                onClick={() => updateRoundPhaseMode(false)}
                className={[
                  "rounded-xl px-3 py-2 text-xs font-medium transition-colors",
                  !splitRoundPhases
                    ? "bg-mystery-900/50 text-mystery-200"
                    : "text-dark-500 hover:text-dark-200",
                ].join(" ")}
              >
                통합
              </button>
              <button
                type="button"
                onClick={() => updateRoundPhaseMode(true)}
                className={[
                  "rounded-xl px-3 py-2 text-xs font-medium transition-colors",
                  splitRoundPhases
                    ? "bg-mystery-900/50 text-mystery-200"
                    : "text-dark-500 hover:text-dark-200",
                ].join(" ")}
              >
                조사/토론 별도
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <NumberInputField
                label="횟수"
                value={rules.roundCount}
                min={1}
                max={10}
                formatValue={(value) => `${value}라운드`}
                onChange={(value) => updateRules({ roundCount: value })}
              />
              {splitRoundPhases ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <TimeInputField
                    label="조사"
                    value={investigationMinutes}
                    min={5}
                    max={60}
                    onChange={(value) => updatePhaseDuration("investigation", value)}
                  />
                  <TimeInputField
                    label="토론"
                    value={discussionMinutes}
                    min={5}
                    max={60}
                    onChange={(value) => updatePhaseDuration("discussion", value)}
                  />
                </div>
              ) : (
                <TimeInputField
                  label="라운드 시간"
                  value={investigationMinutes}
                  min={5}
                  max={60}
                  onChange={(value) => updatePhaseDuration("investigation", value)}
                />
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-dark-800 bg-dark-950/25 p-4">
            <p className="mb-3 text-sm font-semibold text-dark-100">투표/엔딩</p>
            <TimeInputField
              label="시간"
              value={voteEndingMin}
              min={0}
              max={60}
              onChange={updateVoteEndingMinutes}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
