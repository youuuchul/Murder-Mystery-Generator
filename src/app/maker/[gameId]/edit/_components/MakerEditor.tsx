"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import StepWizard from "@/app/maker/new/_components/StepWizard";
import SettingsEditor from "./SettingsEditor";
import StoryEditor from "./StoryEditor";
import PlayerEditor from "./PlayerEditor";
import LocationEditor from "./LocationEditor";
import ScriptEditor from "./ScriptEditor";
import EndingEditor from "./EndingEditor";
import MakerAssistantDock from "./MakerAssistantDock";
import Button from "@/components/ui/Button";
import type { GamePackage, Player, Story } from "@/types/game";
import { validateMakerGame } from "@/lib/maker-validation";

interface MakerEditorProps {
  initialGame: GamePackage;
}

const STEP_COUNT = 6;

/**
 * 스텝 2/3 편집 중 삭제된 플레이어/NPC를 가리키는 관계를 자동 정리한다.
 * 사건 개요와 플레이어 탭을 오가도 참조가 깨진 관계가 저장본에 남지 않게 한다.
 */
function pruneDanglingRelationships(players: Player[], story: Story): Player[] {
  const validPlayerIds = new Set(players.map((player) => player.id));
  const validNpcIds = new Set(story.npcs.map((npc) => npc.id));

  return players.map((player) => ({
    ...player,
    relationships: player.relationships.filter((relationship) => {
      const targetType = relationship.targetType ?? "player";
      const targetId = relationship.targetId || relationship.playerId || "";

      if (targetType === "victim") {
        return targetId === "victim";
      }

      if (targetType === "npc") {
        return validNpcIds.has(targetId);
      }

      return targetId !== player.id && validPlayerIds.has(targetId);
    }).map((relationship) => {
      const targetType = relationship.targetType ?? "player";
      const targetId = relationship.targetId || relationship.playerId || "";
      return {
        ...relationship,
        targetType,
        targetId,
        playerId: targetType === "player" ? targetId : undefined,
      };
    }),
  }));
}

