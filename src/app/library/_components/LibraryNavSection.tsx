import Link from "next/link";
import { getMakerAuthGateway } from "@/lib/maker-auth-gateway";
import { isMakerAdmin } from "@/lib/maker-role";
import { buildMakerAccessPath } from "@/lib/maker-user";
import { getCurrentMakerUser } from "@/lib/maker-user.server";
import GuideMenu from "./GuideMenu";
import MakerAccountMenu from "./MakerAccountMenu";
import MobileNavMenu from "./MobileNavMenu";

const makerAuthGateway = getMakerAuthGateway();

type Props = {
  errorMessage: string | null;
  noticeMessage: string | null;
};

/**
 * 인증 관련 네비게이션.
 * getCurrentMakerUser + getAccountById는 Supabase Auth 왕복이 필요해서
 * Library 페이지 초기 HTML 전송을 블로킹하지 않도록 Suspense 안에 둔다.
 */
export default async function LibraryNavSection({ errorMessage, noticeMessage }: Props) {
  const currentUser = await getCurrentMakerUser();
  const currentAccount = currentUser
    ? await makerAuthGateway.getAccountById(currentUser.id)
    : null;

  if (!currentUser) {
    return (
      <Link
        href={buildMakerAccessPath("/library/manage")}
        className="rounded-md border border-mystery-800/60 bg-mystery-950/30 px-3 py-1.5 text-sm text-mystery-200 transition-colors hover:border-mystery-600 hover:text-mystery-50"
      >
        제작자 로그인
      </Link>
    );
  }

  return (
    <>
      <div className="hidden items-center gap-2 sm:flex">
        <GuideMenu />
        {isMakerAdmin(currentUser) ? (
          <Link
            href="/library/manage/sessions"
            className="rounded-full border border-amber-800 bg-amber-950/50 px-3 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-950/70"
          >
            ADMIN
          </Link>
        ) : null}
      </div>

      <div className="[&>details>summary]:hidden [&>details>summary]:sm:flex">
        <MakerAccountMenu
          currentUser={currentUser}
          currentAccount={currentAccount}
          nextPath="/library"
          errorMessage={errorMessage}
          noticeMessage={noticeMessage}
        />
      </div>

      <MobileNavMenu
        displayName={currentUser.displayName}
        isAdmin={isMakerAdmin(currentUser)}
        showAccountLink
      />

      <Link
        href="/library/manage"
        className="rounded-md border border-mystery-800/60 bg-mystery-950/30 px-3 py-1.5 text-sm text-mystery-200 transition-colors hover:border-mystery-600 hover:text-mystery-50"
      >
        내 게임 관리
      </Link>
    </>
  );
}

export function LibraryNavSectionSkeleton() {
  return (
    <div
      aria-hidden
      className="h-8 w-32 animate-pulse rounded-md border border-dark-800 bg-dark-900/60"
    />
  );
}
