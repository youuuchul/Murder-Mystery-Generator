# MakerGate_SchemaDraft_Report — 작업 보고서

- 날짜: 2026-03-19
- 소요 세션: 1회
- 담당: Codex GPT-5

---

## 1. User Prompt

오늘 바로 로컬 제작자 테스트를 위해 주소를 공유할 예정이니,
작업을 계속 진행하면서 배포 전환용 스키마 초안도 함께 정리해달라는 요청.

## 2. Thinking Process

- 오늘 바로 외부 제작자 테스트를 돌릴 계획이라면, 문서보다 실효성이 큰 것은 `메이커 접근 비밀번호 게이트` 라고 판단했다.
- 현재 권한 모델이 없기 때문에 완전한 협업 보호는 불가능하지만, `/library`, `/maker`, 게임 수정 API 정도만 막아도 공개 테스트 위험을 크게 줄일 수 있다.
- DB 전환 문서는 단순 테이블 나열보다 LLM 제작도우미가 DB 구조에서 어떻게 context를 다시 조립할지까지 같이 정리해야 한다고 판단했다.
- 따라서 `profiles / games / game_content / assets / sessions` 와 `LLM context assembly` 를 한 문서로 묶었다.

## 3. Execution Result

| 파일 | 작업 |
|------|------|
| `middleware.ts` | 제작/관리 동선 보호용 미들웨어 추가 |
| `src/lib/maker-access.ts` | 비밀번호 게이트 공용 유틸 추가 |
| `src/app/api/maker-access/route.ts` | 비밀번호 검증 및 쿠키 발급/삭제 API 추가 |
| `src/app/maker-access/page.tsx` | 제작자 비밀번호 입력 페이지 추가 |
| `.env.example` | `MAKER_ACCESS_PASSWORD` 예시 추가 |
| `docs/plans/20260319_LOCAL_CREATOR_USER_TEST_PLAN.md` | 로컬 제작자 테스트 문서에 게이트 사용법 반영 |
| `docs/backlog/20260319_LIBRARY_MAKER_ACCESS_BACKLOG.md` | Phase 0 구현 상태 반영 |
| `docs/plans/20260319_LIBRARY_MAKER_ACCESS_PLAN.md` | Phase 0 완료 / 다음 단계는 Phase 1 로 갱신 |
| `docs/plans/20260319_SUPABASE_SCHEMA_DRAFT.md` | Supabase 스키마 초안 추가 |

확정 내용:

- 임시 메이커 게이트는 `MAKER_ACCESS_PASSWORD` 가 있을 때만 활성화된다.
- 보호 대상:
  - `/library`
  - `/maker/*`
  - `/api/games/*`
  - `/api/maker-assistant`
- 예외:
  - `/join`
  - `/play/*`
  - 업로드 자산 GET
- DB 초안은 `games` 메타와 `game_content.content_json` 을 분리하는 하이브리드 구조로 정리했다.
- LLM은 DB 전환 후에도 `content_json -> normalizeGame() -> buildMakerAssistantContext()` 흐름을 최대한 유지하는 방향으로 제안했다.

검증 결과:

- `npm run build` 통과
- `npx tsc --noEmit` 통과

## 4. 다음 단계

- [ ] 이번 게이트/스키마 초안 작업 커밋
- [ ] Supabase SQL 마이그레이션 초안 작성
- [ ] 저장소 레이어를 file/db 교체 가능한 인터페이스로 정리