export default function MakerEditor({ initialGame }: MakerEditorProps) {
  const editVersionRef = useRef(0);
  const actionBarRef = useRef<HTMLDivElement | null>(null);
  const [game, setGame] = useState<GamePackage>(initialGame);
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [assistantLauncherBottomOffset, setAssistantLauncherBottomOffset] = useState(120);
  const validation = validateMakerGame(game);

  const updateGame = useCallback((partial: Partial<GamePackage>) => {
    setGame((prev) => {
      const next = { ...prev, ...partial };

      if (partial.story || partial.players) {
        next.players = pruneDanglingRelationships(next.players ?? [], next.story);
      }

      return next;
    });
    editVersionRef.current += 1;
    setHasUnsavedChanges(true);
    setSaveError(null);
  }, []);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasUnsavedChanges) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const actionBar = actionBarRef.current;
    if (!actionBar) {
      return;
    }

    /**
     * 모바일에서 AI 런처가 하단 액션바와 겹치지 않도록
     * 현재 액션바 높이를 기준으로 런처의 bottom offset을 계산한다.
     */
    function updateLauncherOffset() {
      const currentActionBar = actionBarRef.current;
      if (!currentActionBar) {
        return;
      }

      const height = Math.ceil(currentActionBar.getBoundingClientRect().height);
      setAssistantLauncherBottomOffset(height + 24);
    }

    updateLauncherOffset();

    const observer = new ResizeObserver(() => {
      updateLauncherOffset();
    });

    observer.observe(actionBar);
    window.addEventListener("resize", updateLauncherOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateLauncherOffset);
    };
  }, []);

  async function save(updatedGame: GamePackage = game): Promise<boolean> {
    if (saving) {
      return false;
    }

    const requestedEditVersion = editVersionRef.current;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/games/${updatedGame.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedGame),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "저장에 실패했습니다." }));
        setSaveError(data.error ?? "저장에 실패했습니다.");
        return false;
      }

      const { game: saved } = await res.json();
      if (editVersionRef.current === requestedEditVersion) {
        setGame(saved);
        setHasUnsavedChanges(false);
      }
      setSavedAt(new Date().toLocaleTimeString("ko-KR"));
      return true;
    } catch (err) {
      console.error("저장 실패:", err);
      setSaveError("저장 중 오류가 발생했습니다.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function moveToStep(step: number) {
    if (step === currentStep || saving) {
      return;
    }

    if (hasUnsavedChanges) {
      const saved = await save();
      if (!saved) {
        return;
      }
    }

    setCurrentStep(step);
  }

  const saveHeadline = saving
    ? "저장 중..."
    : saveError
      ? "저장 실패"
      : hasUnsavedChanges
        ? "저장되지 않은 변경 있음"
        : savedAt
          ? `${savedAt} 저장 완료`
          : "편집 준비 완료";

  const saveHint = saving
    ? "현재 스텝 변경사항을 서버에 기록하고 있습니다."
    : saveError
      ? saveError
      : hasUnsavedChanges
        ? "스텝 이동 시 현재 내용부터 먼저 저장합니다."
        : "현재 화면의 변경사항이 모두 저장된 상태입니다.";

  const saveButtonLabel = hasUnsavedChanges ? "지금 저장" : "저장 완료";

  return (
    <>
      <div className="space-y-6">
        <div className="bg-dark-900 border border-dark-800 rounded-2xl p-5">
          <StepWizard
            currentStep={currentStep}
            onStepClick={(step) => { void moveToStep(step); }}
            allClickable
            stepIssues={validation.stepIssues}
          />
        </div>

        {validation.issues.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-dark-500">
              검증 힌트 {validation.issues.length}개가 단계 네비게이터에 표시됩니다.
            </p>
          </div>
        )}

        <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6 sm:p-8">
          {currentStep === 1 && (
            <SettingsEditor
              game={game}
              onChange={updateGame}
            />
          )}
          {currentStep === 2 && (
            <StoryEditor
              gameId={game.id}
              story={game.story}
              opening={game.scripts.opening}
              players={game.players ?? []}
              onChangeStory={(story) => updateGame({ story })}
              onChangeOpening={(opening) => updateGame({
                scripts: {
                  ...game.scripts,
                  opening,
                },
              })}
            />
          )}
          {currentStep === 3 && (
            <PlayerEditor
              gameId={game.id}
              players={game.players ?? []}
              clues={game.clues}
              story={game.story}
              timeline={game.story.timeline}
              onChange={(players) => updateGame({ players })}
            />
          )}
          {currentStep === 4 && (
            <LocationEditor
              gameId={game.id}
              locations={game.locations ?? []}
              clues={game.clues}
              characters={game.players ?? []}
              rules={game.rules}
              onChangeLocations={(locations) => updateGame({ locations })}
              onChangeClues={(clues) => updateGame({ clues })}
              onChangeRules={(rules) => updateGame({ rules })}
            />
          )}
          {currentStep === 5 && (
            <ScriptEditor
              scripts={game.scripts}
              rounds={game.rules?.roundCount ?? 4}
              locations={game.locations ?? []}
              onChange={(scripts) => updateGame({ scripts })}
            />
          )}
          {currentStep === 6 && (
            <EndingEditor
              ending={game.ending}
              players={game.players ?? []}
              onChange={(ending) => updateGame({ ending })}
            />
          )}
        </div>

        <div ref={actionBarRef} className="sticky bottom-4 z-10">
          <div className="flex flex-col gap-4 rounded-2xl border border-dark-700 bg-dark-950/95 px-5 py-4 shadow-2xl shadow-black/30 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className={`text-sm font-medium ${
                saveError
                  ? "text-red-300"
                  : hasUnsavedChanges
                    ? "text-yellow-300"
                    : "text-emerald-300"
              }`}>
                {saveHeadline}
              </p>
              <p className="mt-1 text-xs text-dark-500">{saveHint}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => { void moveToStep(Math.max(1, currentStep - 1)); }}
                disabled={currentStep <= 1 || saving}
              >
                ← 이전
              </Button>
              {currentStep < STEP_COUNT ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => { void save(); }}
                    loading={saving}
                    disabled={saving || !hasUnsavedChanges}
                  >
                    {saveButtonLabel}
                  </Button>
                  <Button onClick={() => { void moveToStep(currentStep + 1); }} disabled={saving}>
                    다음 →
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => { void save(); }}
                  loading={saving}
                  disabled={saving || !hasUnsavedChanges}
                >
                  {hasUnsavedChanges ? "최종 저장" : "최종 저장 완료"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <MakerAssistantDock
        game={game}
        currentStep={currentStep}
        validationIssueCount={validation.issues.length}
        launcherBottomOffset={assistantLauncherBottomOffset}
      />
    </>
  );
}
