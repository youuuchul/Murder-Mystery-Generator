"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import ImageAssetField from "./ImageAssetField";
import { useScrollAnchor } from "./useScrollAnchor";
import type { Location, Clue, GameRules, Player, ClueCondition, ClueConditionType } from "@/types/game";

interface LocationEditorProps {
  gameId: string;
  locations: Location[];
  clues: Clue[];
  characters: Player[];
  rules: GameRules;
  onChangeLocations: (locations: Location[]) => void;
  onChangeClues: (clues: Clue[]) => void;
  onChangeRules: (rules: GameRules) => void;
}

const CLUE_TYPES: { value: Clue["type"]; label: string; hint: string }[] = [
  {
    value: "owned",
    label: "획득",
    hint: "인벤토리 보관 · 건네주기 가능",
  },
  {
    value: "shared",
    label: "공개",
    hint: "첫 발견 후 전원 공개 · 재조사 무료",
  },
];

const inputClass =
  "w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";

/**
 * 단서 선택 옵션에 장소명과 유형을 함께 보여줘 긴 목록에서도 찾기 쉽게 만든다.
 */
function getClueOptionLabel(clue: Clue, locations: Location[]): string {
  const locationName = locations.find((location) => location.id === clue.locationId)?.name?.trim() || "위치 미지정";
  const clueTypeLabel = CLUE_TYPES.find((type) => type.value === clue.type)?.label ?? "유형 없음";
  return `${locationName} · ${clue.title || "(제목 없음)"} · ${clueTypeLabel}`;
}

function createLocation(): Location {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
    unlocksAtRound: null,
    clueIds: [],
  };
}

function createClue(locationId: string): Clue {
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    type: "owned",
    imageUrl: undefined,
    locationId,
  };
}

const CONDITION_TYPE_LABELS: Record<ClueConditionType, string> = {
  has_items: "내 아이템 보유",
  character_has_item: "특정 캐릭터 보유",
};

