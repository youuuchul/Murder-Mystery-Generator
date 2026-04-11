"use client";

import { useState } from "react";
import type {
  AuthorNote,
  EndingBranch,
  EndingConfig,
  Player,
  PersonalEnding,
  StoryNpc,
  VoteQuestion,
} from "@/types/game";

interface EndingEditorProps {
  ending: EndingConfig;
  players: Player[];
  npcs?: StoryNpc[];
  voteQuestions: VoteQuestion[];
  advancedVotingEnabled: boolean;
  onChange: (ending: EndingConfig) => void;
  section?: "branches" | "personal" | "author";
}

/** 투표 대상 모드에 따른 실제 선택지 */
function getEffectiveChoices(
  q: VoteQuestion,
  players: Player[],
  npcs: StoryNpc[]
): { id: string; label: string }[] {
  if (q.targetMode === "custom-choices") return q.choices;
  if (q.targetMode === "players-and-npcs") {
    return [
      ...players.map((p) => ({ id: p.id, label: p.name || "(이름 없음)" })),
      ...npcs.map((n) => ({ id: n.id, label: n.name || "(NPC)" })),
    ];
  }
  return players.map((p) => ({ id: p.id, label: p.name || "(이름 없음)" }));
}

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

/** 분기를 찾거나 없으면 새로 만든다 */
function ensureBranch(
  branches: EndingBranch[],
  triggerType: EndingBranch["triggerType"],
  label: string,
  extra?: Partial<EndingBranch>
): EndingBranch {
  const existing = branches.find((b) => {
    if (b.triggerType !== triggerType) return false;
    if (extra?.targetQuestionId && b.targetQuestionId !== extra.targetQuestionId) return false;
    if (extra?.targetChoiceIds?.length && !extra.targetChoiceIds.every((id) => (b.targetChoiceIds ?? []).includes(id))) return false;
    return true;
  });
  return existing ?? {
    id: crypto.randomUUID(),
    label,
    triggerType,
    storyText: "",
    ...extra,
  };
}

// ─── 엔딩 분기 1개 편집 폼 ─────────────────────────────────

function BranchStoryForm({
  branch,
  label,
  sublabel,
  onChangeStory,
  onChangeVideo,
  onChangeMusic,
}: {
  branch: EndingBranch;
  label: string;
  sublabel?: string;
  onChangeStory: (v: string) => void;
  onChangeVideo: (v: string | undefined) => void;
  onChangeMusic: (v: string | undefined) => void;
}) {
  const [showMedia, setShowMedia] = useState(Boolean(branch.videoUrl || branch.backgroundMusic));

  return (
    <div className="rounded-xl border border-dark-700/70 bg-dark-900/40 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-dark-100">{label}</p>
        {sublabel && <p className="text-xs text-dark-500 mt-0.5">{sublabel}</p>}
      </div>
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
  );
}

// ─── 메인 ───────────────────────────────────────────────────

