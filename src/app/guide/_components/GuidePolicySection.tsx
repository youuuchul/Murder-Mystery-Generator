/**
 * 제작/플레이 공통으로 먼저 확인해야 하는 기본 정책 안내 섹션.
 */
export function GuidePolicySection() {
  return (
    <section className="rounded-[24px] border border-dark-800 bg-dark-900/70 p-6 sm:p-8">
      <p className="text-xs uppercase tracking-[0.24em] text-amber-300/80">기본 정책</p>
      <h3 className="mt-3 text-2xl font-semibold text-dark-50">시작 전에 꼭 확인해주세요.</h3>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <article className="rounded-[20px] border border-dark-800 bg-dark-950/50 p-5">
          <p className="text-sm font-semibold text-dark-50">기본 이용 정책</p>
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-dark-300">
            <p>계정은 본인만 사용하고, 다른 사람의 게임이나 세션은 허가 없이 수정하거나 운영하지 않습니다.</p>
            <p>테스트용 방과 실제 진행 방이 섞이지 않도록 방 제목과 공개 상태를 확인한 뒤 시작해주세요.</p>
          </div>
        </article>

        <article className="rounded-[20px] border border-dark-800 bg-dark-950/50 p-5">
          <p className="text-sm font-semibold text-dark-50">저작권 정책</p>
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-dark-300">
            <p>직접 만든 설정과 문안, 사용 허가를 받은 이미지와 자료만 올려주세요.</p>
            <p>원작이 있는 작품을 바탕으로 만들었다면 원작자와 원본 출처를 분명히 남기고, 필요한 권리를 먼저 확인해주세요.</p>
          </div>
        </article>

        <article className="rounded-[20px] border border-amber-900/70 bg-amber-950/20 p-5">
          <p className="text-sm font-semibold text-dark-50">베타 안내</p>
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-dark-300">
            <p>현재는 베타 운영 중이라 예기치 않은 저장 오류나 데이터 유실이 생길 수 있습니다.</p>
            <p>중요한 시나리오와 운영 기록은 따로 백업해두는 것을 권장합니다.</p>
          </div>
        </article>
      </div>
    </section>
  );
}
