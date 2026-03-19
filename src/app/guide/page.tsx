import Link from "next/link";

/**
 * 가이드 허브 페이지.
 */
export default function GuideIndexPage() {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[28px] border border-dark-800 bg-[radial-gradient(circle_at_top_left,_rgba(168,85,247,0.22),_transparent_40%),linear-gradient(135deg,_rgba(20,20,24,0.95),_rgba(9,9,12,0.98))] p-8 sm:p-10">
        <p className="text-sm uppercase tracking-[0.34em] text-mystery-300/70">Guide Hub</p>
        <h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight text-dark-50 sm:text-4xl">
          지금 필요한 흐름만 바로 열어볼 수 있게 제작과 플레이 가이드를 분리해뒀습니다.
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-dark-300 sm:text-base">
          라이브러리에서 게임을 만드는 사람과, 초대 코드를 받아 플레이에 참가하는 사람이 확인해야 하는
          절차가 다르기 때문에 진입 가이드를 두 갈래로 나눴습니다.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href="/guide/create"
          className="group rounded-[24px] border border-dark-800 bg-dark-900/70 p-6 transition-colors hover:border-mystery-700 hover:bg-dark-900"
        >
          <p className="text-sm uppercase tracking-[0.2em] text-mystery-300/70">For Makers</p>
          <h3 className="mt-3 text-2xl font-semibold text-dark-50">게임 만들기</h3>
          <p className="mt-3 text-sm leading-relaxed text-dark-400">
            새 게임 생성, 단계별 저장, AI 제작도우미, 다시 편집, 외부 제작 테스트 흐름을 확인합니다.
          </p>
          <p className="mt-6 text-sm font-medium text-mystery-300 transition-transform group-hover:translate-x-1">
            제작 가이드 열기 →
          </p>
        </Link>

        <Link
          href="/guide/play"
          className="group rounded-[24px] border border-dark-800 bg-dark-900/70 p-6 transition-colors hover:border-mystery-700 hover:bg-dark-900"
        >
          <p className="text-sm uppercase tracking-[0.2em] text-mystery-300/70">For Players</p>
          <h3 className="mt-3 text-2xl font-semibold text-dark-50">게임 플레이하기</h3>
          <p className="mt-3 text-sm leading-relaxed text-dark-400">
            초대 URL, 코드 입력, 참가, 재참가, GM 복구 시나리오를 빠르게 확인합니다.
          </p>
          <p className="mt-6 text-sm font-medium text-mystery-300 transition-transform group-hover:translate-x-1">
            플레이 가이드 열기 →
          </p>
        </Link>
      </section>
    </div>
  );
}
