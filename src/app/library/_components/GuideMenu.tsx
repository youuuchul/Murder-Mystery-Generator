import Link from "next/link";

/**
 * 라이브러리 헤더에서 제작/플레이 가이드 페이지로 이동시키는 드롭다운 메뉴.
 */
export default function GuideMenu() {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-3 py-1.5 text-sm text-dark-400 transition-colors hover:text-dark-100 [&::-webkit-details-marker]:hidden">
        가이드
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-4 w-4 transition-transform group-open:rotate-180"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.112l3.71-3.88a.75.75 0 1 1 1.08 1.04l-4.25 4.444a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </summary>

      <div className="absolute right-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-2xl border border-dark-700 bg-dark-900/95 p-2 shadow-2xl shadow-black/40 backdrop-blur">
        <Link
          href="/guide/create"
          className="block rounded-xl border border-transparent px-4 py-3 transition-colors hover:border-mystery-800 hover:bg-dark-800"
        >
          <p className="text-sm font-semibold text-dark-50">게임 만들기</p>
          <p className="mt-1 text-xs leading-relaxed text-dark-400">
            새 게임 생성, 단계별 저장, AI 제작도우미, 외부 제작 테스트 흐름을 확인합니다.
          </p>
        </Link>

        <Link
          href="/guide/play"
          className="mt-2 block rounded-xl border border-transparent px-4 py-3 transition-colors hover:border-mystery-800 hover:bg-dark-800"
        >
          <p className="text-sm font-semibold text-dark-50">게임 플레이하기</p>
          <p className="mt-1 text-xs leading-relaxed text-dark-400">
            초대 링크, 코드 입력, 참가, 재참가, GM 복구 흐름을 빠르게 확인합니다.
          </p>
        </Link>
      </div>
    </details>
  );
}
