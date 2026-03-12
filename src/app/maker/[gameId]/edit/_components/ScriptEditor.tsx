"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import type { Scripts, ScriptSegment, RoundScript } from "@/types/game";

interface ScriptEditorProps {
  scripts: Scripts;
  rounds: number;
  onChange: (scripts: Scripts) => void;
  onSave: () => void;
  saving: boolean;
}

type Tab = "opening" | "rounds" | "ending";

const textareaClass =
  "w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-3 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition resize-none text-sm leading-relaxed";

const inputClass =
  "w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";

function SegmentEditor({
  label,
  segment,
  onChange,
}: {
  label: string;
  segment: ScriptSegment;
  onChange: (s: ScriptSegment) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-dark-200 mb-2">
          {label} 나레이션 *
        </label>
        <textarea
          rows={8}
          value={segment.narration}
          onChange={(e) => onChange({ ...segment, narration: e.target.value })}
          placeholder="GM이 읽어줄 나레이션 텍스트를 작성하세요."
          className={textareaClass}
        />
        <p className="text-xs text-dark-500 mt-1">
          {segment.narration.length}자
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-dark-400 mb-1">
            배경 음악 URL <span className="text-dark-600">(선택)</span>
          </label>
          <input
            type="url"
            value={segment.backgroundMusic ?? ""}
            onChange={(e) => onChange({ ...segment, backgroundMusic: e.target.value || undefined })}
            placeholder="https://..."
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-dark-400 mb-1">
            영상 URL <span className="text-dark-600">(선택)</span>
          </label>
          <input
            type="url"
            value={segment.videoUrl ?? ""}
            onChange={(e) => onChange({ ...segment, videoUrl: e.target.value || undefined })}
            placeholder="https://..."
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-dark-400 mb-1">
          GM 화면 메모 <span className="text-dark-600">(선택)</span>
        </label>
        <textarea
          rows={4}
          value={segment.gmNote ?? ""}
          onChange={(e) => onChange({ ...segment, gmNote: e.target.value || undefined })}
          placeholder="해당 페이즈에서 GM 메인 화면에 고정할 진행 메모"
          className={textareaClass}
        />
      </div>
    </div>
  );
}

