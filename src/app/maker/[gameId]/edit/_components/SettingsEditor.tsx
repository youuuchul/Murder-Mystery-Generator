"use client";

import { useState } from "react";
import ImageAssetField from "./ImageAssetField";
import type { GamePackage, GameSettings, GameRules, PhaseConfig } from "@/types/game";

interface SettingsEditorProps {
  game: GamePackage;
  onChange: (partial: Partial<GamePackage>) => void;
}

const TAG_SUGGESTIONS = [
  "고딕 저택",
  "도시 누아르",
  "폐쇄형",
  "심리전",
  "가문 비밀",
  "파티",
  "호러",
  "코믹",
  "역사",
  "SF",
];

const DIFFICULTIES = [
  { value: "easy", label: "쉬움", desc: "초보자 권장" },
  { value: "normal", label: "보통", desc: "일반적인 난이도" },
  { value: "hard", label: "어려움", desc: "고난도 추리" },
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

  const privateChat = rules?.privateChat ?? {
    enabled: true,
    maxGroupSize: Math.min(3, settings.playerCount - 1),
    durationMinutes: 5,
  };
  const cardTradingEnabled = rules?.cardTrading?.enabled ?? true;

  function updateSettings<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    if (key === "playerCount") {
      setShowPlayerCountWarning(true);
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
    updateRules({ privateChat: { ...privateChat, ...partial } });
  }

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || settings.tags.includes(tag)) return;
    updateSettings("tags", [...settings.tags, tag]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    updateSettings("tags", settings.tags.filter((item) => item !== tag));
  }

  /**
   * 표지 이미지를 업로드하고 내부 에셋 URL을 설정값에 연결한다.
   * 라이브러리 썸네일은 이 URL을 그대로 사용한다.
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
  const totalMin = roundTotalMin * rules.roundCount;
  const playerCountMismatch = characterCount > 0 && characterCount !== settings.playerCount;

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-xl font-bold text-dark-50">기본 설정</h2>
        <p className="text-sm text-dark-500 mt-1">시나리오 제목, 태그, 난이도, 게임 규칙을 수정합니다.</p>
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
          placeholder="라이브러리 목록에서 보일 한두 문장 소개를 적으세요."
          maxLength={220}
          className={`w-full ${inputClass} resize-none`}
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-xs text-dark-500">스포일러 없이 분위기, 배경, 톤을 짧게 설명하는 소개글입니다.</p>
          <span className="shrink-0 text-[11px] text-dark-600">{(settings.summary ?? "").length}/220</span>
        </div>
      </div>

      <div className="rounded-xl border border-dark-800 bg-dark-900/50 p-5 space-y-4">
        <ImageAssetField
          title="표지 이미지"
          description="라이브러리 카드 썸네일에 표시됩니다. 업로드 후 아래에서 보이는 위치를 조정할 수 있습니다."
          value={settings.coverImageUrl}
          alt={game.title || "시나리오 표지 미리보기"}
          profile="cover"
          onChange={(nextValue) => updateSettings("coverImageUrl", nextValue)}
          onUpload={handleCoverUpload}
          uploading={uploadingCover}
          uploadLabel="표지 업로드"
          emptyStateLabel="아직 연결된 표지 이미지가 없습니다."
        />

        {settings.coverImageUrl ? (
          <div className="rounded-xl border border-dark-800 bg-dark-950/40 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-dark-200">표지 보이는 위치</p>
                <p className="mt-1 text-xs text-dark-500">라이브러리 카드에서 잘리는 위치를 미세 조정합니다.</p>
              </div>
              <button
                type="button"
                onClick={() => updateSettings("coverImagePosition", { x: 50, y: 50 })}
                className="rounded-lg border border-dark-700 px-3 py-2 text-xs text-dark-300 transition-colors hover:border-dark-500 hover:text-dark-100"
              >
                가운데로 초기화
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <label className="block space-y-2">
                  <div className="flex items-center justify-between gap-3 text-xs text-dark-400">
                    <span>좌우 위치</span>
                    <span>{settings.coverImagePosition?.x ?? 50}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={settings.coverImagePosition?.x ?? 50}
                    onChange={(event) => updateSettings("coverImagePosition", {
                      x: Number(event.target.value),
                      y: settings.coverImagePosition?.y ?? 50,
                    })}
                    className="w-full accent-mystery-500"
                  />
                </label>

                <label className="block space-y-2">
                  <div className="flex items-center justify-between gap-3 text-xs text-dark-400">
                    <span>상하 위치</span>
                    <span>{settings.coverImagePosition?.y ?? 50}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={settings.coverImagePosition?.y ?? 50}
                    onChange={(event) => updateSettings("coverImagePosition", {
                      x: settings.coverImagePosition?.x ?? 50,
                      y: Number(event.target.value),
                    })}
                    className="w-full accent-mystery-500"
                  />
                </label>
              </div>

              <div className="overflow-hidden rounded-xl border border-dark-700 bg-dark-950/60">
                <div className="relative aspect-[16/10]">
                  <img
                    src={settings.coverImageUrl}
                    alt={game.title || "표지 위치 미리보기"}
                    className="h-full w-full object-cover"
                    style={{
                      objectPosition: `${settings.coverImagePosition?.x ?? 50}% ${settings.coverImagePosition?.y ?? 50}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div data-maker-anchor="step-1-tags">
        <label className="block text-sm font-medium text-dark-200 mb-3">태그</label>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {settings.tags.length === 0 && (
              <span className="text-xs text-dark-600">아직 추가된 태그가 없습니다.</span>
            )}
            {settings.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => removeTag(tag)}
                className="rounded-full border border-mystery-700 bg-mystery-950/30 px-3 py-1 text-xs font-medium text-mystery-200 hover:bg-mystery-950/50 transition-colors"
              >
                #{tag} ×
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              placeholder="직접 태그 입력 후 Enter"
              className={`flex-1 ${inputClass}`}
            />
            <button
              type="button"
              onClick={() => addTag(tagInput)}
              className="rounded-lg border border-dark-600 bg-dark-800 px-4 py-2 text-sm text-dark-200 hover:bg-dark-700 transition-colors"
            >
              추가
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {TAG_SUGGESTIONS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                className="rounded-full border border-dark-700 bg-dark-800/60 px-3 py-1 text-xs text-dark-300 hover:border-dark-500 hover:text-dark-100 transition-colors"
              >
                + #{tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div data-maker-anchor="step-1-player-count">
          <label className="block text-sm font-medium text-dark-200 mb-3">플레이어 수</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => updateSettings("playerCount", Math.max(4, settings.playerCount - 1))}
              className="w-9 h-9 rounded-lg border border-dark-600 bg-dark-800 text-dark-200 hover:bg-dark-700 flex items-center justify-center text-lg font-bold transition-colors"
            >
              −
            </button>
            <span className="flex-1 text-center text-xl font-bold text-dark-50">
              {settings.playerCount}
              <span className="text-sm font-normal text-dark-400 ml-1">명</span>
            </span>
            <button
              type="button"
              onClick={() => updateSettings("playerCount", Math.min(8, settings.playerCount + 1))}
              className="w-9 h-9 rounded-lg border border-dark-600 bg-dark-800 text-dark-200 hover:bg-dark-700 flex items-center justify-center text-lg font-bold transition-colors"
            >
              +
            </button>
          </div>
          <p className="text-xs text-dark-500 text-center mt-2">4 ~ 8명 (피해자 제외)</p>

          {characterCount > 0 && (
            <div
              className={`mt-2 px-3 py-2 rounded-lg text-xs ${
                playerCountMismatch
                  ? "bg-yellow-950/30 border border-yellow-800 text-yellow-400"
                  : "bg-dark-800 border border-dark-700 text-dark-500"
              }`}
            >
              {playerCountMismatch ? (
                <>
                  현재 {characterCount}명의 캐릭터가 등록되어 있습니다. 플레이어 탭에서 캐릭터 수를 맞춰주세요.
                </>
              ) : (
                <>등록된 캐릭터 {characterCount}명과 일치합니다.</>
              )}
            </div>
          )}

          {showPlayerCountWarning && (
            <div className="mt-2 px-3 py-2 rounded-lg text-xs bg-orange-950/20 border border-orange-900 text-orange-400">
              플레이어 수 변경은 캐릭터 목록에 영향을 주지 않습니다. &apos;플레이어&apos; 탭에서 직접 캐릭터를 추가/삭제하세요.
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-dark-200 mb-3">난이도</label>
          <div className="space-y-2">
            {DIFFICULTIES.map((difficulty) => (
              <button
                key={difficulty.value}
                type="button"
                onClick={() => updateSettings("difficulty", difficulty.value)}
                className={[
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-all",
                  settings.difficulty === difficulty.value
                    ? "border-mystery-600 bg-mystery-950/50 text-mystery-200"
                    : "border-dark-700 bg-dark-800/50 text-dark-400 hover:border-dark-500",
                ].join(" ")}
              >
                <span className="font-medium">{difficulty.label}</span>
                <span className="text-xs text-dark-500">{difficulty.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-dark-200 mb-2">예상 소요 시간 (분)</label>
        <div className="flex items-center gap-4 max-w-xs">
          <input
            type="range"
            min={30}
            max={300}
            step={15}
            value={settings.estimatedDuration}
            onChange={(e) => updateSettings("estimatedDuration", Number(e.target.value))}
            className="flex-1 accent-mystery-500"
          />
          <span className="text-dark-100 font-medium w-16 text-right">{settings.estimatedDuration}분</span>
        </div>
      </div>

      <div className="border-t border-dark-800 pt-8 space-y-6">
        <div>
          <h3 className="text-base font-semibold text-dark-100">게임 규칙</h3>
          <p className="text-xs text-dark-500 mt-1">라운드 구성, 시간, 카드 규칙을 조정합니다.</p>
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
              <p className="font-medium text-dark-200 mb-2">라운드 타임라인 요약</p>
              {rules.phases.map((phase) => (
                <div key={phase.type} className="flex justify-between">
                  <span>{phase.label}</span>
                  <span className="text-dark-300">{phase.durationMinutes}분</span>
                </div>
              ))}
              <div className="border-t border-dark-700 pt-1 mt-1 flex justify-between font-medium text-dark-200">
                <span>1라운드 합계</span>
                <span>{roundTotalMin}분</span>
              </div>
              <div className="flex justify-between text-mystery-400 font-semibold">
                <span>전체 ({rules.roundCount}라운드)</span>
                <span>≈ {totalMin}분</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-dark-400 mb-3">페이즈별 시간 설정</label>
          <div className="space-y-2">
            {rules.phases.map((phase, idx) => (
              <div key={phase.type} className="flex items-center gap-3 bg-dark-800/50 border border-dark-700 rounded-lg px-4 py-3">
                <span className="text-sm font-medium text-dark-200 w-20">{PHASE_LABELS[phase.type]}</span>
                <input
                  type="range"
                  min={3}
                  max={60}
                  step={1}
                  value={phase.durationMinutes}
                  onChange={(e) => updatePhase(idx, { durationMinutes: Number(e.target.value) })}
                  className="flex-1 accent-mystery-500"
                />
                <span className="text-dark-300 text-sm w-12 text-right">{phase.durationMinutes}분</span>
              </div>
            ))}
          </div>
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
                onClick={() => updatePrivateChat({ enabled: !privateChat.enabled })}
                className={["relative w-11 h-6 rounded-full transition-colors", privateChat.enabled ? "bg-mystery-600" : "bg-dark-600"].join(" ")}
              >
                <span
                  className={[
                    "absolute left-0 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
                    privateChat.enabled ? "translate-x-6" : "translate-x-1",
                  ].join(" ")}
                />
              </button>
            </div>

            {privateChat.enabled && (
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
                      onClick={() => updatePrivateChat({ maxGroupSize: Math.min(settings.playerCount - 1, privateChat.maxGroupSize + 1) })}
                      className="w-7 h-7 rounded border border-dark-600 bg-dark-700 text-dark-200 hover:bg-dark-600 flex items-center justify-center text-sm font-bold transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-dark-400">밀담 가능 시간</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={1}
                      max={15}
                      step={1}
                      value={privateChat.durationMinutes}
                      onChange={(e) => updatePrivateChat({ durationMinutes: Number(e.target.value) })}
                      className="w-24 accent-mystery-500"
                    />
                    <span className="text-dark-300 text-xs w-8 text-right">{privateChat.durationMinutes}분</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-200">카드 주고받기</p>
                <p className="text-xs text-dark-500 mt-0.5">플레이어 간 단서 카드 이전 허용</p>
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
