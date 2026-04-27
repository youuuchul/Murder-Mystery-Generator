"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { isCulpritIdValid } from "@/lib/culprit";
import StepWizard from "@/app/maker/new/_components/StepWizard";
import SettingsEditor from "./SettingsEditor";
import StoryEditor from "./StoryEditor";
import PlayerEditor from "./PlayerEditor";
import LocationEditor from "./LocationEditor";
import ScriptEditor from "./ScriptEditor";
import VoteEndingEditor from "./VoteEndingEditor";
import MakerAssistantDock from "./MakerAssistantDock";
import Button from "@/components/ui/Button";
import type { GamePackage, Player, Story } from "@/types/game";
import {
  validateMakerGame,
  type MakerValidationIssue,
} from "@/lib/maker-validation";

interface MakerEditorProps {
  initialGame: GamePackage;
}

const STEP_COUNT = 6;
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
  const [focusRequest, setFocusRequest] = useState<{ target: string | null; token: number }>({
    target: null,
    token: 0,
  });
  const validation = validateMakerGame(game);
  const currentStepIssues = validation.stepIssues[currentStep] ?? [];
  const currentStepErrorIssues = currentStepIssues.filter((issue) => issue.level === "error");
  const currentStepWarningIssues = currentStepIssues.filter((issue) => issue.level === "warning");

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

  /**
   * 검증 이슈 문구를 현재 편집기 내부 섹션 anchor로 매핑한다.
   * 완전히 일치하는 필드가 없더라도 사용자가 가장 빨리 수정할 수 있는 블록으로 이동시키는 목적이다.
   */
  function getValidationAnchor(issue: MakerValidationIssue): string | null {
    const { step, message } = issue;

    if (step === 1) {
      if (message.includes("시나리오 제목")) return "step-1-title";
      if (message.includes("태그")) return "step-1-tags";
      if (message.includes("소개글")) return "step-1-summary";
      if (message.includes("플레이어 수") || message.includes("등록 캐릭터")) return "step-1-player-count";
      return "step-1-title";
    }

    if (step === 2) {
      if (message.includes("오프닝 스토리")) return "step-2-opening";
      if (message.includes("피해자")) return "step-2-victim";
      if (message.includes("NPC")) return "step-2-npcs";
      return "step-2-opening";
    }

    if (step === 3) {
      if (message.includes("범인")) return "step-3-culprit";
      if (message.includes("타임라인") || message.includes("시간대 슬롯")) return "step-3-timeline";
      return "step-3-players";
    }

    if (step === 4) {
      if (message.includes("단서")) return "step-4-clues";
      return "step-4-locations";
    }

    if (step === 5) {
      if (message.includes("투표")) return "step-5-vote";
      return "step-5-rounds";
    }

    if (step === 6) {
      if (message.includes("작가 추가 설명")) return "step-6-author-notes";
      return "step-6-branches";
    }

    return null;
  }

  /**
   * 현재 스텝의 검증 이슈 위치로 이동한다.
   * 탭 전환이 필요한 컴포넌트도 있어 한 번 더 지연 호출해 DOM이 바뀐 뒤 다시 스크롤한다.
   */
  function focusValidationIssue(issue: MakerValidationIssue) {
    const target = getValidationAnchor(issue);
    setFocusRequest((prev) => ({
      target,
      token: prev.token + 1,
    }));

    const runScroll = () => {
      const anchor = target
        ? document.querySelector<HTMLElement>(`[data-maker-anchor="${target}"]`)
        : validationPanelRef.current;

      if (!anchor) {
        return;
      }

      const top = Math.max(anchor.getBoundingClientRect().top + window.scrollY - 20, 0);
      window.scrollTo({ top, behavior: "smooth" });
    };

    window.requestAnimationFrame(runScroll);
    window.setTimeout(runScroll, 180);
  }

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

        {validation.issues.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-dark-500">
              검증 힌트 {validation.issues.length}개가 단계 네비게이터에 표시됩니다.
            </p>
          </div>
        )}

        {currentStepIssues.length > 0 && (
          <div
            ref={validationPanelRef}
            className={`rounded-2xl border px-5 py-4 ${
              currentStepErrorIssues.length > 0
                ? "border-red-900/70 bg-red-950/20"
                : "border-yellow-900/70 bg-yellow-950/20"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-dark-50">Step {currentStep} 확인 항목</p>
                <p className="mt-1 text-xs text-dark-400">
                  에러 {currentStepErrorIssues.length}개
                  {currentStepWarningIssues.length > 0 ? ` · 경고 ${currentStepWarningIssues.length}개` : ""}
                  {" · "}에러는 우선 수정이 필요한 항목이고, 경고는 보완 권장 항목입니다.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {currentStepIssues.map((issue, index) => (
                <button
                  key={`${issue.step}-${issue.level}-${index}`}
                  type="button"
                  onClick={() => focusValidationIssue(issue)}
                  className="flex w-full items-start justify-between gap-3 rounded-xl border border-dark-700/80 bg-dark-950/40 px-3 py-3 text-left transition-colors hover:border-dark-500 hover:bg-dark-900/70"
                >
                  <div className="min-w-0">
                    <p
                      className={`text-[11px] font-medium uppercase tracking-[0.18em] ${
                        issue.level === "error" ? "text-red-300" : "text-yellow-300"
                      }`}
                    >
                      {issue.level === "error" ? "필수 입력 필요" : "보완 권장"}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-dark-100">{issue.message}</p>
                  </div>
                  <span className="shrink-0 text-xs text-mystery-300">위치 보기</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-dark-700/80 bg-[linear-gradient(180deg,rgba(42,46,47,0.68),rgba(23,15,18,0.94))] p-6 shadow-[0_20px_48px_rgba(23,15,18,0.4)] sm:p-8">
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
              onChangeCulprit={(culpritPlayerId) => updateGame({
                story: {
                  ...game.story,
                  culpritPlayerId,
                },
              })}
              onChangeCulpritScope={(mode) => {
                /**
                 * 범인 박스의 후보군 모드를 투표 탭 주 질문 targetMode 와 동기화.
                 * 주 질문이 없으면 새로 만들어 끼워 넣는다(VoteEndingEditor 의 자동 생성과 동일한 형태).
                 */
                const questions = game.voteQuestions ?? [];
                const primary = questions.find(
                  (q) => q.purpose === "ending" && q.voteRound === 1,
                );
                if (primary) {
                  updateGame({
                    voteQuestions: questions.map((q) =>
                      q.id === primary.id ? { ...q, targetMode: mode, choices: [] } : q,
                    ),
                  });
                  return;
                }
                updateGame({
                  voteQuestions: [
                    {
                      id: crypto.randomUUID(),
                      voteRound: 1,
                      label: "",
                      targetMode: mode,
                      purpose: "ending",
                      sortOrder: 0,
                      choices: [],
                    },
                    ...questions,
                  ],
                });
              }}
              focusTarget={focusRequest.target}
              focusToken={focusRequest.token}
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
              gameId={game.id}
              scripts={game.scripts}
              rounds={game.rules?.roundCount ?? 4}
              locations={game.locations ?? []}
              onChange={(scripts) => updateGame({ scripts })}
              focusTarget={focusRequest.target}
              focusToken={focusRequest.token}
            />
          )}
          {currentStep === 6 && (
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
              disabled={currentStep <= 1 || saving}
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
                  disabled={saving}
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
