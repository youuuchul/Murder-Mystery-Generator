/**
 * maker-access.ts
 * 메이커/라이브러리 보호용 임시 비밀번호 게이트 유틸리티.
 *
 * 목표:
 * - 로컬/터널 환경에서 제작자 테스트 시 최소한의 접근 제어 제공
 * - `/join` 과 플레이 동선은 건드리지 않고 제작/관리 동선만 보호
 */

export const MAKER_ACCESS_COOKIE_NAME = "mm_maker_access";

const MAKER_ACCESS_TOKEN_PREFIX = "maker-access:";

/**
 * 메이커 접근 비밀번호를 읽는다.
 * 비어 있으면 게이트가 비활성화된 것으로 간주한다.
 */
export function getMakerAccessPassword(): string {
  return process.env.MAKER_ACCESS_PASSWORD?.trim() ?? "";
}

/** 비밀번호가 설정돼 있으면 메이커 게이트를 활성화한다. */
export function isMakerAccessEnabled(): boolean {
  return getMakerAccessPassword().length > 0;
}

/**
 * 비밀번호를 직접 쿠키에 저장하지 않기 위해
 * SHA-256 기반 세션 토큰 문자열로 변환한다.
 */
export async function createMakerAccessToken(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(`${MAKER_ACCESS_TOKEN_PREFIX}${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** 현재 요청에 설정된 쿠키 값이 유효한 메이커 접근 토큰인지 검사한다. */
export async function isValidMakerAccessToken(cookieValue: string | undefined): Promise<boolean> {
  if (!isMakerAccessEnabled()) {
    return true;
  }

  if (!cookieValue) {
    return false;
  }

  const expected = await createMakerAccessToken(getMakerAccessPassword());
  return cookieValue === expected;
}

/** 메이커 접근 쿠키 기본 옵션. */
export function getMakerAccessCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}

/** 현재 pathname이 임시 메이커 게이트 보호 대상인지 판별한다. */
export function isProtectedMakerPath(pathname: string): boolean {
  if (pathname === "/library" || pathname.startsWith("/library/")) {
    return true;
  }

  if (pathname === "/maker" || pathname.startsWith("/maker/")) {
    return true;
  }

  if (pathname === "/api/maker-assistant" || pathname.startsWith("/api/maker-assistant/")) {
    return true;
  }

  if (pathname === "/api/games" || pathname.startsWith("/api/games/")) {
    return !/^\/api\/games\/[^/]+\/assets\/.+/.test(pathname);
  }

  return false;
}
