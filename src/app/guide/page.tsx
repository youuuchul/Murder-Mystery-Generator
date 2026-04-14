/** @screen P-002 — docs/screens.json 참조 */
import Link from "next/link";

import { GuidePolicySection } from "./_components/GuidePolicySection";

/**
 * 가이드 허브 페이지.
 */
export default function GuideIndexPage() {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[28px] border border-dark-800 bg-[radial-gradient(circle_at_top_left,_rgba(168,85,247,0.22),_transparent_40%),linear-gradient(135deg,_rgba(20,20,24,0.95),_rgba(9,9,12,0.98))] p-8 sm:p-10">
        <p className="text-sm uppercase tracking-[0.34em] text-mystery-300/70">Guide Hub</p>
        <h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight text-dark-50 sm:text-4xl">어떤 방식으로 시작할지 먼저 골라주세요.</h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-dark-300 sm:text-base">
          게임을 만들 사람과 플레이에 참여할 사람의 준비 과정이 달라서, 필요한 흐름만 바로 볼 수 있게 나눠뒀습니다.
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
            새 시나리오 작성, 저장, 공개 전 점검, 다시 편집하는 흐름을 확인합니다.
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
            코드로 참가하기, 다시 접속하기, 진행 중 알아둘 흐름을 빠르게 확인합니다.
          </p>
          <p className="mt-6 text-sm font-medium text-mystery-300 transition-transform group-hover:translate-x-1">
            플레이 가이드 열기 →
          </p>
        </Link>
      </section>

      <GuidePolicySection />
    </div>
  );
}
