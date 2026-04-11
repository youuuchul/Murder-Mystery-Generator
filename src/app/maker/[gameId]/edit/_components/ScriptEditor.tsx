"use client";

import { useEffect, useState } from "react";
import ImageAssetField from "./ImageAssetField";
import type {
  Location,
  Player,
  RoundScript,
  ScriptSegment,
  Scripts,
  StoryNpc,
  VoteQuestion,
  VoteQuestionChoice,
  VoteTargetMode,
} from "@/types/game";

interface ScriptEditorProps {
  gameId: string;
  scripts: Scripts;
  rounds: number;
  locations: Location[];
  players: Player[];
  npcs: StoryNpc[];
  advancedVotingEnabled: boolean;
  voteQuestions: VoteQuestion[];
  onChangeAdvancedVoting: (enabled: boolean) => void;
  onChangeVoteQuestions: (questions: VoteQuestion[]) => void;
  onChange: (scripts: Scripts) => void;
  focusTarget?: string | null;
  focusToken?: number;
}

type Tab = "lobby" | "rounds" | "vote";
type EditorStatus = "empty" | "partial" | "complete";

interface SegmentGuidance {
  intro: string;
  narrationPrompt: string;
  narrationExample: string;
  guideExample: string;
}

const textareaClass =
  "w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-3 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition resize-none text-sm leading-relaxed";

const inputClass =
  "w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";

const SEGMENT_GUIDANCE: Record<"lobby" | "opening" | "vote" | "ending" | "endingSuccess" | "endingFail", SegmentGuidance> = {
  lobby: {
    intro: "대기실은 입장 확인과 시작 직전 안내에 집중하면 됩니다.",
    narrationPrompt: "참가자들이 준비를 마칠 때 GM이 읽어 줄 짧은 안내 문구를 적어주세요.",
    narrationExample: "모든 참가자 입장을 확인합니다.\n캐릭터 선택과 이름 입력이 끝나면 곧 오프닝을 시작합니다.",
    guideExample: "1. 접속 완료 인원 확인\n2. 세션 코드 재안내\n3. 준비가 끝나면 오프닝으로 이동",
  },
  opening: {
    intro: "오프닝은 사건 분위기와 현재 상황을 한 번에 잡아주는 구간입니다.",
    narrationPrompt: "사건 발생 시점, 장소 분위기, 플레이어가 처음 받아야 할 인상을 중심으로 작성하세요.",
    narrationExample: "밤이 깊어질 무렵, 저택의 거실에 모두가 다시 모였습니다.\n잠시 후 한 비명이 울리고, 평온하던 저녁은 사건의 시작으로 바뀝니다.",
    guideExample: "1. 오프닝 영상 또는 음악 재생\n2. 사건 설명 낭독\n3. 피해자 정보와 첫 행동 규칙 안내",
  },
  vote: {
    intro: "투표 구간은 규칙을 짧고 분명하게 다시 알려주는 편이 좋습니다.",
    narrationPrompt: "누구에게 어떻게 투표하는지, 언제 결과가 공개되는지를 간결하게 적어주세요.",
    narrationExample: "이제 각자 범인이라고 생각하는 인물 한 명에게 투표합니다.\n자기 자신은 선택할 수 없으며, 모두가 완료하면 결과가 공개됩니다.",
    guideExample: "1. 투표 규칙 재안내\n2. 전원 제출 여부 확인\n3. 필요 시 강제 공개 버튼 사용",
  },
  ending: {
    intro: "공통 엔딩은 결과와 무관하게 모든 플레이어가 같이 듣는 마무리 문장입니다.",
    narrationPrompt: "결과 공개 직전 분위기를 정리하는 문장이나 사건을 닫는 공통 문장을 작성하세요.",
    narrationExample: "모든 선택이 끝났습니다.\n이제 사건의 결말과 각자의 선택이 어떤 결과를 만들었는지 확인합니다.",
    guideExample: "1. 결과 공개 전 주목 유도\n2. 공통 엔딩 낭독\n3. 이후 성공/실패 분기 엔딩으로 연결",
  },
  endingSuccess: {
    intro: "검거 성공 엔딩은 단서가 어떻게 맞물렸는지 보여주는 구간입니다.",
    narrationPrompt: "범인이 특정된 이유와 사건이 정리되는 느낌을 중심으로 써주세요.",
    narrationExample: "흩어져 있던 단서들이 하나로 이어지며 범인의 동선이 드러났습니다.\n마침내 방 안의 침묵은 진실을 인정하는 순간으로 바뀝니다.",
    guideExample: "1. 핵심 단서 연결 요약\n2. 범인 검거 결과 설명\n3. 플레이어 승점 정리로 연결",
  },
  endingFail: {
    intro: "도주 성공 엔딩은 왜 수사가 실패했는지와 남는 여운을 정리하는 편이 좋습니다.",
    narrationPrompt: "결정적 증거가 부족했던 이유와 범인이 빠져나간 뒤의 분위기를 써주세요.",
    narrationExample: "결정적인 한 조각이 끝내 맞춰지지 않았고, 범인은 혼란 속에서 흔적을 지웠습니다.\n남겨진 사람들은 늦게 도착한 진실의 조각만 바라보게 됩니다.",
    guideExample: "1. 실패 원인 또는 놓친 단서 언급\n2. 범인 도주 결과 설명\n3. 플레이어 승점 정리로 연결",
  },
};

