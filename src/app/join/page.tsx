"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinEntryPage() {
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
    const res = await fetch(`/api/join/${upper}`);
    if (!res.ok) {
      setError("세션을 찾을 수 없습니다. 코드를 다시 확인해주세요.");
      setChecking(false);
      return;
    }
    router.push(`/join/${upper}`);
  }

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-5xl mb-4">🔍</p>
          <h1 className="text-2xl font-bold text-dark-50">게임 참가</h1>
          <p className="text-dark-500 text-sm mt-1">GM에게 받은 6자리 코드를 입력하세요</p>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="예: ABC123"
            maxLength={6}
            className="w-full bg-dark-900 border border-dark-700 rounded-xl px-4 py-4 text-center text-3xl font-mono font-bold tracking-widest text-mystery-300 placeholder:text-dark-700 focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            autoCapitalize="characters"
            autoComplete="off"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            onClick={handleJoin}
            disabled={code.length !== 6 || checking}
            className="w-full py-3.5 bg-mystery-700 hover:bg-mystery-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-40"
          >
            {checking ? "확인 중…" : "입장하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
