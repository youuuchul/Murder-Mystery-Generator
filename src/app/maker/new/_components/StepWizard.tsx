"use client";

import type { MakerValidationIssue } from "@/lib/maker-validation";
import { getHighestValidationLevel } from "@/lib/maker-validation";

interface Step {
  id: number;
  label: string;
  description: string;
}

const STEPS: Step[] = [
  { id: 1, label: "기본 설정", description: "표지·기본 규칙·시간" },
  { id: 2, label: "사건 개요", description: "오프닝·NPC·미디어" },
  { id: 3, label: "플레이어", description: "캐릭터 정보·타임라인·AI 페르소나" },
  { id: 4, label: "단서 카드", description: "장소 설정·단서 배치" },
  { id: 5, label: "투표 & 엔딩", description: "범인·분기·작가 후기" },
];

interface StepWizardProps {
  currentStep: number;
  onStepClick?: (step: number) => void;
  /** true이면 모든 스텝 클릭 가능 (편집 모드용) */
  allClickable?: boolean;
  stepIssues?: Record<number, MakerValidationIssue[]>;
}

export default function StepWizard({
  currentStep,
  onStepClick,
  allClickable = false,
  stepIssues = {},
}: StepWizardProps) {
  const currentStepIssues = stepIssues[currentStep] ?? [];

  return (
    <div className="w-full">
      {/* 데스크톱: 가로 스텝 바 */}
      <div className="hidden md:flex items-start gap-0">
        {STEPS.map((step, idx) => {
          const isCurrent = step.id === currentStep;
          const isPast = step.id < currentStep;
          const isClickable = allClickable || step.id <= currentStep;
          const issues = stepIssues[step.id] ?? [];
          const highestLevel = getHighestValidationLevel(issues);
          const issueBadgeClass =
            highestLevel === "error"
              ? "border-red-800 bg-red-950/30 text-red-300"
              : "border-yellow-800 bg-yellow-950/30 text-yellow-300";
          const tooltip = buildIssueTooltip(step, issues);

          return (
            <div key={step.id} className="flex-1 flex items-start">
              {/* 스텝 아이템 */}
              <button
                onClick={() => isClickable && onStepClick?.(step.id)}
                disabled={!isClickable}
                title={tooltip}
                className={[
                  "flex flex-col items-center gap-2 w-full py-3 px-2 rounded-lg transition-colors",
                  isCurrent && "bg-[rgba(23,15,18,0.92)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
                  isClickable && !isCurrent && "hover:bg-dark-800/70 cursor-pointer",
                  !isClickable && "cursor-default",
                  highestLevel === "error" && isCurrent && "ring-1 ring-red-700/70",
                  highestLevel === "warning" && isCurrent && "ring-1 ring-yellow-700/60",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {/* 원형 번호 */}
                <div
                  className={[
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors",
                    isCurrent
                      ? "border-dark-500 bg-dark-900 text-dark-50"
                      : isPast
                        ? "border-sage-700 bg-sage-900/25 text-sage-300"
                        : highestLevel === "error"
                          ? "border-red-800 bg-red-950/20 text-red-300"
                          : highestLevel === "warning"
                            ? "border-yellow-800 bg-yellow-950/20 text-yellow-300"
                            : "border-dark-600 bg-dark-800 text-dark-500",
                  ].join(" ")}
                >
                  {step.id}
                </div>

                {/* 레이블 */}
                <div className="text-center">
                  <p
                    className={`text-xs font-medium ${
                      isCurrent
                        ? "text-dark-100"
                        : highestLevel === "error"
                          ? "text-red-300"
                          : highestLevel === "warning"
                            ? "text-yellow-300"
                            : isPast
                              ? "text-sage-300"
                              : "text-dark-500"
                    }`}
                  >
                    {step.label}
                  </p>
                  <p className="text-xs text-dark-600 hidden lg:block mt-0.5">
                    {step.description}
                  </p>
                  {issues.length > 0 && (
                    <span
                      className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${issueBadgeClass}`}
                    >
                      {highestLevel === "error" ? `확인 ${issues.length}` : `주의 ${issues.length}`}
                    </span>
                  )}
                </div>
              </button>

              {/* 연결선 (마지막 스텝 제외) */}
              {idx < STEPS.length - 1 && (
                <div className="flex-shrink-0 mt-7 w-8 flex items-center">
                  <div
                    className={`h-0.5 w-full ${isPast ? "bg-sage-700/70" : "bg-dark-700"}`}
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
        <span className="text-sm font-medium text-dark-100">
          {STEPS.find((s) => s.id === currentStep)?.label}
        </span>
        <div className="flex gap-1">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => (allClickable || s.id <= currentStep) && onStepClick?.(s.id)}
              title={buildIssueTooltip(s, stepIssues[s.id] ?? [])}
              className={`h-1.5 w-6 rounded-full transition-colors ${
                (stepIssues[s.id] ?? []).some((issue) => issue.level === "error")
                  ? "bg-red-500"
                  : (stepIssues[s.id] ?? []).length > 0
                    ? "bg-yellow-500"
                    : s.id < currentStep
                  ? "bg-sage-600"
                  : s.id === currentStep
                    ? "bg-dark-200"
                    : "bg-dark-700"
              }`}
            />
          ))}
        </div>
      </div>

      {/* 현재 단계 issue 상세는 MakerEditor 안의 "Step N 확인 항목" 카드(위치 보기 버튼 포함)가 단일 진실로 처리.
          여기 중복 panel은 폐기(2026-05-03). step 배지 라벨 ("주의 N" / "확인 N")로 1차 알림만 유지. */}
    </div>
  );
}

/**
 * 스텝 버튼의 기본 툴팁 문구를 만든다.
 * 검증 이슈가 있으면 한 줄씩 이어붙여 마우스오버 힌트로 사용한다.
 */
function buildIssueTooltip(step: Step, issues: MakerValidationIssue[]): string | undefined {
  if (issues.length === 0) {
    return undefined;
  }

  return [`${step.label} 확인 항목`, ...issues.map((issue) => `- ${issue.message}`)].join("\n");
}
