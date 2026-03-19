import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  MAKER_ACCESS_COOKIE_NAME,
  isMakerAccessEnabled,
  isValidMakerAccessToken,
} from "@/lib/maker-access";

type Props = {
  searchParams: Promise<{
    next?: string;
    error?: string;
  }>;
};

/**
 * 메이커/라이브러리 접근용 임시 비밀번호 입력 화면.
 * 로컬/터널 공유 테스트에서 제작 동선만 가볍게 보호하는 용도다.
 */
export default async function MakerAccessPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  const nextPath = next && next.startsWith("/") ? next : "/library";

  if (!isMakerAccessEnabled()) {
    redirect(nextPath);
  }

  const cookieStore = cookies();
  const granted = await isValidMakerAccessToken(
    cookieStore.get(MAKER_ACCESS_COOKIE_NAME)?.value
  );

  if (granted) {
    redirect(nextPath);
  }

  return (
    <div className="min-h-screen bg-dark-950 px-4 py-10 text-dark-50">
      <div className="mx-auto max-w-md rounded-3xl border border-dark-800 bg-dark-900 p-8 shadow-2xl">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.24em] text-mystery-400">
            Maker Access
          </p>
          <h1 className="mt-3 text-2xl font-semibold">제작자 접근 비밀번호</h1>
          <p className="mt-2 text-sm leading-6 text-dark-400">
            현재 서버는 제작/관리 화면만 임시 비밀번호로 보호하고 있습니다.
            플레이어 참가와 실제 플레이 화면은 이 게이트와 별개입니다.
          </p>
        </div>

        {error === "invalid" ? (
          <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            비밀번호가 올바르지 않습니다.
          </div>
        ) : null}

        <form action="/api/maker-access" method="post" className="space-y-4">
          <input type="hidden" name="next" value={nextPath} />
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-dark-200">
              비밀번호
            </span>
            <input
              type="password"
              name="password"
              required
              autoFocus
              className="w-full rounded-xl border border-dark-700 bg-dark-950 px-4 py-3 text-sm text-dark-50 outline-none transition focus:border-mystery-500"
              placeholder="공유받은 제작자 비밀번호"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-xl border border-mystery-600 bg-mystery-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-mystery-600"
          >
            라이브러리 들어가기
          </button>
        </form>

        <p className="mt-5 text-xs leading-5 text-dark-500">
          접속 후에는 브라우저에 임시 접근 쿠키가 저장됩니다. 테스트가 끝나면
          브라우저 쿠키를 지우거나 비밀번호를 바꾸면 됩니다.
        </p>
      </div>
    </div>
  );
}
