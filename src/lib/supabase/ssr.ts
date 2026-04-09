import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { getMakerAuthProviderConfig } from "@/lib/maker-auth-config";

type SupabaseCookie = {
  name: string;
  value: string;
};

type SupabaseResponseCookie = SupabaseCookie & {
  options: CookieOptions;
};

interface CookieStoreWithGetAll {
  getAll(): SupabaseCookie[];
}

/**
 * SSR 클라이언트 생성에 필요한 Supabase 설정을 읽는다.
 * 메이커 인증은 Supabase 단일 구현이므로 필수 환경변수 유효성만 확인한다.
 */
function getSupabaseSsrConfig() {
  const config = getMakerAuthProviderConfig();

  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    throw new Error("Supabase SSR helpers require NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }

  return config;
}

/** Next.js 쿠키 스토어를 `@supabase/ssr` 형식으로 평탄화한다. */
function readCookies(cookieStore: CookieStoreWithGetAll): SupabaseCookie[] {
  return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
}

/** Supabase가 요청한 쿠키 갱신 목록을 NextResponse에 그대로 적용한다. */
function applyResponseCookies(
  response: NextResponse,
  cookiesToSet: SupabaseResponseCookie[]
) {
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
}

/**
 * Server Component / Route Handler 읽기 전용 인증 확인에 쓰는 Supabase SSR client.
 * 실제 토큰 갱신은 middleware 가 담당하므로 여기서는 `getAll`만 제공한다.
 */
export function createSupabaseReadOnlyClient(cookieStore: CookieStoreWithGetAll) {
  const config = getSupabaseSsrConfig();

  return createServerClient(config.supabaseUrl, config.supabasePublishableKey, {
    cookies: {
      getAll() {
        return readCookies(cookieStore);
      },
    },
  });
}

/** 현재 Server Component 요청에 연결된 Supabase SSR client 를 만든다. */
export function createSupabaseServerComponentClient() {
  return createSupabaseReadOnlyClient(cookies());
}

/** API Route Handler 요청 쿠키를 그대로 읽는 Supabase SSR client 를 만든다. */
export function createSupabaseRequestClient(request: NextRequest) {
  return createSupabaseReadOnlyClient(request.cookies);
}

/**
 * Route Handler 안에서 로그인/로그아웃처럼 세션 쿠키를 변경할 때 쓰는 Supabase SSR client.
 * 갱신된 세션 쿠키는 전달받은 `response` 에 바로 기록된다.
 */
export function createSupabaseRouteHandlerClient(
  request: NextRequest,
  response: NextResponse
) {
  const config = getSupabaseSsrConfig();

  return createServerClient(config.supabaseUrl, config.supabasePublishableKey, {
    cookies: {
      getAll() {
        return readCookies(request.cookies);
      },
      setAll(cookiesToSet) {
        applyResponseCookies(response, cookiesToSet);
      },
    },
  });
}

/**
 * middleware 에서 만들어 둔 세션 쿠키 변경분을 다른 응답 객체로 복사한다.
 * 메이커 게이트 리다이렉트나 JSON 401 응답을 만들어도 토큰 갱신 결과가 유실되지 않게 유지한다.
 */
export function copySupabaseResponseCookies(
  source: NextResponse,
  target: NextResponse
) {
  source.cookies.getAll().forEach(({ name, value, ...options }) => {
    target.cookies.set(name, value, options);
  });
}
