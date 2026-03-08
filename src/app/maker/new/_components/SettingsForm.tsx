"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import Button from "@/components/ui/Button";
import type { GameSettings, GameRules, PhaseConfig } from "@/types/game";

const SettingsSchema = z.object({
  title: z.string().min(1, "제목을 입력하세요").max(100, "제목은 100자 이내로 입력하세요"),
  playerCount: z.number().int().min(4, "최소 4명").max(8, "최대 8명"),
  difficulty: z.enum(["easy", "normal", "hard"]),
  theme: z.string().min(1, "테마를 선택하세요"),
  tone: z.enum(["serious", "comedy", "horror"]),
  estimatedDuration: z.number().int().min(30, "최소 30분").max(300, "최대 300분"),
});

type SettingsFormData = z.infer<typeof SettingsSchema>;

const THEMES = [
  { value: "gothic-mansion", label: "고딕 저택", emoji: "🏰" },
  { value: "city-noir", label: "도시 누아르", emoji: "🌆" },
  { value: "fantasy", label: "판타지", emoji: "🧙" },
  { value: "historical", label: "역사", emoji: "⚔️" },
  { value: "scifi", label: "SF", emoji: "🚀" },
];

const DIFFICULTIES = [
  { value: "easy", label: "쉬움", desc: "초보자 권장" },
  { value: "normal", label: "보통", desc: "일반적인 난이도" },
  { value: "hard", label: "어려움", desc: "고난도 추리" },
] as const;

const TONES = [
  { value: "serious", label: "진지", emoji: "🎭" },
  { value: "comedy", label: "코믹", emoji: "😄" },
  { value: "horror", label: "공포", emoji: "👻" },
] as const;

const PHASE_LABELS: Record<PhaseConfig["type"], string> = {
  investigation: "조사",
  briefing: "브리핑",
  discussion: "토론",
};

function buildDefaultRules(playerCount: number): GameRules {
  const investigationMin = playerCount >= 6 ? 20 : 15;
  return {
    roundCount: 4,
    phases: [
      { type: "investigation", label: "조사", durationMinutes: investigationMin },
      { type: "briefing", label: "브리핑", durationMinutes: 5 },
      { type: "discussion", label: "토론", durationMinutes: 10 },
    ],
    privateChat: {
      enabled: true,
      maxGroupSize: Math.min(3, playerCount - 1),
      durationMinutes: 5,
    },
    cardTrading: { enabled: true },
    cluesPerRound: 2,
    allowLocationRevisit: false,
  };
}

const inputClass =
  "bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";

interface SettingsFormProps {
  onNext?: (gameId: string) => void;
}

