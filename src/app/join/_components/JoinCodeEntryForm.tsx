"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type JoinCodeEntryFormProps = {
  compact?: boolean;
};

/**
 * 세션 코드를 받아 참가 페이지로 보내는 공용 입력 폼.
 * 라이브러리 히어로와 전용 참가 페이지가 같은 검증 규칙을 쓰도록 묶는다.
 */
export default function JoinCodeEntryForm({ compact = false }: JoinCodeEntryFormProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  async function handleJoin() {
    const upper = code.trim().toUpperCase();
    if (upper.length !== 6) {
      setError("6자리 코드를 입력해주세요.");
      return;
    }

    setChecking(true);
    setError("");

    try {
      const response = await fetch(`/api/join/${upper}`);
      if (!response.ok) {
        setError("세션을 찾을 수 없습니다. 코드를 다시 확인해주세요.");
        return;
      }

      router.push(`/join/${upper}`);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className={compact ? "grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]" : "space-y-3"}>
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 6))}
          placeholder="예: ABC123"
          maxLength={6}
          className={[
            "w-full rounded-xl border border-dark-700 bg-dark-900 px-4 text-center font-mono font-bold text-mystery-300 outline-none transition focus:border-mystery-500",
            compact
              ? "py-3 text-2xl tracking-[0.24em]"
              : "py-4 text-3xl tracking-widest placeholder:text-dark-700",
          ].join(" ")}
          onKeyDown={(event) => event.key === "Enter" && handleJoin()}
          autoCapitalize="characters"
          autoComplete="off"
        />
        <button
          onClick={handleJoin}
          disabled={code.length !== 6 || checking}
          className={[
            "rounded-xl bg-mystery-700 font-semibold text-white transition-colors hover:bg-mystery-600 disabled:opacity-40",
            compact ? "px-6 py-3" : "w-full py-3.5",
          ].join(" ")}
        >
          {checking ? "확인 중…" : "입장하기"}
        </button>
      </div>
      {error ? (
        <p className={compact ? "text-sm text-red-300" : "text-center text-sm text-red-400"}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