export default function EndingEditor({
  ending,
  players,
  npcs,
  voteQuestions,
  advancedVotingEnabled,
  onChange,
  section,
}: EndingEditorProps) {
  const allNpcs = npcs ?? [];
  const showBranches = !section || section === "branches";
  const showPersonal = section === "personal";
  const showAuthor = !section || section === "author";

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

  // ── 1차 투표 엔딩 질문 + 선택지 ──

  const endingQuestion1 = voteQuestions.find((q) => q.purpose === "ending" && q.voteRound === 1);
  const round2Questions = voteQuestions.filter((q) => q.voteRound === 2);

  // 2차 투표로 넘어가는 1차 선택지 ID들
  const round2TriggerChoiceIds = new Set(
    round2Questions
      .filter((q) => q.triggerCondition?.questionId === endingQuestion1?.id)
      .map((q) => q.triggerCondition?.resultEquals)
      .filter(Boolean) as string[]
  );

  return (
    <div className="space-y-8">

      {/* ═══ 분기 엔딩 ═══ */}
      {showBranches && (
        <div className="space-y-6">

          {/* ── 기본 투표 모드 (고급 OFF) ── */}
          {!advancedVotingEnabled && (() => {
            const captured = ensureBranch(ending.branches, "culprit-captured", "범인 검거");
            const escaped = ensureBranch(ending.branches, "culprit-escaped", "미검거");

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
                  onChangeStory={(v) => updateBranchField(capturedBranch.id, { storyText: v })}
                  onChangeVideo={(v) => updateBranchField(capturedBranch.id, { videoUrl: v })}
                  onChangeMusic={(v) => updateBranchField(capturedBranch.id, { backgroundMusic: v })}
                />
                <BranchStoryForm
                  branch={escapedBranch}
                  label="미검거"
                  sublabel="범인이 특정되지 않은 경우"
                  onChangeStory={(v) => updateBranchField(escapedBranch.id, { storyText: v })}
                  onChangeVideo={(v) => updateBranchField(escapedBranch.id, { videoUrl: v })}
                  onChangeMusic={(v) => updateBranchField(escapedBranch.id, { backgroundMusic: v })}
                />
              </div>
            );
          })()}

          {/* ── 고급 투표 모드 ── */}
          {advancedVotingEnabled && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-dark-100">분기 엔딩</h3>
                <p className="mt-1 text-xs text-dark-500">
                  투표 선택지별로 엔딩을 작성합니다. 2차 투표로 넘어가는 선택지는 자동 제외됩니다.
                </p>
              </div>

              {/* 1차 투표 엔딩들 */}
              {endingQuestion1 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-widest text-mystery-300/80">
                    1차 투표 결과 엔딩
                  </p>

                  {(() => {
                    const choices = getEffectiveChoices(endingQuestion1, players, allNpcs);
                    return (
                    <>
                      {choices
                        .filter((c) => !round2TriggerChoiceIds.has(c.id))
                        .map((choice) => {
                          const existingBranch = ending.branches.find((b) =>
                            b.triggerType === "custom-choice-matched"
                            && b.targetQuestionId === endingQuestion1.id
                            && (b.targetChoiceIds ?? []).includes(choice.id)
                          ) ?? ensureBranch(
                            ending.branches,
                            "custom-choice-matched",
                            choice.label,
                            { targetQuestionId: endingQuestion1.id, targetChoiceIds: [choice.id] }
                          );

                          return (
                            <BranchStoryForm
                              key={choice.id}
                              branch={existingBranch}
                              label={`"${choice.label}" 선택 시`}
                              onChangeStory={(v) => {
                                if (!ending.branches.find((b) => b.id === existingBranch.id)) {
                                  upsertBranch({ ...existingBranch, storyText: v });
                                } else {
                                  updateBranchField(existingBranch.id, { storyText: v });
                                }
                              }}
                              onChangeVideo={(v) => {
                                if (!ending.branches.find((b) => b.id === existingBranch.id)) {
                                  upsertBranch({ ...existingBranch, videoUrl: v });
                                } else {
                                  updateBranchField(existingBranch.id, { videoUrl: v });
                                }
                              }}
                              onChangeMusic={(v) => {
                                if (!ending.branches.find((b) => b.id === existingBranch.id)) {
                                  upsertBranch({ ...existingBranch, backgroundMusic: v });
                                } else {
                                  updateBranchField(existingBranch.id, { backgroundMusic: v });
                                }
                              }}
                            />
                          );
                        })}

                      {/* fallback 엔딩 */}
                      {(() => {
                        const fb = ensureBranch(ending.branches, "custom-choice-fallback", "나머지 결과", { targetQuestionId: endingQuestion1.id });
                        const existing = ending.branches.find((b) => b.triggerType === "custom-choice-fallback" && b.targetQuestionId === endingQuestion1.id) ?? fb;
                        return (
                          <BranchStoryForm
                            branch={existing}
                            label="나머지 결과 (fallback)"
                            sublabel="위 선택지 외 결과일 때 표시"
                            onChangeStory={(v) => {
                              if (!ending.branches.find((b) => b.id === existing.id)) upsertBranch({ ...existing, storyText: v });
                              else updateBranchField(existing.id, { storyText: v });
                            }}
                            onChangeVideo={(v) => {
                              if (!ending.branches.find((b) => b.id === existing.id)) upsertBranch({ ...existing, videoUrl: v });
                              else updateBranchField(existing.id, { videoUrl: v });
                            }}
                            onChangeMusic={(v) => {
                              if (!ending.branches.find((b) => b.id === existing.id)) upsertBranch({ ...existing, backgroundMusic: v });
                              else updateBranchField(existing.id, { backgroundMusic: v });
                            }}
                          />
                        );
                      })()}

                      {/* 2차 투표로 넘어가는 선택지 */}
                      {choices
                        .filter((c) => round2TriggerChoiceIds.has(c.id))
                        .map((choice) => (
                          <div key={choice.id} className="rounded-xl border border-dark-700/40 bg-dark-900/20 p-3">
                            <p className="text-sm text-dark-500">
                              "{choice.label}" → 2차 투표로 진행 (아래에서 작성)
                            </p>
                          </div>
                        ))}
                    </>
                    );
                  })()}
                </div>
              )}

              {!endingQuestion1 && (
                <div className="rounded-xl border border-dashed border-dark-700 px-4 py-5">
                  <p className="text-xs text-dark-600">투표 탭에서 엔딩 결정 투표 질문을 먼저 추가하세요.</p>
                </div>
              )}

              {/* 2차 투표 엔딩들 */}
              {round2Questions.length > 0 && (
                <div className="space-y-3 border-t border-dark-700 pt-4">
                  <p className="text-xs font-medium uppercase tracking-widest text-mystery-300/80">
                    2차 투표 결과 엔딩 (진엔딩)
                  </p>
                  {round2Questions.map((q2) => (
                    <div key={q2.id} className="space-y-3">
                      <p className="text-xs text-dark-400 font-medium">{q2.label || "2차 투표 질문"}</p>
                      {getEffectiveChoices(q2, players, allNpcs).map((choice) => {
                        const branch = ensureBranch(
                          ending.branches,
                          "vote-round-2-matched",
                          choice.label || "(선택지)",
                          { targetQuestionId: q2.id, targetChoiceIds: [choice.id] }
                        );
                        const existingBranch = ending.branches.find((b) =>
                          b.triggerType === "vote-round-2-matched"
                          && b.targetQuestionId === q2.id
                          && (b.targetChoiceIds ?? []).includes(choice.id)
                        ) ?? branch;

                        return (
                          <BranchStoryForm
                            key={choice.id}
                            branch={existingBranch}
                            label={`"${choice.label}" 선택 시 (진엔딩)`}
                            onChangeStory={(v) => {
                              if (!ending.branches.find((b) => b.id === existingBranch.id)) upsertBranch({ ...existingBranch, storyText: v });
                              else updateBranchField(existingBranch.id, { storyText: v });
                            }}
                            onChangeVideo={(v) => {
                              if (!ending.branches.find((b) => b.id === existingBranch.id)) upsertBranch({ ...existingBranch, videoUrl: v });
                              else updateBranchField(existingBranch.id, { videoUrl: v });
                            }}
                            onChangeMusic={(v) => {
                              if (!ending.branches.find((b) => b.id === existingBranch.id)) upsertBranch({ ...existingBranch, backgroundMusic: v });
                              else updateBranchField(existingBranch.id, { backgroundMusic: v });
                            }}
                          />
                        );
                      })}

                      {/* 2차 투표 fallback */}
                      {(() => {
                        const fb = ensureBranch(
                          ending.branches,
                          "vote-round-2-fallback",
                          "2차 투표 실패",
                          { targetQuestionId: q2.id }
                        );
                        const existing = ending.branches.find((b) =>
                          b.triggerType === "vote-round-2-fallback" && b.targetQuestionId === q2.id
                        ) ?? fb;

                        return (
                          <BranchStoryForm
                            branch={existing}
                            label="나머지 결과 (2차 실패 엔딩)"
                            onChangeStory={(v) => {
                              if (!ending.branches.find((b) => b.id === existing.id)) upsertBranch({ ...existing, storyText: v });
                              else updateBranchField(existing.id, { storyText: v });
                            }}
                            onChangeVideo={(v) => {
                              if (!ending.branches.find((b) => b.id === existing.id)) upsertBranch({ ...existing, videoUrl: v });
                              else updateBranchField(existing.id, { videoUrl: v });
                            }}
                            onChangeMusic={(v) => {
                              if (!ending.branches.find((b) => b.id === existing.id)) upsertBranch({ ...existing, backgroundMusic: v });
                              else updateBranchField(existing.id, { backgroundMusic: v });
                            }}
                          />
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ 개인 엔딩 ═══ */}
      {showPersonal && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-dark-100">개인 엔딩</h3>
            <p className="mt-1 text-xs text-dark-500">
              분기 엔딩 공개 후 각 플레이어에게 개별 표시되는 엔딩입니다. 분기를 선택해서 해당 분기의 개인 엔딩을 작성하세요.
            </p>
          </div>

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

      {/* ═══ 작가 후기 ═══ */}
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
              onClick={() => onChange({ ...ending, authorNotesEnabled: !ending.authorNotesEnabled })}
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

        return (
          <div key={branch.id} className="rounded-xl border border-dark-700/70 bg-dark-900/40 overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedBranchId(isExpanded ? null : branch.id)}
              className="w-full px-4 py-3 text-left hover:bg-dark-900/60 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-dark-100">{branch.label || "(분기 이름 없음)"}</p>
                  <p className="text-xs text-dark-500 mt-0.5">
                    개인 엔딩: {branch.personalEndingsEnabled ? "사용 중" : "사용 안 함"}
                  </p>
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
                  return (
                    <div key={pe.playerId} className="rounded-xl border border-dark-700/50 bg-dark-950/30 p-3 space-y-2">
                      <p className="text-sm font-medium text-dark-200">{player?.name || "(이름 없음)"}</p>
                      <input
                        type="text"
                        value={pe.title ?? ""}
                        onChange={(e) => onUpdatePersonalEnding(branch.id, pe.playerId, { title: e.target.value || undefined })}
                        placeholder="제목 (선택)"
                        className={inp}
                      />
                      <textarea
                        rows={3}
                        value={pe.text}
                        onChange={(e) => onUpdatePersonalEnding(branch.id, pe.playerId, { text: e.target.value })}
                        placeholder="이 캐릭터만 확인할 개인 엔딩"
                        className={inp + " resize-none"}
                      />
                    </div>
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
