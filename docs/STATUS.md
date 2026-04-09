# 프로젝트 현황 (단일 진실 원천)

> **AI 에이전트(Claude, Codex 등)가 세션 시작 시 가장 먼저 읽어야 할 파일.**
> 완료/진행중/미착수 상태는 이 파일이 기준이다.
> 마지막 업데이트: 2026-04-09 (로컬 provider 완전 제거, Supabase MCP 작업 시작)

---

## 배포 현황

- **도메인**: murdermysterygenerator.shop (Vercel + Supabase)
- **저장소**: `APP_PERSISTENCE_PROVIDER=supabase` — games, sessions, assets 모두 Supabase
- **인증**: `MAKER_AUTH_PROVIDER=supabase` — Supabase Auth + `public.profiles`
- **Analytics**: Vercel Analytics 활성

---

## 완료된 주요 기능

### 배포/인프라
- [x] Vercel 배포 + 도메인 (murdermysterygenerator.shop) + SSL
- [x] Vercel Analytics
- [x] Supabase Auth + DB (`games`, `game_content`, `sessions`, `profiles`) + Storage 전환
- [x] 로컬 데이터 → Supabase import 완료 (games 6, sessions 21, assets 15)
- [x] 로컬 storage provider 완전 제거 — Supabase 단일 구현 (`src/lib/storage/` 삭제)

### 계정/권한
- [x] Supabase Auth 기반 계정 체계
- [x] 게임 소유권 (`ownerId` / `visibility` / `publishedAt`)
- [x] 편집 API 소유자 권한 검증 (서버 레벨)
- [x] 라이브러리(공개) / 관리(내 게임) 화면 분리 (`/library` vs `/library/manage`)
- [x] 비밀번호 찾기/재설정/변경 (이메일 발송 구현 완료)
- [x] admin role + 운영 UI (전체 게임/세션 조회·삭제·이관)
- [x] 소유권 귀속/이관 도구 (claimable 게임 귀속, 타 계정 이관)
- [x] 공개 상태 전환 (`draft/private/public`) + 체크리스트 검증

### 라이브러리/진입
- [x] 공개 라이브러리 GM / 플레이어 CTA 분리
- [x] 라이브러리 상단 코드 입력으로 바로 참여
- [x] 플레이어 참여용 세션 목록 화면
- [x] 공개 카드 제작자 display name 노출
- [x] 카드 이미지 표시 통일 (라이브러리/관리 화면)

### 세션/플레이
- [x] 세션 선택 화면 + 이름 자동생성 + 방 제목 수정
- [x] 플레이어 재접속 (토큰 자동복귀 + rejoin)
- [x] GM 없는 플레이어 합의 세션 생성
- [x] 플레이어 합의 기반 다음 단계 진행 요청
- [x] 대기실 → 오프닝 인원 확인 팝업
- [x] 마지막 라운드 → 투표 확인 팝업
- [x] 참가 코드/링크 접기 UI (GM + 플레이어 화면)
- [x] 플레이어 화면 세션 목록 복귀 버튼

### 이미지/미디어
- [x] 업로드 전 압축/리사이즈/WEBP 변환
- [x] 이미지 권장 해상도/비율 안내
- [x] 표지 포지션 조절
- [x] 이미지 필드 공통화 (업로드/썸네일/미리보기 구조)
- [x] 장소/단서/플레이어/NPC/피해자 이미지 업로드 지원

### 메이커 UX
- [x] 범인 설정 Step2 → Step3(플레이어) 이동
- [x] 이미지 필드 접힘/썸네일 구조
- [x] 장소/단서 편집 계층화 (장소 카드 > 단서 서브카드)
- [x] 연관 단서 선택에 장소명 표시
- [x] 필수 입력 누락 이슈 패널 + 위치 보기 자동 스크롤
- [x] 세션 선택 화면 정리 (새 세션/기존 세션 분리)
- [x] 오프닝 타임라인 입력 위치 재정리 (배경설정 탭 잔여 입력 제거, 중앙 타임라인 탭으로 통합) ✅ 완료 (2026-04-09)

### AI 도우미 (메이커)
- [x] guide / draft 모드 분리
- [x] 문체 세분화 (`narrative_prose` / `descriptive_copy` / `gm_guide`)
- [x] 단서 제안 맥락 설정 (장소/인물/개수)
- [x] 응답 잘림 시 자동 재시도

### AI 플레이어
- [x] 대기실 AI 자동 채우기 체크박스 + 슬롯 점유
- [x] AI 투표 기본 비활성화 (엔딩 투표는 사람만 집계)
- [x] 동률 투표 자동 확정 처리 (합의 세션 stuck 방지)
- [x] Langfuse trace 추가
- [x] `player-agent.auto-acquire` 기본 동작

---

## 1차 완료 — 보강 필요

| 항목 | 남은 것 |
|------|---------|
| AI 단서 반응 획득 | 조건식 문제, 타이밍/체감 속도 튜닝 |
| 투표 완료 후 UI 체감 | 폴링/SSE 체감 최적화 |
| 이미지 서버 파생본 | 썸네일 전략 검토 |
| 비밀번호 찾기 | 운영 도메인 기준 메일 발송 최종 검증 |
| admin 운영 UI | 미세조정 가능 |

