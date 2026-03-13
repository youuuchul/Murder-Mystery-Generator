"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import type { GamePackage } from "@/types/game";
import type { GameSession } from "@/types/session";


export default function JoinPage() {
  const { sessionCode } = useParams() as { sessionCode: string };
  const router = useRouter();

  const [session, setSession] = useState<GameSession | null>(null);
  const [game, setGame] = useState<GamePackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    async function fetchSession() {
      const res = await fetch(`/api/join/${sessionCode}`);
      if (!res.ok) {
        setError("세션을 찾을 수 없습니다. 참가 코드를 확인해주세요.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setSession(data.session);
      setGame(data.game);
      setLoading(false);
    }
    fetchSession();
  }, [sessionCode]);

  async function handleJoin() {
    if (!selectedPlayerId || !playerName.trim() || !session) return;
    setJoining(true);
    const res = await fetch(`/api/sessions/${session.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: selectedPlayerId, playerName: playerName.trim() }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? "참가 실패");
      setJoining(false);
      return;
    }
    const { token, sessionId, gameId, playerId } = await res.json();
    // token 저장
    localStorage.setItem(`mm_${sessionId}`, token);
    router.push(`/play/${gameId}/${playerId}?s=${sessionId}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <p className="text-dark-400 animate-pulse">로딩 중…</p>
      </div>
    );
  }

  if (error || !session || !game) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-dark-400">{error || "세션 로드 실패"}</p>
        </div>
      </div>
    );
  }

  const slots = session.sharedState.characterSlots;

  return (
    <div className="min-h-screen bg-dark-950 text-dark-100 p-4">
      <div className="max-w-lg mx-auto pt-8 space-y-6">
        {/* 헤더 */}
        <div className="text-center">
          <p className="text-mystery-500 text-sm mb-1">머더미스터리 참가</p>
          <h1 className="text-2xl font-bold text-dark-50">{game.title}</h1>
          <p className="text-dark-500 text-sm mt-1">
            참가 코드:{" "}
            <span className="font-mono text-mystery-400">{sessionCode}</span>
          </p>
        </div>

        {/* 캐릭터 선택 */}
        <div>
          <h2 className="text-sm font-medium text-dark-400 mb-3">
            캐릭터를 선택하세요
          </h2>
          <div className="space-y-2">
            {slots.map((slot) => {
              const player = game.players.find((p) => p.id === slot.playerId);
              if (!player) return null;
              const taken = slot.isLocked;
              const selected = selectedPlayerId === slot.playerId;

              return (
                <button
                  key={slot.playerId}
                  type="button"
                  disabled={taken}
                  onClick={() => !taken && setSelectedPlayerId(slot.playerId)}
                  className={[
                    "w-full text-left p-4 rounded-xl border transition-all",
                    taken
                      ? "border-dark-800 bg-dark-900/30 opacity-50 cursor-not-allowed"
                      : selected
                      ? "border-mystery-600 bg-mystery-950/30 ring-1 ring-mystery-600"
                      : "border-dark-700 bg-dark-900 hover:border-dark-500",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-dark-100">{player.name}</p>
                      {player.background && (
                        <p className="text-xs text-dark-500 mt-0.5 line-clamp-1">
                          {player.background}
                        </p>
                      )}
                    </div>
                    {taken ? (
                      <span className="text-xs text-dark-600 shrink-0">참가 중</span>
                    ) : selected ? (
                      <span className="text-xs text-mystery-400 shrink-0">선택됨</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 이름 입력 + 참가 */}
        {selectedPlayerId && (
          <div className="bg-dark-900 border border-mystery-800 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-dark-300">
              {game.players.find((p) => p.id === selectedPlayerId)?.name} 로 참가
            </p>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="실제 이름을 입력하세요"
              maxLength={20}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2.5 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 transition text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
            <button
              onClick={handleJoin}
              disabled={!playerName.trim() || joining}
              className="w-full py-3 bg-mystery-700 hover:bg-mystery-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {joining ? "참가 중…" : "참가하기"}
            </button>
          </div>
        )}

        {/* 게임 요약 */}
        <div className="border border-dark-800 rounded-xl p-4 space-y-2">
          <h3 className="text-xs font-medium text-dark-500">게임 정보</h3>
          <div className="flex gap-3 text-xs text-dark-500">
            <span>인원 {game.settings.playerCount}인</span>
            <span>시간 {game.settings.estimatedDuration}분</span>
            <span>난이도 {game.settings.difficulty === "easy" ? "쉬움" : game.settings.difficulty === "normal" ? "보통" : "어려움"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
