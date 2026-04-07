"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LibraryCover from "@/app/library/_components/LibraryCover";
import type { GameOwnershipState } from "@/lib/game-access";
import type { GameMetadata } from "@/types/game";

const difficultyLabel: Record<string, string> = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
};

const difficultyColor: Record<string, string> = {
  easy: "text-green-400 bg-green-900/30 border-green-800",
  normal: "text-yellow-400 bg-yellow-900/30 border-yellow-800",
  hard: "text-red-400 bg-red-900/30 border-red-800",
};

interface GameCardProps {
  game: GameMetadata;
  canEdit: boolean;
  canDelete: boolean;
  canPlay: boolean;
  ownershipState: GameOwnershipState;
  ownerDisplayName?: string;
}

const VISIBILITY_LABELS: Record<GameMetadata["access"]["visibility"], string> = {
  draft: "초안",
  private: "비공개",
  public: "공개",
};

const OWNERSHIP_LABELS: Record<GameOwnershipState, string> = {
  owned: "내 게임",
  claimable: "귀속 가능",
  readonly: "다른 작업자 게임",
};

export default function GameCard({
  game,
  canEdit,
  canDelete,
  canPlay,
  ownershipState,
  ownerDisplayName,
}: GameCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);
  const [claimingOwnership, setClaimingOwnership] = useState(false);
  const [transferringOwnership, setTransferringOwnership] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [publishChecklist, setPublishChecklist] = useState(game.publishReadiness.checklist);

  useEffect(() => {
    setPublishChecklist(game.publishReadiness.checklist);
  }, [game.publishReadiness.checklist]);

  async function handleDelete() {
    if (!canDelete) {
      setActionError("현재 작업자는 이 게임을 삭제할 수 없습니다.");
      return;
    }

    if (!confirm(`"${game.title}"을(를) 삭제할까요?`)) return;
    setDeleting(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const res = await fetch(`/api/games/${game.id}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
        return;
      }

      const data = await res.json().catch(() => ({ error: "삭제에 실패했습니다." }));
      setActionError(data.error ?? "삭제에 실패했습니다.");
    } catch (err) {
      console.error("삭제 실패:", err);
      setActionError("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleVisibilityChange(nextVisibility: GameMetadata["access"]["visibility"]) {
    if (!canEdit || game.access.visibility === nextVisibility) {
      return;
    }

    setUpdatingVisibility(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const res = await fetch(`/api/games/${game.id}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: nextVisibility }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "공개 상태 변경에 실패했습니다." }));
        if (Array.isArray(data.checklist)) {
          setPublishChecklist(data.checklist);
        }
        setActionError(data.error ?? "공개 상태 변경에 실패했습니다.");
        return;
      }

      setActionError(null);
      router.refresh();
    } catch (error) {
      console.error("공개 상태 변경 실패:", error);
      setActionError("공개 상태 변경 중 오류가 발생했습니다.");
    } finally {
      setUpdatingVisibility(false);
    }
  }

  async function handleClaimOwnership() {
    setClaimingOwnership(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const res = await fetch(`/api/games/${game.id}/owner`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim" }),
      });
      const data = await res.json().catch(() => ({ error: "귀속 처리에 실패했습니다." }));

      if (!res.ok) {
        setActionError(data.error ?? "귀속 처리에 실패했습니다.");
        return;
      }

      setActionNotice("현재 작업자로 귀속했습니다.");
      router.refresh();
    } catch (error) {
      console.error("귀속 처리 실패:", error);
      setActionError("귀속 처리 중 오류가 발생했습니다.");
    } finally {
      setClaimingOwnership(false);
    }
  }

  async function handleTransferOwnership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!transferTarget.trim()) {
      setActionError("로그인 ID 또는 작업자 키를 입력하세요.");
      return;
    }

    setTransferringOwnership(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const res = await fetch(`/api/games/${game.id}/owner`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "transfer",
          target: transferTarget,
        }),
      });
      const data = await res.json().catch(() => ({ error: "소유권 이관에 실패했습니다." }));

      if (!res.ok) {
        setActionError(data.error ?? "소유권 이관에 실패했습니다.");
        return;
      }

      setTransferTarget("");
      setActionNotice(`소유자를 ${data.owner?.displayName ?? "다른 작업자"}로 변경했습니다.`);
      router.refresh();
    } catch (error) {
      console.error("소유권 이관 실패:", error);
      setActionError("소유권 이관 중 오류가 발생했습니다.");
    } finally {
      setTransferringOwnership(false);
    }
  }

  const diff = game.settings.difficulty;
  const tags = game.settings.tags ?? [];
  const ownerKeyHint = game.access.ownerId
    ? `${game.access.ownerId.slice(0, 8)}...${game.access.ownerId.slice(-4)}`
    : "";
  const missingPublishItems = publishChecklist.filter((item) => !item.passed);

  return (
    <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden hover:border-mystery-700 hover:shadow-lg hover:shadow-mystery-900/20 transition-all duration-200 group">
      <LibraryCover
        title={game.title}
        imageUrl={game.settings.coverImageUrl}
        imagePosition={game.settings.coverImagePosition}
      />

      {/* 콘텐츠 */}
      <div className="p-4 space-y-3">
        <h3 className="font-semibold text-dark-50 text-base leading-tight line-clamp-2 group-hover:text-mystery-300 transition-colors">
          {game.title}
        </h3>

        {game.settings.summary ? (
          <p className="text-sm leading-relaxed text-dark-400 line-clamp-3 min-h-[3.9rem]">
            {game.settings.summary}
          </p>
        ) : null}

        {/* 배지 */}
        <div className="flex flex-wrap gap-1.5">
          <span
            className={`text-xs px-2 py-0.5 rounded-full border font-medium ${difficultyColor[diff] ?? "text-dark-400 bg-dark-800 border-dark-600"}`}
          >
            {difficultyLabel[diff] ?? diff}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full border border-dark-600 bg-dark-800 text-dark-300">
            {VISIBILITY_LABELS[game.access.visibility]}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full border border-dark-700 bg-dark-900 text-dark-400">
            {OWNERSHIP_LABELS[ownershipState]}
          </span>
          {tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded-full border text-dark-300 bg-dark-800 border-dark-600">
              #{tag}
            </span>
          ))}
        </div>

        {/* 통계 */}
        <div className="flex items-center gap-3 text-xs text-dark-400">
          <span title="인원 수">인원 {game.settings.playerCount}인</span>
          <span title="소요 시간">시간 {game.settings.estimatedDuration}분</span>
        </div>

        {ownershipState === "readonly" ? (
          <p className="rounded-lg border border-dark-800 bg-dark-950/80 px-3 py-2 text-xs leading-5 text-dark-400">
            현재 소유자:
            {" "}
            <span className="text-dark-200">{ownerDisplayName ?? "알 수 없는 작업자"}</span>
            {ownerKeyHint ? (
              <>
                {" "}
                <span className="font-mono text-[11px] text-dark-500">({ownerKeyHint})</span>
              </>
            ) : null}
          </p>
        ) : null}

        {canEdit ? (
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-dark-500">
              라이브러리 노출 상태
            </p>
            <div
              className={[
                "rounded-lg border px-3 py-3 text-xs leading-5",
                missingPublishItems.length === 0
                  ? "border-emerald-900 bg-emerald-950/30 text-emerald-200"
                  : "border-amber-900 bg-amber-950/20 text-amber-100",
              ].join(" ")}
            >
              <p className="font-medium">
                {missingPublishItems.length === 0
                  ? "지금 공개 가능합니다."
                  : `공개 전 확인 ${missingPublishItems.length}개`}
              </p>
              {missingPublishItems.length > 0 ? (
                <ul className="mt-2 space-y-1 text-amber-100/90">
                  {missingPublishItems.map((item) => (
                    <li key={item.id}>
                      - {item.detail}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["draft", "private", "public"] as const).map((visibility) => (
                <button
                  key={visibility}
                  type="button"
                  onClick={() => handleVisibilityChange(visibility)}
                  disabled={updatingVisibility || game.access.visibility === visibility}
                  className={[
                    "rounded-lg border px-2 py-2 text-[11px] font-medium transition-colors",
                    game.access.visibility === visibility
                      ? "border-mystery-700 bg-mystery-950/40 text-mystery-200"
                      : "border-dark-700 bg-dark-950 text-dark-400 hover:border-dark-500 hover:text-dark-200",
                    updatingVisibility ? "opacity-70" : "",
                  ].join(" ")}
                >
                  {VISIBILITY_LABELS[visibility]}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {ownershipState === "claimable" ? (
          <div className="space-y-2 rounded-lg border border-sky-900/70 bg-sky-950/20 px-3 py-3 text-xs leading-5 text-sky-100">
            <p className="font-medium text-sky-200">아직 소유자가 없는 레거시 게임입니다.</p>
            <p>현재 작업자로 귀속하면 이후에는 이 작업자만 편집과 소유권 이관을 할 수 있습니다.</p>
            <button
              type="button"
              onClick={handleClaimOwnership}
              disabled={claimingOwnership}
              className="inline-flex rounded-md border border-sky-700 bg-sky-900/40 px-3 py-2 font-medium text-sky-100 transition-colors hover:border-sky-500 hover:bg-sky-900/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {claimingOwnership ? "귀속 중..." : "내 작업자로 귀속"}
            </button>
          </div>
        ) : null}

        {ownershipState === "owned" ? (
          <form
            onSubmit={handleTransferOwnership}
            className="space-y-2 rounded-lg border border-dark-800 bg-dark-950/70 px-3 py-3"
          >
            <p className="text-[11px] uppercase tracking-[0.18em] text-dark-500">
              소유권 이관
            </p>
            <p className="text-xs leading-5 text-dark-400">
              다른 작업자의 로그인 ID 또는 작업자 키를 입력하면 이 게임 소유자를 바로 바꿉니다.
            </p>
            <input
              type="text"
              value={transferTarget}
              onChange={(event) => setTransferTarget(event.target.value)}
              autoComplete="off"
              className="w-full rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 font-mono text-xs text-dark-100 outline-none transition focus:border-mystery-500"
              placeholder="예: studio-a 또는 123e4567-e89b-12d3-a456-426614174000"
            />
            <button
              type="submit"
              disabled={transferringOwnership}
              className="inline-flex rounded-md border border-dark-700 bg-dark-900 px-3 py-2 text-xs font-medium text-dark-100 transition-colors hover:border-dark-500 hover:bg-dark-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {transferringOwnership ? "이관 중..." : "소유권 이관"}
            </button>
          </form>
        ) : null}

        {/* 액션 버튼 */}
        <div className="flex gap-2 pt-1">
          {canEdit ? (
            <Link
              href={`/maker/${game.id}/edit`}
              className="flex-1 text-center text-xs py-1.5 px-3 rounded bg-dark-800 hover:bg-dark-700 text-dark-200 hover:text-dark-50 border border-dark-600 transition-colors"
            >
              편집
            </Link>
          ) : (
            <span className="flex-1 text-center text-xs py-1.5 px-3 rounded border border-dark-800 bg-dark-950 text-dark-600">
              편집 불가
            </span>
          )}
          {canPlay ? (
            <Link
              href={`/play/${game.id}`}
              className="flex-1 text-center text-xs py-1.5 px-3 rounded bg-mystery-700 hover:bg-mystery-600 text-white border border-mystery-600 transition-colors"
            >
              플레이
            </Link>
          ) : (
            <span className="flex-1 text-center text-xs py-1.5 px-3 rounded border border-dark-800 bg-dark-950 text-dark-600">
              비공개
            </span>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || !canDelete}
            className="text-xs py-1.5 px-2 rounded border border-dark-700 text-dark-500 hover:text-red-400 hover:border-red-800 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            title="삭제"
          >
            {deleting ? "삭제 중" : "삭제"}
          </button>
        </div>

        {actionError ? (
          <p className="text-xs leading-5 text-red-300">{actionError}</p>
        ) : null}
        {actionNotice ? (
          <p className="text-xs leading-5 text-emerald-300">{actionNotice}</p>
        ) : null}
      </div>
    </div>
  );
}
