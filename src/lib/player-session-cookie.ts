/**
 * 플레이어 세션 토큰을 쿠키로도 동기화하기 위한 유틸.
 *
 * 기존에는 localStorage만 사용했지만, 서버 컴포넌트가 초기 세션 데이터를
 * 읽어서 SSR에 포함시키려면 쿠키가 필요하다 (서버는 localStorage 접근 불가).
 *
 * 동기화 원칙:
 * - 토큰 저장 시 localStorage + 쿠키를 함께 기록
 * - 토큰 삭제 시 둘 다 지움
 * - 쿠키 이름: `mm_t_{sessionId}` (기존 localStorage 키와 구분되도록 prefix 분리)
 * - Path=/, SameSite=Lax, 24시간 유지
 */

export const PLAYER_SESSION_COOKIE_PREFIX = "mm_t_";
export const PLAYER_SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24; // 24h

export function getPlayerSessionCookieName(sessionId: string): string {
  return `${PLAYER_SESSION_COOKIE_PREFIX}${sessionId}`;
}

/** 브라우저 환경에서만 동작. SSR에선 no-op. */
export function persistPlayerSessionToken(sessionId: string, token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`mm_${sessionId}`, token);
  } catch {
    // storage 접근 실패는 쿠키만으로도 진행 가능하므로 무시
  }
  const cookieName = getPlayerSessionCookieName(sessionId);
  const secureAttr = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${cookieName}=${encodeURIComponent(token)}; Max-Age=${PLAYER_SESSION_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secureAttr}`;
}

export function clearPlayerSessionToken(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`mm_${sessionId}`);
  } catch {}
  const cookieName = getPlayerSessionCookieName(sessionId);
  document.cookie = `${cookieName}=; Max-Age=0; Path=/; SameSite=Lax`;
}

/** localStorage에 토큰이 있으면 쿠키가 없을 때만 쿠키로 마이그레이션. */
export function syncPlayerSessionCookieFromLocalStorage(sessionId: string): string | null {
  if (typeof window === "undefined") return null;
  let token: string | null = null;
  try {
    token = window.localStorage.getItem(`mm_${sessionId}`);
  } catch {
    return null;
  }
  if (!token) return null;
  const cookieName = getPlayerSessionCookieName(sessionId);
  const hasCookie = document.cookie.split(";").some((part) => part.trim().startsWith(`${cookieName}=`));
  if (!hasCookie) {
    const secureAttr = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${cookieName}=${encodeURIComponent(token)}; Max-Age=${PLAYER_SESSION_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secureAttr}`;
  }
  return token;
}
