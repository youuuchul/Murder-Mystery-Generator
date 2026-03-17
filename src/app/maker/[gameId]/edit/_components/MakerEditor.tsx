"use client";

import { useState, useCallback } from "react";
import StepWizard from "@/app/maker/new/_components/StepWizard";
import SettingsEditor from "./SettingsEditor";
import StoryEditor from "./StoryEditor";
import PlayerEditor from "./PlayerEditor";
import LocationEditor from "./LocationEditor";
import ScriptEditor from "./ScriptEditor";
import EndingEditor from "./EndingEditor";
import MakerAssistantDock from "./MakerAssistantDock";
import Button from "@/components/ui/Button";
import type { GamePackage } from "@/types/game";
import { validateMakerGame } from "@/lib/maker-validation";

interface MakerEditorProps {
  initialGame: GamePackage;
}

const STEP_COUNT = 6;

export default function MakerEditor({ initialGame }: MakerEditorProps) {
  const [game, setGame] = useState<GamePackage>(initialGame);
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const validation = validateMakerGame(game);

  const updateGame = useCallback((partial: Partial<GamePackage>) => {
    setGame((prev) => ({ ...prev, ...partial }));
  }, []);

  async function save(updatedGame: GamePackage = game) {
    setSaving(true);
    try {
      const res = await fetch(`/api/games/${updatedGame.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedGame),
      });
      if (res.ok) {
        const { game: saved } = await res.json();
        setGame(saved);
        setSavedAt(new Date().toLocaleTimeString("ko-KR"));
      }
    } catch (err) {
      console.error("저장 실패:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="bg-dark-900 border border-dark-800 rounded-2xl p-5">
          <StepWizard
            currentStep={currentStep}
            onStepClick={(step) => setCurrentStep(step)}
            allClickable
            stepIssues={validation.stepIssues}
          />
        </div>

        {(savedAt || validation.issues.length > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {savedAt ? <p className="text-xs text-dark-500">{savedAt} 저장됨</p> : <span />}
            {validation.issues.length > 0 && (
              <p className="text-xs text-dark-500">
                검증 힌트 {validation.issues.length}개가 단계 네비게이터에 표시됩니다.
              </p>
            )}
          </div>
        )}

        <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6 sm:p-8">
          {currentStep === 1 && (
            <SettingsEditor
              game={game}
              onChange={updateGame}
              onSave={() => save({ ...game })}
              saving={saving}
            />
          )}
          {currentStep === 2 && (
            <StoryEditor
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
              onSave={() => save({ ...game })}
              saving={saving}
            />
          )}
          {currentStep === 3 && (
            <PlayerEditor
              players={game.players ?? []}
              clues={game.clues}
              story={game.story}
              timeline={game.story.timeline}
              onChange={(players) => updateGame({ players })}
              onSave={() => save({ ...game })}
              saving={saving}
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
              onSave={() => save({ ...game })}
              saving={saving}
            />
          )}
          {currentStep === 5 && (
            <ScriptEditor
              scripts={game.scripts}
              rounds={game.rules?.roundCount ?? 4}
              locations={game.locations ?? []}
              onChange={(scripts) => updateGame({ scripts })}
              onSave={() => save({ ...game })}
              saving={saving}
            />
          )}
          {currentStep === 6 && (
            <EndingEditor
              ending={game.ending}
              players={game.players ?? []}
              onChange={(ending) => updateGame({ ending })}
              onSave={() => save({ ...game })}
              saving={saving}
            />
          )}
        </div>

        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setCurrentStep((s) => Math.max(1, s - 1))} disabled={currentStep <= 1}>
            ← 이전
          </Button>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => save()} loading={saving}>저장</Button>
            {currentStep < STEP_COUNT ? (
              <Button onClick={() => setCurrentStep((s) => s + 1)}>다음 →</Button>
            ) : (
              <Button onClick={() => save()} loading={saving}>완료 & 저장</Button>
            )}
          </div>
        </div>
      </div>

      <MakerAssistantDock
        game={game}
        currentStep={currentStep}
        validationIssueCount={validation.issues.length}
      />
    </>
  );
}
