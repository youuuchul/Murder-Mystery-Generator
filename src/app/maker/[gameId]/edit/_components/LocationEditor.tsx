"use client";

import { useState, type ChangeEvent } from "react";
import Button from "@/components/ui/Button";
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
  onSave: () => void;
  saving: boolean;
}

const CLUE_TYPES: { value: Clue["type"]; label: string }[] = [
  { value: "physical", label: "물적 증거" },
  { value: "testimony", label: "증언" },
  { value: "document", label: "문서" },
  { value: "scene", label: "현장 단서" },
];

const inputClass =
  "w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";

function createLocation(): Location {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
    imageUrl: undefined,
    unlocksAtRound: null,
    clueIds: [],
  };
}

function createClue(locationId: string): Clue {
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    type: "physical",
    imageUrl: undefined,
    locationId,
    pointsTo: "",
    isSecret: false,
  };
}

const CONDITION_TYPE_LABELS: Record<ClueConditionType, string> = {
  has_items: "내 아이템 보유 — 내가 지정 단서를 현재 인벤토리에 보유",
  character_has_item: "특정 캐릭터 보유 — 특정 캐릭터가 지정 단서를 현재 보유",
};

/** 조건 설정 폼 — 단서/장소에서 공용 */
function ConditionForm({
  label,
  condition,
  onChange,
  allClues,
  allCharacters,
  excludeClueId,
}: {
  label: string;
  condition: ClueCondition | undefined;
  onChange: (c: ClueCondition | undefined) => void;
  allClues: Clue[];
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

  const selectableClues = allClues.filter((c) => c.id !== excludeClueId);
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
            {label}: {enabled ? "조건 설정됨" : "조건 없음 (자유 접근)"}
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
              필요 단서/아이템
              <span className="text-dark-600 ml-1">(복수 선택 가능)</span>
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
                      {c.title || "(제목 없음)"}
                      <span className="text-dark-600 ml-1">[{c.type}]</span>
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
              <span className="text-dark-600 ml-1">(잠금 상태일 때 표시)</span>
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
  onChangeLocation: (l: Location) => void;
  onDeleteLocation: () => void;
  onAddClue: () => void;
  onChangeClue: (clue: Clue) => void;
  onDeleteClue: (clueId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);

  function update<K extends keyof Location>(key: K, value: Location[K]) {
    onChangeLocation({ ...location, [key]: value });
  }

  /**
   * 장소 대표 이미지를 업로드하고, 응답으로 받은 내부 자산 URL을 장소 데이터에 연결한다.
   * 파일 자체는 `data/games/{gameId}/assets/locations` 아래에 저장된다.
   */
  async function handleLocationImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploadingImage(true);
    try {
      const res = await fetch(`/api/games/${gameId}/assets`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error ?? "이미지 업로드 실패");
        return;
      }

      update("imageUrl", data.url);
    } catch (error) {
      console.error("장소 이미지 업로드 실패:", error);
      alert("이미지 업로드 중 오류가 발생했습니다.");
    } finally {
      setUploadingImage(false);
    }
  }

  return (
    <div className="border border-dark-700 rounded-xl overflow-hidden">
      {/* 장소 헤더 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-dark-800/60 hover:bg-dark-800 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-medium text-dark-100">
            {location.name || <span className="text-dark-500 italic">장소 이름 없음</span>}
          </span>
          <span className="text-xs text-dark-500 bg-dark-700 px-2 py-0.5 rounded-full">
            단서 {clues.length}개
          </span>
          {location.unlocksAtRound !== null && (
            <span className="text-xs text-mystery-400 bg-mystery-950/40 border border-mystery-800 px-2 py-0.5 rounded-full">
              Round {location.unlocksAtRound} 해제
            </span>
          )}
          {location.unlocksAtRound === null && (
            <span className="text-xs text-green-400 bg-green-950/40 border border-green-800 px-2 py-0.5 rounded-full">
              처음부터 접근 가능
            </span>
          )}
          {location.ownerPlayerId && (
            <span className="text-xs text-orange-400 bg-orange-950/40 border border-orange-800 px-2 py-0.5 rounded-full">
              {allCharacters.find((c) => c.id === location.ownerPlayerId)?.name ?? "소유자"} 접근 불가
            </span>
          )}
          {location.imageUrl && (
            <span className="text-xs text-sky-400 bg-sky-950/30 border border-sky-900 px-2 py-0.5 rounded-full">
              이미지
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDeleteLocation(); }}
            className="text-xs text-dark-500 hover:text-red-400 transition-colors px-2 py-1"
          >
            삭제
          </button>
          <span className="text-dark-500 text-sm">{expanded ? "접기" : "열기"}</span>
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-5">
          {/* 장소 기본 정보 */}
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
                <span className="text-dark-600 font-normal ml-1">(비우면 처음부터)</span>
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
              접근 불가 캐릭터 <span className="text-dark-600 font-normal">(소유자 — 자기 공간에는 들어갈 수 없음)</span>
            </label>
            <select
              value={location.ownerPlayerId ?? ""}
              onChange={(e) => update("ownerPlayerId", e.target.value || undefined)}
              className={inputClass}
            >
              <option value="">— 없음 (모든 캐릭터 접근 가능) —</option>
              {allCharacters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || `(이름 없음)`}
                </option>
              ))}
            </select>
            {location.ownerPlayerId && (
              <p className="text-xs text-orange-400 mt-1">
                {allCharacters.find((c) => c.id === location.ownerPlayerId)?.name ?? "해당 캐릭터"}
                은(는) 이 장소에서 단서를 획득할 수 없습니다.
              </p>
            )}
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

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1">장소 대표 이미지</label>
                <p className="text-xs text-dark-600">
                  플레이어 장소 카드에 함께 노출될 이미지입니다. 업로드 후 저장해야 최종 반영됩니다.
                </p>
              </div>
              <label className="shrink-0">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handleLocationImageUpload}
                  disabled={uploadingImage}
                />
                <span className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-dark-600 text-sm text-dark-200 hover:border-dark-400 transition-colors cursor-pointer">
                  {uploadingImage ? "업로드 중…" : "이미지 업로드"}
                </span>
              </label>
            </div>

            {location.imageUrl ? (
              <div className="overflow-hidden rounded-xl border border-dark-700 bg-dark-950/40">
                <img
                  src={location.imageUrl}
                  alt={location.name || "장소 이미지 미리보기"}
                  className="w-full h-48 object-cover"
                />
                <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-dark-700 bg-dark-900/60">
                  <p className="text-xs text-dark-500 truncate">{location.imageUrl}</p>
                  <button
                    type="button"
                    onClick={() => update("imageUrl", undefined)}
                    className="text-xs text-dark-500 hover:text-red-400 transition-colors shrink-0"
                  >
                    이미지 제거
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 border border-dashed border-dark-700 rounded-xl">
                <p className="text-xs text-dark-600">아직 업로드된 장소 이미지가 없습니다.</p>
              </div>
            )}
          </div>

          {/* 장소 입장 조건 */}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-2">
              장소 입장 조건
              <span className="text-dark-600 font-normal ml-1">— 조건 미충족 시 이 장소의 모든 단서 획득 불가</span>
            </label>
            <ConditionForm
              label="입장 조건"
              condition={location.accessCondition}
              onChange={(c) => update("accessCondition", c)}
              allClues={allClues}
              allCharacters={allCharacters}
            />
          </div>

          {/* 이 장소의 단서 카드들 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-dark-400">단서 카드</label>
              <button
                type="button"
                onClick={onAddClue}
                className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
              >
                + 단서 추가
              </button>
            </div>

            {clues.length === 0 ? (
              <div className="text-center py-4 border border-dashed border-dark-700 rounded-lg">
                <p className="text-xs text-dark-600">이 장소에 배치된 단서가 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {clues.map((clue) => (
                  <ClueForm
                    key={clue.id}
                    clue={clue}
                    allClues={allClues}
                    allCharacters={allCharacters}
                    onChange={onChangeClue}
                    onDelete={() => onDeleteClue(clue.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 단서 카드 1개 폼 */
function ClueForm({
  clue,
  allClues,
  allCharacters,
  onChange,
  onDelete,
}: {
  clue: Clue;
  allClues: Clue[];
  allCharacters: Player[];
  onChange: (c: Clue) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const typeInfo = CLUE_TYPES.find((t) => t.value === clue.type);

  function update<K extends keyof Clue>(key: K, value: Clue[K]) {
    onChange({ ...clue, [key]: value });
  }

  return (
    <div className="border border-dark-700/60 rounded-lg overflow-hidden bg-dark-900/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-dark-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm text-dark-200">
            {clue.title || <span className="text-dark-500 italic">제목 없음</span>}
          </span>
          <span className="text-[11px] text-dark-500 border border-dark-700 bg-dark-800 px-1.5 py-0.5 rounded">
            {typeInfo?.label ?? "유형 없음"}
          </span>
          {clue.isSecret && (
            <span className="text-xs text-yellow-400 border border-yellow-800 bg-yellow-950/30 px-1.5 py-0.5 rounded">
              비밀
            </span>
          )}
          {clue.imageUrl && (
            <span className="text-xs text-sky-400 border border-sky-900 bg-sky-950/30 px-1.5 py-0.5 rounded">
              이미지
            </span>
          )}
          {clue.condition && (
            <span className="text-xs text-mystery-400 border border-mystery-800 bg-mystery-950/30 px-1.5 py-0.5 rounded">
              잠금 조건
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-xs text-dark-600 hover:text-red-400 transition-colors"
          >
            삭제
          </button>
          <span className="text-dark-600 text-xs">{expanded ? "접기" : "열기"}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
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
                onChange={(e) => update("type", e.target.value as Clue["type"])}
                className={inputClass}
              >
                {CLUE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-dark-500 mb-1">단서 내용</label>
            <textarea
              rows={3}
              value={clue.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="플레이어가 카드를 획득했을 때 보게 되는 내용"
              className={inputClass + " resize-none"}
            />
          </div>

          <div>
            <label className="block text-xs text-dark-500 mb-1">
              단서 이미지 URL
              <span className="text-dark-600 ml-1">인벤토리와 상세 카드에 함께 표시됩니다.</span>
            </label>
            <input
              type="url"
              value={clue.imageUrl ?? ""}
              onChange={(e) => update("imageUrl", e.target.value || undefined)}
              placeholder="https://..."
              className={inputClass}
            />
            {clue.imageUrl ? (
              <div className="mt-2 overflow-hidden rounded-xl border border-dark-700 bg-dark-950/40">
                <img
                  src={clue.imageUrl}
                  alt={clue.title || "단서 이미지 미리보기"}
                  className="w-full h-40 object-cover"
                />
              </div>
            ) : (
              <p className="text-xs text-dark-600 mt-2">
                이미지가 없으면 플레이어 화면에서는 텍스트 카드만 표시됩니다.
              </p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs text-dark-500 mb-1">
                연관 정보 <span className="text-dark-600">(GM 메모용)</span>
              </label>
              <input
                type="text"
                value={clue.pointsTo ?? ""}
                onChange={(e) => update("pointsTo", e.target.value)}
                placeholder="어떤 캐릭터/사건을 가리키는지"
                className={inputClass}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer mt-4">
              <input
                type="checkbox"
                checked={clue.isSecret ?? false}
                onChange={(e) => update("isSecret", e.target.checked)}
                className="accent-mystery-500 w-4 h-4"
              />
              <span className="text-xs text-dark-400">GM 직접 배포</span>
            </label>
          </div>

          {/* 단서 획득 조건 */}
          <div>
            <label className="block text-xs text-dark-500 mb-2">
              단서 획득 조건
              <span className="text-dark-600 font-normal ml-1">— 조건 충족 시에만 획득 가능</span>
            </label>
            <ConditionForm
              label="획득 조건"
              condition={clue.condition}
              onChange={(c) => update("condition", c)}
              allClues={allClues}
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
  onSave,
  saving,
}: LocationEditorProps) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-dark-50">장소 & 단서 카드</h2>
          <p className="text-sm text-dark-500 mt-1">
            {locations.length}개 장소 · {totalClues}개 단서 — 단서는 장소에 배치되고, 플레이어가 방문해 획득합니다.
          </p>
        </div>
        <Button size="sm" onClick={addLocation}>+ 장소 추가</Button>
      </div>

      {/* 획득/방문 규칙 설정 */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-4 space-y-4">
        <p className="text-sm font-medium text-dark-300">단서 획득 규칙</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* 라운드당 획득 수 */}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1">
              라운드당 최대 획득 단서 수
              <span className="text-dark-600 font-normal ml-1">(0 = 무제한)</span>
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
            {(rules.cluesPerRound ?? 0) > 0 && (
              <p className="text-xs text-mystery-500 mt-1">
                플레이어는 라운드당 최대 {rules.cluesPerRound}개 단서를 획득할 수 있습니다.
                라운드가 바뀌면 초기화됩니다.
              </p>
            )}
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
                    ? "border-green-700 bg-green-900/20 text-green-300"
                    : "border-dark-600 text-dark-500 hover:border-dark-500",
                ].join(" ")}
              >
                허용
              </button>
            </div>
          </div>
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
            onClick={addLocation}
            className="mt-3 text-sm text-mystery-400 hover:text-mystery-300 transition-colors"
          >
            + 첫 번째 장소 추가
          </button>
        </div>
      ) : (
        <div className="space-y-3">
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

      <div className="flex justify-end pt-2">
        <Button onClick={onSave} loading={saving} variant="secondary">저장</Button>
      </div>
    </div>
  );
}
