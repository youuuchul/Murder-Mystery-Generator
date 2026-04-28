"use client";

import { useEffect, useState } from "react";
import ImageAssetField from "./ImageAssetField";
import type {
  Location,
  RoundScript,
  ScriptSegment,
  Scripts,
} from "@/types/game";

interface ScriptEditorProps {
  gameId: string;
  scripts: Scripts;
  rounds: number;
  locations: Location[];
  onChange: (scripts: Scripts) => void;
  focusTarget?: string | null;
  focusToken?: number;
}

type Tab = "lobby" | "rounds";
type EditorStatus = "empty" | "partial" | "complete";

interface SegmentGuidance {
  narrationPrompt: string;
}

const textareaClass =
  "w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-3 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition resize-none text-sm leading-relaxed";

const inputClass =
  "w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";

const SEGMENT_GUIDANCE: Record<"lobby" | "opening" | "ending" | "endingSuccess" | "endingFail", SegmentGuidance> = {
  lobby: {
    narrationPrompt: "참가자들이 준비를 마칠 때 공통 화면에 띄울 짧은 안내 문구를 적어주세요.",
  },
  opening: {
    narrationPrompt: "사건 발생 시점, 장소 분위기, 플레이어가 처음 받아야 할 인상을 중심으로 작성하세요.",
  },
  ending: {
    narrationPrompt: "결과 공개 직전 분위기를 정리하는 문장이나 사건을 닫는 공통 문장을 작성하세요.",
  },
  endingSuccess: {
    narrationPrompt: "범인이 특정된 이유와 사건이 정리되는 느낌을 중심으로 써주세요.",
  },
  endingFail: {
    narrationPrompt: "결정적 증거가 부족했던 이유와 범인이 빠져나간 뒤의 분위기를 써주세요.",
  },
};

/**
 * 공백만 있는 값도 비어 있는 것으로 본다.
 */
function hasContent(value?: string): boolean {
  return Boolean(value?.trim());
}

/**
 * 안내 텍스트 기준으로 세그먼트 작성 상태를 계산한다.
 */
function getSegmentStatus(segment: ScriptSegment): EditorStatus {
  return hasContent(segment.narration) ? "complete" : "empty";
}

/**
 * 라운드 스크립트 작성 상태를 라운드 이벤트 기준으로 계산한다.
 */
function getRoundStatus(round: RoundScript): EditorStatus {
  return hasContent(round.narration) ? "complete" : "empty";
}

/**
 * 탭 요약에 사용할 상태 배지 문구를 만든다.
 */
function statusLabel(status: EditorStatus): string {
  if (status === "complete") return "작성됨";
  if (status === "partial") return "작성 중";
  return "미작성";
}

/**
 * 상태에 따라 재사용하는 배지 색상을 정한다.
 */
function statusClassName(status: EditorStatus): string {
  if (status === "complete") {
    return "border-sage-700 bg-sage-900/25 text-sage-300";
  }
  if (status === "partial") {
    return "border-yellow-800 bg-yellow-950/20 text-yellow-300";
  }
  return "border-dark-700 bg-dark-900 text-dark-400";
}

