"use client";

import type {
  AuthorNote,
  EndingBranch,
  EndingConfig,
  Player,
  PersonalEnding,
  VoteQuestion,
} from "@/types/game";

interface EndingEditorProps {
  ending: EndingConfig;
  players: Player[];
  voteQuestions: VoteQuestion[];
  advancedVotingEnabled: boolean;
  onChange: (ending: EndingConfig) => void;
}

const inp = "w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";
const ta = `${inp} resize-none`;

/** 엔딩 분기 1개 기본값을 만든다. */
function createEndingBranch(): EndingBranch {
  return {
    id: crypto.randomUUID(),
    label: "",
    triggerType: "wrong-arrest-fallback",
    targetPlayerId: undefined,
    storyText: "",
    personalEndingsEnabled: false,
    personalEndings: [],
    videoUrl: undefined,
    backgroundMusic: undefined,
  };
}

/** 작가 추가 설명 1개 기본값을 만든다. */
function createAuthorNote(): AuthorNote {
  return {
    id: crypto.randomUUID(),
    title: "",
    content: "",
  };
}

/** 분기 개인 엔딩 배열을 현재 플레이어 목록 기준으로 정렬한다. */
function normalizeBranchPersonalEndings(
  players: Player[],
  endings: PersonalEnding[] | undefined
): PersonalEnding[] {
  return players.map((player) => {
    const existing = endings?.find((ending) => ending.playerId === player.id);
    return existing ?? {
      playerId: player.id,
      title: "",
      text: "",
    };
  });
}

