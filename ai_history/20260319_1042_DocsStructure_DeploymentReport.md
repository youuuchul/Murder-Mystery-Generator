# DocsStructure_DeploymentReport — 작업 보고서

- 날짜: 2026-03-19
- 소요 세션: 1회
- 담당: Codex GPT-5

---

## 1. User Prompt

문서화, 배포 방향 정리, 로컬 제작자 테스트 흐름 정리, 폴더/문서 구조 정리, 데이터 유실 가능성 검토를 요청받았다.

## 2. Thinking Process

- 배포 스택은 `Vercel + Supabase` 로 고정하되, 현재 로컬 파일 저장 구조를 그대로 배포하는 것은 위험하다고 판단했다.
- 문서는 성격별로 분리하지 않으면 backlog / plan / handoff / research 가 계속 섞여 커질 것이므로 `docs/` 하위 분류를 만들었다.
- 로컬 테스트는 현재 구조에서 가장 현실적인 검증 방법이지만, 데이터가 호스트 PC 로컬 `data/` 아래에만 저장된다는 점을 명확히 문서화해야 한다고 판단했다.
- Codex도 같은 프로젝트 규칙을 보도록 루트 `AGENTS.md` 를 추가했다.

## 3. Execution Result

| 파일 | 작업 |
|------|------|
| `docs/README.md` | 문서 인덱스 추가 |
| `docs/research/20260319_VERCEL_SUPABASE_DEPLOYMENT_REVIEW.md` | 배포 스택 검토 문서 작성 |
| `docs/research/20260319_LOCAL_DATA_DEPLOYMENT_RISK.md` | 로컬 데이터/배포 리스크 문서 작성 |
| `docs/plans/20260319_LOCAL_CREATOR_USER_TEST_PLAN.md` | 로컬 제작자 유저 테스트 계획 작성 |
| `docs/backlog/20260319_HOME_ENTRY_GUIDE_BACKLOG.md` | 홈 진입 가이드 백로그 작성 |
| `docs/backlog/*`, `docs/plans/*`, `docs/handoff/*` | 문서 폴더 재배치 |
| `README.md` | 폴더 구조도, 문서 링크, 다음 작업 갱신 |
| `CLAUDE.md` | 목표 배포 스택과 새 문서 경로 반영 |
| `AGENTS.md` | Codex용 프로젝트 규칙 파일 추가 |
| `data/README.md` | 실제 현재 저장 구조 기준으로 수정 |
| `src/**/.gitkeep` 일부 | 비어 있는 스캐폴딩 플레이스홀더 정리 |

확정 내용:

- 로컬 제작자 테스트 흐름
  - 호스트가 서버 실행
  - `/library` 주소 공유
  - 참여자가 메이커 편집
  - 결과는 호스트 로컬 `data/games` 에 저장
- 배포 방향
  - Hosting: Vercel
  - Auth / DB / Storage: Supabase
- 현재 우선순위
  - 배포보다 로컬 테스트와 Auth/DB/Storage 마이그레이션 설계가 먼저

검증 결과:

- 구조/문서 정리 위주 작업으로 별도 빌드는 실행하지 않았다.
- 링크/문서 경로는 로컬 기준으로 재점검했다.

## 4. 다음 단계

- [ ] 이번 문서/구조 정리분 커밋
- [ ] Supabase 스키마 초안 작성
- [ ] 로컬 게임 export/import 기준 정리
