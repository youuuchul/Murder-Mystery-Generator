"use client";

interface Step {
  id: number;
  label: string;
  description: string;
}

const STEPS: Step[] = [
  { id: 1, label: "기본 설정", description: "테마·인원·난이도·분위기" },
  { id: 2, label: "사건 개요", description: "범죄 유형·배경·동기·범인" },
  { id: 3, label: "플레이어", description: "캐릭터별 배경·비밀·알리바이" },
  { id: 4, label: "단서 카드", description: "물적 증거·증언·현장 단서" },
  { id: 5, label: "스크립트", description: "오프닝·라운드·엔딩 나레이션" },
];

interface StepWizardProps {
  currentStep: number;
  onStepClick?: (step: number) => void;
  completedSteps?: Set<number>;
  /** true이면 모든 스텝 클릭 가능 (편집 모드용) */
  allClickable?: boolean;
}

export default function StepWizard({
  currentStep,
  onStepClick,
  completedSteps = new Set(),
  allClickable = false,
}: StepWizardProps) {
  return (
    <div className="w-full">
      {/* 데스크톱: 가로 스텝 바 */}
      <div className="hidden md:flex items-start gap-0">
        {STEPS.map((step, idx) => {
          const isCompleted = completedSteps.has(step.id);
          const isCurrent = step.id === currentStep;
          const isClickable = allClickable || isCompleted || step.id <= currentStep;

          return (
            <div key={step.id} className="flex-1 flex items-start">
              {/* 스텝 아이템 */}
              <button
                onClick={() => isClickable && onStepClick?.(step.id)}
                disabled={!isClickable}
                className={[
                  "flex flex-col items-center gap-2 w-full py-3 px-2 rounded-lg transition-colors",
                  isCurrent && "bg-mystery-950/50",
                  isClickable && !isCurrent && "hover:bg-dark-800 cursor-pointer",
                  !isClickable && "cursor-default",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {/* 원형 번호 */}
                <div
                  className={[
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors",
                    isCurrent
                      ? "border-mystery-500 bg-mystery-700 text-white"
                      : isCompleted
                        ? "border-mystery-600 bg-mystery-800/50 text-mystery-300"
                        : "border-dark-600 bg-dark-800 text-dark-500",
                  ].join(" ")}
                >
                  {isCompleted && !isCurrent ? "✓" : step.id}
                </div>

                {/* 레이블 */}
                <div className="text-center">
                  <p
                    className={`text-xs font-medium ${isCurrent ? "text-mystery-300" : isCompleted ? "text-dark-300" : "text-dark-500"}`}
                  >
                    {step.label}
                  </p>
                  <p className="text-xs text-dark-600 hidden lg:block mt-0.5">
                    {step.description}
                  </p>
                </div>
              </button>

              {/* 연결선 (마지막 스텝 제외) */}
              {idx < STEPS.length - 1 && (
                <div className="flex-shrink-0 mt-7 w-8 flex items-center">
                  <div
                    className={`h-0.5 w-full ${isCompleted ? "bg-mystery-700" : "bg-dark-700"}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 모바일: 현재 단계 표시 */}
      <div className="md:hidden flex items-center justify-between px-1 py-2">
        <span className="text-sm text-dark-400">
          단계 {currentStep} / {STEPS.length}
        </span>
        <span className="text-sm font-medium text-mystery-300">
          {STEPS.find((s) => s.id === currentStep)?.label}
        </span>
        <div className="flex gap-1">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => (allClickable || s.id <= currentStep || completedSteps.has(s.id)) && onStepClick?.(s.id)}
              className={`h-1.5 w-6 rounded-full transition-colors ${
                s.id < currentStep || completedSteps.has(s.id)
                  ? "bg-mystery-600"
                  : s.id === currentStep
                    ? "bg-mystery-400"
                    : "bg-dark-700"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
