"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

type MobileNavMenuProps = {
  displayName: string;
  isAdmin?: boolean;
  logoutNextPath?: string;
  /** 페이지별 추가 링크 (e.g. 세션 관리, 제작 보호 ON 등) */
  extraItems?: Array<{ label: string; href: string; variant?: "default" | "badge" }>;
};

/**
 * 모바일 전용 ⋮ 햄버거 메뉴. sm(640px) 이상에서는 렌더링되지 않는다.
 * 가이드 링크, 계정 요약, 로그아웃을 flat 리스트로 제공한다.
 */
export default function MobileNavMenu({
  displayName,
  isAdmin,
  logoutNextPath = "/maker-access",
  extraItems,
}: MobileNavMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen]);

  // 뒤로가기/링크 이동 시 메뉴 닫기
  useEffect(() => {
    if (!isOpen) return;
    const close = () => setIsOpen(false);
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, [isOpen]);

  return (
    <div className="relative sm:hidden" ref={ref}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-dark-700 bg-dark-900/80 text-dark-400 transition-colors hover:border-dark-500 hover:text-dark-100"
        aria-label="메뉴 열기"
      >
        <svg viewBox="0 0 4 16" fill="currentColor" className="h-4 w-1">
          <circle cx="2" cy="2" r="1.5" />
          <circle cx="2" cy="8" r="1.5" />
          <circle cx="2" cy="14" r="1.5" />
        </svg>
      </button>

      {isOpen && (
        <div className="fixed inset-x-3 top-[calc(4rem+0.5rem)] z-20 overflow-hidden rounded-2xl border border-dark-700 bg-dark-900/95 shadow-2xl shadow-black/40 backdrop-blur">
          {/* 계정 요약 */}
          <div className="border-b border-dark-800 px-4 py-3">
            <p className="text-[11px] uppercase tracking-widest text-dark-500">계정</p>
            <p className="mt-1 text-sm font-medium text-dark-100">
              작업자 {displayName}
            </p>
          </div>

          {/* 메뉴 항목 */}
          <div className="p-2">
            <Link
              href="/guide/create"
              onClick={() => setIsOpen(false)}
              className="block rounded-xl px-4 py-2.5 text-sm text-dark-200 transition-colors hover:bg-dark-800 hover:text-dark-50"
            >
              게임 만들기 가이드
            </Link>
            <Link
              href="/guide/play"
              onClick={() => setIsOpen(false)}
              className="block rounded-xl px-4 py-2.5 text-sm text-dark-200 transition-colors hover:bg-dark-800 hover:text-dark-50"
            >
              게임 플레이 가이드
            </Link>

            {isAdmin && (
              <Link
                href="/library/manage/sessions"
                onClick={() => setIsOpen(false)}
                className="block rounded-xl px-4 py-2.5 text-sm font-medium text-amber-300 transition-colors hover:bg-dark-800"
              >
                ADMIN 세션 관리
              </Link>
            )}

            {extraItems?.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={
                  item.variant === "badge"
                    ? "mt-1 block rounded-xl px-4 py-2.5 text-sm text-emerald-300 transition-colors hover:bg-dark-800"
                    : "block rounded-xl px-4 py-2.5 text-sm text-dark-200 transition-colors hover:bg-dark-800 hover:text-dark-50"
                }
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* 로그아웃 */}
          <div className="border-t border-dark-800 p-2">
            <form action="/api/maker-access" method="post">
              <input type="hidden" name="intent" value="logout" />
              <input type="hidden" name="next" value={logoutNextPath} />
              <button
                type="submit"
                className="w-full rounded-xl px-4 py-2.5 text-left text-sm text-dark-400 transition-colors hover:bg-dark-800 hover:text-dark-200"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