/**
 * 공백만 있는 값도 비어 있는 것으로 본다.
 */
function hasContent(value?: string): boolean {
  return Boolean(value?.trim());
}

/**
 * 나레이션/가이드 기준으로 세그먼트 작성 상태를 계산한다.
 */
function getSegmentStatus(segment: ScriptSegment): EditorStatus {
  const filled = [segment.narration, segment.gmNote].filter(hasContent).length;

  if (filled === 0) return "empty";
  if (filled === 2) return "complete";
  return "partial";
}

/**
 * 라운드 스크립트의 핵심 필드 작성 상태를 계산한다.
 */
function getRoundStatus(round: RoundScript): EditorStatus {
  const filled = [round.narration, round.gmNote].filter(hasContent).length;

  if (filled === 0) return "empty";
  if (filled === 2) return "complete";
  return "partial";
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

function ExamplePanel({
  title,
  description,
  example,
}: {
  title: string;
  description: string;
  example: string;
}) {
  return (
    <div className="rounded-xl border border-dark-700 bg-dark-900/60 p-4 space-y-2">
      <p className="text-xs font-medium text-dark-300">{title}</p>
      <p className="text-xs text-dark-500">{description}</p>
      <p className="text-sm leading-relaxed text-dark-400 whitespace-pre-line">{example}</p>
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
  description: string;
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
      <p className="mt-1 text-xs text-dark-600">{description}</p>
    </div>
  );
}

function SegmentEditor({
  label,
  phaseLabel,
  segment,
  guidance,
  onChange,
  textLabel,
  textBadgeLabel = "나레이션",
  hideTextField = false,
}: {
  label: string;
  phaseLabel: string;
  segment: ScriptSegment;
  guidance: SegmentGuidance;
  onChange: (segment: ScriptSegment) => void;
  textLabel?: string;
  textBadgeLabel?: string;
  hideTextField?: boolean;
}) {
  const status = getSegmentStatus(segment);
  const hasNarration = hasContent(segment.narration);
  const hasGuide = hasContent(segment.gmNote);
  const hasMusic = hasContent(segment.backgroundMusic);
  const hasVideo = hasContent(segment.videoUrl);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-dark-700 bg-dark-900/60 p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-dark-100">{label} 작성 가이드</p>
            <p className="mt-1 text-xs text-dark-500">{guidance.intro}</p>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className={`rounded-full border px-2 py-0.5 ${hasNarration ? "border-sage-700 bg-sage-900/25 text-sage-300" : "border-dark-700 bg-dark-900 text-dark-500"}`}>
            {textBadgeLabel} {hasNarration ? "작성됨" : "미작성"}
          </span>
          <span className={`rounded-full border px-2 py-0.5 ${hasGuide ? "border-sage-700 bg-sage-900/25 text-sage-300" : "border-dark-700 bg-dark-900 text-dark-500"}`}>
            진행 가이드 {hasGuide ? "작성됨" : "미작성"}
          </span>
          <span className={`rounded-full border px-2 py-0.5 ${hasMusic ? "border-sage-700 bg-sage-900/25 text-sage-300" : "border-dark-700 bg-dark-900 text-dark-500"}`}>
            배경 음악 {hasMusic ? "연결됨" : "비워 둠"}
          </span>
          <span className={`rounded-full border px-2 py-0.5 ${hasVideo ? "border-sage-700 bg-sage-900/25 text-sage-300" : "border-dark-700 bg-dark-900 text-dark-500"}`}>
            영상 {hasVideo ? "연결됨" : "비워 둠"}
          </span>
        </div>
      </div>

      {!hideTextField && (
        <div>
          <FieldHeader label={textLabel ?? `${label} 나레이션`} filled={hasNarration} />
          <textarea
            rows={8}
            value={segment.narration}
            onChange={(e) => onChange({ ...segment, narration: e.target.value })}
            placeholder={guidance.narrationPrompt}
            className={textareaClass}
          />
          <p className="mt-1 text-xs text-dark-500">{segment.narration.length}자</p>
          {!hasNarration && (
            <div className="mt-3">
              <ExamplePanel
                title={`예시 ${textBadgeLabel}`}
                description="아직 비어 있다면 아래 흐름을 참고해서 문장을 시작하면 됩니다."
                example={guidance.narrationExample}
              />
            </div>
          )}
        </div>
      )}

      <div>
        <FieldHeader label={`${phaseLabel} 진행 가이드`} filled={hasGuide} />
        <textarea
          rows={5}
          value={segment.gmNote ?? ""}
          onChange={(e) => onChange({ ...segment, gmNote: e.target.value || undefined })}
          placeholder="GM이 실제로 확인할 진행 순서, 주의사항, 다음 전환 조건을 적어주세요."
          className={textareaClass}
        />
        {!hasGuide && (
          <div className="mt-3">
            <ExamplePanel
              title="예시 진행 가이드"
              description="GM 화면에 그대로 보이므로 체크리스트처럼 짧게 쓰는 편이 읽기 쉽습니다."
              example={guidance.guideExample}
            />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-dark-700 bg-dark-900/60 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-dark-100">미디어 링크</p>
            <p className="mt-1 text-xs text-dark-500">영상과 배경 음악은 URL만 연결합니다.</p>
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
            description="비워 두면 이 페이즈에서는 배경 음악 패널이 숨겨집니다."
          />
          <MediaLinkField
            label="영상 링크"
            value={segment.videoUrl}
            onChange={(nextValue) => onChange({ ...segment, videoUrl: nextValue })}
            description="YouTube, Vimeo, mp4 링크를 그대로 넣으면 GM 보드에 반영됩니다."
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
  const hasGuide = hasContent(round.gmNote);
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
          <div className="rounded-xl border border-dark-700 bg-dark-900/60 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-dark-100">Round {round.round} 작성 메모</p>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className={`rounded-full border px-2 py-0.5 ${hasNarration ? "border-sage-700 bg-sage-900/25 text-sage-300" : "border-dark-700 bg-dark-900 text-dark-500"}`}>
                  라운드 이벤트 {hasNarration ? "작성됨" : "미작성"}
                </span>
                <span className={`rounded-full border px-2 py-0.5 ${hasGuide ? "border-sage-700 bg-sage-900/25 text-sage-300" : "border-dark-700 bg-dark-900 text-dark-500"}`}>
                  진행 가이드 {hasGuide ? "작성됨" : "미작성"}
                </span>
              </div>
            </div>
            <p className="text-xs text-dark-500">
              각 라운드는 시작 멘트, 열린 장소 안내, 종료 직전 공지 순서로 적으면 읽기 편합니다.
            </p>
          </div>

          <div>
            <FieldHeader label="라운드 이벤트" filled={hasNarration} />
            <textarea
              rows={4}
              value={round.narration}
              onChange={(e) => onChange({ ...round, narration: e.target.value })}
              placeholder={`Round ${round.round}에서 플레이어에게 바로 보여줄 이벤트 텍스트를 적어주세요.`}
              className={textareaClass}
            />
            {!hasNarration && (
              <div className="mt-3">
                <ExamplePanel
                  title={`Round ${round.round} 라운드 이벤트 예시`}
                  description="새로 열린 장소와 이번 라운드의 행동 목표를 먼저 알려주면 흐름이 깔끔합니다."
                  example={`조사 시간이 다시 시작됩니다.\n이번 라운드에 새로 열린 공간을 확인하고 제한 시간 안에 단서를 확보해 주세요.`}
                />
              </div>
            )}
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
            <FieldHeader label={`Round ${round.round} 진행 가이드`} filled={hasGuide} />
            <textarea
              rows={4}
              value={round.gmNote ?? ""}
              onChange={(e) => onChange({ ...round, gmNote: e.target.value || undefined })}
              placeholder={`Round ${round.round}에서 GM이 확인할 진행 순서와 종료 기준을 적어주세요.`}
              className={textareaClass}
            />
            {!hasGuide && (
              <div className="mt-3">
                <ExamplePanel
                  title={`Round ${round.round} 진행 가이드 예시`}
                  description="GM 전용 체크리스트처럼 짧게 적어 두면 실제 세션에서 읽기가 빠릅니다."
                  example={`1. 라운드 시작 선언\n2. 열린 장소 확인\n3. 종료 3분 전 공지\n4. 타이머 종료 후 다음 단계 준비`}
                />
              </div>
            )}
          </div>

          <ImageAssetField
            title="라운드 대표 이미지"
            description="라운드 시작 시 GM 보드에 보일 대표 이미지입니다. 없으면 공통 이미지를 사용합니다."
            value={round.imageUrl}
            alt={`Round ${round.round} 대표 이미지`}
            profile="round"
            onChange={(nextValue) => onChange({ ...round, imageUrl: nextValue })}
            onUpload={onUploadImage}
            uploading={uploadingImage}
            uploadLabel="이미지 업로드"
            emptyStateLabel="아직 연결된 라운드 대표 이미지가 없습니다."
          />

          <div className="rounded-xl border border-dark-700 bg-dark-900/60 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-dark-100">미디어 링크</p>
                <p className="mt-1 text-xs text-dark-500">영상과 배경 음악은 URL만 연결합니다.</p>
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
                description="비워 두면 이 라운드에서는 배경 음악 패널이 숨겨집니다."
              />
              <MediaLinkField
                label="영상 링크"
                value={round.videoUrl}
                onChange={(nextValue) => onChange({ ...round, videoUrl: nextValue })}
                description="YouTube, Vimeo, mp4 링크를 그대로 넣으면 GM 보드에 반영됩니다."
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

const TARGET_MODE_LABELS: Record<VoteTargetMode, string> = {
  "players-only": "플레이어만",
  "players-and-npcs": "플레이어 + NPC",
  "custom-choices": "커스텀 선택지",
};

function createVoteQuestion(voteRound: number): VoteQuestion {
  return {
    id: crypto.randomUUID(),
    voteRound,
    label: "",
    targetMode: "players-only",
    isPrimary: false,
    sortOrder: 0,
    choices: [],
  };
}

function createVoteChoice(): VoteQuestionChoice {
  return { id: crypto.randomUUID(), label: "" };
}

function VoteSettingsPanel({
  enabled,
  questions,
  players,
  npcs,
  onToggle,
  onChangeQuestions,
}: {
  enabled: boolean;
  questions: VoteQuestion[];
  players: Player[];
  npcs: StoryNpc[];
  onToggle: (v: boolean) => void;
  onChangeQuestions: (q: VoteQuestion[]) => void;
}) {
  const round1Questions = questions.filter((q) => q.voteRound === 1);
  const round2Questions = questions.filter((q) => q.voteRound === 2);

  function addQuestion(voteRound: number) {
    onChangeQuestions([...questions, createVoteQuestion(voteRound)]);
  }

  function updateQuestion(id: string, patch: Partial<VoteQuestion>) {
    onChangeQuestions(questions.map((q) => q.id === id ? { ...q, ...patch } : q));
  }

  function deleteQuestion(id: string) {
    onChangeQuestions(questions.filter((q) => q.id !== id));
  }

  function updateChoices(questionId: string, choices: VoteQuestionChoice[]) {
    updateQuestion(questionId, { choices });
  }

  return (
    <section className="rounded-2xl border border-dark-800 bg-dark-900/55 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-dark-100">고급 투표 설정</p>
          <p className="mt-1 text-xs text-dark-500">
            다중 질문, NPC 투표 대상, 커스텀 선택지, 2차 투표 등 확장 투표 기능을 설정합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
            enabled ? "bg-mystery-600" : "bg-dark-700"
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-4" : ""
          }`} />
        </button>
      </div>

      {enabled && (
        <div className="space-y-5 pt-2">
          {/* 1차 투표 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-widest text-mystery-300/80">1차 투표 질문</p>
              <button
                type="button"
                onClick={() => addQuestion(1)}
                className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
              >
                + 질문 추가
              </button>
            </div>
            {round1Questions.length === 0 && (
              <p className="text-xs text-dark-600 text-center py-3 border border-dashed border-dark-700 rounded-xl">
                질문을 추가하면 기본 범인 투표 대신 사용됩니다.
              </p>
            )}
            {round1Questions.map((q) => (
              <VoteQuestionForm
                key={q.id}
                question={q}
                players={players}
                npcs={npcs}
                onChange={(patch) => updateQuestion(q.id, patch)}
                onDelete={() => deleteQuestion(q.id)}
                onChangeChoices={(c) => updateChoices(q.id, c)}
              />
            ))}
          </div>

          {/* 2차 투표 */}
          <div className="space-y-3 border-t border-dark-700 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-mystery-300/80">2차 투표 (선택)</p>
                <p className="text-xs text-dark-600 mt-0.5">1차 투표 결과 조건에 따라 추가 투표를 진행합니다.</p>
              </div>
              <button
                type="button"
                onClick={() => addQuestion(2)}
                className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
              >
                + 질문 추가
              </button>
            </div>
            {round2Questions.map((q) => (
              <VoteQuestionForm
                key={q.id}
                question={q}
                players={players}
                npcs={npcs}
                isSecondRound
                firstRoundQuestions={round1Questions}
                onChange={(patch) => updateQuestion(q.id, patch)}
                onDelete={() => deleteQuestion(q.id)}
                onChangeChoices={(c) => updateChoices(q.id, c)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function VoteQuestionForm({
  question,
  players,
  npcs,
  isSecondRound,
  firstRoundQuestions,
  onChange,
  onDelete,
  onChangeChoices,
}: {
  question: VoteQuestion;
  players: Player[];
  npcs: StoryNpc[];
  isSecondRound?: boolean;
  firstRoundQuestions?: VoteQuestion[];
  onChange: (patch: Partial<VoteQuestion>) => void;
  onDelete: () => void;
  onChangeChoices: (c: VoteQuestionChoice[]) => void;
}) {
  const [expanded, setExpanded] = useState(!question.label);

  return (
    <div className="rounded-xl border border-dark-700/70 bg-dark-950/45 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-3 text-left transition-colors hover:bg-dark-900/50"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {question.isPrimary && (
                <span className="rounded-full border border-mystery-800 bg-mystery-950/30 px-2 py-0.5 text-[11px] text-mystery-400">
                  주 질문
                </span>
              )}
              <span className="rounded-full border border-dark-700 bg-dark-900 px-2 py-0.5 text-[11px] text-dark-400">
                {TARGET_MODE_LABELS[question.targetMode]}
              </span>
            </div>
            <p className="mt-1.5 text-sm font-medium text-dark-100">
              {question.label || <span className="text-dark-500 italic">질문 텍스트 없음</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="rounded-lg border border-dark-700 px-2.5 py-1.5 text-xs text-dark-500 hover:border-red-900/50 hover:text-red-400 transition-colors"
            >
              삭제
            </button>
            <span className="text-xs text-dark-500">{expanded ? "접기" : "열기"}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-dark-800/80 bg-black/10 px-3 pb-3 pt-3">
          <div>
            <label className="block text-xs text-dark-500 mb-1">질문 텍스트</label>
            <input
              type="text"
              value={question.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="예: 범인은 누구인가?, 살해 도구는?"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs text-dark-500 mb-1">보충 설명 (선택)</label>
            <input
              type="text"
              value={question.description ?? ""}
              onChange={(e) => onChange({ description: e.target.value || undefined })}
              placeholder="질문에 대한 추가 안내"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-dark-500 mb-1">투표 대상</label>
              <select
                value={question.targetMode}
                onChange={(e) => {
                  const mode = e.target.value as VoteTargetMode;
                  onChange({
                    targetMode: mode,
                    choices: mode === "custom-choices" ? question.choices : [],
                  });
                }}
                className={inputClass}
              >
                {(Object.keys(TARGET_MODE_LABELS) as VoteTargetMode[]).map((m) => (
                  <option key={m} value={m}>{TARGET_MODE_LABELS[m]}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer py-2">
                <input
                  type="checkbox"
                  checked={question.isPrimary}
                  onChange={(e) => onChange({ isPrimary: e.target.checked })}
                  className="accent-mystery-500 w-3.5 h-3.5"
                />
                <span className="text-xs text-dark-400">엔딩 분기 결정용 (주 질문)</span>
              </label>
            </div>
          </div>

          {/* 커스텀 선택지 */}
          {question.targetMode === "custom-choices" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs text-dark-500">선택지</label>
                <button
                  type="button"
                  onClick={() => onChangeChoices([...question.choices, createVoteChoice()])}
                  className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
                >
                  + 추가
                </button>
              </div>
              {question.choices.map((c, ci) => (
                <div key={c.id} className="flex gap-2">
                  <input
                    type="text"
                    value={c.label}
                    onChange={(e) => {
                      const next = question.choices.map((ch, i) =>
                        i === ci ? { ...ch, label: e.target.value } : ch
                      );
                      onChangeChoices(next);
                    }}
                    placeholder={`선택지 ${ci + 1}`}
                    className={inputClass + " flex-1"}
                  />
                  <button
                    type="button"
                    onClick={() => onChangeChoices(question.choices.filter((_, i) => i !== ci))}
                    className="text-xs text-dark-600 hover:text-red-400 px-2 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 2차 투표 트리거 조건 */}
          {isSecondRound && firstRoundQuestions && firstRoundQuestions.length > 0 && (
            <div className="space-y-2 border-t border-dark-700 pt-3">
              <label className="block text-xs text-dark-500">2차 투표 전 스토리 텍스트</label>
              <textarea
                rows={3}
                value={question.preStoryText ?? ""}
                onChange={(e) => onChange({ preStoryText: e.target.value || undefined })}
                placeholder="1차 투표 결과 공개 후, 2차 투표 전에 보여줄 스토리"
                className={inputClass + " resize-none"}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ScriptEditor({
  gameId,
  scripts,
  rounds,
  locations,
  players,
  npcs,
  advancedVotingEnabled,
  voteQuestions,
  onChangeAdvancedVoting,
  onChangeVoteQuestions,
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
          gmNote: undefined,
        }
      );
    }

    return normalized;
  }

  const roundCount = Math.max(rounds, scripts.rounds.length, 1);
  const normalizedRounds = ensureRounds(roundCount);
  const roundStatuses = normalizedRounds.map((round) => getRoundStatus(round));
  const tabs: { id: Tab; label: string; status: EditorStatus }[] = [
    { id: "lobby", label: "대기실", status: getSegmentStatus(scripts.lobby) },
    { id: "rounds", label: `라운드 (${roundCount}개)`, status: getRoundsTabStatus(normalizedRounds) },
    { id: "vote", label: "투표", status: getSegmentStatus(scripts.vote) },
  ];

  useEffect(() => {
    if (!focusTarget) {
      return;
    }

    if (focusTarget === "step-5-vote") {
      setActiveTab("vote");
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
        <p className="text-sm text-dark-500 mt-1">
          라운드별 가이드, 미디어, 이벤트 텍스트와 투표 안내를 작성합니다. 오프닝은 Step 2, 엔딩은 Step 6에서 설정합니다.
        </p>
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
          phaseLabel="대기실"
          segment={scripts.lobby}
          guidance={SEGMENT_GUIDANCE.lobby}
          onChange={(lobby) => onChange({ ...scripts, lobby })}
          hideTextField
          textLabel="대기실 텍스트"
          textBadgeLabel="대기실 텍스트"
        />
      )}

      {activeTab === "rounds" && (
        <div data-maker-anchor="step-5-rounds" className="space-y-3">
          <div className="rounded-xl border border-dark-700 bg-dark-900/60 p-4 space-y-2">
            <p className="text-sm font-semibold text-dark-100">라운드 작성 현황</p>
            <p className="text-xs text-dark-500">
              라운드 수를 변경하려면 기본 설정에서 수정하세요. 현재 {normalizedRounds.length}개 라운드 중{" "}
              {roundStatuses.filter((status) => status !== "complete").length}개가 아직 덜 작성되었습니다.
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

      {activeTab === "vote" && (
        <div data-maker-anchor="step-5-vote" className="space-y-6">
          <SegmentEditor
            label="투표"
            phaseLabel="투표"
            segment={scripts.vote}
            guidance={SEGMENT_GUIDANCE.vote}
            onChange={(vote) => onChange({ ...scripts, vote })}
            textLabel="투표 안내 텍스트"
            textBadgeLabel="안내 텍스트"
          />

          {/* 고급 투표 설정 */}
          <VoteSettingsPanel
            enabled={advancedVotingEnabled}
            questions={voteQuestions}
            players={players}
            npcs={npcs}
            onToggle={onChangeAdvancedVoting}
            onChangeQuestions={onChangeVoteQuestions}
          />
        </div>
      )}
    </div>
  );
}
