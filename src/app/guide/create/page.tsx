import Link from "next/link";

/**
 * 제작자용 빠른 사용 가이드.
 */
export default function CreateGuidePage() {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[28px] border border-dark-800 bg-[radial-gradient(circle_at_top_right,_rgba(168,85,247,0.18),_transparent_38%),linear-gradient(160deg,_rgba(18,18,22,0.98),_rgba(9,9,12,0.98))] p-8 sm:p-10">
        <p className="text-sm uppercase tracking-[0.3em] text-mystery-300/70">Maker Guide</p>
        <h2 className="mt-4 text-3xl font-semibold text-dark-50 sm:text-4xl">게임 만들기</h2>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-dark-300 sm:text-base">
          라이브러리에서 새 게임을 만들고, 단계별로 저장하면서 시나리오를 완성하는 흐름입니다.
          지금 버전은 로컬 서버에 저장되며, 같은 서버에 접속한 다른 제작자와 테스트할 수 있습니다.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/maker/new"
            className="rounded-xl border border-mystery-600 bg-mystery-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mystery-600"
          >
            새 게임 만들기
          </Link>
          <Link
            href="/library"
            className="rounded-xl border border-dark-700 px-4 py-2 text-sm font-medium text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50"
          >
            라이브러리 보기
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-[24px] border border-dark-800 bg-dark-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-mystery-300/70">01</p>
          <h3 className="mt-3 text-xl font-semibold text-dark-50">기본 제작 흐름</h3>
          <ol className="mt-4 space-y-3 text-sm leading-relaxed text-dark-300">
            <li>1. 라이브러리에서 `+ 새 게임 만들기`를 눌러 기본 정보를 만든다.</li>
            <li>2. 편집 화면에서 Step 1~6을 순서대로 채운다.</li>
            <li>3. 각 단계의 내용은 하단 저장 바에서 저장 상태를 확인한다.</li>
            <li>4. 이후에는 라이브러리 카드의 `편집` 버튼으로 다시 들어와 이어서 작업한다.</li>
          </ol>
        </article>

        <article className="rounded-[24px] border border-dark-800 bg-dark-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-mystery-300/70">02</p>
          <h3 className="mt-3 text-xl font-semibold text-dark-50">저장과 다시 편집</h3>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-dark-300">
            <p>저장은 현재 네 로컬 서버의 `data/` 폴더에 기록됩니다.</p>
            <p>브라우저를 닫아도 서버가 살아 있으면 라이브러리에서 다시 열어 수정할 수 있습니다.</p>
            <p>같은 게임을 여러 명이 동시에 만지면 마지막 저장 내용이 덮일 수 있으니, 테스트 중에는 담당 게임을 나눠서 작업하는 편이 안전합니다.</p>
          </div>
        </article>

        <article className="rounded-[24px] border border-dark-800 bg-dark-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-mystery-300/70">03</p>
          <h3 className="mt-3 text-xl font-semibold text-dark-50">AI 제작도우미 활용</h3>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-dark-300">
            <p>우하단 `제작도우미`에서 `자동 / 가이드 / 문안` 모드로 질문할 수 있습니다.</p>
            <p>`가이드`는 구조 조언과 점검용, `문안`은 실제 입력칸에 붙일 초안용으로 생각하면 됩니다.</p>
            <p>스토리 계열 입력은 산문형, 설명 계열 입력은 안내문형으로 답하도록 조정돼 있습니다.</p>
          </div>
        </article>

        <article className="rounded-[24px] border border-dark-800 bg-dark-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-mystery-300/70">04</p>
          <h3 className="mt-3 text-xl font-semibold text-dark-50">외부 제작 테스트</h3>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-dark-300">
            <p>외부 테스트는 서버를 켠 뒤 `/library` 주소를 공유하면 됩니다.</p>
            <p>`MAKER_ACCESS_PASSWORD`를 설정하면 라이브러리와 메이커 편집 경로에 비밀번호 게이트가 걸립니다.</p>
            <p>이 비밀번호는 “제작자 전체 보호용”이며, 아직 게임별 권한 분리나 소유자 전용 편집은 지원하지 않습니다.</p>
          </div>
        </article>
      </section>

      <section className="rounded-[24px] border border-amber-900/70 bg-amber-950/20 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-amber-300/80">현재 상태</p>
        <h3 className="mt-3 text-xl font-semibold text-dark-50">공개/비공개, 게임별 비밀번호</h3>
        <p className="mt-4 text-sm leading-relaxed text-dark-300">
          이 기능들은 아직 정식 구현 전입니다. 지금은 `공개 라이브러리 / 내 게임 / 게임별 비밀번호`가 분리되지 않았고,
          대신 메이커 전체 경로를 잠그는 임시 비밀번호 게이트만 있습니다.
        </p>
      </section>
    </div>
  );
}
