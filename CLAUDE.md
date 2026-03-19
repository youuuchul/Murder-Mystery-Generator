# Murder Mystery Generator — 프로젝트 컨텍스트

## 서비스 한 줄 요약

머더미스터리 시나리오를 직접 제작하고, 오프라인 보드게임을 디지털 카드로 진행하는 플랫폼.

## 플레이 시나리오

- 플레이어들이 **같은 공간에 모여** 오프라인으로 게임
- 각자 **모바일 폰**으로 본인 캐릭터 카드·인벤토리 확인
- 서버는 GM 노트북(로컬) 또는 배포 서버에서 실행
- 카드를 보여줄 때는 **화면을 물리적으로 보여주는 방식**

## 세 가지 모드

| 모드 | 접속 기기 | 주요 기능 |
|------|----------|----------|
| **메이커** | PC/노트북 | 시나리오·캐릭터·단서 직접 작성·편집·저장 |
| **라이브러리** | PC/노트북 | 게임 목록 관리, 세션 시작 |
| **플레이어** | 모바일 | 캐릭터 배경, 인벤토리, 카드 열람, 건네주기 |
| **GM** | PC/노트북 | 게임 진행 제어, 카드 배포, 전체 상태 감시 |

## 핵심 설계 원칙

1. **서버가 진실의 원천**: 카드 내용은 서버에서 token 기반으로 필터링 후 전달
2. **인벤토리 격리**: 다른 플레이어의 카드 내용은 절대 응답에 포함되지 않음
3. **카드 이전 가능**: 플레이어 간 카드 건네주기 지원 (이전 후 원소유자 열람 불가)
4. **SSE로 실시간 push**: 카드 획득·이전 이벤트는 SSE로 즉시 알림

## 기술 스택

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript (Zod로 입력 검증)
- **Styling**: Tailwind CSS (모바일 우선)
- **Current Storage**: 게임 패키지 / 세션 상태 / 업로드 자산 모두 로컬 파일 기반
- **Current Realtime**: SSE (Server-Sent Events) + polling fallback
- **Target Deployment Stack**: Vercel + Supabase
  - Hosting: Vercel
  - Auth / Database / Storage / Realtime candidate: Supabase
- **패키지**: npm

## 배포 방향

- 단기 개발 환경은 로컬 JSON + 로컬 업로드를 계속 사용한다.
- 배포 준비 기준의 목표 스택은 `Vercel + Supabase` 로 고정한다.
- 따라서 아래 방향을 우선한다.
  - 로컬 파일 저장 -> Supabase Postgres / Storage 전환
  - 메이커 무권한 접근 -> Auth + ownership + visibility 모델 도입
  - 공개 플레이 동선과 제작/관리 동선 분리

관련 문서:

- `docs/research/20260319_VERCEL_SUPABASE_DEPLOYMENT_REVIEW.md`
- `docs/research/20260319_LOCAL_DATA_DEPLOYMENT_RISK.md`
- `docs/backlog/20260319_LIBRARY_MAKER_ACCESS_BACKLOG.md`
- `docs/plans/20260319_LIBRARY_MAKER_ACCESS_PLAN.md`

## 핵심 참조 문서

- 전체 명세: `docs/SPEC.md`
- 타입 정의: `types/game.ts`, `types/session.ts`
- 세션/카드 설계: `docs/SPEC.md` §9

## 메이커 작성 순서

```
기본 설정 → 사건 개요 → 플레이어 → 장소 & 단서 → 스크립트 → 엔딩
```
현재 메이커는 6-step 구조이며, 편집 모드에서는 스텝 간 자유 이동이 가능하다.

## 에이전트

- `doc-writer`: 작업 보고서 생성 → `ai_history/` 저장

## 작업 로깅

- 의미 있는 작업 완료 시 `ai_history/` 에 보고서 작성 (규칙: `.claude/rules/work-logging.md`)
- 네이밍: `YYYYMMDD_HHMM_TaskName_Report.md`
- hooks가 파일 변경 5개 이상이면 자동으로 보고서 작성 권장 알림 출력