function StatusBadge({ status }: { status: EditorStatus }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClassName(status)}`}>
      {statusLabel(status)}
    </span>
  );
}

function FieldHeader({
  label,
  filled,
  optional,
}: {
  label: string;
  filled: boolean;
  optional?: boolean;
}) {
  const status = filled ? "작성됨" : optional ? "비워 둠" : "미작성";
  const className = filled
    ? "border-sage-700 bg-sage-900/25 text-sage-300"
    : optional
      ? "border-dark-700 bg-dark-900 text-dark-500"
      : "border-yellow-800 bg-yellow-950/20 text-yellow-300";

  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <label className="block text-sm font-medium text-dark-200">{label}</label>
      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}>
        {status}
      </span>
    </div>
  );
}

function MediaLinkField({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value?: string;
  onChange: (nextValue?: string) => void;
  description?: string;
}) {
  return (
    <div>
      <FieldHeader label={label} filled={hasContent(value)} optional />
      <input
        type="url"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder="https://..."
        className={inputClass}
      />
      {description && <p className="mt-1 text-xs text-dark-600">{description}</p>}
    </div>
  );
}

function SegmentEditor({
  label,
  segment,
  guidance,
  onChange,
  textLabel,
  hideTextField = false,
}: {
  label: string;
  segment: ScriptSegment;
  guidance: SegmentGuidance;
  onChange: (segment: ScriptSegment) => void;
  textLabel?: string;
  hideTextField?: boolean;
}) {
  const status: EditorStatus = hideTextField ? "complete" : getSegmentStatus(segment);
  const hasNarration = hasContent(segment.narration);
  const hasMusic = hasContent(segment.backgroundMusic);
  const hasVideo = hasContent(segment.videoUrl);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-dark-700 bg-dark-900/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-dark-100">{label}</p>
          </div>
          <StatusBadge status={status} />
        </div>
      </div>

      {!hideTextField && (
        <div>
          <FieldHeader label={textLabel ?? `${label} 안내 텍스트`} filled={hasNarration} />
          <textarea
            rows={8}
            value={segment.narration}
            onChange={(e) => onChange({ ...segment, narration: e.target.value })}
            placeholder={guidance.narrationPrompt}
            className={textareaClass}
          />
          <p className="mt-1 text-xs text-dark-500">{segment.narration.length}자</p>
        </div>
      )}

      <div className="rounded-xl border border-dark-700 bg-dark-900/60 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-dark-100">미디어 링크</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className={`rounded-full border px-2 py-0.5 ${hasMusic ? "border-sage-700 bg-sage-900/25 text-sage-300" : "border-dark-700 bg-dark-900 text-dark-500"}`}>
              배경 음악 {hasMusic ? "연결됨" : "비워 둠"}
            </span>
            <span className={`rounded-full border px-2 py-0.5 ${hasVideo ? "border-sage-700 bg-sage-900/25 text-sage-300" : "border-dark-700 bg-dark-900 text-dark-500"}`}>
              영상 {hasVideo ? "연결됨" : "비워 둠"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MediaLinkField
            label="배경 음악 링크"
            value={segment.backgroundMusic}
            onChange={(nextValue) => onChange({ ...segment, backgroundMusic: nextValue })}
          />
          <MediaLinkField
            label="영상 링크"
            value={segment.videoUrl}
            onChange={(nextValue) => onChange({ ...segment, videoUrl: nextValue })}
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
  onUploadImage,
  uploadingImage,
}: {
  round: RoundScript;
  locations: Location[];
  onChange: (round: RoundScript) => void;
  onUploadImage: (file: File) => Promise<void>;
  uploadingImage: boolean;
}) {
  const [expanded, setExpanded] = useState(round.round === 1);
  const unlockedLocations = locations.filter((location) => location.unlocksAtRound === round.round);
  const status = getRoundStatus(round);
  const hasNarration = hasContent(round.narration);
  const hasMusic = hasContent(round.backgroundMusic);
  const hasVideo = hasContent(round.videoUrl);

  return (
    <div className="border border-dark-700 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center justify-between px-4 py-3 bg-dark-800/50 hover:bg-dark-800 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-medium text-dark-100">Round {round.round}</span>
          <StatusBadge status={status} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-dark-500">{round.narration ? `${round.narration.length}자` : "미작성"}</span>
          <span className="text-dark-500 text-sm">{expanded ? "접기" : "열기"}</span>
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          <div className="rounded-xl border border-dark-700 bg-dark-900/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-dark-100">Round {round.round}</p>
              <StatusBadge status={status} />
            </div>
          </div>

          <div>
            <FieldHeader label="라운드 이벤트" filled={hasNarration} />
            <textarea
              rows={4}
              value={round.narration}
              onChange={(e) => onChange({ ...round, narration: e.target.value })}
              placeholder={`Round ${round.round} 이벤트 텍스트`}
              className={textareaClass}
            />
          </div>

          <div className="rounded-xl border border-dark-700 bg-dark-900/60 p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-dark-300">이 라운드에서 열리는 장소</p>
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

          <ImageAssetField
            title="라운드 대표 이미지"
            description="GM 보드에 표시됩니다."
            value={round.imageUrl}
            alt={`Round ${round.round} 대표 이미지`}
            profile="round"
            onChange={(nextValue) => onChange({ ...round, imageUrl: nextValue })}
            onUpload={onUploadImage}
            uploading={uploadingImage}
            uploadLabel="이미지 업로드"
            emptyStateLabel="이미지 없음"
          />

          <div className="rounded-xl border border-dark-700 bg-dark-900/60 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-dark-100">미디어 링크</p>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className={`rounded-full border px-2 py-0.5 ${hasMusic ? "border-sage-700 bg-sage-900/25 text-sage-300" : "border-dark-700 bg-dark-900 text-dark-500"}`}>
                  배경 음악 {hasMusic ? "연결됨" : "비워 둠"}
                </span>
                <span className={`rounded-full border px-2 py-0.5 ${hasVideo ? "border-sage-700 bg-sage-900/25 text-sage-300" : "border-dark-700 bg-dark-900 text-dark-500"}`}>
                  영상 {hasVideo ? "연결됨" : "비워 둠"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MediaLinkField
                label="배경 음악 링크"
                value={round.backgroundMusic}
                onChange={(nextValue) => onChange({ ...round, backgroundMusic: nextValue })}
              />
              <MediaLinkField
                label="영상 링크"
                value={round.videoUrl}
                onChange={(nextValue) => onChange({ ...round, videoUrl: nextValue })}
              />
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

/**
 * 라운드 탭 배지에 쓸 전체 상태를 집계한다.
 */
function getRoundsTabStatus(rounds: RoundScript[]): EditorStatus {
  const completeCount = rounds.filter((round) => getRoundStatus(round) === "complete").length;

  if (completeCount === 0 && rounds.every((round) => getRoundStatus(round) === "empty")) {
    return "empty";
  }
  if (completeCount === rounds.length) {
    return "complete";
  }
  return "partial";
}

export default function ScriptEditor({
  gameId,
  scripts,
  rounds,
  locations,
  onChange,
  focusTarget,
  focusToken,
}: ScriptEditorProps) {
  const [activeTab, setActiveTab] = useState<Tab>("lobby");
  const [uploadingAssetTarget, setUploadingAssetTarget] = useState<string | null>(null);

  function ensureRounds(count: number): RoundScript[] {
    const existing = scripts.rounds;
    const normalized: RoundScript[] = [];

    for (let round = 1; round <= count; round += 1) {
      normalized.push(
        existing.find((item) => item.round === round) ?? {
          round,
          narration: "",
          unlockedLocationIds: [],
          imageUrl: undefined,
          videoUrl: undefined,
          backgroundMusic: undefined,
        }
      );
    }

    return normalized;
  }

  const roundCount = Math.max(rounds, scripts.rounds.length, 1);
  const normalizedRounds = ensureRounds(roundCount);
  const roundStatuses = normalizedRounds.map((round) => getRoundStatus(round));
  const tabs: { id: Tab; label: string; status: EditorStatus }[] = [
    { id: "lobby", label: "대기실", status: "complete" as EditorStatus },
    { id: "rounds", label: `라운드 (${roundCount}개)`, status: getRoundsTabStatus(normalizedRounds) },
  ];

  useEffect(() => {
    if (!focusTarget) {
      return;
    }

    if (focusTarget === "step-5-rounds") {
      setActiveTab("rounds");
    }
  }, [focusTarget, focusToken]);

  /** 라운드 대표 이미지를 업로드해 Step 5와 GM 보드에서 쓸 내부 URL로 바꾼다. */
  async function handleRoundImageUpload(roundId: number, file: File): Promise<void> {
    const target = `round:${roundId}`;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("scope", "rounds");

    setUploadingAssetTarget(target);
    try {
      const res = await fetch(`/api/games/${gameId}/assets`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error ?? "라운드 이미지 업로드 실패");
        return;
      }

      const nextRounds = normalizedRounds.map((round) => (
        round.round === roundId ? { ...round, imageUrl: data.url } : round
      ));
      onChange({ ...scripts, rounds: nextRounds });
    } catch (error) {
      console.error("라운드 이미지 업로드 실패:", error);
      alert("라운드 이미지 업로드 중 오류가 발생했습니다.");
    } finally {
      setUploadingAssetTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-dark-50">스크립트</h2>
      </div>

      <div className="flex gap-1 bg-dark-800 p-1 rounded-xl">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              activeTab === tab.id ? "bg-dark-600 text-dark-50 shadow-sm" : "text-dark-400 hover:text-dark-200",
            ].join(" ")}
          >
            <span className="flex flex-col items-center gap-1 sm:flex-row sm:justify-center">
              <span>{tab.label}</span>
              <StatusBadge status={tab.status} />
            </span>
          </button>
        ))}
      </div>

      {activeTab === "lobby" && (
        <SegmentEditor
          label="대기실"
          segment={scripts.lobby}
          guidance={SEGMENT_GUIDANCE.lobby}
          onChange={(lobby) => onChange({ ...scripts, lobby })}
          hideTextField
          textLabel="대기실 텍스트"
        />
      )}

      {activeTab === "rounds" && (
        <div data-maker-anchor="step-5-rounds" className="space-y-3">
          <div className="rounded-xl border border-dark-700 bg-dark-900/60 p-4 space-y-2">
            <p className="text-sm font-semibold text-dark-100">라운드 작성 현황</p>
            <p className="text-xs text-dark-500">
              {normalizedRounds.length}개 중 {roundStatuses.filter((status) => status !== "complete").length}개 미작성
            </p>
          </div>
          {normalizedRounds.map((round, idx) => (
            <RoundScriptForm
              key={round.round}
              round={round}
              locations={locations}
              onChange={(updatedRound) => {
                const nextRounds = normalizedRounds.map((item, roundIdx) => (roundIdx === idx ? updatedRound : item));
                onChange({ ...scripts, rounds: nextRounds });
              }}
              onUploadImage={(file) => handleRoundImageUpload(round.round, file)}
              uploadingImage={uploadingAssetTarget === `round:${round.round}`}
            />
          ))}
        </div>
      )}

    </div>
  );
}
