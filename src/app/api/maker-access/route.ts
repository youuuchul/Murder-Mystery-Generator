import { NextRequest, NextResponse } from "next/server";
import {
  MAKER_ACCESS_COOKIE_NAME,
  createMakerAccessToken,
  getMakerAccessCookieOptions,
  getMakerAccessPassword,
  isMakerAccessEnabled,
} from "@/lib/maker-access";

/**
 * POST /api/maker-access
 * 메이커 접근 비밀번호를 검증하고 임시 세션 쿠키를 발급한다.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/library");

  if (!isMakerAccessEnabled()) {
    return NextResponse.redirect(new URL(next || "/library", request.url), 303);
  }

  if (password !== getMakerAccessPassword()) {
    const failureUrl = new URL("/maker-access", request.url);
    failureUrl.searchParams.set("error", "invalid");
    failureUrl.searchParams.set("next", next || "/library");
    return NextResponse.redirect(failureUrl, 303);
  }

  const token = await createMakerAccessToken(password);
  const response = NextResponse.redirect(new URL(next || "/library", request.url), 303);

  response.cookies.set(
    MAKER_ACCESS_COOKIE_NAME,
    token,
    getMakerAccessCookieOptions()
  );

  return response;
}

/**
 * DELETE /api/maker-access
 * 발급한 메이커 접근 쿠키를 제거한다.
 */
export async function DELETE(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next") || "/maker-access";
  const response = NextResponse.redirect(new URL(next, request.url), 303);

  response.cookies.delete(MAKER_ACCESS_COOKIE_NAME);
  return response;
}
