import type { AppUser } from "@/types/auth";

export const MAKER_USER_COOKIE_NAME = "mm_maker_user";

const MAKER_USER_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
const MAKER_DISPLAY_NAME_MAX_LENGTH = 32;
const MAKER_USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface CookieStoreLike {
  get(name: string): { value: string } | undefined;
}

/**
 * 메이커 사용자 표시 이름을 쿠키 저장 전 형태로 정리한다.
 * 비어 있는 값은 그대로 두고, 길이만 안전한 범위로 제한한다.
 */
export function normalizeMakerDisplayName(value: string): string {
  return value.trim().slice(0, MAKER_DISPLAY_NAME_MAX_LENGTH);
}

/** 표시 이름이 최소 입력 조건을 만족하는지 검사한다. */
export function isValidMakerDisplayName(value: string): boolean {
  return normalizeMakerDisplayName(value).length > 0;
}

/** 작업자 복구 키 형식으로 쓸 userId 문자열을 정리한다. */
export function normalizeMakerUserId(value: string): string {
  return value.trim().toLowerCase();
}

/** 작업자 복구 키가 UUID 형식인지 검사한다. */
export function isValidMakerUserId(value: string): boolean {
  return MAKER_USER_ID_PATTERN.test(normalizeMakerUserId(value));
}

/**
 * 현재 사용자 쿠키가 있으면 같은 userId를 유지하고,
 * 없으면 새 작업자 세션 ID를 만든다.
 */
export function createMakerUser(displayName: string, existingUserId?: string): AppUser {
  return {
    id: normalizeMakerUserId(existingUserId ?? "") || crypto.randomUUID(),
    displayName: normalizeMakerDisplayName(displayName),
  };
}

/** 사용자 세션을 안전하게 쿠키 문자열로 직렬화한다. */
export function serializeMakerUser(user: AppUser): string {
  return encodeURIComponent(
    JSON.stringify({
      id: user.id,
      displayName: normalizeMakerDisplayName(user.displayName),
    })
  );
}

/** 쿠키 문자열을 메이커 사용자 세션으로 복원한다. */
export function parseMakerUser(cookieValue: string | undefined): AppUser | null {
  if (!cookieValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(cookieValue)) as Partial<AppUser>;
    const id = typeof parsed.id === "string" ? parsed.id.trim() : "";
    const displayName = normalizeMakerDisplayName(
      typeof parsed.displayName === "string" ? parsed.displayName : ""
    );

    if (!id || !displayName) {
      return null;
    }

    return { id, displayName };
  } catch {
    return null;
  }
}

/** Request cookies / `cookies()` 모두에서 현재 작업자 세션을 읽는다. */
export function getMakerUserFromCookieStore(cookieStore: CookieStoreLike): AppUser | null {
  return parseMakerUser(cookieStore.get(MAKER_USER_COOKIE_NAME)?.value);
}

/** 메이커 사용자 세션 쿠키 기본 옵션. */
export function getMakerUserCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAKER_USER_MAX_AGE_SECONDS,
  };
}

/** 메이커 로그인 후 돌아갈 내부 경로를 안전하게 정리한다. */
export function normalizeMakerNextPath(
  value: string | null | undefined,
  fallback = "/library"
): string {
  return value && value.startsWith("/") ? value : fallback;
}

/** 현재 작업자 세션이 없을 때 보낼 로그인 경로를 만든다. */
export function buildMakerAccessPath(nextPath: string): string {
  const params = new URLSearchParams({
    next: normalizeMakerNextPath(nextPath),
  });

  return `/maker-access?${params.toString()}`;
}
