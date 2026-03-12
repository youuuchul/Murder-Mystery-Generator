"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import type { Location, RoundScript, ScriptSegment, Scripts } from "@/types/game";

interface ScriptEditorProps {
  scripts: Scripts;
  rounds: number;
  locations: Location[];
  onChange: (scripts: Scripts) => void;
  onSave: () => void;
  saving: boolean;
}

type Tab = "lobby" | "opening" | "rounds" | "vote" | "ending";

const textareaClass =
  "w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-3 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition resize-none text-sm leading-relaxed";

const inputClass =
  "w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";

function SegmentEditor({
  label,
  phaseLabel,
  segment,
  onChange,
}: {
  label: string;
  phaseLabel: string;
  segment: ScriptSegment;
  onChange: (segment: ScriptSegment) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-dark-200 mb-2">{label} 나레이션</label>
        <textarea
          rows={8}
          value={segment.narration}
          onChange={(e) => onChange({ ...segment, narration: e.target.value })}
          placeholder={`${label}에서 GM이 읽어줄 나레이션을 작성하세요.`}
          className={textareaClass}
        />
        <p className="text-xs text-dark-500 mt-1">{segment.narration.length}자</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-dark-400 mb-1">
          {phaseLabel} 진행 가이드 <span className="text-dark-600">(GM 화면 동기화)</span>
        </label>
        <textarea
          rows={5}
          value={segment.gmNote ?? ""}
          onChange={(e) => onChange({ ...segment, gmNote: e.target.value || undefined })}
          placeholder={`이 페이즈에서 GM이 확인할 진행 순서나 주의사항을 직접 작성하세요.\n예) 1. 전원 입장 확인\n2. 참가 코드 재안내\n3. 다음 단계로 이동`}
          className={textareaClass}
        />
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
    </div>
  );
}

