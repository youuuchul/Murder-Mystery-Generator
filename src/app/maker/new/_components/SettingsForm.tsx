"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import Button from "@/components/ui/Button";
import {
  buildDefaultGameRules,
  canUsePrivateChat,
  normalizePrivateChatConfig,
} from "@/lib/game-rules";
import { buildMakerAccessPath } from "@/lib/maker-user";
import type { GameSettings, GameRules, PhaseConfig } from "@/types/game";

const SettingsSchema = z.object({
  title: z.string().min(1, "제목을 입력하세요").max(100, "제목은 100자 이내로 입력하세요"),
  summary: z.string().max(220, "소개글은 220자 이내로 입력하세요"),
  playerCount: z.number().int().min(1, "최소 1명").max(8, "최대 8명"),
  difficulty: z.enum(["easy", "normal", "hard"]),
  tags: z.array(z.string().min(1)).min(1, "태그를 1개 이상 추가하세요"),
  estimatedDuration: z.number().int().min(30, "최소 30분").max(300, "최대 300분"),
});

type SettingsFormData = z.infer<typeof SettingsSchema>;

const TAG_SUGGESTIONS = [
  "고딕 저택",
  "도시 누아르",
  "폐쇄형",
  "심리전",
  "가문 비밀",
  "파티",
  "호러",
  "코믹",
  "역사",
  "SF",
];

const DIFFICULTIES = [
  { value: "easy", label: "쉬움", desc: "초보자 권장" },
  { value: "normal", label: "보통", desc: "일반적인 난이도" },
  { value: "hard", label: "어려움", desc: "고난도 추리" },
] as const;

const PHASE_LABELS: Record<string, string> = {
  investigation: "조사",
  discussion: "토론",
};

const inputClass =
  "bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";

interface SettingsFormProps {
  onNext?: (gameId: string) => void;
}

