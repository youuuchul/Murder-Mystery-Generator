"use client";

import { useState } from "react";
import { useScrollAnchor } from "./useScrollAnchor";
import { buildPlayersNpcsVictimTargets } from "@/lib/culprit";
import type {
  AuthorNote,
  EndingBranch,
  EndingBranchTriggerType,
  EndingConfig,
  Player,
  PersonalEnding,
  Story,
  StoryNpc,
  VoteQuestion,
} from "@/types/game";

interface EndingEditorProps {
  ending: EndingConfig;
  players: Player[];
  npcs?: StoryNpc[];
  victim?: Story["victim"];
  voteQuestions: VoteQuestion[];
  advancedVotingEnabled: boolean;
  onChange: (ending: EndingConfig) => void;
  section?: "branches" | "personal" | "author";
}

/** 투표 대상 모드에 따른 실제 선택지 */
function getEffectiveChoices(
  q: VoteQuestion,
  players: Player[],
  npcs: StoryNpc[],
  victim: Story["victim"] | undefined,
): { id: string; label: string }[] {
  if (q.targetMode === "custom-choices") return q.choices;
  if (q.targetMode === "players-and-npcs") {
    return buildPlayersNpcsVictimTargets(players, npcs, victim);
  }
  return players.map((p) => ({ id: p.id, label: p.name || "(이름 없음)" }));
}

const TRIGGER_TYPE_LABELS: Record<EndingBranchTriggerType, string> = {
  "culprit-captured": "범인 검거",
  "culprit-escaped": "미검거",
  "custom-choice-matched": "1차 투표",
  "custom-choice-fallback": "1차 나머지",
  "vote-round-2-matched": "2차 투표",
  "vote-round-2-fallback": "2차 나머지",
};

const inp = "w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";
const ta = `${inp} resize-none`;

function createAuthorNote(): AuthorNote {
  return { id: crypto.randomUUID(), title: "", content: "" };
}

function normalizeBranchPersonalEndings(
  players: Player[],
  endings: PersonalEnding[] | undefined
): PersonalEnding[] {
  return players.map((player) => {
    const existing = endings?.find((ending) => ending.playerId === player.id);
    return existing ?? { playerId: player.id, title: "", text: "" };
  });
}

// ─── 엔딩 분기 스토리 폼 ─────────────────────────────────