function RoundScriptForm({
  round,
  onChange,
}: {
  round: RoundScript;
  onChange: (r: RoundScript) => void;
}) {
  const [expanded, setExpanded] = useState(round.round === 1);

  return (
    <div className="border border-dark-700 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-dark-800/50 hover:bg-dark-800 transition-colors text-left"
      >
        <span className="font-medium text-dark-100">Round {round.round}</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-dark-500">
            {round.narration ? `${round.narration.length}자` : "미작성"}
          </span>
          <span className="text-dark-500 text-sm">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1">라운드 나레이션</label>
            <textarea
              rows={4}
              value={round.narration}
              onChange={(e) => onChange({ ...round, narration: e.target.value })}
              placeholder={`Round ${round.round} 시작 시 GM이 읽어줄 내용`}
              className={textareaClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1">
              이 라운드에서 잠금 해제할 장소 ID <span className="text-dark-600">(쉼표 구분)</span>
            </label>
            <input
              type="text"
              value={round.unlockedLocationIds.join(", ")}
              onChange={(e) =>
                onChange({
                  ...round,
                  unlockedLocationIds: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="location-id-1, location-id-2"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">
                배경 음악 URL <span className="text-dark-600">(선택)</span>
              </label>
              <input
                type="url"
                value={round.backgroundMusic ?? ""}
                onChange={(e) => onChange({ ...round, backgroundMusic: e.target.value || undefined })}
                placeholder="https://..."
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">
                영상 URL <span className="text-dark-600">(선택)</span>
              </label>
              <input
                type="url"
                value={round.videoUrl ?? ""}
                onChange={(e) => onChange({ ...round, videoUrl: e.target.value || undefined })}
                placeholder="https://..."
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1">
              GM 화면 메모 <span className="text-dark-600">(선택)</span>
            </label>
            <textarea
              rows={4}
              value={round.gmNote ?? ""}
              onChange={(e) => onChange({ ...round, gmNote: e.target.value || undefined })}
              placeholder={`Round ${round.round}에서 GM 보드에 띄울 진행 메모`}
              className={textareaClass}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScriptEditor({
  scripts,
  rounds,
  onChange,
  onSave,
  saving,
}: ScriptEditorProps) {
  const [activeTab, setActiveTab] = useState<Tab>("opening");

  function ensureRounds(count: number): RoundScript[] {
    const existing = scripts.rounds;
    const result: RoundScript[] = [];
    for (let i = 1; i <= count; i++) {
      result.push(
        existing.find((r) => r.round === i) ?? {
          round: i,
          narration: "",
          unlockedLocationIds: [],
          videoUrl: undefined,
          backgroundMusic: undefined,
          gmNote: undefined,
        }
      );
    }
    return result;
  }

  const roundCount = Math.max(rounds, scripts.rounds.length, 3);
  const normalizedRounds = ensureRounds(roundCount);

  const tabs: { id: Tab; label: string }[] = [
    { id: "opening", label: "오프닝" },
    { id: "rounds", label: `라운드 (${roundCount}개)` },
    { id: "ending", label: "엔딩" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-dark-50">스크립트</h2>
        <p className="text-sm text-dark-500 mt-1">
          오프닝·라운드별·엔딩 나레이션을 작성합니다.
        </p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-dark-800 p-1 rounded-xl">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-dark-600 text-dark-50 shadow-sm"
                : "text-dark-400 hover:text-dark-200",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === "opening" && (
        <SegmentEditor
          label="오프닝"
          segment={scripts.opening}
          onChange={(opening) => onChange({ ...scripts, opening })}
        />
      )}

      {activeTab === "rounds" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-dark-500">라운드 수를 변경하려면 기본 설정에서 수정하세요.</p>
          </div>
          {normalizedRounds.map((round, idx) => (
            <RoundScriptForm
              key={round.round}
              round={round}
              onChange={(updated) => {
                const next = normalizedRounds.map((r, i) => (i === idx ? updated : r));
                onChange({ ...scripts, rounds: next });
              }}
            />
          ))}
        </div>
      )}

      {activeTab === "ending" && (
        <div className="space-y-8">
          <div className="border border-blue-800/50 rounded-xl p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-blue-300">🎉 범인 검거 성공 엔딩</p>
              <p className="text-xs text-dark-500 mt-0.5">다수가 범인을 지목해 검거에 성공했을 때 표시됩니다.</p>
            </div>
            <SegmentEditor
              label="검거 성공"
              segment={scripts.endingSuccess ?? { narration: "", videoUrl: undefined, backgroundMusic: undefined }}
              onChange={(endingSuccess) => onChange({ ...scripts, endingSuccess })}
            />
          </div>

          <div className="border border-red-800/50 rounded-xl p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-red-300">💀 범인 도주 성공 엔딩</p>
              <p className="text-xs text-dark-500 mt-0.5">범인이 특정되지 않거나 다수가 틀렸을 때 표시됩니다.</p>
            </div>
            <SegmentEditor
              label="도주 성공"
              segment={scripts.endingFail ?? { narration: "", videoUrl: undefined, backgroundMusic: undefined }}
              onChange={(endingFail) => onChange({ ...scripts, endingFail })}
            />
          </div>

          {/* 공통 엔딩 (선택) */}
          <details className="border border-dark-700 rounded-xl overflow-hidden">
            <summary className="px-4 py-3 text-sm text-dark-400 cursor-pointer hover:text-dark-200 bg-dark-800/40">
              공통 엔딩 나레이션 (선택 — 양쪽 엔딩 전에 공통으로 표시)
            </summary>
            <div className="p-4">
              <SegmentEditor
                label="공통 엔딩"
                segment={scripts.ending}
                onChange={(ending) => onChange({ ...scripts, ending })}
              />
            </div>
          </details>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={onSave} loading={saving} variant="secondary">
          저장
        </Button>
      </div>
    </div>
  );
}