export default function SettingsForm({ onNext }: SettingsFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof SettingsFormData, string>>>({});

  const [form, setForm] = useState<SettingsFormData>({
    title: "",
    playerCount: 5,
    difficulty: "normal",
    theme: "",
    tone: "serious",
    estimatedDuration: 120,
  });

  const [rules, setRules] = useState<GameRules>(() => buildDefaultRules(5));

  function updateForm<K extends keyof SettingsFormData>(key: K, value: SettingsFormData[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // 플레이어 수 변경 시 규칙 기본값 재계산
      if (key === "playerCount") {
        setRules(buildDefaultRules(value as number));
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
    setRules((prev) => ({ ...prev, privateChat: { ...prev.privateChat, ...partial } }));
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
    try {
      const { title, playerCount, difficulty, theme, tone, estimatedDuration } = result.data;
      const settings: GameSettings = { playerCount, difficulty, theme, tone, estimatedDuration };

      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, settings, rules }),
      });

      if (!res.ok) return;
      const { game } = await res.json();
      onNext ? onNext(game.id) : router.push(`/maker/${game.id}/edit`);
    } catch (err) {
      console.error("요청 오류:", err);
    } finally {
      setLoading(false);
    }
  }

  // 라운드당 총 시간 계산
  const roundTotalMin = rules.phases.reduce((s, p) => s + p.durationMinutes, 0);
  const totalMin = roundTotalMin * rules.roundCount;

  return (
    <form onSubmit={handleSubmit} className="space-y-10">

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

      {/* ── 테마 ── */}
      <div>
        <label className="block text-sm font-medium text-dark-200 mb-3">
          테마 <span className="text-mystery-400">*</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {THEMES.map((theme) => (
            <button
              key={theme.value}
              type="button"
              onClick={() => updateForm("theme", theme.value)}
              className={[
                "flex flex-col items-center gap-2 py-4 px-3 rounded-xl border-2 transition-all",
                form.theme === theme.value
                  ? "border-mystery-500 bg-mystery-950/50 text-mystery-200"
                  : "border-dark-700 bg-dark-800/50 text-dark-400 hover:border-dark-500 hover:text-dark-200",
              ].join(" ")}
            >
              <span className="text-2xl">{theme.emoji}</span>
              <span className="text-xs font-medium">{theme.label}</span>
            </button>
          ))}
        </div>
        {errors.theme && <p className="mt-1 text-xs text-red-400">{errors.theme}</p>}
      </div>

      {/* ── 플레이어 수 / 난이도 / 분위기 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* 플레이어 수 */}
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-3">플레이어 수</label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => updateForm("playerCount", Math.max(4, form.playerCount - 1))}
              className="w-9 h-9 rounded-lg border border-dark-600 bg-dark-800 text-dark-200 hover:bg-dark-700 flex items-center justify-center text-lg font-bold transition-colors">−</button>
            <span className="flex-1 text-center text-xl font-bold text-dark-50">
              {form.playerCount}<span className="text-sm font-normal text-dark-400 ml-1">명</span>
            </span>
            <button type="button" onClick={() => updateForm("playerCount", Math.min(8, form.playerCount + 1))}
              className="w-9 h-9 rounded-lg border border-dark-600 bg-dark-800 text-dark-200 hover:bg-dark-700 flex items-center justify-center text-lg font-bold transition-colors">+</button>
          </div>
          <p className="text-xs text-dark-500 text-center mt-2">4 ~ 8명 (피해자 제외)</p>
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

        {/* 분위기 */}
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-3">분위기</label>
          <div className="space-y-2">
            {TONES.map((t) => (
              <button key={t.value} type="button" onClick={() => updateForm("tone", t.value)}
                className={["w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-sm transition-all",
                  form.tone === t.value ? "border-mystery-600 bg-mystery-950/50 text-mystery-200" : "border-dark-700 bg-dark-800/50 text-dark-400 hover:border-dark-500"].join(" ")}>
                <span>{t.emoji}</span><span className="font-medium">{t.label}</span>
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
            룰북에 자동으로 반영됩니다. 플레이어 수에 맞게 기본값이 설정되어 있습니다.
          </p>
        </div>

        {/* 라운드 수 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-2">
              총 라운드 수 <span className="text-dark-600">(조사→브리핑→토론 반복)</span>
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
                  <span className="text-dark-300">{p.durationMinutes}분</span>
                </div>
              ))}
              <div className="border-t border-dark-700 pt-1 mt-1 flex justify-between font-medium text-dark-200">
                <span>1라운드 합계</span><span>{roundTotalMin}분</span>
              </div>
              <div className="flex justify-between text-mystery-400 font-semibold">
                <span>전체 ({rules.roundCount}라운드)</span><span>≈ {totalMin}분</span>
              </div>
            </div>
          </div>
        </div>

        {/* 페이즈별 시간 */}
        <div className="mb-6">
          <label className="block text-xs font-medium text-dark-400 mb-3">페이즈별 시간 설정</label>
          <div className="space-y-2">
            {rules.phases.map((phase, idx) => (
              <div key={phase.type} className="flex items-center gap-3 bg-dark-800/50 border border-dark-700 rounded-lg px-4 py-3">
                <span className="text-sm font-medium text-dark-200 w-20">{PHASE_LABELS[phase.type]}</span>
                <input
                  type="range" min={3} max={60} step={1}
                  value={phase.durationMinutes}
                  onChange={(e) => updatePhase(idx, { durationMinutes: Number(e.target.value) })}
                  className="flex-1 accent-mystery-500"
                />
                <span className="text-dark-300 text-sm w-12 text-right">{phase.durationMinutes}분</span>
              </div>
            ))}
          </div>
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
                onClick={() => updatePrivateChat({ enabled: !rules.privateChat.enabled })}
                className={["relative w-11 h-6 rounded-full transition-colors",
                  rules.privateChat.enabled ? "bg-mystery-600" : "bg-dark-600"].join(" ")}
              >
                <span className={["absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
                  rules.privateChat.enabled ? "translate-x-6" : "translate-x-1"].join(" ")} />
              </button>
            </div>
            {rules.privateChat.enabled && (
              <div className="space-y-3 pt-1 border-t border-dark-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dark-400">최대 인원</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => updatePrivateChat({ maxGroupSize: Math.max(2, rules.privateChat.maxGroupSize - 1) })}
                      className="w-7 h-7 rounded border border-dark-600 bg-dark-700 text-dark-200 hover:bg-dark-600 flex items-center justify-center text-sm font-bold transition-colors">−</button>
                    <span className="text-dark-100 font-medium w-8 text-center">{rules.privateChat.maxGroupSize}인</span>
                    <button type="button" onClick={() => updatePrivateChat({ maxGroupSize: Math.min(form.playerCount - 1, rules.privateChat.maxGroupSize + 1) })}
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
                <span className={["absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
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