function RoundScriptForm({
  round,
  locations,
  onChange,
}: {
  round: RoundScript;
  locations: Location[];
  onChange: (round: RoundScript) => void;
}) {
  const [expanded, setExpanded] = useState(round.round === 1);
  const unlockedLocations = locations.filter((location) => location.unlocksAtRound === round.round);

  return (
    <div className="border border-dark-700 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center justify-between px-4 py-3 bg-dark-800/50 hover:bg-dark-800 transition-colors text-left"
      >
        <span className="font-medium text-dark-100">Round {round.round}</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-dark-500">{round.narration ? `${round.narration.length}자` : "미작성"}</span>
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

          <div className="rounded-xl border border-dark-700 bg-dark-900/60 p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-dark-300">이 라운드에서 열리는 장소</p>
              <span className="text-[11px] text-dark-500">장소 탭 기준 자동 반영</span>
            </div>
            {unlockedLocations.length === 0 ? (
              <p className="text-sm text-dark-600">장소 탭에서 이 라운드에 열리는 장소를 지정하지 않았습니다.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {unlockedLocations.map((location) => (
                  <span
                    key={location.id}
                    className="rounded-full border border-dark-700 bg-dark-800 px-3 py-1 text-xs text-dark-200"
                  >
                    {location.name || "이름 없는 장소"}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1">
              Round {round.round} 진행 가이드 <span className="text-dark-600">(GM 화면 동기화)</span>
            </label>
            <textarea
              rows={4}
              value={round.gmNote ?? ""}
              onChange={(e) => onChange({ ...round, gmNote: e.target.value || undefined })}
              placeholder={`Round ${round.round}에서 GM이 확인할 진행 순서와 유의사항을 작성하세요.`}
              className={textareaClass}
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
        </div>
      )}
    </div>
  );
}

export default function ScriptEditor({
  scripts,
  rounds,
  locations,
  onChange,
  onSave,
  saving,
}: ScriptEditorProps) {
  const [activeTab, setActiveTab] = useState<Tab>("lobby");

  function ensureRounds(count: number): RoundScript[] {
    const existing = scripts.rounds;
    const normalized: RoundScript[] = [];

    for (let round = 1; round <= count; round += 1) {
      normalized.push(
        existing.find((item) => item.round === round) ?? {
          round,
          narration: "",
          unlockedLocationIds: [],
          videoUrl: undefined,
          backgroundMusic: undefined,
          gmNote: undefined,
        }
      );
    }

    return normalized;
  }

  const roundCount = Math.max(rounds, scripts.rounds.length, 1);
  const normalizedRounds = ensureRounds(roundCount);
  const tabs: { id: Tab; label: string }[] = [
    { id: "lobby", label: "대기실" },
    { id: "opening", label: "오프닝" },
    { id: "rounds", label: `라운드 (${roundCount}개)` },
    { id: "vote", label: "투표" },
    { id: "ending", label: "엔딩" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-dark-50">스크립트</h2>
        <p className="text-sm text-dark-500 mt-1">
          각 페이즈의 나레이션, GM 진행 가이드, 영상, 배경음악을 작성합니다.
        </p>
      </div>

      <div className="flex gap-1 bg-dark-800 p-1 rounded-xl">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors",
              activeTab === tab.id ? "bg-dark-600 text-dark-50 shadow-sm" : "text-dark-400 hover:text-dark-200",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "lobby" && (
        <SegmentEditor
          label="대기실"
          phaseLabel="대기실"
          segment={scripts.lobby}
          onChange={(lobby) => onChange({ ...scripts, lobby })}
        />
      )}

      {activeTab === "opening" && (
        <SegmentEditor
          label="오프닝"
          phaseLabel="오프닝"
          segment={scripts.opening}
          onChange={(opening) => onChange({ ...scripts, opening })}
        />
      )}

      {activeTab === "rounds" && (
        <div className="space-y-3">
          <p className="text-xs text-dark-500">라운드 수를 변경하려면 기본 설정에서 수정하세요.</p>
          {normalizedRounds.map((round, idx) => (
            <RoundScriptForm
              key={round.round}
              round={round}
              locations={locations}
              onChange={(updatedRound) => {
                const nextRounds = normalizedRounds.map((item, roundIdx) => (roundIdx === idx ? updatedRound : item));
                onChange({ ...scripts, rounds: nextRounds });
              }}
            />
          ))}
        </div>
      )}

      {activeTab === "vote" && (
        <SegmentEditor
          label="투표"
          phaseLabel="투표"
          segment={scripts.vote}
          onChange={(vote) => onChange({ ...scripts, vote })}
        />
      )}

      {activeTab === "ending" && (
        <div className="space-y-8">
          <SegmentEditor
            label="공통 엔딩"
            phaseLabel="엔딩 공통"
            segment={scripts.ending}
            onChange={(ending) => onChange({ ...scripts, ending })}
          />

          <div className="border border-blue-800/50 rounded-xl p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-blue-300">범인 검거 성공 엔딩</p>
              <p className="text-xs text-dark-500 mt-0.5">다수가 범인을 지목해 검거에 성공했을 때 사용됩니다.</p>
            </div>
            <SegmentEditor
              label="검거 성공"
              phaseLabel="검거 성공"
              segment={scripts.endingSuccess ?? { narration: "", videoUrl: undefined, backgroundMusic: undefined }}
              onChange={(endingSuccess) => onChange({ ...scripts, endingSuccess })}
            />
          </div>

          <div className="border border-red-800/50 rounded-xl p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-red-300">범인 도주 성공 엔딩</p>
              <p className="text-xs text-dark-500 mt-0.5">범인이 특정되지 않거나 다수가 틀렸을 때 사용됩니다.</p>
            </div>
            <SegmentEditor
              label="도주 성공"
              phaseLabel="도주 성공"
              segment={scripts.endingFail ?? { narration: "", videoUrl: undefined, backgroundMusic: undefined }}
              onChange={(endingFail) => onChange({ ...scripts, endingFail })}
            />
          </div>
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
