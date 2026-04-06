import type { NextResponse } from "next/server";
import type { GameSession } from "@/types/session";

export const GM_SESSION_ACCESS_COOKIE_NAME = "mm_gm_session_access";

const GM_SESSION_ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const GM_SESSION_ACCESS_MAX_ENTRIES = 24;

interface CookieStoreLike {
  get(name: string): { value: string } | undefined;
}

interface GmSessionAccessEntry {
  sessionId: string;
  sessionCode: string;
  grantedAt: string;
}

type SessionAccessTarget = Pick<GameSession, "id" | "sessionCode" | "hostUserId">;

function normalizeSessionId(value: string): string {
  return value.trim();
}

function normalizeSessionCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeHostUserId(value?: string | null): string | null {
  const normalizedValue = value?.trim() ?? "";
  return normalizedValue.length > 0 ? normalizedValue : null;
}

/**
 * 응답 쿠키에 넣을 GM 세션 접근 항목을 안전한 형태로 정리한다.
 * 세션 ID/코드가 둘 다 유효할 때만 저장해 브라우저 재진입 기준으로 사용한다.
 */
function normalizeGmSessionAccessEntry(
  value: Partial<GmSessionAccessEntry>
): GmSessionAccessEntry | null {
  const sessionId = typeof value.sessionId === "string" ? normalizeSessionId(value.sessionId) : "";
  const sessionCode = typeof value.sessionCode === "string" ? normalizeSessionCode(value.sessionCode) : "";
  const grantedAt = typeof value.grantedAt === "string" && value.grantedAt.trim()
    ? value.grantedAt
    : new Date().toISOString();

  if (!sessionId || !sessionCode) {
    return null;
  }

  return { sessionId, sessionCode, grantedAt };
}

/**
 * 브라우저에 저장된 GM 세션 접근 쿠키를 복원한다.
 * 손상되거나 오래된 항목은 무시하고 최신 순으로 최대 개수만 유지한다.
 */
export function parseGmSessionAccessCookie(cookieValue: string | undefined): GmSessionAccessEntry[] {
  if (!cookieValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(cookieValue)) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const entries = parsed
      .map((item) => normalizeGmSessionAccessEntry(item as Partial<GmSessionAccessEntry>))
      .filter((item): item is GmSessionAccessEntry => Boolean(item));

    return entries.slice(0, GM_SESSION_ACCESS_MAX_ENTRIES);
  } catch {
    return [];
  }
}

/**
 * 현재 요청 쿠키에서 GM 세션 직접 복귀 권한 목록을 읽는다.
 */
export function getGmSessionAccessEntries(cookieStore: CookieStoreLike): GmSessionAccessEntry[] {
  return parseGmSessionAccessCookie(cookieStore.get(GM_SESSION_ACCESS_COOKIE_NAME)?.value);
}

/**
 * 세션 생성자 여부를 검사한다.
 * 로그인한 작업자가 자기 세션을 다시 열 때 코드 입력을 생략하는 기준이다.
 */
export function isSessionHost(session: SessionAccessTarget, currentUserId?: string | null): boolean {
  const normalizedHostUserId = normalizeHostUserId(session.hostUserId);
  const normalizedCurrentUserId = normalizeHostUserId(currentUserId);

  return Boolean(normalizedHostUserId && normalizedCurrentUserId && normalizedHostUserId === normalizedCurrentUserId);
}

/**
 * 브라우저 쿠키에 이미 저장된 세션 코드가 실제 세션과 일치하는지 확인한다.
 * 같은 브라우저에서 다시 들어올 때만 코드 없이 열리도록 판단한다.
 */
export function hasStoredGmSessionAccess(
  session: SessionAccessTarget,
  cookieStore: CookieStoreLike
): boolean {
  const normalizedSessionId = normalizeSessionId(session.id);
  const normalizedSessionCode = normalizeSessionCode(session.sessionCode);

  return getGmSessionAccessEntries(cookieStore).some((entry) => (
    entry.sessionId === normalizedSessionId
    && entry.sessionCode === normalizedSessionCode
  ));
}

/**
 * 현재 작업자/브라우저 기준으로 이 세션을 코드 없이 바로 열 수 있는지 계산한다.
 */
export function canResumeGmSessionDirectly(
  session: SessionAccessTarget,
  options: {
    currentUserId?: string | null;
    cookieStore?: CookieStoreLike;
  } = {}
): boolean {
  if (isSessionHost(session, options.currentUserId)) {
    return true;
  }

  return options.cookieStore ? hasStoredGmSessionAccess(session, options.cookieStore) : false;
}

/**
 * 기존 쿠키 값에 특정 세션 접근 권한을 최신 항목으로 갱신한다.
 * 중복 세션은 하나만 남기고, 최근 사용 순으로 일정 개수만 유지한다.
 */
export function buildNextGmSessionAccessCookieValue(
  existingCookieValue: string | undefined,
  session: Pick<GameSession, "id" | "sessionCode">
): string {
  const nextEntry = normalizeGmSessionAccessEntry({
    sessionId: session.id,
    sessionCode: session.sessionCode,
    grantedAt: new Date().toISOString(),
  });

  if (!nextEntry) {
    return encodeURIComponent(JSON.stringify([]));
  }

  const dedupedEntries = [
    nextEntry,
    ...parseGmSessionAccessCookie(existingCookieValue).filter((entry) => entry.sessionId !== nextEntry.sessionId),
  ].slice(0, GM_SESSION_ACCESS_MAX_ENTRIES);

  return encodeURIComponent(JSON.stringify(dedupedEntries));
}

/**
 * 특정 응답에 GM 세션 직접 복귀 쿠키를 갱신해 같은 브라우저 재진입을 허용한다.
 */
export function applyGmSessionAccessCookie(
  response: NextResponse,
  existingCookieValue: string | undefined,
  session: Pick<GameSession, "id" | "sessionCode">
): void {
  response.cookies.set(
    GM_SESSION_ACCESS_COOKIE_NAME,
    buildNextGmSessionAccessCookieValue(existingCookieValue, session),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: GM_SESSION_ACCESS_MAX_AGE_SECONDS,
    }
  );
}
