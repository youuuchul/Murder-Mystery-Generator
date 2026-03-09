"use client";

import { useState, useCallback } from "react";
import StepWizard from "@/app/maker/new/_components/StepWizard";
import SettingsEditor from "./SettingsEditor";
import StoryEditor from "./StoryEditor";
import PlayerEditor from "./PlayerEditor";
import LocationEditor from "./LocationEditor";
import ScriptEditor from "./ScriptEditor";
import Button from "@/components/ui/Button";
import type { GamePackage } from "@/types/game";

interface MakerEditorProps {
  initialGame: GamePackage;
}

const STEP_COUNT = 5;

export default function MakerEditor({ initialGame }: MakerEditorProps) {
  const [game, setGame] = useState<GamePackage>(initialGame);
  const [currentStep, setCurrentStep] = useState(1);
  // 편집 모드: 모든 스텝이 완료된 것으로 처리 (자유 이동)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const updateGame = useCallback((partial: Partial<GamePackage>) => {
    setGame((prev) => ({ ...prev, ...partial }));
  }, []);

  const markCompleted = useCallback((step: number) => {
    setCompletedSteps((prev) => new Set([...prev, step]));
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
    <div className="space-y-6">
      <div className="bg-dark-900 border border-dark-800 rounded-2xl p-5">
        <StepWizard
          currentStep={currentStep}
          completedSteps={completedSteps}
          onStepClick={(step) => setCurrentStep(step)}
          allClickable
        />
      </div>

      {savedAt && <p className="text-xs text-dark-500 text-right">{savedAt} 저장됨</p>}

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
            players={game.players ?? []}
            onChange={(story) => updateGame({ story })}
            onSave={() => save({ ...game })}
            saving={saving}
          />
        )}
        {currentStep === 3 && (
          <PlayerEditor
            players={game.players ?? []}
            clues={game.clues}
            onChange={(players) => updateGame({ players })}
            onSave={() => save({ ...game })}
            saving={saving}
          />
        )}
        {currentStep === 4 && (
          <LocationEditor
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
            onChange={(scripts) => updateGame({ scripts })}
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
            <Button onClick={() => { markCompleted(currentStep); setCurrentStep((s) => s + 1); }}>다음 →</Button>
          ) : (
            <Button onClick={() => { markCompleted(STEP_COUNT); save(); }} loading={saving}>완료 & 저장</Button>
          )}
        </div>
      </div>
    </div>
  );
}
