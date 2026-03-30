import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  MAKER_ACCESS_COOKIE_NAME,
  isMakerAccessEnabled,
  isProtectedMakerPath,
  isValidMakerAccessToken,
} from "@/lib/maker-access";
import { updateSupabaseSession } from "@/lib/supabase/middleware";
import { copySupabaseResponseCookies } from "@/lib/supabase/ssr";

/**
 * 제작/관리 동선에만 임시 비밀번호 게이트를 적용한다.
 * 플레이어 참가(`/join`)와 실제 플레이 화면은 의도적으로 제외한다.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const sessionResponse = await updateSupabaseSession(request);

  if (!isMakerAccessEnabled() || !isProtectedMakerPath(pathname)) {
    return sessionResponse;
  }

  const token = request.cookies.get(MAKER_ACCESS_COOKIE_NAME)?.value;
  const granted = await isValidMakerAccessToken(token);

  if (granted) {
    return sessionResponse;
  }

  if (pathname.startsWith("/api/")) {
    const response = NextResponse.json(
      { error: "메이커 접근 비밀번호가 필요합니다." },
      { status: 401 }
    );
    copySupabaseResponseCookies(sessionResponse, response);
    return response;
  }

  const url = request.nextUrl.clone();
  url.pathname = "/maker-access";
  url.searchParams.set("next", `${pathname}${search}`);
  const response = NextResponse.redirect(url);
  copySupabaseResponseCookies(sessionResponse, response);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
