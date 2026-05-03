"use client";

import { startTransition, useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { isCulpritIdValid } from "@/lib/culprit";
import StepWizard from "@/app/maker/new/_components/StepWizard";
import SettingsEditor from "./SettingsEditor";
import Step2Editor from "./Step2Editor";
import PlayerEditor from "./PlayerEditor";
import LocationEditor from "./LocationEditor";
import VoteEndingEditor from "./VoteEndingEditor";
import MakerAssistantDock from "./MakerAssistantDock";
import Button from "@/components/ui/Button";
import type { GamePackage, Player, Story } from "@/types/game";
import { validateMakerGame } from "@/lib/maker-validation";

interface MakerEditorProps {
  initialGame: GamePackage;
}

const STEP_COUNT = 5;
const ACTION_BAR_POS_STORAGE_KEY = "maker-editor-actionbar-pos-v1";
const VIEWPORT_MARGIN = 12;
/** AI 런처 버튼 예상 높이 (텍스트 2줄 + 패딩). 콘텐츠 하단 여백 계산용. */
const LAUNCHER_HEIGHT_ESTIMATE = 48;

type BarPosition = { x: number; y: number };

function clampPositionToViewport(pos: BarPosition, width: number, height: number): BarPosition {
  if (typeof window === "undefined") return pos;
  const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
  return {
    x: Math.min(Math.max(VIEWPORT_MARGIN, pos.x), maxX),
    y: Math.min(Math.max(VIEWPORT_MARGIN, pos.y), maxY),
  };
}

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
  const router = useRouter();
  const editVersionRef = useRef(0);
  const hasUnsavedRef = useRef(false);
  const actionBarRef = useRef<HTMLDivElement | null>(null);
  const validationPanelRef = useRef<HTMLDivElement | null>(null);
  const [game, setGame] = useState<GamePackage>(initialGame);
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [assistantLauncherBottomOffset, setAssistantLauncherBottomOffset] = useState(24);
  const [barPosition, setBarPosition] = useState<BarPosition | null>(null);
  const [barHeight, setBarHeight] = useState<number>(80);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const validation = validateMakerGame(game);
  const currentStepIssues = validation.stepIssues[currentStep] ?? [];
  const currentStepErrorIssues = currentStepIssues.filter((issue) => issue.level === "error");
  const currentStepWarningIssues = currentStepIssues.filter((issue) => issue.level === "warning");
  const validationErrorCount = validation.issues.filter((issue) => issue.level === "error").length;
  const validationWarningCount = validation.issues.length - validationErrorCount;

  /**
   * validation panel 변동에 따른 scroll 보정은 자식 editor의 `captureScrollAnchor`가 담당한다.
   * 자식이 클릭한 button 위치를 viewport에 고정하면 panel 추가/제거에 따른 scroll 변동도 함께 보존됨.
   * 부모에서 panel height 기반으로 추가 보정을 하면 자식 보정과 합쳐져 overshoot(이중 보정)이 발생해
   * button이 viewport 밖으로 밀려나는 문제가 있었음. 부모 보정은 제거하고 자식에만 책임을 둔다.
   * (`overflow-anchor: none`은 보조로 panel에 명시되어 있음.)
   */

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

  // ref를 state와 동기화 (이벤트 핸들러에서 최신 값 참조용)
  useEffect(() => {
    hasUnsavedRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  // 브라우저 닫기/새로고침 시 경고
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

  // 클라이언트 네비게이션 (Link 클릭) 가드 — 미저장 변경 시 confirm 경고
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!hasUnsavedRef.current) return;

      const anchor = (event.target as HTMLElement).closest("a[href]");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript")) return;

      // 현재 편집 페이지 내부 앵커는 무시
      if (href.includes(`/maker/${initialGame.id}/edit`)) return;

      // eslint-disable-next-line no-restricted-globals
      if (!confirm("저장하지 않은 변경사항이 있습니다. 페이지를 떠나시겠습니까?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [initialGame.id]);

  /**
   * 액션바 초기 위치 복원/계산:
   * - 마지막에 저장된 위치가 있으면 복원, 없으면 화면 하단 중앙.
   * - 첫 렌더 직후 실제 크기가 잡힌 뒤 한 번 세팅한다.
   */
  useEffect(() => {
    const bar = actionBarRef.current;
    if (!bar || barPosition) {
      return;
    }

    const width = bar.offsetWidth;
    const height = bar.offsetHeight;
    if (!width || !height) {
      return;
    }

    const saved = window.localStorage.getItem(ACTION_BAR_POS_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as BarPosition;
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
          setBarPosition(clampPositionToViewport(parsed, width, height));
          return;
        }
      } catch {
        // 잘못된 저장값은 무시
      }
    }

    setBarPosition(
      clampPositionToViewport(
        {
          x: Math.round((window.innerWidth - width) / 2),
          y: window.innerHeight - height - 24,
        },
        width,
        height,
      ),
    );
  }, [barPosition]);

  /** 창 크기 변경 시 액션바가 뷰포트 밖으로 나가지 않도록 clamp. */
  useEffect(() => {
    function handleResize() {
      const bar = actionBarRef.current;
      if (!bar) return;
      setBarPosition((prev) =>
        prev ? clampPositionToViewport(prev, bar.offsetWidth, bar.offsetHeight) : prev,
      );
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /** 액션바 높이를 추적해 콘텐츠 하단 패딩에 사용. 바가 콘텐츠를 가리지 않도록 여백을 확보한다. */
  useEffect(() => {
    const bar = actionBarRef.current;
    if (!bar) return;
    const update = () => {
      const nextHeight = bar.offsetHeight;
      if (nextHeight > 0) setBarHeight(nextHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  /**
   * AI 런처(우측 하단 고정)와 플로팅 액션바가 겹치는지 계산해,
   * 겹치면 런처를 액션바 위로 밀어 올린다. 평소엔 기본 위치(24px) 유지.
   */
  useEffect(() => {
    function updateLauncherOffset() {
      const bar = actionBarRef.current;
      if (!bar || !barPosition) {
        setAssistantLauncherBottomOffset(24);
        return;
      }
      const rect = bar.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // 런처 footprint 추정: 우측 여백 16, 폭 240, 기본 높이 72, 아래 여백 24.
      const launcherLeft = vw - 256;
      const launcherRight = vw - 12;
      const launcherTop = vh - 120;
      const launcherBottom = vh - 12;

      const overlaps =
        rect.left < launcherRight &&
        rect.right > launcherLeft &&
        rect.top < launcherBottom &&
        rect.bottom > launcherTop;

      if (overlaps) {
        const desired = Math.max(24, vh - rect.top + 12);
        setAssistantLauncherBottomOffset(desired);
      } else {
        setAssistantLauncherBottomOffset(24);
      }
    }

    updateLauncherOffset();

    const bar = actionBarRef.current;
    const observer = bar ? new ResizeObserver(updateLauncherOffset) : null;
    if (bar && observer) observer.observe(bar);
    window.addEventListener("resize", updateLauncherOffset);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateLauncherOffset);
    };
  }, [barPosition]);

  /** 드래그 시작/중/종료. 드래그 종료 시 localStorage에 위치를 저장한다. */
  const handleBarDragStart = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const bar = actionBarRef.current;
    if (!bar || !barPosition) return;
    event.preventDefault();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origX: barPosition.x,
      origY: barPosition.y,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // setPointerCapture 미지원 환경은 무시
    }
  }, [barPosition]);

  const handleBarDragMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bar = actionBarRef.current;
    if (!bar) return;
    const next = clampPositionToViewport(
      { x: drag.origX + (event.clientX - drag.startX), y: drag.origY + (event.clientY - drag.startY) },
      bar.offsetWidth,
      bar.offsetHeight,
    );
    setBarPosition(next);
  }, []);

  const handleBarDragEnd = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 무시
    }
    if (barPosition) {
      try {
        window.localStorage.setItem(ACTION_BAR_POS_STORAGE_KEY, JSON.stringify(barPosition));
      } catch {
        // 쿼터 초과 등은 무시
      }
    }
  }, [barPosition]);

  // "위치 보기" 버튼은 정밀도 부족(같은 step 영역으로만 이동)으로 폐기됨(2026-05-03).
  // issue 메시지 자체에 식별 정보를 담는 방식으로 전환. anchor 시스템(data-maker-anchor /
  // focusTarget prop)도 함께 정리됨. 메이커는 step 배지로 1차 알림 + panel 메시지로 항목을 직접 식별한다.

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

      const responseData = await res.json();
      const saved = responseData?.game;

      if (!saved || !saved.id) {
        setSaveError("저장은 완료됐으나 서버 응답이 비어 있습니다. 페이지를 새로고침해 주세요.");
        return false;
      }

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

  function moveToStep(step: number) {
    if (step === currentStep) {
      return;
    }

    startTransition(() => {
      setCurrentStep(step);
    });
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
    ? "변경사항을 서버에 저장하고 있습니다."
    : saveError
      ? saveError
      : hasUnsavedChanges
        ? "탭 이동은 자유롭게 할 수 있습니다. 페이지를 떠나기 전 저장하세요."
        : "현재 화면의 변경사항이 모두 저장된 상태입니다.";

  const saveButtonLabel = hasUnsavedChanges ? "지금 저장" : "저장 완료";

  return (
    <>
      <div
        className="space-y-6"
        style={{
          /**
           * 액션바가 하단에 있으면서 AI 런처와 스택될 때(런처가 바 위로 밀려 올라감)의 최악 케이스까지
           * 커버하도록 여백을 잡는다: 액션바 높이 + 런처 높이 + 여백.
           */
          paddingBottom: `${barHeight + LAUNCHER_HEIGHT_ESTIMATE + 16}px`,
        }}
      >
        <div className="rounded-2xl border border-dark-700/80 bg-[linear-gradient(180deg,rgba(42,46,47,0.62),rgba(23,15,18,0.9))] p-5 shadow-[0_18px_40px_rgba(23,15,18,0.35)]">
          <StepWizard
            currentStep={currentStep}
            onStepClick={(step) => { void moveToStep(step); }}
            allClickable
            stepIssues={validation.stepIssues}
          />
        </div>

        <div className="rounded-2xl border border-dark-700/80 bg-[linear-gradient(180deg,rgba(42,46,47,0.68),rgba(23,15,18,0.94))] p-6 shadow-[0_20px_48px_rgba(23,15,18,0.4)] sm:p-8">

          {/* validation 카운트 + 현재 step 확인 항목 panel.
              wrapper 안 첫 줄에 둠. panel이 동적으로 추가/제거되어도 wrapper 위 layout(step 네비)은
              안정. 메이커는 step 진입 시 panel + 위치 보기 버튼을 한 화면에서 본다. */}
          {validation.issues.length > 0 && (
            <p className="mb-3 text-xs text-dark-500" style={{ overflowAnchor: "none" }}>
              필수 {validationErrorCount}개
              {validationWarningCount > 0 ? ` · 권장 ${validationWarningCount}개` : ""}
            </p>
          )}
          {currentStepIssues.length > 0 && (
            <div
              ref={validationPanelRef}
              className={`mb-6 rounded-2xl border px-5 py-4 ${
                currentStepErrorIssues.length > 0
                  ? "border-red-900/70 bg-red-950/20"
                  : "border-yellow-900/70 bg-yellow-950/20"
              }`}
              /**
               * scroll anchoring에서 panel 자체를 제외한다.
               * panel이 추가/제거될 때 브라우저가 panel "다음" element(편집 폼 등)를 anchor로 잡아
               * scroll 위치를 자동 보존 → 토글/버튼 클릭 시 화면이 튀는 현상 차단.
               * 적용 범위: Step 1~5 모두 (panel은 모든 step 공용).
               */
              style={{ overflowAnchor: "none" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-dark-50">Step {currentStep} 확인 항목</p>
                  <p className="mt-1 text-xs text-dark-400">
                    필수 {currentStepErrorIssues.length}개
                    {currentStepWarningIssues.length > 0 ? ` · 권장 ${currentStepWarningIssues.length}개` : ""}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {currentStepIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className="rounded-xl border border-dark-700/80 bg-dark-950/40 px-3 py-3"
                  >
                    <p
                      className={`text-[11px] font-medium uppercase tracking-[0.18em] ${
                        issue.level === "error" ? "text-red-300" : "text-yellow-300"
                      }`}
                    >
                      {issue.level === "error" ? "필수 입력 필요" : "보완 권장"}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-dark-100">{issue.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <SettingsEditor
              game={game}
              onChange={updateGame}
            />
          )}
          {currentStep === 2 && (
            <Step2Editor
              gameId={game.id}
              story={game.story}
              scripts={game.scripts}
              rules={game.rules}
              locations={game.locations ?? []}
              onChangeStory={(story) => updateGame({ story })}
              onChangeScripts={(scripts) => updateGame({ scripts })}
              onChangeRules={(rules) => updateGame({ rules })}
            />
          )}
          {currentStep === 3 && (
            <PlayerEditor
              gameId={game.id}
              players={game.players ?? []}
              clues={game.clues}
              locations={game.locations ?? []}
              story={game.story}
              timeline={game.story.timeline}
              voteQuestions={game.voteQuestions ?? []}
              onChange={(players) => {
                /**
                 * 플레이어 목록이 바뀐 뒤 범인이 여전히 유효한지 확인.
                 * - 플레이어 범인이 삭제되면 클리어한다.
                 * - 피해자/NPC 범인은 이 콜백과 무관하므로 그대로 둔다.
                 */
                const culpritStillValid = isCulpritIdValid(
                  game.story.culpritPlayerId,
                  players,
                  game.story,
                );
                updateGame({
                  players,
                  story: culpritStillValid
                    ? game.story
                    : { ...game.story, culpritPlayerId: "" },
                });
              }}
              onChangeTimeline={(timeline) => updateGame({
                story: {
                  ...game.story,
                  timeline,
                },
              })}
              onChangeVoteQuestions={(voteQuestions) => updateGame({ voteQuestions })}
              onJumpToCulpritStep={() => { void moveToStep(5); }}
              scoringEnabled={game.rules?.scoringEnabled ?? true}
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
            <VoteEndingEditor
              game={game}
              onUpdate={updateGame}
            />
          )}
        </div>

      </div>

      <div
        ref={actionBarRef}
        style={{
          position: "fixed",
          left: barPosition ? `${barPosition.x}px` : "-9999px",
          top: barPosition ? `${barPosition.y}px` : "-9999px",
          visibility: barPosition ? "visible" : "hidden",
          maxWidth: "min(720px, calc(100vw - 24px))",
        }}
        className="z-30"
      >
        <div className="flex items-stretch gap-2 rounded-2xl border border-dark-600 bg-[linear-gradient(180deg,rgba(23,15,18,0.95),rgba(42,46,47,0.82))] px-3 py-3 shadow-[0_20px_48px_rgba(23,15,18,0.55)] backdrop-blur-xl sm:gap-3 sm:px-4">
          <button
            type="button"
            onPointerDown={handleBarDragStart}
            onPointerMove={handleBarDragMove}
            onPointerUp={handleBarDragEnd}
            onPointerCancel={handleBarDragEnd}
            className="flex w-6 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-lg text-dark-500 hover:bg-dark-800/60 hover:text-dark-200 active:cursor-grabbing"
            aria-label="도구막대 위치 이동"
            title="드래그해서 위치 이동"
          >
            <span aria-hidden className="text-xs leading-none tracking-tighter">⋮⋮</span>
          </button>

          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <p className={`truncate text-sm font-medium ${
              saveError
                ? "text-red-300"
                : hasUnsavedChanges
                  ? "text-yellow-300"
                  : "text-sage-300"
            }`}>
              {saveHeadline}
            </p>
            <p className="mt-0.5 hidden truncate text-xs text-dark-500 sm:block">{saveHint}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { void moveToStep(Math.max(1, currentStep - 1)); }}
              disabled={currentStep <= 1}
            >
              ← 이전
            </Button>
            {currentStep < STEP_COUNT ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { void save(); }}
                  loading={saving}
                  disabled={saving || !hasUnsavedChanges}
                >
                  {saveButtonLabel}
                </Button>
                <Button
                  size="sm"
                  onClick={() => { void moveToStep(currentStep + 1); }}
                >
                  다음 →
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
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

      <MakerAssistantDock
        game={game}
        currentStep={currentStep}
        validationIssueCount={validation.issues.length}
        launcherBottomOffset={assistantLauncherBottomOffset}
      />
    </>
  );
}