export default function EndingEditor({
  ending,
  players,
  voteQuestions,
  advancedVotingEnabled,
  onChange,
}: EndingEditorProps) {
  function updateBranch(index: number, partial: Partial<EndingBranch>) {
    onChange({
      ...ending,
      branches: ending.branches.map((branch, branchIndex) => (
        branchIndex === index ? { ...branch, ...partial } : branch
      )),
    });
  }

  function updateBranchPersonalEnding(
    branchIndex: number,
    playerId: string,
    partial: Partial<PersonalEnding>
  ) {
    const branch = ending.branches[branchIndex];
    const personalEndings = normalizeBranchPersonalEndings(players, branch?.personalEndings);

    onChange({
      ...ending,
      branches: ending.branches.map((item, index) => (
        index === branchIndex
          ? {
              ...item,
              personalEndings: personalEndings.map((personalEnding) => (
                personalEnding.playerId === playerId
                  ? { ...personalEnding, ...partial }
                  : personalEnding
              )),
            }
          : item
      )),
    });
  }

  function updateAuthorNote(index: number, partial: Partial<AuthorNote>) {
    onChange({
      ...ending,
      authorNotes: ending.authorNotes.map((note, noteIndex) => (
        noteIndex === index ? { ...note, ...partial } : note
      )),
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-dark-50">엔딩</h2>
        <p className="mt-1 text-sm text-dark-500">
          검거된 캐릭터 기준 분기 엔딩과 분기별 개인 엔딩, 작가 추가 설명을 설정합니다.
        </p>
      </div>

      <div data-maker-anchor="step-6-branches" className="rounded-xl border border-dark-700 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-dark-100">분기 엔딩</h3>
            <p className="mt-1 text-xs text-dark-500">
              공통 엔딩 없이 결과에 맞는 분기 텍스트만 바로 노출됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...ending, branches: [...ending.branches, createEndingBranch()] })}
            className="shrink-0 text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
          >
            + 분기 추가
          </button>
        </div>

        {ending.branches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-dark-700 px-4 py-5">
            <p className="text-xs text-dark-600">등록된 엔딩 분기가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {ending.branches.map((branch, index) => (
              <div key={branch.id} className="rounded-xl border border-dark-700/70 bg-dark-900/40 p-4 space-y-5">
                {(() => {
                  const branchPersonalEndings = normalizeBranchPersonalEndings(players, branch.personalEndings);

                  return (
                    <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-dark-100">
                    {branch.label || `분기 ${index + 1}`}
                  </p>
                  <button
                    type="button"
                    onClick={() => onChange({
                      ...ending,
                      branches: ending.branches.filter((_, branchIndex) => branchIndex !== index),
                    })}
                    className="text-xs text-dark-500 hover:text-red-400 transition-colors"
                  >
                    삭제
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-dark-400">분기 이름</label>
                    <input
                      type="text"
                      value={branch.label}
                      onChange={(e) => updateBranch(index, { label: e.target.value })}
                      placeholder="예: 범인 검거"
                      className={inp}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-dark-400">트리거</label>
                    <select
                      value={branch.triggerType}
                      onChange={(e) => {
                        const tt = e.target.value as EndingBranch["triggerType"];
                        updateBranch(index, {
                          triggerType: tt,
                          targetPlayerId: tt === "specific-player-arrested" ? branch.targetPlayerId : undefined,
                          targetQuestionId: tt === "custom-choice-selected" ? branch.targetQuestionId : undefined,
                          targetChoiceId: tt === "custom-choice-selected" ? branch.targetChoiceId : undefined,
                        });
                      }}
                      className={inp}
                    >
                      <option value="culprit-captured">범인 검거</option>
                      <option value="specific-player-arrested">특정 캐릭터 검거</option>
                      <option value="wrong-arrest-fallback">오검거 기본 분기</option>
                      {advancedVotingEnabled && (
                        <option value="custom-choice-selected">커스텀 선택지 결과</option>
                      )}
                    </select>
                  </div>
                </div>

                {branch.triggerType === "specific-player-arrested" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-dark-400">대상 캐릭터</label>
                    <select
                      value={branch.targetPlayerId ?? ""}
                      onChange={(e) => updateBranch(index, { targetPlayerId: e.target.value || undefined })}
                      className={inp}
                    >
                      <option value="">— 캐릭터 선택 —</option>
                      {players.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.name || "(이름 없음)"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {branch.triggerType === "custom-choice-selected" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-dark-400">투표 질문</label>
                      <select
                        value={branch.targetQuestionId ?? ""}
                        onChange={(e) => updateBranch(index, {
                          targetQuestionId: e.target.value || undefined,
                          targetChoiceId: undefined,
                        })}
                        className={inp}
                      >
                        <option value="">— 질문 선택 —</option>
                        {voteQuestions.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.label || `질문 (${q.voteRound}차)`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-dark-400">선택지 결과</label>
                      <select
                        value={branch.targetChoiceId ?? ""}
                        onChange={(e) => updateBranch(index, { targetChoiceId: e.target.value || undefined })}
                        className={inp}
                      >
                        <option value="">— 선택지 선택 —</option>
                        {(voteQuestions.find((q) => q.id === branch.targetQuestionId)?.choices ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label || "(선택지 없음)"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-dark-400">스토리 텍스트</label>
                  <textarea
                    rows={6}
                    value={branch.storyText}
                    onChange={(e) => updateBranch(index, { storyText: e.target.value })}
                    placeholder="이 분기에서 플레이어에게 보여줄 엔딩 텍스트"
                    className={ta}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-dark-400">영상 URL</label>
                    <input
                      type="url"
                      value={branch.videoUrl ?? ""}
                      onChange={(e) => updateBranch(index, { videoUrl: e.target.value || undefined })}
                      placeholder="https://..."
                      className={inp}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-dark-400">배경 음악 URL</label>
                    <input
                      type="url"
                      value={branch.backgroundMusic ?? ""}
                      onChange={(e) => updateBranch(index, { backgroundMusic: e.target.value || undefined })}
                      placeholder="https://..."
                      className={inp}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-dark-800 bg-dark-950/50 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-dark-100">개인 엔딩</h4>
                      <p className="mt-1 text-xs text-dark-500">
                        켜면 이 분기 엔딩 뒤에 플레이어가 각자 자기 화면에서 개인 엔딩을 확인합니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateBranch(index, {
                        personalEndingsEnabled: !branch.personalEndingsEnabled,
                        personalEndings: !branch.personalEndingsEnabled
                          ? branchPersonalEndings
                          : branch.personalEndings,
                      })}
                      className={[
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                        branch.personalEndingsEnabled
                          ? "border-mystery-600 bg-mystery-900/30 text-mystery-200"
                          : "border-dark-700 text-dark-500 hover:text-dark-300",
                      ].join(" ")}
                    >
                      {branch.personalEndingsEnabled ? "사용 중" : "사용 안 함"}
                    </button>
                  </div>

                  {branch.personalEndingsEnabled && (
                    <div className="space-y-4">
                      {branchPersonalEndings.map((personalEnding) => {
                        const player = players.find((item) => item.id === personalEnding.playerId);

                        return (
                          <div key={`${branch.id}-${personalEnding.playerId}`} className="rounded-xl border border-dark-700/70 bg-dark-900/40 p-4 space-y-3">
                            <p className="text-sm font-medium text-dark-100">
                              {player?.name || "(이름 없는 캐릭터)"}
                            </p>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-dark-400">제목</label>
                              <input
                                type="text"
                                value={personalEnding.title ?? ""}
                                onChange={(e) => updateBranchPersonalEnding(index, personalEnding.playerId, {
                                  title: e.target.value || undefined,
                                })}
                                placeholder="선택 사항"
                                className={inp}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-dark-400">개인 엔딩 텍스트</label>
                              <textarea
                                rows={4}
                                value={personalEnding.text}
                                onChange={(e) => updateBranchPersonalEnding(index, personalEnding.playerId, {
                                  text: e.target.value,
                                })}
                                placeholder="이 캐릭터만 확인할 개인 엔딩"
                                className={ta}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>

      <div data-maker-anchor="step-6-author-notes" className="rounded-xl border border-dark-700 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-dark-100">작가 추가 설명</h3>
            <p className="mt-1 text-xs text-dark-500">
              켜면 개인 엔딩 이후 GM 화면에서만 확인할 수 있는 정리 메모를 표시합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange({
              ...ending,
              authorNotesEnabled: !ending.authorNotesEnabled,
            })}
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
                <p className="text-xs text-dark-600">등록된 작가 추가 설명이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ending.authorNotes.map((note, index) => (
                  <div key={note.id} className="rounded-xl border border-dark-700/70 bg-dark-900/40 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-dark-100">
                        {note.title || `항목 ${index + 1}`}
                      </p>
                      <button
                        type="button"
                        onClick={() => onChange({
                          ...ending,
                          authorNotes: ending.authorNotes.filter((_, noteIndex) => noteIndex !== index),
                        })}
                        className="text-xs text-dark-500 hover:text-red-400 transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-dark-400">항목</label>
                      <input
                        type="text"
                        value={note.title}
                        onChange={(e) => updateAuthorNote(index, { title: e.target.value })}
                        placeholder="예: 진실 해설"
                        className={inp}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-dark-400">내용</label>
                      <textarea
                        rows={4}
                        value={note.content}
                        onChange={(e) => updateAuthorNote(index, { content: e.target.value })}
                        placeholder="GM 화면에서만 확인할 작가 메모"
                        className={ta}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
