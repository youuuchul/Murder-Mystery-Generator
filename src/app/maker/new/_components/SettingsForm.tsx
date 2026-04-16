"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import Button from "@/components/ui/Button";
import { buildMakerAccessPath } from "@/lib/maker-user";

const SettingsSchema = z.object({
  title: z.string().min(1, "제목을 입력하세요").max(100, "제목은 100자 이내로 입력하세요"),
  summary: z.string().max(220, "소개글은 220자 이내로 입력하세요"),
});

type SettingsFormData = z.infer<typeof SettingsSchema>;

const inputClass =
  "bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";

export default function SettingsForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof SettingsFormData, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [form, setForm] = useState<SettingsFormData>({
    title: "",
    summary: "",
  });

  function updateForm<K extends keyof SettingsFormData>(key: K, value: SettingsFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const result = SettingsSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof SettingsFormData, string>> = {};
      for (const issue of result.error.issues) {
        fieldErrors[issue.path[0] as keyof SettingsFormData] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    setSubmitError(null);
    try {
      const { title, summary } = result.data;
      const payload: { title: string; summary?: string } = { title: title.trim() };
      if (summary.trim()) payload.summary = summary.trim();

      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      router.push(`/maker/${game.id}/edit`);
    } catch (err) {
      console.error("요청 오류:", err);
      setSubmitError("게임 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {submitError ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {submitError}
        </div>
      ) : null}

      <div>
        <label className="block text-sm font-medium text-dark-200 mb-2">
          시나리오 제목 <span className="text-mystery-400">*</span>
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => updateForm("title", e.target.value)}
          placeholder="예: 저택의 밤, 사라진 다이아몬드"
          maxLength={100}
          className={`w-full ${inputClass}`}
          autoFocus
        />
        {errors.title && <p className="mt-1 text-xs text-red-400">{errors.title}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-dark-200 mb-2">소개글</label>
        <textarea
          rows={3}
          value={form.summary}
          onChange={(e) => updateForm("summary", e.target.value)}
          placeholder="라이브러리 목록에서 보일 한두 문장 소개를 적으세요. 나중에 편집 화면에서 수정할 수 있습니다."
          maxLength={220}
          className={`w-full ${inputClass} resize-none`}
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-xs text-dark-500">스포일러 없이 분위기와 테마를 짧게 설명하면 좋습니다.</p>
          <span className="shrink-0 text-[11px] text-dark-600">{form.summary.length}/220</span>
        </div>
        {errors.summary && <p className="mt-1 text-xs text-red-400">{errors.summary}</p>}
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" size="lg" loading={loading}>
          생성하고 편집 시작하기 →
        </Button>
      </div>
    </form>
  );
}