export default function SettingsForm({ onNext }: SettingsFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof SettingsFormData, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [form, setForm] = useState<SettingsFormData>({
    title: "",
    summary: "",
    playerCount: 5,
    difficulty: "normal",
    tags: [],
    estimatedDuration: 120,
  });

  const [rules, setRules] = useState<GameRules>(() => buildDefaultGameRules(5));
  const [tagInput, setTagInput] = useState("");

  function updateForm<K extends keyof SettingsFormData>(key: K, value: SettingsFormData[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // 플레이어 수 변경 시 규칙 기본값 재계산
      if (key === "playerCount") {
        setRules(buildDefaultGameRules(value as number));
      }
      return next;
    });
    if (errors[key]) setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  }

  function updatePhase(idx: number, partial: Partial<PhaseConfig>) {
    setRules((prev) => ({
      ...prev,
      phases: prev.phases.map((p, i) => (i === idx ? { ...p, ...partial } : p)),
    }));
  }

  function updatePrivateChat(partial: Partial<GameRules["privateChat"]>) {
    setRules((prev) => ({
      ...prev,
      privateChat: normalizePrivateChatConfig(form.playerCount, { ...prev.privateChat, ...partial }),
    }));
  }

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || form.tags.includes(tag)) return;
    updateForm("tags", [...form.tags, tag]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    updateForm("tags", form.tags.filter((item) => item !== tag));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const result = SettingsSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of result.error.issues) {
        fieldErrors[issue.path[0] as keyof SettingsFormData] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    setSubmitError(null);
    try {
      const { title, summary, playerCount, difficulty, tags, estimatedDuration } = result.data;
      const settings: GameSettings = {
        playerCount,
        difficulty,
        tags,
        estimatedDuration,
        summary: summary.trim() || undefined,
      };

      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, settings, rules }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "게임 생성에 실패했습니다." }));

        if (res.status === 401) {
          router.push(buildMakerAccessPath("/maker/new"));
          return;
        }

        setSubmitError(data.error ?? "게임 생성에 실패했습니다.");
        return;
      }

      const { game } = await res.json();
      onNext ? onNext(game.id) : router.push(`/maker/${game.id}/edit`);
    } catch (err) {
      console.error("요청 오류:", err);
      setSubmitError("게임 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  // 라운드당 총 시간 계산
  const roundTotalMin = rules.phases.reduce((s, p) => s + p.durationMinutes, 0);
  const totalMin = rules.openingDurationMinutes + roundTotalMin * rules.roundCount;
  const canConfigurePrivateChat = canUsePrivateChat(form.playerCount);

  function formatDuration(minutes: number): string {
    return minutes === 0 ? "없음" : `${minutes}분`;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      {submitError ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {submitError}
        </div>
      ) : null}

      {/* ── 제목 ── */}
      <div>
        <label className="block text-sm font-medium text-dark-200 mb-2">
          시나리오 제목 <span className="text-mystery-400">*</span>
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => updateForm("title", e.target.value)}
          placeholder="예: 저택의 밤, 사라진 다이아몬드"
          className={`w-full ${inputClass}`}
        />
        {errors.title && <p className="mt-1 text-xs text-red-400">{errors.title}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-dark-200 mb-2">소개글</label>
        <textarea
          rows={3}
          value={form.summary}
          onChange={(e) => updateForm("summary", e.target.value)}
          placeholder="라이브러리 목록에서 보일 한두 문장 소개를 적으세요."
          maxLength={220}
          className={`w-full ${inputClass} resize-none`}
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-xs text-dark-500">스포일러 없이 분위기와 테마를 설명하는 짧은 소개글입니다.</p>
          <span className="shrink-0 text-[11px] text-dark-600">{form.summary.length}/220</span>
        </div>
        {errors.summary && <p className="mt-1 text-xs text-red-400">{errors.summary}</p>}
      </div>

      {/* ── 태그 ── */}
      <div>
        <label className="block text-sm font-medium text-dark-200 mb-3">
          태그 <span className="text-mystery-400">*</span>
        </label>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {form.tags.length === 0 && (
              <span className="text-xs text-dark-600">아직 추가된 태그가 없습니다.</span>
            )}
            {form.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => removeTag(tag)}
                className="rounded-full border border-mystery-700 bg-mystery-950/30 px-3 py-1 text-xs font-medium text-mystery-200 hover:bg-mystery-950/50 transition-colors"
              >
                #{tag} ×
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              placeholder="직접 태그 입력 후 Enter"
              className={`flex-1 ${inputClass}`}
            />
            <button
              type="button"
              onClick={() => addTag(tagInput)}
              className="rounded-lg border border-dark-600 bg-dark-800 px-4 py-2 text-sm text-dark-200 hover:bg-dark-700 transition-colors"
            >
              추가
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {TAG_SUGGESTIONS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                className="rounded-full border border-dark-700 bg-dark-800/60 px-3 py-1 text-xs text-dark-300 hover:border-dark-500 hover:text-dark-100 transition-colors"
              >
                + #{tag}
              </button>
            ))}
          </div>
        </div>
        {errors.tags && <p className="mt-1 text-xs text-red-400">{errors.tags}</p>}
      </div>

      {/* ── 플레이어 수 / 난이도 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* 플레이어 수 */}
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-3">플레이어 수</label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => updateForm("playerCount", Math.max(1, form.playerCount - 1))}
              className="w-9 h-9 rounded-lg border border-dark-600 bg-dark-800 text-dark-200 hover:bg-dark-700 flex items-center justify-center text-lg font-bold transition-colors">−</button>
            <span className="flex-1 text-center text-xl font-bold text-dark-50">
              {form.playerCount}<span className="text-sm font-normal text-dark-400 ml-1">명</span>
            </span>
            <button type="button" onClick={() => updateForm("playerCount", Math.min(8, form.playerCount + 1))}
              className="w-9 h-9 rounded-lg border border-dark-600 bg-dark-800 text-dark-200 hover:bg-dark-700 flex items-center justify-center text-lg font-bold transition-colors">+</button>
          </div>
          <p className="text-xs text-dark-500 text-center mt-2">1 ~ 8명 (피해자 제외)</p>
        </div>

        {/* 난이도 */}
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-3">난이도</label>
          <div className="space-y-2">
            {DIFFICULTIES.map((d) => (
              <button key={d.value} type="button" onClick={() => updateForm("difficulty", d.value)}
                className={["w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-all",
                  form.difficulty === d.value ? "border-mystery-600 bg-mystery-950/50 text-mystery-200" : "border-dark-700 bg-dark-800/50 text-dark-400 hover:border-dark-500"].join(" ")}>
                <span className="font-medium">{d.label}</span>
                <span className="text-xs text-dark-500">{d.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 소요 시간 ── */}
      <div>
        <label className="block text-sm font-medium text-dark-200 mb-2">예상 소요 시간 (분)</label>
        <div className="flex items-center gap-4 max-w-xs">
          <input type="range" min={30} max={300} step={15} value={form.estimatedDuration}
            onChange={(e) => updateForm("estimatedDuration", Number(e.target.value))}
            className="flex-1 accent-mystery-500" />
          <span className="text-dark-100 font-medium w-16 text-right">{form.estimatedDuration}분</span>
        </div>
      </div>

      {/* ══════════════════════════════════════
          게임 규칙
      ══════════════════════════════════════ */}
      <div className="border-t border-dark-800 pt-8">
        <div className="mb-5">
          <h3 className="text-base font-semibold text-dark-100">게임 규칙</h3>
          <p className="text-xs text-dark-500 mt-1">
            가이드와 플레이 흐름에 반영됩니다. 플레이어 수에 맞게 기본값이 설정되어 있습니다.
          </p>
        </div>

        {/* 라운드 수 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-2">
              총 라운드 수 <span className="text-dark-600">(조사→토론 반복)</span>
            </label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setRules((r) => ({ ...r, roundCount: Math.max(1, r.roundCount - 1) }))}
                className="w-9 h-9 rounded-lg border border-dark-600 bg-dark-800 text-dark-200 hover:bg-dark-700 flex items-center justify-center text-lg font-bold transition-colors">−</button>
              <span className="flex-1 text-center text-xl font-bold text-dark-50">
                {rules.roundCount}<span className="text-sm font-normal text-dark-400 ml-1">라운드</span>
              </span>
              <button type="button" onClick={() => setRules((r) => ({ ...r, roundCount: Math.min(10, r.roundCount + 1) }))}
                className="w-9 h-9 rounded-lg border border-dark-600 bg-dark-800 text-dark-200 hover:bg-dark-700 flex items-center justify-center text-lg font-bold transition-colors">+</button>
            </div>
          </div>

          {/* 시간 요약 */}
          <div className="flex items-center">
            <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 w-full text-sm text-dark-400 space-y-1">
              <p className="font-medium text-dark-200 mb-2">라운드 타임라인 요약</p>
              {rules.phases.map((p) => (
                <div key={p.type} className="flex justify-between">
                  <span>{p.label}</span>
                  <span className="text-dark-300">{formatDuration(p.durationMinutes)}</span>
                </div>
              ))}
              <div className="flex justify-between">
                <span>오프닝</span>
                <span className="text-dark-300">{rules.openingDurationMinutes}분</span>
              </div>
              <div className="border-t border-dark-700 pt-1 mt-1 flex justify-between font-medium text-dark-200">
                <span>1라운드 합계</span><span>{roundTotalMin}분</span>
              </div>
              <div className="flex justify-between text-mystery-400 font-semibold">
                <span>전체 (오프닝 + {rules.roundCount}라운드)</span><span>≈ {totalMin}분</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-xs font-medium text-dark-400 mb-3">오프닝 제한 시간</label>
          <div className="flex items-center gap-3 bg-dark-800/50 border border-dark-700 rounded-lg px-4 py-3">
            <span className="text-sm font-medium text-dark-200 w-20">오프닝</span>
            <input
              type="range"
              min={1}
              max={30}
              step={1}
              value={rules.openingDurationMinutes}
              onChange={(e) => setRules((prev) => ({ ...prev, openingDurationMinutes: Number(e.target.value) }))}
              className="flex-1 accent-mystery-500"
            />
            <span className="text-dark-300 text-sm w-12 text-right">{rules.openingDurationMinutes}분</span>
          </div>
          <p className="mt-2 text-xs text-dark-500">오프닝 페이즈에서 모두가 참고할 기본 제한시간입니다.</p>
        </div>

        {/* 페이즈별 시간 */}
        <div className="mb-6">
          <label className="block text-xs font-medium text-dark-400 mb-3">페이즈별 시간 설정</label>
          <div className="space-y-2">
            {rules.phases.map((phase, idx) => (
              <div key={phase.type} className="flex items-center gap-3 bg-dark-800/50 border border-dark-700 rounded-lg px-4 py-3">
                <span className="text-sm font-medium text-dark-200 w-20">{PHASE_LABELS[phase.type]}</span>
                <input
                  type="range"
                  min={phase.type === "discussion" ? 0 : 3}
                  max={60}
                  step={1}
                  value={phase.durationMinutes}
                  onChange={(e) => updatePhase(idx, { durationMinutes: Number(e.target.value) })}
                  className="flex-1 accent-mystery-500"
                />
                <span className="text-dark-300 text-sm w-12 text-right">{formatDuration(phase.durationMinutes)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-dark-500">
            토론을 0분으로 두면 조사 후 바로 다음 라운드 또는 투표로 넘어갑니다.
          </p>
        </div>

        {/* 밀담 설정 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-200">밀담 (사적 대화)</p>
                <p className="text-xs text-dark-500 mt-0.5">조사 페이즈 중 소그룹 비밀 대화</p>
              </div>
              <button
                type="button"
                onClick={() => canConfigurePrivateChat && updatePrivateChat({ enabled: !rules.privateChat.enabled })}
                disabled={!canConfigurePrivateChat}
                className={[
                  "relative w-11 h-6 rounded-full transition-colors",
                  rules.privateChat.enabled && canConfigurePrivateChat ? "bg-mystery-600" : "bg-dark-600",
                  !canConfigurePrivateChat ? "cursor-not-allowed opacity-60" : "",
                ].join(" ")}
              >
                <span className={["absolute left-0 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
                  rules.privateChat.enabled && canConfigurePrivateChat ? "translate-x-6" : "translate-x-1"].join(" ")} />
              </button>
            </div>
            {!canConfigurePrivateChat ? (
              <p className="rounded-lg border border-dark-700 bg-dark-900/40 px-3 py-2 text-xs text-dark-500">
                밀담은 플레이어 3명 이상일 때만 사용할 수 있습니다.
              </p>
            ) : rules.privateChat.enabled && (
              <div className="space-y-3 pt-1 border-t border-dark-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dark-400">최대 인원</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => updatePrivateChat({ maxGroupSize: Math.max(2, rules.privateChat.maxGroupSize - 1) })}
                      className="w-7 h-7 rounded border border-dark-600 bg-dark-700 text-dark-200 hover:bg-dark-600 flex items-center justify-center text-sm font-bold transition-colors">−</button>
                    <span className="text-dark-100 font-medium w-8 text-center">{rules.privateChat.maxGroupSize}인</span>
                    <button type="button" onClick={() => updatePrivateChat({ maxGroupSize: Math.min(Math.max(2, form.playerCount - 1), rules.privateChat.maxGroupSize + 1) })}
                      className="w-7 h-7 rounded border border-dark-600 bg-dark-700 text-dark-200 hover:bg-dark-600 flex items-center justify-center text-sm font-bold transition-colors">+</button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dark-400">밀담 가능 시간</span>
                  <div className="flex items-center gap-2">
                    <input type="range" min={1} max={15} step={1}
                      value={rules.privateChat.durationMinutes}
                      onChange={(e) => updatePrivateChat({ durationMinutes: Number(e.target.value) })}
                      className="w-24 accent-mystery-500" />
                    <span className="text-dark-300 text-xs w-8 text-right">{rules.privateChat.durationMinutes}분</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 카드 거래 */}
          <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-200">카드 주고받기</p>
                <p className="text-xs text-dark-500 mt-0.5">플레이어 간 단서 카드 이전 허용</p>
              </div>
              <button
                type="button"
                onClick={() => setRules((r) => ({ ...r, cardTrading: { enabled: !r.cardTrading.enabled } }))}
                className={["relative w-11 h-6 rounded-full transition-colors",
                  rules.cardTrading.enabled ? "bg-mystery-600" : "bg-dark-600"].join(" ")}
              >
                <span className={["absolute left-0 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
                  rules.cardTrading.enabled ? "translate-x-6" : "translate-x-1"].join(" ")} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 제출 */}
      <div className="flex justify-end pt-2">
        <Button type="submit" size="lg" loading={loading}>다음 단계 →</Button>
      </div>
    </form>
  );
}
