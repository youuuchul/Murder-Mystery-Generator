"use client";

import { useState } from "react";
import JoinCodeEntryForm from "@/app/join/_components/JoinCodeEntryForm";

/**
 * 공개 라이브러리 상단에서 플레이어가 바로 참가 코드를 입력할 수 있게 여는 토글 영역.
 */
export default function LibraryQuickJoin() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-6 rounded-2xl border border-dark-800/80 bg-dark-950/45 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-dark-100">참가 코드를 받았다면 바로 들어오세요</p>
          <p className="text-sm text-dark-400">
            게임을 고르지 않아도 6자리 코드만 있으면 바로 입장할 수 있습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="inline-flex items-center justify-center rounded-full border border-dark-700 bg-dark-900/80 px-4 py-2 text-sm font-medium text-dark-100 transition hover:border-dark-500 hover:text-dark-50"
        >
          {isOpen ? "코드 입력 닫기" : "코드 입력으로 바로 참여"}
        </button>
      </div>

      {isOpen ? (
        <div className="mt-4 border-t border-dark-800/80 pt-4">
          <JoinCodeEntryForm compact />
        </div>
      ) : null}
    </div>
  );
}
