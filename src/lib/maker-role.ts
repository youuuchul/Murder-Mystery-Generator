import type { AppUser, MakerRole } from "@/types/auth";

/**
 * 외부 입력이나 레거시 데이터를 현재 지원하는 작업자 role 값으로 정규화한다.
 * 알 수 없는 값은 모두 기본 권한인 `creator`로 수렴시킨다.
 */
export function normalizeMakerRole(value: unknown): MakerRole {
  return value === "admin" ? "admin" : "creator";
}

/**
 * 현재 작업자가 운영용 관리자 권한인지 검사한다.
 * null/undefined와 레거시 쿠키는 모두 일반 작업자로 취급한다.
 */
export function isMakerAdmin(user?: Pick<AppUser, "role"> | null): boolean {
  return normalizeMakerRole(user?.role) === "admin";
}
