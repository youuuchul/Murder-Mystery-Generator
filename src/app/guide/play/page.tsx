/** @screen P-004 — docs/screens.json 참조 */
import Link from "next/link";

import { GuidePolicySection } from "../_components/GuidePolicySection";

/**
 * 플레이어/GM용 빠른 사용 가이드.
 */
export default function PlayGuidePage() {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[28px] border border-dark-800 bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.16),_transparent_34%),linear-gradient(160deg,_rgba(17,18,22,0.98),_rgba(8,9,12,0.98))] p-8 sm:p-10">
        <p className="text-sm uppercase tracking-[0.3em] text-sky-300/70">Player Guide</p>
        <h2 className="mt-4 text-3xl font-semibold text-dark-50 sm:text-4xl">게임 플레이하기</h2>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-dark-300 sm:text-base">
          플레이어는 받은 코드나 링크로 참가하고, 진행 중에는 같은 방으로 다시 돌아올 수 있습니다.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/join"
            className="rounded-xl border border-sky-700 bg-sky-800/70 px-4 py-2 text-sm font-medium text-sky-50 transition-colors hover:bg-sky-700"
          >
            참가 코드 입력
          </Link>
          <Link
            href="/library"
            className="rounded-xl border border-dark-700 px-4 py-2 text-sm font-medium text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50"
          >
            라이브러리로
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-[24px] border border-dark-800 bg-dark-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-sky-300/70">01</p>
          <h3 className="mt-3 text-xl font-semibold text-dark-50">참가하기</h3>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-dark-300">
            <p>초대 링크로 바로 들어가거나, `참가 코드 입력`에서 6자리 코드를 입력해 입장합니다.</p>
            <p>참가할 때는 캐릭터를 고르고 이름을 입력합니다.</p>
            <p>이 이름은 다시 들어올 때 본인 확인에 쓰이니, 처음 입력한 이름을 기억해두는 편이 좋습니다.</p>
          </div>
        </article>

        <article className="rounded-[24px] border border-dark-800 bg-dark-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-sky-300/70">02</p>
          <h3 className="mt-3 text-xl font-semibold text-dark-50">재접속과 재참가</h3>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-dark-300">
            <p>같은 브라우저라면 원래 플레이 화면으로 자동 복귀합니다.</p>
            <p>다른 브라우저나 기기에서는 같은 코드로 다시 들어와 같은 캐릭터와 이름을 입력하면 복귀할 수 있습니다.</p>
            <p>복귀 후에는 기존 인벤토리와 진행 상태가 그대로 이어집니다.</p>
          </div>
        </article>

        <article className="rounded-[24px] border border-dark-800 bg-dark-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-sky-300/70">03</p>
          <h3 className="mt-3 text-xl font-semibold text-dark-50">재참가가 막혔을 때</h3>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-dark-300">
            <p>재접속이 꼬이면 GM이 해당 캐릭터의 재참가를 다시 열어줄 수 있습니다.</p>
            <p>이후에는 같은 코드, 같은 캐릭터, 같은 이름으로 다시 들어오면 됩니다.</p>
            <p>이 과정에서도 기존 진행 정보는 유지됩니다.</p>
          </div>
        </article>

        <article className="rounded-[24px] border border-dark-800 bg-dark-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-sky-300/70">04</p>
          <h3 className="mt-3 text-xl font-semibold text-dark-50">GM/플레이어 화면 흐름</h3>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-dark-300">
            <p>대기실과 오프닝에서는 공통화면과 캐릭터 정보를 먼저 확인합니다.</p>
            <p>본게임이 시작되면 장소 탐색, 인벤토리, 투표 흐름으로 자동 이동합니다.</p>
            <p>도중에 끊겨도 같은 코드로 다시 들어오면 이어서 진행할 수 있습니다.</p>
          </div>
        </article>
      </section>

      <GuidePolicySection />
    </div>
  );
}