/** 조건 설정 폼 — 단서/장소에서 공용 */
function ConditionForm({
  label,
  condition,
  onChange,
  allClues,
  allLocations,
  allCharacters,
  excludeClueId,
}: {
  label: string;
  condition: ClueCondition | undefined;
  onChange: (c: ClueCondition | undefined) => void;
  allClues: Clue[];
  allLocations: Location[];
  allCharacters: Player[];
  excludeClueId?: string;
}) {
  const enabled = condition !== undefined;

  function toggle() {
    onChange(enabled ? undefined : { type: "has_items", requiredClueIds: [], hint: "" });
  }

  function update<K extends keyof ClueCondition>(key: K, value: ClueCondition[K]) {
    if (!condition) return;
    onChange({ ...condition, [key]: value });
  }

  const locationOrder = new Map(allLocations.map((loc, index) => [loc.id, index]));
  const clueOrderInLocation = new Map<string, number>();
  allLocations.forEach((loc) => {
    (loc.clueIds ?? []).forEach((clueId, index) => {
      clueOrderInLocation.set(clueId, index);
    });
  });
  const selectableClues = allClues
    .filter((c) => c.id !== excludeClueId)
    .slice()
    .sort((a, b) => {
      const aLoc = locationOrder.get(a.locationId ?? "") ?? Number.MAX_SAFE_INTEGER;
      const bLoc = locationOrder.get(b.locationId ?? "") ?? Number.MAX_SAFE_INTEGER;
      if (aLoc !== bLoc) return aLoc - bLoc;
      const aIdx = clueOrderInLocation.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bIdx = clueOrderInLocation.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aIdx - bIdx;
    });
  const needsTarget = condition?.type === "character_has_item";

  return (
    <div className="border border-dark-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-dark-800/30 hover:bg-dark-800/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-dark-400">
            {enabled ? `${label} 설정됨` : "조건 없음"}
          </span>
        </div>
        <span className="text-xs text-mystery-500 hover:text-mystery-300 shrink-0 ml-2">
          {enabled ? "조건 제거" : "+ 조건 추가"}
        </span>
      </button>

      {enabled && condition && (
        <div className="px-3 pb-3 pt-3 space-y-3 border-t border-dark-700">
          {/* 조건 유형 */}
          <div>
            <label className="block text-xs text-dark-500 mb-1">조건 유형</label>
            <select
              value={condition.type}
              onChange={(e) => {
                const t = e.target.value as ClueConditionType;
                onChange({
                  ...condition,
                  type: t,
                  targetCharacterId: t === "character_has_item" ? condition.targetCharacterId : undefined,
                });
              }}
              className={inputClass}
            >
              {(Object.keys(CONDITION_TYPE_LABELS) as ClueConditionType[]).map((t) => (
                <option key={t} value={t}>{CONDITION_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          {/* 필요 아이템 */}
          <div>
            <label className="block text-xs text-dark-500 mb-1">
              필요 단서
            </label>
            {selectableClues.length === 0 ? (
              <p className="text-xs text-dark-700 py-2 px-2">
                선택 가능한 단서가 없습니다. 다른 단서를 먼저 추가하세요.
              </p>
            ) : (
              <div className="space-y-1 max-h-36 overflow-y-auto bg-dark-800/40 rounded-lg p-2">
                {selectableClues.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 cursor-pointer py-1 px-2 rounded hover:bg-dark-700/50"
                  >
                    <input
                      type="checkbox"
                      checked={condition.requiredClueIds.includes(c.id)}
                      onChange={(e) => {
                        const ids = e.target.checked
                          ? [...condition.requiredClueIds, c.id]
                          : condition.requiredClueIds.filter((id) => id !== c.id);
                        update("requiredClueIds", ids);
                      }}
                      className="accent-mystery-500 w-3.5 h-3.5 shrink-0"
                    />
                    <span className="text-xs text-dark-300">
                      {getClueOptionLabel(c, allLocations)}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {condition.requiredClueIds.length > 0 && (
              <p className="text-xs text-mystery-500 mt-1">{condition.requiredClueIds.length}개 필요</p>
            )}
          </div>

          {/* 대상 캐릭터 (character_has_item만) */}
          {needsTarget && (
            <div>
              <label className="block text-xs text-dark-500 mb-1">
                아이템을 보유해야 할 캐릭터
              </label>
              <select
                value={condition.targetCharacterId ?? ""}
                onChange={(e) => update("targetCharacterId", e.target.value || undefined)}
                className={inputClass}
              >
                <option value="">— 선택 —</option>
                {allCharacters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || "(이름 없음)"}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 힌트 */}
          <div>
            <label className="block text-xs text-dark-500 mb-1">
              플레이어 힌트
            </label>
            <input
              type="text"
              value={condition.hint ?? ""}
              onChange={(e) => update("hint", e.target.value)}
              placeholder="예: 열쇠를 누군가에게 건네야 합니다"
              className={inputClass}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** 장소 1개 + 해당 장소의 단서 카드들 */
function LocationBlock({
  gameId,
  location,
  clues,
  allLocations,
  allClues,
  allCharacters,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onChangeLocation,
  onDeleteLocation,
  onAddClue,
  onChangeClue,
  onDeleteClue,
}: {
  gameId: string;
  location: Location;
  clues: Clue[];
  allLocations: Location[];
  allClues: Clue[];
  allCharacters: Player[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChangeLocation: (l: Location) => void;
  onDeleteLocation: () => void;
  onAddClue: () => void;
  onChangeClue: (clue: Clue) => void;
  onDeleteClue: (clueId: string) => void;
}) {
  const [expanded, setExpanded] = useState(!location.name && clues.length === 0);
  // 장소·단서 추가/삭제 시 panel 변동 보존.
  const captureScrollAnchor = useScrollAnchor();
  const ownerName = allCharacters.find((c) => c.id === location.ownerPlayerId)?.name ?? "지정 캐릭터";
  const visibleSummaryBadges = [
    `${clues.length}개 단서`,
    location.unlocksAtRound !== null ? `Round ${location.unlocksAtRound} 해제` : "처음부터 접근",
    location.ownerPlayerId
      ? `${ownerName} 제한`
      : null,
    location.accessCondition ? "입장 조건" : null,
    location.previewCluesEnabled ? "단서 미리보기" : null,
  ].filter(Boolean) as string[];
  const summaryText = location.description.trim();

  function update<K extends keyof Location>(key: K, value: Location[K]) {
    onChangeLocation({ ...location, [key]: value });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-dark-700/80 bg-[linear-gradient(180deg,rgba(58,16,20,0.26),rgba(23,15,18,0.94))] shadow-[0_12px_36px_rgba(23,15,18,0.26)]">
      {/* 장소 헤더 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-4 text-left transition-colors hover:bg-dark-900/30"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mt-3 text-base font-semibold text-dark-50">
              {location.name || <span className="italic text-dark-500">장소 이름 없음</span>}
            </p>
            {summaryText ? (
              <p className="mt-1 max-w-3xl line-clamp-2 text-sm leading-relaxed text-dark-500">
                {summaryText}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {visibleSummaryBadges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-dark-700 bg-dark-950/60 px-2.5 py-1 text-[11px] text-dark-300"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); captureScrollAnchor(e); onDeleteLocation(); }}
              className="rounded-lg border border-dark-700 px-3 py-2 text-xs text-dark-500 transition-colors hover:border-red-900/50 hover:text-red-400"
            >
              삭제
            </button>
            <div className="flex overflow-hidden rounded-lg border border-dark-700">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                disabled={!canMoveUp}
                aria-label="위로 이동"
                className="px-2.5 py-2 text-xs text-dark-400 transition-colors hover:bg-dark-800/60 hover:text-dark-200 disabled:cursor-not-allowed disabled:text-dark-700 disabled:hover:bg-transparent"
              >
                ↑
              </button>
              <span className="w-px bg-dark-700" aria-hidden />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                disabled={!canMoveDown}
                aria-label="아래로 이동"
                className="px-2.5 py-2 text-xs text-dark-400 transition-colors hover:bg-dark-800/60 hover:text-dark-200 disabled:cursor-not-allowed disabled:text-dark-700 disabled:hover:bg-transparent"
              >
                ↓
              </button>
            </div>
            <span className="rounded-lg border border-dark-700 bg-dark-950/50 px-3 py-2 text-xs text-dark-400">
              {expanded ? "접기" : "열기"}
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="space-y-5 border-t border-dark-700/80 bg-dark-950/25 p-4">
          {/* 장소 기본 정보 */}
          <section className="rounded-2xl border border-dark-800 bg-dark-900/55 p-4 space-y-4">
            <p className="text-sm font-semibold text-dark-100">장소 설정</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-dark-400 mb-1">장소 이름 *</label>
                <input
                  type="text"
                  value={location.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="예: 에드워드의 방, 지하 창고, 정원"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1">
                  잠금 해제 라운드
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={location.unlocksAtRound ?? ""}
                  onChange={(e) =>
                    update("unlocksAtRound", e.target.value === "" ? null : Number(e.target.value))
                  }
                  placeholder="없음"
                  className={inputClass}
                />
              </div>
            </div>

            {/* 소유자 캐릭터 */}
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">
                접근 제한 캐릭터
              </label>
              <select
                value={location.ownerPlayerId ?? ""}
                onChange={(e) => update("ownerPlayerId", e.target.value || undefined)}
                className={inputClass}
              >
                <option value="">— 없음 —</option>
                {allCharacters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || `(이름 없음)`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">장소 설명</label>
              <textarea
                rows={2}
                value={location.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="플레이어가 이 장소에 방문했을 때 보게 되는 설명"
                className={inputClass + " resize-none"}
              />
            </div>
          </section>

          {/* 획득 전 단서 미리보기 */}
          <section className="rounded-2xl border border-dark-800 bg-dark-900/45 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-dark-100">획득 전 단서 미리보기</p>
              </div>
              <button
                type="button"
                onClick={() => update("previewCluesEnabled", !location.previewCluesEnabled)}
                className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
                  location.previewCluesEnabled ? "bg-mystery-600" : "bg-dark-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    location.previewCluesEnabled ? "translate-x-4" : ""
                  }`}
                />
              </button>
            </div>
          </section>

          {/* 장소 입장 조건 */}
          <section className="rounded-2xl border border-dark-800 bg-dark-900/45 p-4">
            <label className="block text-xs font-medium text-dark-400 mb-2">
              장소 입장 조건
            </label>
            <ConditionForm
              label="입장 조건"
              condition={location.accessCondition}
              onChange={(c) => update("accessCondition", c)}
              allClues={allClues}
              allLocations={allLocations}
              allCharacters={allCharacters}
            />
          </section>

          {/* 이 장소의 단서 카드들 */}
          <section className="rounded-2xl border border-mystery-900/40 bg-[linear-gradient(180deg,rgba(58,16,20,0.72),rgba(23,15,18,0.96))] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <label className="text-xs font-medium uppercase tracking-[0.18em] text-mystery-300/80">단서 카드</label>
              </div>
              <button
                type="button"
                onClick={(e) => { captureScrollAnchor(e); onAddClue(); }}
                className="rounded-lg border border-mystery-900/60 bg-mystery-950/25 px-3 py-2 text-xs text-mystery-300 transition-colors hover:border-mystery-700 hover:bg-mystery-950/40"
              >
                + 단서 추가
              </button>
            </div>

            {clues.length === 0 ? (
              <div className="rounded-xl border border-dashed border-dark-700 bg-dark-950/35 py-6 text-center">
                <p className="text-xs text-dark-600">단서 없음</p>
              </div>
            ) : (
              <div className="space-y-3 rounded-2xl border border-dark-800/80 bg-black/10 p-3">
                {clues.map((clue) => (
                  <ClueForm
                    key={clue.id}
                    gameId={gameId}
                    clue={clue}
                    allClues={allClues}
                    allLocations={allLocations}
                    allCharacters={allCharacters}
                    previewEnabled={location.previewCluesEnabled ?? false}
                    onChange={onChangeClue}
                    onDelete={() => onDeleteClue(clue.id)}
                  />
                ))}
                {/* 연속 추가 시 위로 스크롤할 필요가 없도록 목록 하단에도 추가 버튼 노출 */}
                <button
                  type="button"
                  onClick={(e) => { captureScrollAnchor(e); onAddClue(); }}
                  className="w-full rounded-xl border border-dashed border-mystery-900/50 bg-mystery-950/15 py-2 text-xs text-mystery-300/80 transition-colors hover:border-mystery-700 hover:bg-mystery-950/30 hover:text-mystery-200"
                >
                  + 단서 추가
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** 단서 카드 1개 폼 */
function ClueForm({
  gameId,
  clue,
  allClues,
  allLocations,
  allCharacters,
  previewEnabled,
  onChange,
  onDelete,
}: {
  gameId: string;
  clue: Clue;
  allClues: Clue[];
  allLocations: Location[];
  allCharacters: Player[];
  previewEnabled: boolean;
  onChange: (c: Clue) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(!clue.title && !clue.description && !clue.imageUrl);
  const [uploadingImage, setUploadingImage] = useState(false);
  const typeInfo = CLUE_TYPES.find((t) => t.value === clue.type);
  const isSharedClue = clue.type === "shared";
  // 단서 삭제 시 panel 변동 보존.
  const captureScrollAnchor = useScrollAnchor();

  function update<K extends keyof Clue>(key: K, value: Clue[K]) {
    onChange({ ...clue, [key]: value });
  }

  /**
   * 단서 이미지를 업로드하고 인벤토리/상세 카드에서 사용할 내부 에셋 URL을 기록한다.
   * 실제 저장 backend는 provider 설정을 따르며, 게임 JSON에는 내부 URL만 유지한다.
   */
  async function handleClueImageUpload(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("scope", "clues");

    setUploadingImage(true);
    try {
      const res = await fetch(`/api/games/${gameId}/assets`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error ?? "단서 이미지 업로드 실패");
        return;
      }

      update("imageUrl", data.url);
    } catch (error) {
      console.error("단서 이미지 업로드 실패:", error);
      alert("단서 이미지 업로드 중 오류가 발생했습니다.");
    } finally {
      setUploadingImage(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-dark-700/70 bg-dark-950/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-3 text-left transition-colors hover:bg-dark-900/50"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-dark-700 bg-dark-900 px-2 py-0.5 text-[11px] text-dark-400">
                {typeInfo?.label ?? "유형 없음"}
              </span>
              {clue.imageUrl && (
                <span className="rounded-full border border-sky-900 bg-sky-950/30 px-2 py-0.5 text-[11px] text-sky-400">
                  이미지
                </span>
              )}
              {clue.condition && (
                <span className="rounded-full border border-mystery-800 bg-mystery-950/30 px-2 py-0.5 text-[11px] text-mystery-400">
                  잠금 조건
                </span>
              )}
              {previewEnabled && (clue.previewTitle || clue.previewDescription) && (
                <span className="rounded-full border border-amber-800 bg-amber-950/30 px-2 py-0.5 text-[11px] text-amber-400">
                  미리보기
                </span>
              )}
            </div>
            <p className="mt-2 text-sm font-medium text-dark-100">
              {clue.title || <span className="text-dark-500 italic">제목 없음</span>}
            </p>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-dark-500">
              {clue.description.trim() || "단서 설명이 아직 없습니다."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); captureScrollAnchor(e); onDelete(); }}
              className="rounded-lg border border-dark-700 px-2.5 py-1.5 text-xs text-dark-500 transition-colors hover:border-red-900/50 hover:text-red-400"
            >
              삭제
            </button>
            <span className="rounded-lg border border-dark-700 bg-dark-900/70 px-2.5 py-1.5 text-xs text-dark-500">
              {expanded ? "접기" : "열기"}
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-dark-800/80 bg-black/10 px-3 pb-3 pt-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-dark-500 mb-1">제목</label>
              <input
                type="text"
                value={clue.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="단서 이름"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-dark-500 mb-1">유형</label>
              <select
                value={clue.type}
                onChange={(e) => {
                  const nextType = e.target.value as Clue["type"];
                  onChange({ ...clue, type: nextType });
                }}
                className={inputClass}
              >
                {CLUE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              {typeInfo?.hint && (
                <p className="mt-1 text-[11px] text-dark-500 leading-snug">{typeInfo.hint}</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-dark-800 bg-dark-900/40 p-3">
            <label className="block text-xs text-dark-500 mb-1">단서 내용</label>
            <textarea
              rows={3}
              value={clue.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder={isSharedClue ? "첫 발견 이후 모두에게 공개될 공용 단서 내용" : "플레이어가 카드를 획득했을 때 보게 되는 내용"}
              className={inputClass + " resize-none"}
            />
          </div>

          {isSharedClue && (
            <div className="rounded-lg border border-sky-900/60 bg-sky-950/10 px-3 py-2 text-xs text-sky-300">
              첫 발견 후 전원 공개 · 재조사 무료 · 인벤토리 미보관
            </div>
          )}

          <div className="rounded-xl border border-dark-800 bg-dark-900/40 p-3">
            <ImageAssetField
              title="단서 이미지"
              description="카드 상세 이미지"
              value={clue.imageUrl}
              alt={clue.title || "단서 이미지 미리보기"}
              profile="clue"
              onChange={(nextValue) => update("imageUrl", nextValue)}
              onUpload={handleClueImageUpload}
              uploading={uploadingImage}
              uploadLabel="단서 이미지 업로드"
              emptyStateLabel="이미지 없음"
            />
          </div>

          {/* 획득 전 미리보기 텍스트 */}
          {previewEnabled && (
            <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-3 space-y-2">
              <label className="block text-xs font-medium text-amber-300/80">
                획득 전 표시 텍스트
              </label>
              <input
                type="text"
                value={clue.previewTitle ?? ""}
                onChange={(e) => update("previewTitle", e.target.value || undefined)}
                placeholder="예: 책상 위의 편지, 정원사에게 말을 건다"
                className={inputClass}
              />
              <textarea
                rows={2}
                value={clue.previewDescription ?? ""}
                onChange={(e) => update("previewDescription", e.target.value || undefined)}
                placeholder="미획득 상태에서 플레이어에게 보여줄 부가 설명 (선택)"
                className={inputClass + " resize-none"}
              />
            </div>
          )}

          {/* 단서 획득 조건 — owned/shared 모두 적용 (shared는 첫 발견 시점에만 체크) */}
          <div className="rounded-xl border border-dark-800 bg-dark-900/40 p-3">
            <label className="block text-xs text-dark-500 mb-2">
              단서 획득 조건
              {isSharedClue ? (
                <span className="text-dark-600 font-normal ml-1">첫 발견 기준</span>
              ) : null}
            </label>
            <ConditionForm
              label="획득 조건"
              condition={clue.condition}
              onChange={(c) => update("condition", c)}
              allClues={allClues}
              allLocations={allLocations}
              allCharacters={allCharacters}
              excludeClueId={clue.id}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function LocationEditor({
  gameId,
  locations,
  clues,
  characters,
  rules,
  onChangeLocations,
  onChangeClues,
  onChangeRules,
}: LocationEditorProps) {
  // 장소·단서 추가/삭제로 panel(장소·단서 1개 이상 / 이름·설명 비어있음) 변동 보존.
  const captureScrollAnchor = useScrollAnchor();

  function addLocation() {
    onChangeLocations([...locations, createLocation()]);
  }

  function updateLocation(idx: number, updated: Location) {
    onChangeLocations(locations.map((l, i) => (i === idx ? updated : l)));
  }

  function deleteLocation(idx: number) {
    const loc = locations[idx];
    // 이 장소의 단서들도 함께 삭제
    onChangeClues(clues.filter((c) => c.locationId !== loc.id));
    onChangeLocations(locations.filter((_, i) => i !== idx));
  }

  function moveLocation(idx: number, direction: -1 | 1) {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= locations.length) return;
    const next = locations.slice();
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    onChangeLocations(next);
  }

  function addClue(locationId: string) {
    const newClue = createClue(locationId);
    // Location의 clueIds에도 추가
    onChangeLocations(
      locations.map((l) =>
        l.id === locationId ? { ...l, clueIds: [...l.clueIds, newClue.id] } : l
      )
    );
    onChangeClues([...clues, newClue]);
  }

  function updateClue(updated: Clue) {
    onChangeClues(clues.map((c) => (c.id === updated.id ? updated : c)));
  }

  function deleteClue(clueId: string, locationId: string) {
    onChangeClues(clues.filter((c) => c.id !== clueId));
    onChangeLocations(
      locations.map((l) =>
        l.id === locationId ? { ...l, clueIds: l.clueIds.filter((id) => id !== clueId) } : l
      )
    );
  }

  const totalClues = clues.length;
  const lockedLocations = locations.filter((location) => location.unlocksAtRound !== null).length;
  const restrictedLocations = locations.filter(
    (location) => location.unlocksAtRound === null && (location.ownerPlayerId || location.accessCondition),
  ).length;
  const publicLocations = locations.length - lockedLocations - restrictedLocations;
  const ownedClues = clues.filter((clue) => clue.type !== "shared").length;
  const sharedClues = clues.filter((clue) => clue.type === "shared").length;
  const cardTradingEnabled = rules.cardTrading?.enabled ?? true;

  return (
    <div data-maker-anchor="step-4-locations" className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-dark-50">장소 & 단서 카드</h2>
          <p className="text-sm text-dark-500 mt-1">
            {locations.length}개 장소 · {totalClues}개 단서 — 단서는 장소에 배치되고, 플레이어가 방문해 획득합니다.
          </p>
        </div>
        <Button size="sm" onClick={(e) => { captureScrollAnchor(e); addLocation(); }}>+ 장소 추가</Button>
      </div>

      {/* 획득/방문 규칙 설정 */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-4 space-y-4">
        <p className="text-sm font-medium text-dark-300">단서 획득 규칙</p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* 라운드당 획득 수 */}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1">
              라운드당 획득 수
            </label>
            <input
              type="number"
              min={0}
              max={20}
              value={rules.cluesPerRound ?? 0}
              onChange={(e) =>
                onChangeRules({ ...rules, cluesPerRound: Math.max(0, Number(e.target.value)) })
              }
              className={inputClass}
            />
          </div>

          {/* 같은 라운드 재방문 */}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-2">
              같은 라운드 내 동일 장소 재방문
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onChangeRules({ ...rules, allowLocationRevisit: false })}
                className={[
                  "flex-1 py-2 text-sm rounded-lg border transition-colors",
                  !(rules.allowLocationRevisit ?? true)
                    ? "border-mystery-600 bg-mystery-900/40 text-mystery-300"
                    : "border-dark-600 text-dark-500 hover:border-dark-500",
                ].join(" ")}
              >
                불가 (기본)
              </button>
              <button
                type="button"
                onClick={() => onChangeRules({ ...rules, allowLocationRevisit: true })}
                className={[
                  "flex-1 py-2 text-sm rounded-lg border transition-colors",
                  (rules.allowLocationRevisit ?? true)
                    ? "border-sage-700 bg-sage-900/25 text-sage-300"
                    : "border-dark-600 text-dark-500 hover:border-dark-500",
                ].join(" ")}
              >
                허용
              </button>
            </div>
          </div>

          {/* 카드 주고받기 */}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-2">
              카드 주고받기
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onChangeRules({ ...rules, cardTrading: { enabled: false } })}
                className={[
                  "flex-1 py-2 text-sm rounded-lg border transition-colors",
                  !cardTradingEnabled
                    ? "border-mystery-600 bg-mystery-900/40 text-mystery-300"
                    : "border-dark-600 text-dark-500 hover:border-dark-500",
                ].join(" ")}
              >
                불가
              </button>
              <button
                type="button"
                onClick={() => onChangeRules({ ...rules, cardTrading: { enabled: true } })}
                className={[
                  "flex-1 py-2 text-sm rounded-lg border transition-colors",
                  cardTradingEnabled
                    ? "border-sage-700 bg-sage-900/25 text-sage-300"
                    : "border-dark-600 text-dark-500 hover:border-dark-500",
                ].join(" ")}
              >
                허용
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-dark-800 bg-dark-900/45 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-dark-600">장소</p>
          <p className="mt-2 text-lg font-semibold text-dark-100">{locations.length}개</p>
          <p className="mt-1 text-[11px] text-dark-500">
            공개 {publicLocations} · 잠금 {lockedLocations} · 특정인 제한 {restrictedLocations}
          </p>
        </div>
        <div className="rounded-2xl border border-dark-800 bg-dark-900/45 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-dark-600">단서</p>
          <p className="mt-2 text-lg font-semibold text-dark-100">{totalClues}개</p>
          <p className="mt-1 text-[11px] text-dark-500">
            획득 {ownedClues} · 공개 {sharedClues}
          </p>
        </div>
      </div>

      {locations.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-dark-700 rounded-xl">
          <p className="text-dark-500">아직 등록된 장소가 없습니다.</p>
          <p className="text-xs text-dark-600 mt-1 max-w-xs mx-auto">
            장소를 추가하고 각 장소에 단서 카드를 배치하세요.
            라운드 해제 없이 비워두면 처음부터 접근 가능합니다.
          </p>
          <button
            type="button"
            onClick={(e) => { captureScrollAnchor(e); addLocation(); }}
            className="mt-3 text-sm text-mystery-400 hover:text-mystery-300 transition-colors"
          >
            + 첫 번째 장소 추가
          </button>
        </div>
      ) : (
        <div data-maker-anchor="step-4-clues" className="space-y-3">
          {locations.map((location, idx) => {
            const locationClues = clues.filter((c) => c.locationId === location.id);
            return (
              <LocationBlock
                key={location.id}
                gameId={gameId}
                location={location}
                clues={locationClues}
                allLocations={locations}
                allClues={clues}
                allCharacters={characters}
                canMoveUp={idx > 0}
                canMoveDown={idx < locations.length - 1}
                onMoveUp={() => moveLocation(idx, -1)}
                onMoveDown={() => moveLocation(idx, 1)}
                onChangeLocation={(updated) => updateLocation(idx, updated)}
                onDeleteLocation={() => deleteLocation(idx)}
                onAddClue={() => addClue(location.id)}
                onChangeClue={updateClue}
                onDeleteClue={(clueId) => deleteClue(clueId, location.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
