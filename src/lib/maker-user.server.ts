import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AppUser } from "@/types/auth";
import { buildMakerAccessPath, getMakerUserFromCookieStore } from "@/lib/maker-user";

/** 현재 서버 요청에 연결된 메이커 사용자 세션을 읽는다. */
export function getCurrentMakerUser(): AppUser | null {
  return getMakerUserFromCookieStore(cookies());
}

/**
 * 제작/관리 페이지 진입 전 현재 작업자 세션을 강제한다.
 * 세션이 없으면 메이커 접근 페이지로 보낸다.
 */
export function requireCurrentMakerUser(nextPath: string): AppUser {
  const currentUser = getCurrentMakerUser();

  if (!currentUser) {
    redirect(buildMakerAccessPath(nextPath));
  }

  return currentUser;
}
