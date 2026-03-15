"use client";

import type { GamePackage } from "@/types/game";
import MakerAssistantDrawer from "./MakerAssistantDrawer";
import MakerAssistantLauncher from "./MakerAssistantLauncher";
import useMakerAssistant from "./useMakerAssistant";

interface MakerAssistantDockProps {
  game: GamePackage;
  currentStep: number;
  validationIssueCount: number;
}

export default function MakerAssistantDock({
  game,
  currentStep,
  validationIssueCount,
}: MakerAssistantDockProps) {
  const assistant = useMakerAssistant({ game, currentStep });

  return (
    <>
      <MakerAssistantLauncher
        open={assistant.open}
        pending={assistant.pending}
        onClick={() => assistant.setOpen(true)}
      />
      <MakerAssistantDrawer
        open={assistant.open}
        pending={assistant.pending}
        gameTitle={game.title}
        currentStep={currentStep}
        validationIssueCount={validationIssueCount}
        draft={assistant.draft}
        error={assistant.error}
        messages={assistant.messages}
        onClose={() => assistant.setOpen(false)}
        onDraftChange={assistant.setDraft}
        onQuickAction={assistant.runQuickAction}
        onSend={assistant.sendChat}
        onReset={assistant.resetConversation}
      />
    </>
  );
}
