import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { AppUser } from "@/types/auth";
import { getMakerAuthProviderConfig } from "@/lib/maker-auth-config";
import { getMakerAuthGateway } from "@/lib/maker-auth-gateway";
import {
  buildMakerAccessPath,
  getMakerUserFromCookieStore,
  normalizeMakerDisplayName,
} from "@/lib/maker-user";
import { normalizeMakerRole } from "@/lib/maker-role";
import {
  createSupabaseRequestClient,
  createSupabaseServerComponentClient,
} from "@/lib/supabase/ssr";

const makerAuthGateway = getMakerAuthGateway();

/**
 * Supabase Auth 사용자와 profiles 레코드를 합쳐 현재 작업자 식별 정보를 복원한다.
 * profiles 가 일시적으로 비어 있어도 user metadata 의 display name 으로 최소 식별은 유지한다.
 */
async function resolveSupabaseMakerUser(
  getUser: () => Promise<{
    data: { user: { id: string; user_metadata?: Record<string, unknown> } | null };
    error: { message: string } | null;
  }>
): Promise<AppUser | null> {
  const { data, error } = await getUser();
  if (error || !data.user) {
    return null;
  }

  const account = await makerAuthGateway.getAccountById(data.user.id);
  const fallbackDisplayName = normalizeMakerDisplayName(
    typeof data.user.user_metadata?.display_name === "string"
      ? data.user.user_metadata.display_name
      : typeof data.user.user_metadata?.name === "string"
        ? data.user.user_metadata.name
        : ""
  );
  const displayName = account?.displayName ?? fallbackDisplayName;

  if (!displayName) {
    return null;
  }

  return {
    id: data.user.id,
    displayName,
    role: normalizeMakerRole(account?.role),
  };
}

/** 현재 서버 요청에 연결된 메이커 사용자 세션을 읽는다. */
export async function getCurrentMakerUser(): Promise<AppUser | null> {
  if (getMakerAuthProviderConfig().provider !== "supabase") {
    return getMakerUserFromCookieStore(cookies());
  }

  const supabase = createSupabaseServerComponentClient();
  return resolveSupabaseMakerUser(() => supabase.auth.getUser());
}

/** Route Handler 요청에서 현재 작업자 세션을 검증된 사용자 기준으로 읽는다. */
export async function getRequestMakerUser(request: NextRequest): Promise<AppUser | null> {
  if (getMakerAuthProviderConfig().provider !== "supabase") {
    return getMakerUserFromCookieStore(request.cookies);
  }

  const supabase = createSupabaseRequestClient(request);
  return resolveSupabaseMakerUser(() => supabase.auth.getUser());
}

/**
 * 제작/관리 페이지 진입 전 현재 작업자 세션을 강제한다.
 * 세션이 없으면 메이커 접근 페이지로 보낸다.
 */
export async function requireCurrentMakerUser(nextPath: string): Promise<AppUser> {
  const currentUser = await getCurrentMakerUser();

  if (!currentUser) {
    redirect(buildMakerAccessPath(nextPath));
  }

  return currentUser;
}
