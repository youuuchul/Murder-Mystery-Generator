import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 게임 제작/플레이 가이드 페이지 공통 레이아웃.
 */
export default function GuideLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-dark-950">
      <header className="sticky top-0 z-10 border-b border-dark-800 bg-dark-950/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-mystery-300/70">
              Quick Guide
            </p>
            <h1 className="text-lg font-semibold text-dark-50">사용 가이드</h1>
          </div>
          <Link
            href="/library"
            className="rounded-md border border-dark-700 px-3 py-1.5 text-sm text-dark-300 transition-colors hover:border-dark-500 hover:text-dark-50"
          >
            라이브러리로
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
