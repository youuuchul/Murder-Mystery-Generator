"use client";

interface MakerAssistantLauncherProps {
  open: boolean;
  pending: boolean;
  launcherBottomOffset: number;
  onClick: () => void;
}

export default function MakerAssistantLauncher({
  open,
  pending,
  launcherBottomOffset,
  onClick,
}: MakerAssistantLauncherProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ["--maker-assistant-bottom" as string]:
          `calc(env(safe-area-inset-bottom, 0px) + ${launcherBottomOffset}px)`,
      }}
      className={[
        "fixed bottom-[var(--maker-assistant-bottom)] right-4 z-30 flex items-center gap-3 rounded-full border px-4 py-3 shadow-2xl transition-all",
        "backdrop-blur-md sm:right-6",
        open
          ? "pointer-events-none translate-y-3 opacity-0"
          : "border-mystery-700 bg-[linear-gradient(135deg,rgba(105,41,122,0.95),rgba(31,41,55,0.95))] text-white hover:border-mystery-500 hover:shadow-mystery-950/50",
      ].join(" ")}
      aria-label="제작 도우미 열기"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-base">
        AI
      </span>
      <span className="text-left">
        <span className="block text-sm font-semibold">제작 도우미</span>
        <span className="block text-[11px] text-white/70">
          {pending ? "응답 생성 중" : "초안 작성 · 점검 · 제안"}
        </span>
      </span>
    </button>
  );
}