function BranchStoryForm({
  branch,
  label,
  sublabel,
  badge,
  onChangeStory,
  onChangeVideo,
  onChangeMusic,
  onDelete,
  children,
}: {
  branch: EndingBranch;
  label: string;
  sublabel?: string;
  badge?: string;
  onChangeStory: (v: string) => void;
  onChangeVideo: (v: string | undefined) => void;
  onChangeMusic: (v: string | undefined) => void;
  onDelete?: () => void;
  children?: React.ReactNode;
}) {
  const [showMedia, setShowMedia] = useState(Boolean(branch.videoUrl || branch.backgroundMusic));
  const [expanded, setExpanded] = useState(true);
  // 분기 삭제 시 panel(분기 1개 이상 / 검거 / 미검거) 변동 보존.
  const captureScrollAnchor = useScrollAnchor();

  return (
    <div className="rounded-xl border border-dark-700/70 bg-dark-900/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 text-left hover:bg-dark-900/60 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            {badge && (
              <span className="rounded-full border border-dark-700 bg-dark-900 px-2 py-0.5 text-[11px] text-dark-400 shrink-0">
                {badge}
              </span>
            )}
            <div>
              <p className="text-sm font-medium text-dark-100">{label}</p>
              {sublabel && <p className="text-xs text-dark-500 mt-0.5">{sublabel}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onDelete && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); captureScrollAnchor(e); onDelete(); }}
                className="rounded-lg border border-dark-700 px-2.5 py-1.5 text-xs text-dark-500 hover:border-red-900/50 hover:text-red-400 transition-colors"
              >
                삭제
              </button>
            )}
            <span className="text-xs text-dark-500">{expanded ? "접기" : "열기"}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-dark-800/80 px-4 pb-4 pt-3 space-y-3">
          {children}
          <textarea
            rows={5}
            value={branch.storyText}
            onChange={(e) => onChangeStory(e.target.value)}
            placeholder="이 분기에서 플레이어에게 보여줄 엔딩 텍스트"
            className={ta}
          />
          <button
            type="button"
            onClick={() => setShowMedia(!showMedia)}
            className="text-xs text-dark-500 hover:text-dark-300 transition-colors"
          >
            {showMedia ? "미디어 접기" : "영상/음악 URL 추가"}
          </button>
          {showMedia && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-dark-500">영상 URL</label>
                <input
                  type="url"
                  value={branch.videoUrl ?? ""}
                  onChange={(e) => onChangeVideo(e.target.value || undefined)}
                  placeholder="https://..."
                  className={inp}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-dark-500">배경 음악 URL</label>
                <input
                  type="url"
                  value={branch.backgroundMusic ?? ""}
                  onChange={(e) => onChangeMusic(e.target.value || undefined)}
                  placeholder="https://..."
                  className={inp}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 선택지 매핑 체크박스 ────────────────────────────────

function ChoiceMapper({
  choices,
  branchId,
  selectedIds,
  otherBranches,
  disabledIds,
  disabledLabel,
  onChange,
}: {
  choices: { id: string; label: string }[];
  branchId: string;
  selectedIds: string[];
  otherBranches: EndingBranch[];
  disabledIds: Set<string>;
  disabledLabel: string;
  onChange: (ids: string[]) => void;
}) {
  // 다른 분기에 매핑된 선택지 추적
  const otherBranchMap = new Map<string, string>();
  for (const b of otherBranches) {
    if (b.id === branchId) continue;
    for (const cId of b.targetChoiceIds ?? []) {
      otherBranchMap.set(cId, b.label || "(이름 없음)");
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-dark-500">선택지 매핑</p>
      {choices.map((c) => {
        const isSelected = selectedIds.includes(c.id);
        const isDisabled = disabledIds.has(c.id);
        const mappedTo = otherBranchMap.get(c.id);
        const isOtherMapped = Boolean(mappedTo) && !isSelected;

        return (
          <label
            key={c.id}
            className={[
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
              isDisabled
                ? "border-dark-800 bg-dark-950/30 text-dark-600 cursor-not-allowed"
                : isOtherMapped
                  ? "border-dark-800 bg-dark-950/20 text-dark-500 cursor-not-allowed"
                  : isSelected
                    ? "border-mystery-700 bg-mystery-950/20 text-dark-100"
                    : "border-dark-700 bg-dark-900/30 text-dark-300 hover:border-dark-600 cursor-pointer",
            ].join(" ")}
          >
            <input
              type="checkbox"
              checked={isSelected}
              disabled={isDisabled || isOtherMapped}
              onChange={() => {
                if (isSelected) {
                  onChange(selectedIds.filter((id) => id !== c.id));
                } else {
                  onChange([...selectedIds, c.id]);
                }
              }}
              className="accent-mystery-500"
            />
            <span className="flex-1">{c.label}</span>
            {isDisabled && (
              <span className="text-[11px] text-yellow-400/70">{disabledLabel}</span>
            )}
            {isOtherMapped && (
              <span className="text-[11px] text-dark-600">{mappedTo}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}

// ─── 메인 ───────────────────────────────────────────────────

export default function EndingEditor({
  ending,
  players,
  npcs,
  victim,
  voteQuestions,
  advancedVotingEnabled,
  onChange,
  section,
}: EndingEditorProps) {
  const allNpcs = npcs ?? [];
  const showBranches = !section || section === "branches";
  const showPersonal = section === "personal";
  const showAuthor = !section || section === "author";
  // 작가 후기 토글 / 분기 추가/삭제로 panel 변동 시 viewport 보존.
  const captureScrollAnchor = useScrollAnchor();

  // ── 분기 업데이트 헬퍼 ──

  function upsertBranch(branch: EndingBranch) {
    const exists = ending.branches.find((b) => b.id === branch.id);
    const branches = exists
      ? ending.branches.map((b) => b.id === branch.id ? branch : b)
      : [...ending.branches, branch];
    onChange({ ...ending, branches });
  }

  function updateBranchField(branchId: string, patch: Partial<EndingBranch>) {
    onChange({
      ...ending,
      branches: ending.branches.map((b) => b.id === branchId ? { ...b, ...patch } : b),
    });
  }

  function deleteBranch(branchId: string) {
    onChange({
      ...ending,
      branches: ending.branches.filter((b) => b.id !== branchId),
    });
  }

  function updateBranchPersonalEnding(branchId: string, playerId: string, patch: Partial<PersonalEnding>) {
    const branch = ending.branches.find((b) => b.id === branchId);
    if (!branch) return;
    const personalEndings = normalizeBranchPersonalEndings(players, branch.personalEndings);
    onChange({
      ...ending,
      branches: ending.branches.map((b) =>
        b.id === branchId
          ? { ...b, personalEndings: personalEndings.map((pe) => pe.playerId === playerId ? { ...pe, ...patch } : pe) }
          : b
      ),
    });
  }

  function updateAuthorNote(index: number, partial: Partial<AuthorNote>) {
    onChange({
      ...ending,
      authorNotes: ending.authorNotes.map((note, i) => i === index ? { ...note, ...partial } : note),
    });
  }

  // ── 투표 질문/선택지 정보 ──

  const endingQuestion1 = voteQuestions.find((q) => q.purpose === "ending" && q.voteRound === 1);
  const round2Questions = voteQuestions.filter((q) => q.voteRound === 2);

  // 1차 엔딩 투표가 커스텀 선택지 모드면 고급 엔딩 UI(선택지별 분기)를 강제 활성화.
  // 기존 advancedVotingEnabled 플래그는 "2차 투표 도입"과 결합돼 있지만,
  // custom-choices는 1차 분기만으로도 선택지 기반 엔딩이 필요하다.
  const useCustomChoiceEnding = endingQuestion1?.targetMode === "custom-choices";
  const useAdvancedEndingUI = advancedVotingEnabled || useCustomChoiceEnding;

  // 2차 투표로 넘어가는 1차 선택지 ID들
  const round2TriggerChoiceIds = new Set(
    round2Questions
      .filter((q) => q.triggerCondition?.questionId === endingQuestion1?.id)
      .map((q) => q.triggerCondition?.resultEquals)
      .filter(Boolean) as string[]
  );

  // 1차 엔딩 분기들 (custom-choice-matched + fallback)
  const round1Branches = ending.branches.filter(
    (b) => b.triggerType === "custom-choice-matched" && b.targetQuestionId === endingQuestion1?.id
  );
  const round1Fallback = ending.branches.find(
    (b) => b.triggerType === "custom-choice-fallback" && b.targetQuestionId === endingQuestion1?.id
  );

  // 2차 엔딩 분기들
  function getRound2Branches(questionId: string) {
    return ending.branches.filter(
      (b) => b.triggerType === "vote-round-2-matched" && b.targetQuestionId === questionId
    );
  }
  function getRound2Fallback(questionId: string) {
    return ending.branches.find(
      (b) => b.triggerType === "vote-round-2-fallback" && b.targetQuestionId === questionId
    );
  }

  function addBranch(triggerType: EndingBranchTriggerType, questionId: string) {
    const branch: EndingBranch = {
      id: crypto.randomUUID(),
      label: "",
      triggerType,
      targetQuestionId: questionId,
      targetChoiceIds: [],
      storyText: "",
    };
    onChange({ ...ending, branches: [...ending.branches, branch] });
  }

  function ensureFallback(triggerType: EndingBranchTriggerType, questionId: string, label: string): EndingBranch {
    const existing = ending.branches.find(
      (b) => b.triggerType === triggerType && b.targetQuestionId === questionId
    );
    if (existing) return existing;
    const fb: EndingBranch = {
      id: crypto.randomUUID(),
      label,
      triggerType,
      targetQuestionId: questionId,
      storyText: "",
    };
    // side-effect: 자동 추가
    onChange({ ...ending, branches: [...ending.branches, fb] });
    return fb;
  }

  return (
    <div className="space-y-8">

      {/* === 분기 엔딩 === */}
      {showBranches && (
        <div className="space-y-6">

          {/* -- 기본 투표 모드 (2차 투표 OFF + custom-choices 아님) -- */}
          {!useAdvancedEndingUI && (() => {
            // 기본 모드에서 커스텀 선택지가 있으면 고급 엔딩 UI 대신 기본 2분기
            const captured = ending.branches.find((b) => b.triggerType === "culprit-captured")
              ?? { id: crypto.randomUUID(), label: "범인 검거", triggerType: "culprit-captured" as const, storyText: "" };
            const escaped = ending.branches.find((b) => b.triggerType === "culprit-escaped")
              ?? { id: crypto.randomUUID(), label: "미검거", triggerType: "culprit-escaped" as const, storyText: "" };

            // 초기 분기 자동 생성
            if (!ending.branches.find((b) => b.triggerType === "culprit-captured")) {
              upsertBranch(captured);
            }
            if (!ending.branches.find((b) => b.triggerType === "culprit-escaped")) {
              upsertBranch(escaped);
            }

            const capturedBranch = ending.branches.find((b) => b.triggerType === "culprit-captured") ?? captured;
            const escapedBranch = ending.branches.find((b) => b.triggerType === "culprit-escaped") ?? escaped;

            return (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-dark-100">분기 엔딩</h3>
                  <p className="mt-1 text-xs text-dark-500">투표 결과에 따라 두 가지 엔딩을 작성합니다.</p>
                </div>
                <BranchStoryForm
                  branch={capturedBranch}
                  label="범인 검거"
                  sublabel="투표로 진범이 특정된 경우"
                  badge="범인 검거"
                  onChangeStory={(v) => updateBranchField(capturedBranch.id, { storyText: v })}
                  onChangeVideo={(v) => updateBranchField(capturedBranch.id, { videoUrl: v })}
                  onChangeMusic={(v) => updateBranchField(capturedBranch.id, { backgroundMusic: v })}
                />
                <BranchStoryForm
                  branch={escapedBranch}
                  label="미검거"
                  sublabel="범인이 특정되지 않은 경우"
                  badge="미검거"
                  onChangeStory={(v) => updateBranchField(escapedBranch.id, { storyText: v })}
                  onChangeVideo={(v) => updateBranchField(escapedBranch.id, { videoUrl: v })}
                  onChangeMusic={(v) => updateBranchField(escapedBranch.id, { backgroundMusic: v })}
                />
              </div>
            );
          })()}

          {/* -- 선택지 기반 엔딩 분기 UI (advancedVotingEnabled 또는 custom-choices) -- */}
          {useAdvancedEndingUI && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-dark-100">분기 엔딩</h3>
                <p className="mt-1 text-xs text-dark-500">
                  투표 선택지를 분기에 매핑합니다. 여러 선택지를 하나의 분기에 묶을 수 있습니다.
                </p>
              </div>

              {/* 1차 투표 엔딩들 */}
              {endingQuestion1 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-widest text-mystery-300/80">
                      1차 투표 결과 엔딩
                    </p>
                    <button
                      type="button"
                      onClick={(e) => { captureScrollAnchor(e); addBranch("custom-choice-matched", endingQuestion1.id); }}
                      className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
                    >
                      + 엔딩 분기 추가
                    </button>
                  </div>

                  {round1Branches.length === 0 && (
                    <p className="text-xs text-dark-600 text-center py-3 border border-dashed border-dark-700 rounded-xl">
                      엔딩 분기를 추가하고, 각 분기에 선택지를 매핑하세요.
                    </p>
                  )}

                  {/* 매핑된 분기들 */}
                  {round1Branches.map((branch) => {
                    const choices = getEffectiveChoices(endingQuestion1, players, allNpcs, victim);
                    return (
                      <BranchStoryForm
                        key={branch.id}
                        branch={branch}
                        label={branch.label || "(분기 이름 없음)"}
                        badge="1차 투표"
                        onChangeStory={(v) => updateBranchField(branch.id, { storyText: v })}
                        onChangeVideo={(v) => updateBranchField(branch.id, { videoUrl: v })}
                        onChangeMusic={(v) => updateBranchField(branch.id, { backgroundMusic: v })}
                        onDelete={() => deleteBranch(branch.id)}
                      >
                        {/* 분기 이름 입력 */}
                        <div>
                          <label className="block text-xs text-dark-500 mb-1">분기 이름</label>
                          <input
                            type="text"
                            value={branch.label}
                            onChange={(e) => updateBranchField(branch.id, { label: e.target.value })}
                            placeholder="예: 범인 검거 엔딩"
                            className={inp}
                          />
                        </div>
                        {/* 선택지 체크박스 매핑 */}
                        <ChoiceMapper
                          choices={choices}
                          branchId={branch.id}
                          selectedIds={branch.targetChoiceIds ?? []}
                          otherBranches={round1Branches}
                          disabledIds={round2TriggerChoiceIds}
                          disabledLabel="2차 투표 진입"
                          onChange={(ids) => updateBranchField(branch.id, { targetChoiceIds: ids })}
                        />
                      </BranchStoryForm>
                    );
                  })}

                  {/* 2차 투표로 넘어가는 선택지 안내 */}
                  {round2TriggerChoiceIds.size > 0 && (() => {
                    const choices = getEffectiveChoices(endingQuestion1, players, allNpcs, victim);
                    const triggerChoices = choices.filter((c) => round2TriggerChoiceIds.has(c.id));
                    return triggerChoices.length > 0 ? (
                      <div className="rounded-xl border border-yellow-900/30 bg-yellow-950/10 p-3">
                        <p className="text-xs text-yellow-300/80">
                          2차 투표 진입 선택지: {triggerChoices.map((c) => c.label).join(", ")}
                        </p>
                        <p className="text-xs text-dark-600 mt-0.5">
                          이 선택지가 최다 득표 시 2차 투표로 진행됩니다. 아래에서 2차 엔딩을 작성하세요.
                        </p>
                      </div>
                    ) : null;
                  })()}

                  {/* Fallback 엔딩 */}
                  {(() => {
                    const fb = round1Fallback ?? ensureFallback("custom-choice-fallback", endingQuestion1.id, "나머지 결과");
                    return (
                      <BranchStoryForm
                        branch={fb}
                        label="나머지 결과 (fallback)"
                        sublabel="위 분기에 매핑되지 않은 선택지가 최다 득표 시 표시"
                        badge="1차 나머지"
                        onChangeStory={(v) => {
                          if (!ending.branches.find((b) => b.id === fb.id)) upsertBranch({ ...fb, storyText: v });
                          else updateBranchField(fb.id, { storyText: v });
                        }}
                        onChangeVideo={(v) => {
                          if (!ending.branches.find((b) => b.id === fb.id)) upsertBranch({ ...fb, videoUrl: v });
                          else updateBranchField(fb.id, { videoUrl: v });
                        }}
                        onChangeMusic={(v) => {
                          if (!ending.branches.find((b) => b.id === fb.id)) upsertBranch({ ...fb, backgroundMusic: v });
                          else updateBranchField(fb.id, { backgroundMusic: v });
                        }}
                      />
                    );
                  })()}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-dark-700 px-4 py-5">
                  <p className="text-xs text-dark-600">투표 탭에서 기본 투표 질문의 선택지를 설정하세요.</p>
                </div>
              )}

              {/* 2차 투표 엔딩들 */}
              {round2Questions.length > 0 && (
                <div className="space-y-3 border-t border-dark-700 pt-4">
                  <p className="text-xs font-medium uppercase tracking-widest text-mystery-300/80">
                    2차 투표 결과 엔딩
                  </p>
                  {round2Questions.map((q2) => {
                    const choices = getEffectiveChoices(q2, players, allNpcs, victim);
                    const r2Branches = getRound2Branches(q2.id);
                    const r2Fallback = getRound2Fallback(q2.id);

                    return (
                      <div key={q2.id} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-dark-400 font-medium">{q2.label || "2차 투표 질문"}</p>
                          <button
                            type="button"
                            onClick={(e) => { captureScrollAnchor(e); addBranch("vote-round-2-matched", q2.id); }}
                            className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
                          >
                            + 엔딩 분기 추가
                          </button>
                        </div>

                        {r2Branches.map((branch) => (
                          <BranchStoryForm
                            key={branch.id}
                            branch={branch}
                            label={branch.label || "(분기 이름 없음)"}
                            badge="2차 투표"
                            onChangeStory={(v) => updateBranchField(branch.id, { storyText: v })}
                            onChangeVideo={(v) => updateBranchField(branch.id, { videoUrl: v })}
                            onChangeMusic={(v) => updateBranchField(branch.id, { backgroundMusic: v })}
                            onDelete={() => deleteBranch(branch.id)}
                          >
                            <div>
                              <label className="block text-xs text-dark-500 mb-1">분기 이름</label>
                              <input
                                type="text"
                                value={branch.label}
                                onChange={(e) => updateBranchField(branch.id, { label: e.target.value })}
                                placeholder="예: 진엔딩"
                                className={inp}
                              />
                            </div>
                            <ChoiceMapper
                              choices={choices}
                              branchId={branch.id}
                              selectedIds={branch.targetChoiceIds ?? []}
                              otherBranches={r2Branches}
                              disabledIds={new Set()}
                              disabledLabel=""
                              onChange={(ids) => updateBranchField(branch.id, { targetChoiceIds: ids })}
                            />
                          </BranchStoryForm>
                        ))}

                        {/* 2차 fallback */}
                        {(() => {
                          const fb = r2Fallback ?? ensureFallback("vote-round-2-fallback", q2.id, "2차 나머지 결과");
                          return (
                            <BranchStoryForm
                              branch={fb}
                              label="나머지 결과 (2차 fallback)"
                              badge="2차 나머지"
                              onChangeStory={(v) => {
                                if (!ending.branches.find((b) => b.id === fb.id)) upsertBranch({ ...fb, storyText: v });
                                else updateBranchField(fb.id, { storyText: v });
                              }}
                              onChangeVideo={(v) => {
                                if (!ending.branches.find((b) => b.id === fb.id)) upsertBranch({ ...fb, videoUrl: v });
                                else updateBranchField(fb.id, { videoUrl: v });
                              }}
                              onChangeMusic={(v) => {
                                if (!ending.branches.find((b) => b.id === fb.id)) upsertBranch({ ...fb, backgroundMusic: v });
                                else updateBranchField(fb.id, { backgroundMusic: v });
                              }}
                            />
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* === 개인 엔딩 === */}
      {showPersonal && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-dark-100">개인 엔딩</h3>
            <p className="mt-1 text-xs text-dark-500">
              분기 엔딩 공개 후 각 플레이어에게 개별 표시되는 엔딩입니다. 분기를 선택해서 해당 분기의 개인 엔딩을 작성하세요.
            </p>
          </div>

          {/* 레거시 데이터 마이그레이션 안내 */}
          {ending.personalEndingsEnabled
            && ending.personalEndings.some((pe) => pe.text.trim())
            && !ending.branches.some((b) => b.personalEndingsEnabled) && (
            <div className="rounded-xl border border-yellow-900/30 bg-yellow-950/10 p-4 space-y-3">
              <p className="text-xs font-medium text-yellow-300/80">
                기존 형식의 개인 엔딩 데이터가 있습니다
              </p>
              <p className="text-xs text-dark-500">
                이전 버전에서 작성한 공통 개인 엔딩을 모든 분기의 개인 엔딩으로 복사합니다.
              </p>
              <button
                type="button"
                onClick={() => {
                  const updatedBranches = ending.branches.map((b) => ({
                    ...b,
                    personalEndingsEnabled: true,
                    personalEndings: normalizeBranchPersonalEndings(
                      players,
                      ending.personalEndings.length > 0 ? ending.personalEndings : b.personalEndings
                    ),
                  }));
                  onChange({
                    ...ending,
                    branches: updatedBranches,
                    personalEndingsEnabled: false,
                    personalEndings: [],
                  });
                }}
                className="rounded-lg border border-yellow-700 bg-yellow-900/20 px-3 py-1.5 text-xs font-medium text-yellow-200 hover:bg-yellow-900/40 transition-colors"
              >
                분기별로 이동
              </button>
            </div>
          )}

          {ending.branches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-dark-700 px-4 py-5">
              <p className="text-xs text-dark-600">엔딩 탭에서 분기를 먼저 작성하세요.</p>
            </div>
          ) : (
            <PersonalEndingsPerBranch
              branches={ending.branches}
              players={players}
              onToggle={(branchId, enabled) => updateBranchField(branchId, {
                personalEndingsEnabled: enabled,
                personalEndings: enabled
                  ? normalizeBranchPersonalEndings(players, ending.branches.find((b) => b.id === branchId)?.personalEndings)
                  : undefined,
              })}
              onUpdatePersonalEnding={updateBranchPersonalEnding}
            />
          )}
        </div>
      )}

      {/* === 작가 후기 === */}
      {showAuthor && (
        <div className="rounded-xl border border-dark-700 p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-dark-100">작가 후기</h3>
              <p className="mt-1 text-xs text-dark-500">
                모든 엔딩 공개 후 표시되는 작가 메모입니다.
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                captureScrollAnchor(e);
                onChange({ ...ending, authorNotesEnabled: !ending.authorNotesEnabled });
              }}
              className={[
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                ending.authorNotesEnabled
                  ? "border-mystery-600 bg-mystery-900/30 text-mystery-200"
                  : "border-dark-700 text-dark-500 hover:text-dark-300",
              ].join(" ")}
            >
              {ending.authorNotesEnabled ? "사용 중" : "사용 안 함"}
            </button>
          </div>

          {ending.authorNotesEnabled && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => onChange({ ...ending, authorNotes: [...ending.authorNotes, createAuthorNote()] })}
                className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
              >
                + 항목 추가
              </button>

              {ending.authorNotes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-dark-700 px-4 py-5">
                  <p className="text-xs text-dark-600">등록된 작가 후기가 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {ending.authorNotes.map((note, index) => (
                    <div key={note.id} className="rounded-xl border border-dark-700/70 bg-dark-900/40 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-dark-100">{note.title || `항목 ${index + 1}`}</p>
                        <button
                          type="button"
                          onClick={() => onChange({ ...ending, authorNotes: ending.authorNotes.filter((_, i) => i !== index) })}
                          className="text-xs text-dark-500 hover:text-red-400 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                      <input
                        type="text"
                        value={note.title}
                        onChange={(e) => updateAuthorNote(index, { title: e.target.value })}
                        placeholder="예: 진실 해설"
                        className={inp}
                      />
                      <textarea
                        rows={4}
                        value={note.content}
                        onChange={(e) => updateAuthorNote(index, { content: e.target.value })}
                        placeholder="작가 메모"
                        className={ta}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 개인 엔딩: 분기별로 접기/펼치기 ───────────────────────

function PersonalEndingsPerBranch({
  branches,
  players,
  onToggle,
  onUpdatePersonalEnding,
}: {
  branches: EndingBranch[];
  players: Player[];
  onToggle: (branchId: string, enabled: boolean) => void;
  onUpdatePersonalEnding: (branchId: string, playerId: string, patch: Partial<PersonalEnding>) => void;
}) {
  const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {branches.map((branch) => {
        const isExpanded = expandedBranchId === branch.id;
        const personalEndings = normalizeBranchPersonalEndings(players, branch.personalEndings);
        const triggerLabel = TRIGGER_TYPE_LABELS[branch.triggerType] ?? branch.triggerType;

        return (
          <div key={branch.id} className="rounded-xl border border-dark-700/70 bg-dark-900/40 overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedBranchId(isExpanded ? null : branch.id)}
              className="w-full px-4 py-3 text-left hover:bg-dark-900/60 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="rounded-full border border-dark-700 bg-dark-900 px-2 py-0.5 text-[11px] text-dark-400 shrink-0">
                    {triggerLabel}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-dark-100">{branch.label || "(분기 이름 없음)"}</p>
                    <p className="text-xs text-dark-500 mt-0.5">
                      개인 엔딩: {branch.personalEndingsEnabled ? "사용 중" : "사용 안 함"}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-dark-500">{isExpanded ? "접기" : "열기"}</span>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-dark-700 px-4 pb-4 pt-3 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-dark-400">이 분기에서 개인 엔딩 사용</p>
                  <button
                    type="button"
                    onClick={() => onToggle(branch.id, !branch.personalEndingsEnabled)}
                    className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
                      branch.personalEndingsEnabled ? "bg-mystery-600" : "bg-dark-700"
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      branch.personalEndingsEnabled ? "translate-x-4" : ""
                    }`} />
                  </button>
                </div>

                {branch.personalEndingsEnabled && personalEndings.map((pe) => {
                  const player = players.find((p) => p.id === pe.playerId);
                  const hasContent = Boolean(pe.title?.trim() || pe.text.trim());
                  return (
                    <PersonalEndingCard
                      key={pe.playerId}
                      playerName={player?.name || "(이름 없음)"}
                      pe={pe}
                      hasContent={hasContent}
                      onUpdate={(patch) => onUpdatePersonalEnding(branch.id, pe.playerId, patch)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── 개인 엔딩 카드 (빈 텍스트 접기 지원) ──────────────────

function PersonalEndingCard({
  playerName,
  pe,
  hasContent,
  onUpdate,
}: {
  playerName: string;
  pe: PersonalEnding;
  hasContent: boolean;
  onUpdate: (patch: Partial<PersonalEnding>) => void;
}) {
  const [expanded, setExpanded] = useState(hasContent);

  return (
    <div className="rounded-xl border border-dark-700/50 bg-dark-950/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2.5 text-left hover:bg-dark-900/40 transition-colors"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-dark-200">{playerName}</p>
          <span className="text-xs text-dark-600">
            {hasContent ? (expanded ? "접기" : "작성됨") : (expanded ? "접기" : "미작성")}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-dark-800/50 px-3 pb-3 pt-2 space-y-2">
          <input
            type="text"
            value={pe.title ?? ""}
            onChange={(e) => onUpdate({ title: e.target.value || undefined })}
            placeholder="제목 (선택)"
            className={inp}
          />
          <textarea
            rows={3}
            value={pe.text}
            onChange={(e) => onUpdate({ text: e.target.value })}
            placeholder="이 캐릭터만 확인할 개인 엔딩"
            className={inp + " resize-none"}
          />
        </div>
      )}
    </div>
  );
}
