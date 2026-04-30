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

const PHASE_LABELS: Record<PhaseConfig["type"], string> = {
  investigation: "조사",
  discussion: "토론",
};

const inputClass =
  "bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";

export default function SettingsEditor({ game, onChange }: SettingsEditorProps) {
  const settings = game.settings;
  const rules = game.rules;
  const characterCount = game.players?.length ?? 0;

  const [showPlayerCountWarning, setShowPlayerCountWarning] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);

  const privateChat = normalizePrivateChatConfig(settings.playerCount, rules?.privateChat);
  const cardTradingEnabled = rules?.cardTrading?.enabled ?? true;
  const canConfigurePrivateChat = canUsePrivateChat(settings.playerCount);

  function updateSettings<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    if (key === "playerCount") {
      setShowPlayerCountWarning(true);
      const nextPlayerCount = value as number;
      onChange({
        settings: { ...settings, [key]: value },
        rules: {
          ...rules,
          phases: rules.phases.map((phase) => (
            phase.type === "discussion" && nextPlayerCount <= 1
              ? { ...phase, durationMinutes: 0 }
              : phase
          )),
          privateChat: normalizePrivateChatConfig(nextPlayerCount, privateChat),
        },
      });
      return;
    }
    onChange({ settings: { ...settings, [key]: value } });
  }

  function updateRules(partial: Partial<GameRules>) {
    onChange({ rules: { ...rules, ...partial } });
  }

  function updatePhase(idx: number, partial: Partial<PhaseConfig>) {
    updateRules({
      phases: rules.phases.map((phase, phaseIdx) => (phaseIdx === idx ? { ...phase, ...partial } : phase)),
    });
  }

  function updatePrivateChat(partial: Partial<GameRules["privateChat"]>) {
    updateRules({ privateChat: normalizePrivateChatConfig(settings.playerCount, { ...privateChat, ...partial }) });
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

  const roundTotalMin = rules.phases.reduce((sum, phase) => sum + phase.durationMinutes, 0);
  const totalMin = rules.openingDurationMinutes + roundTotalMin * rules.roundCount;
  const roundBlockMin = roundTotalMin * rules.roundCount;
  const estimateDeltaMin = settings.estimatedDuration - totalMin;
  const estimateDeltaAbs = Math.abs(estimateDeltaMin);
  const estimateDeltaLabel = estimateDeltaMin > 0
    ? `표기 여유 ${estimateDeltaMin}분`
    : estimateDeltaMin === 0
      ? "타이머와 동일"
      : `타이머 초과 ${estimateDeltaAbs}분`;
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

  function formatDuration(minutes: number): string {
    return minutes === 0 ? "없음" : `${minutes}분`;
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div
          data-maker-anchor="step-1-player-count"
          className="h-full rounded-xl border border-dark-800 bg-dark-900/45 p-4"
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

          {showPlayerCountWarning && (
            <div className="mt-2 px-3 py-2 rounded-lg text-xs bg-orange-950/20 border border-orange-900 text-orange-400">
              플레이어 수만 바뀝니다. 캐릭터는 플레이어 탭에서 맞춰주세요.
            </div>
          )}
        </div>

        <div className="h-full rounded-xl border border-dark-800 bg-dark-900/45 p-4">
          <label className="block text-sm font-medium text-dark-200 mb-3">표기 난이도</label>
          <div className="grid grid-cols-2 gap-2">
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

      <div>
        <label className="block text-sm font-medium text-dark-200 mb-2">예상 소요 시간</label>
        <div className="rounded-xl border border-dark-800 bg-dark-900/50 p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-2xl font-bold text-dark-50">{settings.estimatedDuration}분</p>
              <p className="mt-1 text-xs text-dark-500">
                타이머 합계 {totalMin}분 · 투표/엔딩은 별도
              </p>
            </div>
            <span
              className={[
                "rounded-full border px-3 py-1 text-xs",
                estimateDeltaMin >= 0
                  ? "border-dark-700 bg-dark-950/60 text-dark-300"
                  : "border-yellow-900/70 bg-yellow-950/20 text-yellow-300",
              ].join(" ")}
            >
              {estimateDeltaLabel}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={30}
              max={300}
              step={15}
              value={settings.estimatedDuration}
              onChange={(e) => updateSettings("estimatedDuration", Number(e.target.value))}
              className="flex-1 accent-mystery-500"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-dark-800 pt-8 space-y-6">
        <div>
          <h3 className="text-base font-semibold text-dark-100">게임 규칙</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-2">
              총 라운드 수 <span className="text-dark-600">(조사→토론 반복)</span>
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => updateRules({ roundCount: Math.max(1, rules.roundCount - 1) })}
                className="w-9 h-9 rounded-lg border border-dark-600 bg-dark-800 text-dark-200 hover:bg-dark-700 flex items-center justify-center text-lg font-bold transition-colors"
              >
                −
              </button>
              <span className="flex-1 text-center text-xl font-bold text-dark-50">
                {rules.roundCount}
                <span className="text-sm font-normal text-dark-400 ml-1">라운드</span>
              </span>
              <button
                type="button"
                onClick={() => updateRules({ roundCount: Math.min(10, rules.roundCount + 1) })}
                className="w-9 h-9 rounded-lg border border-dark-600 bg-dark-800 text-dark-200 hover:bg-dark-700 flex items-center justify-center text-lg font-bold transition-colors"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center">
            <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 w-full text-sm text-dark-400 space-y-1">
              <p className="font-medium text-dark-200 mb-2">진행 타이머 합계</p>
              <div className="flex justify-between">
                <span>오프닝</span>
                <span className="text-dark-300">{rules.openingDurationMinutes}분</span>
              </div>
              <div className="flex justify-between">
                <span>1라운드 합계</span>
                <span className="text-dark-300">{roundTotalMin}분</span>
              </div>
              <div className="flex justify-between">
                <span>라운드 전체</span>
                <span className="text-dark-300">{roundBlockMin}분</span>
              </div>
              <div className="flex justify-between">
                <span>투표/엔딩</span>
                <span className="text-dark-500">별도</span>
              </div>
              <div className="border-t border-dark-700 pt-1 mt-1 flex justify-between text-mystery-400 font-semibold">
                <span>타이머 합계</span>
                <span>{totalMin}분</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-dark-400 mb-3">오프닝 제한 시간</label>
          <div className="flex items-center gap-3 bg-dark-800/50 border border-dark-700 rounded-lg px-4 py-3">
            <span className="text-sm font-medium text-dark-200 w-20">오프닝</span>
            <input
              type="range"
              min={1}
              max={30}
              step={1}
              value={rules.openingDurationMinutes}
              onChange={(e) => updateRules({ openingDurationMinutes: Number(e.target.value) })}
              className="flex-1 accent-mystery-500"
            />
            <span className="text-dark-300 text-sm w-12 text-right">{rules.openingDurationMinutes}분</span>
          </div>
          <p className="mt-2 text-xs text-dark-500">공통화면과 GM 화면 타이머에 적용됩니다.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-dark-400 mb-3">페이즈별 시간</label>
          <div className="space-y-2">
            {rules.phases.map((phase, idx) => (
              <div key={phase.type} className="flex items-center gap-3 bg-dark-800/50 border border-dark-700 rounded-lg px-4 py-3">
                <span className="text-sm font-medium text-dark-200 w-20">{PHASE_LABELS[phase.type]}</span>
                <input
                  type="range"
                  min={phase.type === "discussion" ? 0 : 3}
                  max={60}
                  step={1}
                  value={phase.durationMinutes}
                  onChange={(e) => updatePhase(idx, { durationMinutes: Number(e.target.value) })}
                  className="flex-1 accent-mystery-500"
                />
                <span className="text-dark-300 text-sm w-12 text-right">{formatDuration(phase.durationMinutes)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-dark-500">
            토론을 0분으로 두면 조사 후 바로 다음 라운드 또는 투표로 넘어갑니다.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-200">밀담 (사적 대화)</p>
                <p className="text-xs text-dark-500 mt-0.5">조사 페이즈 중 소그룹 비밀 대화</p>
              </div>
              <button
                type="button"
                onClick={() => canConfigurePrivateChat && updatePrivateChat({ enabled: !privateChat.enabled })}
                disabled={!canConfigurePrivateChat}
                className={[
                  "relative w-11 h-6 rounded-full transition-colors",
                  privateChat.enabled && canConfigurePrivateChat ? "bg-mystery-600" : "bg-dark-600",
                  !canConfigurePrivateChat ? "cursor-not-allowed opacity-60" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "absolute left-0 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
                    privateChat.enabled && canConfigurePrivateChat ? "translate-x-6" : "translate-x-1",
                  ].join(" ")}
                />
              </button>
            </div>

            {!canConfigurePrivateChat ? (
              <p className="rounded-lg border border-dark-700 bg-dark-900/40 px-3 py-2 text-xs text-dark-500">
                밀담은 플레이어 3명 이상일 때만 사용할 수 있습니다.
              </p>
            ) : privateChat.enabled && (
              <div className="space-y-3 pt-1 border-t border-dark-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dark-400">최대 인원</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updatePrivateChat({ maxGroupSize: Math.max(2, privateChat.maxGroupSize - 1) })}
                      className="w-7 h-7 rounded border border-dark-600 bg-dark-700 text-dark-200 hover:bg-dark-600 flex items-center justify-center text-sm font-bold transition-colors"
                    >
                      −
                    </button>
                    <span className="text-dark-100 font-medium w-8 text-center">{privateChat.maxGroupSize}인</span>
                    <button
                      type="button"
                      onClick={() => updatePrivateChat({ maxGroupSize: Math.min(Math.max(2, settings.playerCount - 1), privateChat.maxGroupSize + 1) })}
                      className="w-7 h-7 rounded border border-dark-600 bg-dark-700 text-dark-200 hover:bg-dark-600 flex items-center justify-center text-sm font-bold transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

              </div>
            )}
          </div>

          <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-200">카드 주고받기</p>
                <p className="text-xs text-dark-500 mt-0.5">단서 카드를 서로 전달할 수 있음</p>
              </div>
              <button
                type="button"
                onClick={() => updateRules({ cardTrading: { enabled: !cardTradingEnabled } })}
                className={["relative w-11 h-6 rounded-full transition-colors", cardTradingEnabled ? "bg-mystery-600" : "bg-dark-600"].join(" ")}
              >
                <span
                  className={[
                    "absolute left-0 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
                    cardTradingEnabled ? "translate-x-6" : "translate-x-1",
                  ].join(" ")}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