---

## 미착수 — 우선순위순

### 높음
- [x] **서버 기반 공용 타이머** — `SharedState.timerState`로 라운드 타이머 서버 기반 통합. GM/호스트가 시작·일시정지·재개 가능. 플레이어 공통화면 탭에서 카운트다운 표시. 합의 모드 호스트 조작 지원. 비로그인 세션 삭제 권한 수정 ✅ 완료 (2026-04-09)
- [x] **계정별 동시 세션 수 제한** — 로그인 유저 최대 3개(admin 면제), 비로그인 유저 1개(쿠키 기반 추적). 한도 초과 시 모달로 기존 세션 관리 + `/library/manage/my-sessions` 페이지 추가 ✅ 완료 (2026-04-09)
- [x] **인물 설정 관계 탭 복구** — 메이커 Step3 관계 탭 정상 확인. 플레이어 인물 정보에서 관계/인상 미입력 시 불필요한 placeholder 텍스트 제거 ✅ 완료 (2026-04-09)
- [x] **Supabase MCP 연결** — Claude/Codex가 DB 직접 쿼리 가능하도록 선행 작업 (JSON 컬럼 개선 설계 전제) ✅ 완료 (2026-04-09)

### 중간
- [ ] **게임 공개 모드 unlisted 추가** — 라이브러리 비노출 + 링크 직접 접근 가능. `visibility` 재편: `private | unlisted | public`. `draft` 제거 검토 (`lifecycle_status.draft`와 중복). 비공개 전환 시 링크 비작동 + 세션 삭제 알림. unlisted 접근 허용 RLS/토큰 정책 설계 선행 필요.
- [ ] **통 JSON DB 컬럼 개선** — `game_content.content_json` 분리로 메이커 AI 챗봇 레이턴시 개선. 선결 조건: Supabase MCP 연결 후 데이터 분포 기반 설계.
- [ ] **메이커 AI 도우미 Langfuse 트레이싱** — `/api/maker-assistant` trace 미적용. 모드(guide/draft), step, 재시도 여부 스팬 추가. 향후 NPC 챗봇도 동일 패턴.
- [ ] **유저 정보 오버레이 모바일 스크롤 버그** — 오버레이 내부 스크롤 미작동으로 하단 로그아웃 버튼 접근 불가. iOS Safari `overflow-y: scroll` + `-webkit-overflow-scrolling: touch` 또는 body scroll lock 충돌 추정.
- [x] **플레이어 엔딩 이후 종료 동선** — 최종 엔딩 공개 후 게임 종료 액션 ✅ 완료 (2026-04-09)
- [ ] **장소 탐색 첫 획득 카드 상세 팝업** — 첫 획득 시 자동 팝업 오픈
- [ ] **미사용 세션 자동 정리 정책** — 일정 기간(예: 24시간) 미활동 세션 자동 종료/삭제. 불특정 유저 접속 오픈 대비 세션 누적 방지. 엔딩 완료 세션 자동 정리 포함. Supabase pg_cron 또는 API 기반 정리 검토
- [ ] **라운드 대표 이미지 업로드** — 현재 URL-only
- [ ] **대상 작업자 찾기 UX** — 소유권 이관 시 이름/ID 검색
- [ ] **GM 없는 세션 공통화면 범위 보강**

### 낮음/장기
- [ ] **Git 브랜치 전략 전환** — 유저 인입 시점에 main/dev 분리 도입. 현재는 main 직접 push + Vercel 즉시 배포. 병렬 에이전트 작업 시 feature 브랜치 + worktree 활용. dev 도입 시 Vercel Preview 기반 staging 검증 추가. CLAUDE.md/AGENTS.md 지침도 함께 갱신 필요
- [ ] AI 채팅 탭 및 대화 파이프라인 (향후 NPC 챗봇 포함 Langfuse trace 설계)
- [ ] AI 카드 교환/전달
- [ ] AI 시간 기반 행동 정책 (라운드 종료 직전)
- [ ] 시나리오별 프롬프트 override 실제 적용
- [ ] Langfuse score 체계
- [ ] 협업자 모델
- [ ] 엔딩 투표 세부 분기 확장

---

## 참조 문서

| 문서 | 목적 |
|------|------|
| `docs/SPEC.md` | 전체 설계 명세 |
| `docs/backlog/20260406_POST_DEPLOY_PRODUCT_BACKLOG.md` | 배포 후 백로그 세부 스펙 |
| `docs/plans/20260408_LLM_PLAYER_AGENT_PLAN.md` | AI 플레이어 구현 계획 |
| `docs/plans/LLM_MAKER_ASSISTANT_PLAN.md` | AI 도우미 계획 |
| `docs/operations/` | admin 운영 가이드 |
| `ai_history/` | 과거 작업 기록 (이력 참조용) |
| `docs/archive/` | 완료된 문서 보존 |
