# ProjectInit & SpecDesign — 작업 보고서

- **날짜**: 2026-03-05
- **소요 세션**: 1회 (초기 셋업)
- **담당**: Claude Sonnet 4.6

---

## 1. User Prompt

> 머더미스터리 웹/앱 보드게임 스토리 생성기 + 플레이어 만들려고 함.
> .claude 폴더 정리 → 이번 프로젝트에 필요한 것 추리기 → 유저 단위로 옮길 것 확인 → 프로젝트 CLAUDE.md 생성.
> 이후 게임 개요/명세서 작성 (폴더 구조, 동작 방식 포함).
> 오프라인 동일 공간 플레이 + 각자 모바일 화면 + 카드 소유권 이전 기능 고려.

---

## 2. Thinking Process

### .claude 폴더 정리 판단 기준
- RAG 관련(eval-runner, rag-debugger, build-report, rag-implementation, run-eval): 이번 프로젝트와 무관 → 삭제
- 범용(doc-writer, execution-quality, work-logging): 모든 프로젝트에 유용 → `~/.claude/` 루트로 복사
- 웹앱 관련(vercel-react-best-practices, skill-creator): 이미 루트에 있음
- PDF 스킬: 카드/룰북 출력 가능성 → 프로젝트에 유지
- settings.local.json: 이전 프로젝트 경로 포함 → 초기화

### 명세서 설계 핵심 결정

**플레이 시나리오 (2차 수정 후 확정)**
- 처음엔 온라인 멀티플레이어로 설계했으나, 실제 사용 맥락 확인 후 수정
- **오프라인 동일 공간**: 같은 WiFi, 각자 모바일, 화면을 물리적으로 보여주는 방식
- 서버는 GM 노트북 로컬 실행 또는 배포 서버

**카드 프라이버시 설계**
- 상태를 `sharedState`(전원 공개)와 `playerState`(token 기반 개인)으로 분리
- 서버가 token 확인 후 해당 플레이어 데이터만 필터링해 응답
- 다른 플레이어 `inventory`는 절대 응답 포함 금지

**카드 소유권 이전**
- 물리 보드게임의 "카드 건네주기" 행위를 디지털로 구현
- 이전 후 원소유자 열람 불가 / GM은 전체 transferLog 열람 / 취소 불가

**실시간 동기화**
- WebSocket → SSE 채택 (카드 배포/이전은 서버→클라이언트 단방향 push로 충분)
- 클라이언트→서버 액션은 REST로 처리

---

## 3. Execution Result

### 생성/수정 파일

| 파일 | 작업 | 설명 |
|------|------|------|
| `.claude/agents/doc-writer.md` | 삭제 (루트 복사 후) | `~/.claude/agents/` 로 이동 |
| `.claude/agents/eval-runner.md` | 삭제 | RAG 전용, 불필요 |
| `.claude/agents/rag-debugger.md` | 삭제 | RAG 전용, 불필요 |
| `.claude/skills/build-report/` | 삭제 | RAG 평가 전용 |
| `.claude/skills/rag-implementation/` | 삭제 | RAG 전용 |
| `.claude/skills/run-eval/` | 삭제 | RAG 전용 |
| `.claude/skills/skill-creator/` | 삭제 | 루트에 이미 있음 |
| `.claude/settings.local.json` | 초기화 | 이번 프로젝트용 권한으로 재작성 |
| `~/.claude/agents/doc-writer.md` | 생성 | 루트로 이동 (범용) |
| `~/.claude/rules/execution-quality.md` | 생성 | 루트로 이동 (범용) |
| `~/.claude/rules/work-logging.md` | 생성 | 루트로 이동 (범용) |
| `CLAUDE.md` | 생성 | 프로젝트 컨텍스트 (Claude용) |
| `docs/SPEC.md` | 생성 | 서비스 전체 명세서 (9장 구성) |

### 확정된 주요 아키텍처
- **앱 모드**: 메이커 / 라이브러리 / GM뷰 / 플레이어뷰(모바일)
- **저장**: 게임 패키지 → JSON / 세션 상태 → SQLite
- **실시간**: SSE
- **인증**: UUID 토큰 → 세션 링크 QR 배포
- **카드 격리**: token 기반 서버 필터링

---

## 4. 다음 단계 (예정)

- [ ] Next.js 프로젝트 초기 세팅 (`npx create-next-app`)
- [ ] TypeScript 타입 정의 (`types/game.ts`, `types/session.ts`)
- [ ] 기본 설정 폼 → LLM 스토리 생성 파이프라인 구현 (Phase 1 코어 루프)
