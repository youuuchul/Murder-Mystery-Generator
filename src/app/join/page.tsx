/** @screen P-013 — docs/screens.json 참조 */
"use client";

import JoinCodeEntryForm from "./_components/JoinCodeEntryForm";

export default function JoinEntryPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-950 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-dark-50">게임 참가</h1>
          <p className="mt-1 text-sm text-dark-500">GM에게 받은 6자리 코드를 입력하세요</p>
        </div>
        <JoinCodeEntryForm />
      </div>
    </div>
  );
}
