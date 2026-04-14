"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useParams } from "next/navigation";
import { getPlayerAgentRuntimeStatusLabel } from "@/lib/ai/player-agent/core/player-agent-state";
import {
  clearPlayerSessionToken,
  persistPlayerSessionToken,
} from "@/lib/player-session-cookie";
import type { JoinSessionPreview } from "@/lib/session-sanitizer";
import type { GamePackage } from "@/types/game";

interface ResumeSessionResponse {
  gameId: string;
  playerState: {
    playerId: string;
  };
}

interface JoinLookupResponse {
  session: JoinSessionPreview;
  game: GamePackage;
}

interface JoinActionResponse {
  token: string;
  sessionId: string;
  gameId: string;
  playerId: string;
}

export default function JoinPage() {
  const { sessionCode } = useParams() as { sessionCode: string };
  const router = useRouter();

  const [session, setSession] = useState<JoinSessionPreview | null>(null);
  const [game, setGame] = useState<GamePackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resumeMessage, setResumeMessage] = useState("");

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [joining, setJoining] = useState(false);

  const selectedSlot = session?.sharedState.characterSlots.find((slot) => slot.playerId === selectedPlayerId) ?? null;
  const isAiSlot = Boolean(selectedSlot?.isAiControlled);
  const isRejoinFlow = Boolean(selectedSlot?.isLocked && !selectedSlot?.isAiControlled);
  const selectedHasPriorProgress = Boolean(
    selectedSlot
    && !selectedSlot.isLocked
    && !selectedSlot.isAiControlled
    && session?.slotsWithPriorProgress?.includes(selectedSlot.playerId)
  );

  useEffect(() => {
    async function fetchSession() {
      const res = await fetch(`/api/join/${sessionCode}`);
      if (!res.ok) {
        setError("세션을 찾을 수 없습니다. 참가 코드를 확인해주세요.");
        setLoading(false);
        return;
      }
      const data = await res.json() as JoinLookupResponse;
      setSession(data.session);
      setGame(data.game);

      const savedToken = localStorage.getItem(`mm_${data.session.id}`);
      if (!savedToken) {
        setLoading(false);
        return;
      }

      setResumeMessage("기존 참가 정보를 확인하는 중…");

      try {
        const resumeRes = await fetch(`/api/sessions/${data.session.id}?token=${savedToken}`);

        if (!resumeRes.ok) {
          clearPlayerSessionToken(data.session.id);
          setResumeMessage("");
          setLoading(false);
          return;
        }

        const resumeData = await resumeRes.json() as ResumeSessionResponse;
        router.replace(`/play/${resumeData.gameId}/${resumeData.playerState.playerId}?s=${data.session.id}`);
        return;
      } catch {
        setResumeMessage("");
      }

      setLoading(false);
    }
    fetchSession();
  }, [router, sessionCode]);

  async function handleJoin() {
    if (!selectedPlayerId || !playerName.trim() || !session) return;
    setJoining(true);
    const endpoint = isRejoinFlow ? "rejoin" : "join";
    const res = await fetch(`/api/sessions/${session.id}/${endpoint}`, {
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
    const { token, sessionId, gameId, playerId } = await res.json() as JoinActionResponse;
    // token을 localStorage와 쿠키 모두에 저장 (쿠키는 서버 컴포넌트 SSR용)
    persistPlayerSessionToken(sessionId, token);
    router.push(`/play/${gameId}/${playerId}?s=${sessionId}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <p className="text-dark-400 animate-pulse">{resumeMessage || "로딩 중…"}</p>
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
              const aiTaken = slot.isAiControlled === true;
              const selected = selectedPlayerId === slot.playerId;
              const hasPriorProgress = session?.slotsWithPriorProgress?.includes(slot.playerId) ?? false;
              const canInherit = !taken && !aiTaken && hasPriorProgress;

              return (
                <button
                  key={slot.playerId}
                  type="button"
                  disabled={aiTaken}
                  onClick={() => setSelectedPlayerId(slot.playerId)}
                  className={[
                    "w-full text-left p-4 rounded-xl border transition-all",
                    aiTaken
                      ? "border-dark-700 bg-dark-900/40 opacity-70 cursor-not-allowed"
                      : "",
                    selected
                      ? taken
                        ? "border-amber-700 bg-amber-950/20 ring-1 ring-amber-700"
                        : "border-mystery-600 bg-mystery-950/30 ring-1 ring-mystery-600"
                      : taken
                      ? "border-dark-700 bg-dark-900/60 hover:border-amber-800"
                      : "border-dark-700 bg-dark-900 hover:border-dark-500",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {player.cardImage ? (
                        <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg border border-dark-700 bg-dark-950">
                          <Image
                            src={player.cardImage}
                            alt={player.name}
                            fill
                            sizes="48px"
                            className="h-full w-full object-cover object-center"
                          />
                        </div>
                      ) : null}
                      <div className="min-w-0">
                        <p className="font-semibold text-dark-100">{player.name}</p>
                        {player.background && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-dark-500">
                            {player.background}
                          </p>
                        )}
                      </div>
                    </div>
                    {aiTaken ? (
                      <span className="text-xs text-sky-300 shrink-0">
                        AI {getPlayerAgentRuntimeStatusLabel(slot.aiRuntimeStatus)}
                      </span>
                    ) : taken ? (
                      <span className="text-xs text-amber-400 shrink-0">복귀 가능</span>
                    ) : canInherit ? (
                      <span className="text-xs text-emerald-400 shrink-0">이어받기 가능</span>
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
        {selectedPlayerId && !isAiSlot && (
          <div className="bg-dark-900 border border-mystery-800 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-dark-300">
              {game.players.find((p) => p.id === selectedPlayerId)?.name} {isRejoinFlow ? "복귀" : "로 참가"}
            </p>
            <p className="text-xs text-dark-500">
              {isRejoinFlow
                ? "처음 참가할 때 입력한 실제 이름을 그대로 입력해야 복귀할 수 있습니다."
                : selectedHasPriorProgress
                  ? "이전 점유자가 남긴 인벤토리/진행 상태를 이어받습니다. 실제 이름을 입력하세요."
                  : "플레이어를 식별할 실제 이름을 입력하세요. 나중에 재접속할 때도 이 이름으로 확인합니다."}
            </p>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder={isRejoinFlow ? "처음 참가 때 입력한 이름" : "실제 이름을 입력하세요"}
              maxLength={20}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2.5 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 transition text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
            <button
              onClick={handleJoin}
              disabled={!playerName.trim() || joining}
              className="w-full py-3 bg-mystery-700 hover:bg-mystery-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {joining ? (isRejoinFlow ? "복귀 중…" : "참가 중…") : (isRejoinFlow ? "복귀하기" : "참가하기")}
            </button>
          </div>
        )}

        {selectedPlayerId && isAiSlot && (
          <div className="bg-dark-900 border border-sky-900/50 rounded-xl p-4 text-sm text-sky-200">
            이 자리는 현재 AI 플레이어가 맡고 있습니다.
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
