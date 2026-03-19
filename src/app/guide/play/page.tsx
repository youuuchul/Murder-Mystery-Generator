import Link from "next/link";

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
          플레이어는 GM에게 받은 링크나 코드로 참가합니다. 참가 이후에는 같은 브라우저 자동 복귀와 이름 기반 재참가 흐름이 준비돼 있습니다.
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
            <p>GM이 준 초대 링크로 바로 들어가거나, `게임 참가` 화면에서 6자리 코드를 입력합니다.</p>
            <p>참가할 때는 캐릭터를 고르고 이름을 입력합니다.</p>
            <p>이 이름은 나중에 다른 브라우저에서 재참가할 때 본인 확인 기준으로 다시 사용되니, 신경 써서 입력하는 편이 좋습니다.</p>
          </div>
        </article>

        <article className="rounded-[24px] border border-dark-800 bg-dark-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-sky-300/70">02</p>
          <h3 className="mt-3 text-xl font-semibold text-dark-50">재접속과 재참가</h3>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-dark-300">
            <p>같은 브라우저라면 저장된 토큰을 읽어 자동으로 원래 플레이 화면으로 복귀합니다.</p>
            <p>다른 브라우저나 기기에서는 같은 코드로 다시 들어와 같은 캐릭터를 고른 뒤, 처음 참가 때 입력한 이름을 다시 입력해 복귀할 수 있습니다.</p>
            <p>복귀 시 기존 인벤토리, 진행 상황, 투표 상태는 이어집니다.</p>
          </div>
        </article>

        <article className="rounded-[24px] border border-dark-800 bg-dark-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-sky-300/70">03</p>
          <h3 className="mt-3 text-xl font-semibold text-dark-50">재참가가 막혔을 때</h3>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-dark-300">
            <p>재접속이 꼬이면 GM 화면에서 해당 캐릭터에 `재참가 허용`을 눌러 복구할 수 있습니다.</p>
            <p>이후 플레이어는 다시 코드로 들어와 같은 캐릭터와 같은 이름으로 재참가하면 됩니다.</p>
            <p>최근 버전에서는 이 과정을 거쳐도 해당 캐릭터의 진행 상태가 유지되도록 맞춰져 있습니다.</p>
          </div>
        </article>

        <article className="rounded-[24px] border border-dark-800 bg-dark-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-sky-300/70">04</p>
          <h3 className="mt-3 text-xl font-semibold text-dark-50">GM/플레이어 화면 흐름</h3>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-dark-300">
            <p>대기실과 오프닝에서는 캐릭터 정보 중심으로 진행되고, 본게임 라운드가 시작되면 플레이어 화면은 자동으로 장소 탐색 탭으로 이동합니다.</p>
            <p>투표 페이즈로 넘어가면 플레이어 화면도 자동으로 투표 탭으로 넘어갑니다.</p>
            <p>재접속 안내가 필요하면 GM이 세션 코드와 현재 재참가 방법을 함께 안내하는 편이 좋습니다.</p>
          </div>
        </article>
      </section>
    </div>
  );
}
