import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getMakerAuthProviderConfig } from "@/lib/maker-auth-config";

/**
 * Supabase SSR 공식 패턴에 맞춰 요청 시작 시 세션을 먼저 확인한다.
 * 갱신된 access/refresh token 이 있으면 request/response 쿠키에 함께 반영한다.
 */
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  const config = getMakerAuthProviderConfig();
  let response = NextResponse.next({
    request,
  });

  if (config.provider !== "supabase") {
    return response;
  }

  const supabase = createServerClient(config.supabaseUrl, config.supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  try {
    await supabase.auth.getUser();
  } catch (error) {
    console.error("[supabase middleware] failed to refresh session", error);
  }

  return response;
}
