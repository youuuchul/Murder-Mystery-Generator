import Link from "next/link";

import { GuidePolicySection } from "../_components/GuidePolicySection";

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
          새 게임을 만들고, 단계별로 내용을 채워 공개 전까지 다듬는 흐름입니다.
          작업 중인 게임은 저장 후 다시 열어 이어서 편집할 수 있습니다.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/maker/new"
            className="rounded-xl border border-mystery-600 bg-mystery-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mystery-600"
          >
            새 게임 만들기
          </Link>
          <Link
            href="/library/manage"
            className="rounded-xl border border-dark-700 px-4 py-2 text-sm font-medium text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50"
          >
            내 게임 관리
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-[24px] border border-dark-800 bg-dark-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-mystery-300/70">01</p>
          <h3 className="mt-3 text-xl font-semibold text-dark-50">기본 제작 흐름</h3>
          <ol className="mt-4 space-y-3 text-sm leading-relaxed text-dark-300">
            <li>1. `내 게임 관리`에서 `+ 새 게임 만들기`를 눌러 기본 정보를 만듭니다.</li>
            <li>2. 편집 화면에서 Step 1~6을 순서대로 채워 시나리오를 완성합니다.</li>
            <li>3. 각 단계에서 저장 상태를 확인하며 필요한 부분을 다시 다듬습니다.</li>
            <li>4. 완성 전에는 비공개로 점검하고, 준비가 되면 공개로 전환합니다.</li>
          </ol>
        </article>

        <article className="rounded-[24px] border border-dark-800 bg-dark-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-mystery-300/70">02</p>
          <h3 className="mt-3 text-xl font-semibold text-dark-50">저장과 다시 편집</h3>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-dark-300">
            <p>브라우저를 닫아도 저장된 게임은 `내 게임 관리`에서 다시 열어 이어서 작업할 수 있습니다.</p>
            <p>공개 전에는 직접 플레이해보면서 인원 수, 카드, 엔딩 분기, 공통화면 노출을 함께 점검하는 편이 안전합니다.</p>
            <p>중요한 시나리오는 별도로 백업해두는 것을 권장합니다.</p>
          </div>
        </article>

        <article className="rounded-[24px] border border-dark-800 bg-dark-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-mystery-300/70">03</p>
          <h3 className="mt-3 text-xl font-semibold text-dark-50">AI 제작도우미 활용</h3>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-dark-300">
            <p>우하단 `제작도우미`에서 `자동 / 가이드 / 문안` 모드로 질문할 수 있습니다.</p>
            <p>`가이드`는 구조 점검과 다음 작업 정리에, `문안`은 실제 입력 초안이 필요할 때 쓰면 편합니다.</p>
            <p>답변은 참고용이니, 공개 전에는 시나리오 맥락과 톤을 한 번 더 직접 확인해주세요.</p>
          </div>
        </article>

        <article className="rounded-[24px] border border-dark-800 bg-dark-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-mystery-300/70">04</p>
          <h3 className="mt-3 text-xl font-semibold text-dark-50">외부 제작 테스트</h3>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-dark-300">
            <p>플레이 테스트는 공개 라이브러리에서 실제 참가 흐름까지 같이 확인하는 편이 좋습니다.</p>
            <p>운영 중인 방과 테스트용 방이 섞이지 않도록 방 제목을 분명하게 적어두세요.</p>
            <p>관리자 계정은 운영 점검용으로만 쓰고, 실제 제작은 작업자 계정 기준으로 진행하는 편이 안전합니다.</p>
          </div>
        </article>
      </section>

      <GuidePolicySection />
    </div>
  );
}
