# 프로젝트 현황 (단일 진실 원천)

> **AI 에이전트(Claude, Codex 등)가 세션 시작 시 가장 먼저 읽어야 할 파일.**
> 완료/진행중/미착수 상태는 이 파일이 기준이다.
> 마지막 업데이트: 2026-04-15 (모바일 뷰포트 meta 누락 수정, iOS input 포커스 자동 확대 차단, 캐릭터 카드 승리조건 배치 정돈, 게임 커버 GM/플레이어 버튼 정책 정리, GM 전용 진행 가이드(gmNote) 폐지, 퍼스널/과거 기록 git 추적 제외 + set-maker-role.mjs Supabase 전용 단순화, 장소 character_has_item 조건을 "열기" 액션 + sky-pill 알림으로 전환)

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
- [x] 공개 상태 전환 (`private/unlisted/public`) + 체크리스트 검증

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
- [x] 동점 재투표 시스템 (동점 후보 제한 재투표 → 재동점 시 랜덤 확정)
- [x] Langfuse trace 추가
- [x] `player-agent.auto-acquire` 기본 동작

---

## 1차 완료 — 보강 필요

| 항목 | 남은 것 |
|------|---------|
| AI 단서 반응 획득 | 조건식 문제, 타이밍/체감 속도 튜닝 |
| 투표 완료 후 UI 체감 | 퍼널 분리 완료. 완료 후 폴링/SSE 중단 + 초기 fetch 20s 타임아웃 적용 (2026-04-13) |
| **Vercel Cold Start 지연** | Library 페이지 Cold Start 5~15s, Warm 1.8s. DB는 정상(세션 20개, 최대 11KB). 1차 대응: listUsers 전체 스캔 제거 + owner id 병렬 조회 전환. 2차 대응: Suspense 스트리밍으로 쉘/nav/counts/grid 분리, React.cache로 DB 쿼리 dedupe (2026-04-13). 추가 대응 필요 시: Vercel Pro keep-warm 검토 |
| **엔딩 후 서버 무응답** | 원인: GM 탭 폴링 종료 가드 없음 + 세션 GET이 매번 정규화 15테이블 조인 실행 + SSE 무한 유지. 수정: GM shouldStopPolling 가드, getGame 30s in-memory 캐시, SSE maxDuration=60s로 슬롯 회수 (2026-04-13) |
| 동점 재투표 시스템 | 혼자 테스트 불가 — 2명 이상 참여 세션에서 실동작 검증 필요 |
| 이미지 서버 파생본 | 썸네일 전략 검토 |
| 비밀번호 찾기 | 운영 도메인 기준 메일 발송 최종 검증 |
| admin 운영 UI | 미세조정 가능 |
| Langfuse Vercel 환경변수 | Vercel에 설정된 LANGFUSE_PUBLIC_KEY/SECRET_KEY가 MurdermysteryGenerator 프로젝트 키와 일치하는지 검증. 현재 my-first-test-org로 trace가 간 적 있음. 로컬 .env 키는 정상 확인됨 |

---

## 미착수 — 우선순위순

### 🚨 긴급
- [x] **잠긴 장소 UI 스포일러 정리 + AI 자동 해제 + 조건 picker 정렬** — (1) 플레이어 장소 카드가 잠금 상태에서 해제 힌트와 장소 설명을 동시에 노출해 정답이 새던 문제. 잠금 중엔 `accessCondition.hint`만, 해제 후엔 `description`+이미지만 보이도록 `PlayerView.tsx` 분기 수정. (2) `applyPlayerAgentAutoAcquireReaction`에 `findUnlockableLocationForAi` 추가 — AI가 `character_has_item` 대상이고 필요 단서 모두 보유 + `unlocksAtRound` 조건 만족 + 아직 미해제인 장소가 있으면 단서 획득보다 먼저 해제 액션 실행. outcome에 `unlockedLocationId/Name` 필드 추가, `cards/route.ts`에서 AI 해제 시 `location_unlocked` 이벤트 브로드캐스트. 한 턴에 "열기 + 줍기" 동시 처리는 금지(인간 플레이어 흐름과 일치). (3) 메이커 `LocationEditor`의 필요 단서/아이템 체크박스 목록이 단서 생성 순서로 나와 긴 목록에서 장소별 묶음이 깨지던 문제. 장소 순서 → 각 장소 `clueIds` 배치 순서로 정렬. ✅ 완료 (2026-04-15)
- [x] **단서 본문 중괄호 누출 차단** — `suggest_clues` 시스템 프롬프트가 FINDING.detail 포맷을 `{...}` 자리표시자로 안내했더니 모델이 카드 본문을 `{...}`로 감싸 출력하던 버그. 자리표시 표기를 `→ 이 자리에 ... 적는다`로 바꾸고 "안내문에 쓰인 →·{·} 같은 자리표시 기호는 실제 출력에 절대 포함하지 않는다" 규칙 명시. ✅ 완료 (2026-04-15)
- [x] **장소 설명 스포일러 방지 규칙** — draft `descriptive_copy` 프로필이 장소 설명을 뽑을 때, 컨텍스트로 받은 해당 장소 단서를 그대로 본문에 지목해 "탐색 전 정답 공개"가 되던 가능성이 있던 부분을 프롬프트 레벨에서 차단. `getDraftStyleRules`에서 intent.targetLabel에 "장소"가 포함되면 추가 규칙 블록 주입: (1) 감각·배경 스토리로 몰입 올리는 묘사만, (2) 단서 존재/위치/외형/제목/해석 힌트 금지, (3) '쪽지가 있다/수상한 물건이 보인다' 류 발견 유도 문장 금지, (4) 단서에 해당하는 아이템은 본문에서 지목하지 말고 자연스러운 가구·흔적·분위기로 대체. 단서 목록은 맥락 참고용으로만 프롬프트에 남김. ✅ 완료 (2026-04-15)
- [x] **단서 카드 평서문 종결 강제** — AI가 뽑아주는 단서 본문이 "…푸른 잉크 얼룩이 있음" 같은 명사형 마무리로 끝나서 카드 톤이 깨지던 문제. `suggest_clues` 가이드라인과 draft `descriptive_copy` 프로필에 "모든 본문 문장은 ~다/~었다/~하였다 같은 평서문 종결형으로 끝낸다. '~있음/~함/~됨' 같은 명사형 종결, 개조식 종결 금지" 규칙 추가. ✅ 완료 (2026-04-15)
- [x] **단서 제안 카드 분리 + 본문만 복사** — `suggest_clues` FINDING의 detail이 카드 본문 + 왜 필요한가 + 원시 UUID까지 통으로 섞여 있어 제작자가 복붙할 때 쓸모없는 메타가 따라붙던 문제. 프롬프트에 FINDING.detail을 `[본문]` / `[근거]` 두 블록으로 고정 출력하도록 명시(본문에 UUID 금지, 캐릭터/장소는 이름으로). 클라이언트 `parseClueFindingDetail()`이 두 블록을 분리하고 혹시 새어 나온 UUID 괄호 주석은 제거. `MakerAssistantMessageList`의 suggest_clues finding 렌더링을 두 박스로 분리: 위 박스 "카드 본문" + **본문만 복사** 버튼, 아래 "왜 필요한가 (참고용)" 점선 박스에 근거를 dim 처리. 포맷이 안 맞는 레거시 응답은 기존 단일 문단 뷰로 폴백. ✅ 완료 (2026-04-15)
- [x] **타임라인 엔트리 활성/비활성 스위치** — 중앙 타임라인 매트릭스가 플레이어×슬롯 cell을 "입력됨/미입력"만 구분해서 AI 가이드·검증 로직이 "아직 안 쓴 것"과 "이 캐릭터는 이 시간대에 없다"를 혼동. `PlayerTimelineEntry`에 `inactive?: boolean` 필드 추가(`true`=의도적 N/A). DB `player_timeline_entries` 테이블에 `inactive boolean not null default false` 컬럼 추가(migration `20260415_000002_timeline_inactive_flag.sql`, 운영 DB 적용 완료). 메이커 `TimelineMatrixEditor`: 셀 헤더에 활성/비활성 토글 버튼 + 입력됨(초록)/미입력(앰버)/비활성(회색) 상태 라벨, 비활성 시 textarea disabled + placeholder "비활성 상태: 이 시간대에 이 캐릭터는 등장/행동하지 않습니다." + 카드 배경/이름 흐리게. 토글을 비활성으로 바꾸면 기존 action 텍스트는 클리어(혼선 방지). 저장 경로도 `te.action` 비어 있어도 `inactive=true`면 row를 남기도록 변경해 플래그가 DB에 유지됨. `maker-validation.ts` 누락 경고는 `action 비어있음 && inactive===true`면 제작자가 N/A 결정을 내린 것으로 보고 카운트에서 제외. `maker-assistant-context.ts`도 timeline 항목마다 `status: "filled"|"inactive"|"empty"`를 주입하고 `playersWithoutTimeline` 계산도 같은 규칙 적용. AI `timeline_plan` 프로필 규칙에 "status=inactive면 새 ENTRY 만들지 않기 / empty면 제안 가능 / filled면 NOTES로만 보강" 추가. 플레이어 공개 화면은 `action.trim()` 비어있는 엔트리를 이미 스킵하므로 자연스럽게 비활성은 노출되지 않음. ✅ 완료 (2026-04-15)
- [x] **라이브러리 카드 공개 전 체크 오탐 수정** — `buildMetadataFromRow`가 list 쿼리용으로만 호출되면서 content가 없다는 이유로 opening/ending 체크리스트를 항상 `passed: false`로 박아두던 버그. 실제로는 저장 시점에 계산된 `lifecycle_status`가 `ready`면 전체 readiness가 통과된 상태인데 카드에는 "오프닝 기본 스크립트가 필요합니다 / 엔딩 분기 또는 엔딩 스크립트가 필요합니다"가 항상 떠 있었음. fallback 메타데이터에서 opening/ending의 `passed`를 `lifecycle_status === "ready"`로 전가하고 detail 문구도 "메이커에서 상세 내용을 확인하세요" 톤으로 완화. 메이커 내부 `maker-validation.ts`는 현행 필드(`game.scripts.opening.narration`, `game.ending.branches`)를 이미 쓰고 있어 그대로 둠. ✅ 완료 (2026-04-15)
- [x] **타임라인 AI 제안 UI 항목별 복사** — `timeline_plan` draft의 SLOT/ENTRY 포맷을 클라이언트에서 파싱해 복붙 단위를 잘게 쪼갠 뷰로 렌더. `MakerAssistantMessageList.tsx`에 `parseTimelinePlan()` + `TimelinePlanView` + `CopyButton` 컴포넌트 추가. body에 `SLOT|` 라인이 하나 이상이고 ENTRY가 하나라도 달려 있으면 슬롯별 카드로 분리해 각 슬롯에 "슬롯 전체 복사" 버튼, 엔트리마다 "행동만 복사" 버튼, 상단에 "원문 전체 복사" 유지. 타임라인 의도가 아니면 기존 산문 `<pre>` 뷰로 폴백. ✅ 완료 (2026-04-15)
- [x] **타임라인 AI 제안 모드** — "타임라인 작성 도와줘" 계열 요청이 기본 산문 draft로 떨어지면서 복붙 단위가 잘게 나뉘지 않던 문제. `DraftWritingProfile`에 `timeline_plan` 프로필 추가. `inferDraftIntent`가 타임라인/시간대/시각표/시간표 키워드를 가장 먼저 `timeline_plan`으로 라우팅(비밀/반전/엔딩 등 다른 룰보다 위). `getDraftStyleRules`에 `SLOT|시간대|설명` / `ENTRY|플레이어 이름|행동 1~2문장` 포맷 강제, 의미 있는 최소 슬롯만(3~6개), 모든 슬롯에 전원 엔트리 금지, ENTRY는 해당 캐릭터 상세 스토리/비밀에서 파생된 행동만. `buildDraftPromptContext`도 timeline_plan일 때 `story`(피해자/경위/기존 슬롯)와 `players`(story/secret/timeline 포함)를 통째로 주입. `buildMakerAssistantContext`에 `message` 파라미터 추가해 채팅 텍스트에서 타임라인 의도 감지 시 step과 무관하게 full player 데이터(배경/스토리/비밀/기존 timeline)를 포함하도록 `needsFullPlayers` 확장. API route도 message를 넘기도록 업데이트. UI에서 SLOT/ENTRY 블록별 복사 버튼까지 붙이는 건 백로그. ✅ 완료 (2026-04-15, UI는 백로그)
- [x] **비밀 정보 불릿형 기본 유도** — 비밀 정보는 후반 공개용 사실 리스트라 산문보다 불릿이 GM/플레이어 양쪽에서 훑기 좋고 AI draft도 구조 재활용이 쉬움. 메이커 `PlayerEditor` 비밀 정보 textarea placeholder를 `-` 불릿 3줄 예시 + 하단 설명으로 교체. AI 도우미: `DraftWritingProfile`에 `bullet_facts` 프로필 추가, `inferDraftIntent`가 "비밀/반전" 키워드를 가장 먼저 `bullet_facts`로 라우팅, `getDraftStyleRules`에 불릿 형식/3~7개 제한/후반 공개용 결정타 위주 규칙 주입, `buildDraftPromptContext`도 같은 캐릭터 맥락 위주로 슬림하게 구성. 플레이어 `PrivateTextToggle`은 모든 비어있지 않은 줄이 `-`/`•`로 시작할 때 `<ul>` 리스트로 렌더(그 외는 기존 `<p whitespace-pre-line>` 유지) → 강제 아닌 유도 방식. ✅ 완료 (2026-04-15)
- [x] **제작 도우미 응답모드 auto 오판** — "오프닝 써줘", "캐릭터 배경 만들어줘" 같은 문안 생성 요청도 기존 패턴이 좁아 guide로 떨어지던 문제. `maker-assistant-response-mode.ts` DRAFT 패턴을 입력칸 명사(소개글/배경/비밀/엔딩/단서 카드/장소 설명/라운드 멘트/NPC 소개 등) + 생성 동사(써/작성/만들/생성/지어/짜/뽑아/제안) + 어미(줘/주세요/봐)로 확장. guide 패턴에도 가이드/리뷰/설명해/알려 추가. 판정 로직도 `draftScore > guideScore`로 바꿔 동률이면 guide로 안전하게 떨어지게 조정("오프닝 검토해줘"처럼 명사+분석 동사가 같이 오는 경우 오탐 방지). ✅ 완료 (2026-04-15)
- [x] **메이커 제작 도우미 스트리밍 UX + 허풍 차단** — 스트리밍 중 SSE chunk를 그대로 UI에 쏟아부어 `ACTION|3|...`, `FINDING|warning|...` 같은 내부 구조 마커와 gpt-5-mini의 토큰 반복(예: "의의의의", "쉽게쉽게")이 그대로 노출되던 문제. `useMakerAssistant.ts`에 `extractStreamingDisplay()` 추가: 스트리밍 버퍼에서 `SUMMARY:` / `BODY:` 본문만 뽑아 표시하고, 섹션 마커 도달 전이거나 파이프 포맷 라인은 "응답 생성 중…"으로 대체. 파싱 완료 후 `done` 이벤트가 오면 `finalResult.summary`/`body`로 교체되는 기존 경로는 유지. 시스템 프롬프트에 `maker-assistant-prompts.ts`로 "게임 데이터를 직접 수정/저장할 권한이 없다", "입력해 드릴게요/저장하겠습니다 표현 금지" 규칙 추가 — 실제로 write 경로가 구현돼 있지 않으므로(AI 응답은 suggestedActions/body까지만 반환) AI가 허풍으로 "자동 입력" 언급하지 못하도록 차단. ✅ 완료 (2026-04-15)
- [x] **승점 조건 자동 판정 진단 UI** — `ScoreConditionResult.missingConfigReason` 추가. clue-ownership/vote-answer에서 config가 비어 자동 판정 불가일 때 이유 문자열을 반환. PlayerView 결과 화면에서 설계상 수동(`type==="manual"`)과 조건 미완성(자동 타입인데 config 누락)을 분리 표시. 메이커 ScoreConditionsEditor의 clue-ownership 행에서 clueId 미선택 시 빨간 경고 배너 노출 → 사용자가 대상 단서를 지정해야 엔딩 시 인벤토리 기반 자동 판정이 동작함을 명시. ✅ 완료 (2026-04-15)
- [x] **플레이 UI 잔버그 일괄 수정** — (1) 오프닝 페이즈 내레이션 중복(opening banner + SharedBoardPanel) 제거: opening일 때 SharedBoardPanel narrationBlocks 숨김. (2) 공통화면 자료 없을 때 placeholder 박스 제거. (3) "보유됨" 단서 라벨을 `카드 #N` 하드코딩에서 `{장소명} #N`으로 교체. (4) 메이커 스텝 대기실: `hideTextField` 시 텍스트 뱃지/상태를 작성완료로 처리. (5) 개인 투표 통합: `VoteQuestion.personalTargetPlayerId` 추가 → 메이커 VoteQuestionForm에 플레이어 선택 UI, 플레이어 기본 범인투표 하단에 본인용 개인 질문 렌더 + 동시 제출, 서버 vote route basic + questionVotes 동시 수락. (6) UI 정리: 승리조건 접힘 버튼 보라 강조, "(본인만 열람)" 라벨 전부 삭제, "비밀 / 반전 정보" → "비밀 정보"로 메이커/플레이어/검증/AI 프롬프트 통일. ✅ 완료 (2026-04-15)
- [x] **모바일 첫 진입 뷰포트 확대 이슈** — `src/app/layout.tsx`에 viewport meta export 누락이 주 원인. Next.js App Router `viewport` export(`width=device-width, initial-scale=1, viewport-fit=cover`) 추가. `globals.css`에 `html,body { overflow-x: hidden; max-width: 100vw }` 보강(iOS Safari가 html에 걸려있지 않으면 자식 overflow-x-hidden 무시 케이스 회피). 부수 발견: `/library/manage/my-sessions` · `/library/manage/sessions` 검색 input이 `min-w-[18rem]`로 고정돼 320px 기기에서 overflow → `w-full sm:w-auto sm:min-w-[18rem]`로 교체. 렌더된 HTML에 viewport meta 삽입 검증. ✅ 완료 (2026-04-15)


- [x] **AI 채우기가 합의 마지막 요청자가 비호스트일 때 드롭되는 문제** — (A) 우선 호스트 판정: `GameSession.hostPlayerId` 필드 도입(player-consensus에서 첫 join한 playerId 고정). `phase-request`/세션 GET/`page.tsx` SSR에 `hostByPlayerToken` 조건 OR 추가 — 쿠키 유실 무관. (B) 플래그 드롭 수정: player-consensus에서 advance는 마지막 요청자가 트리거하는데, 비호스트 요청 body에는 `fillMissingWithAi=false`라 호스트 의도가 덮어써졌음. `SharedState.pendingFillMissingWithAi` 필드 도입해 호스트가 체크 시 세션 상태에 박아두고 advance 시 함께 평가, 성공 시 해제. GM 모드는 직접 PATCH라 영향 없음. ✅ 완료 (2026-04-14)
- [x] **조인 시 "이미 참가한 슬롯" 더블 알럿** — 원인: `handleJoin`에 재진입 가드 없음 → 모바일 더블탭/React state flush 지연으로 같은 요청 두 번 발사, 두 번째가 이미 잠긴 슬롯 만나 409. `useRef` 동기 가드 추가 + try/finally로 상태 해제 보장. ✅ 완료 (2026-04-14)

### 높음
- [x] **획득 전 단서 표시 설정** — 장소별 "획득 전 미리보기" 토글 + 단서별 preview_title/preview_description 입력. 기본 OFF 시 `{장소명} #N` 표시. ON 시 조사 포인트 힌트·NPC 대화 선택지 용도 활용. DB 컬럼 추가. 메이커 LocationEditor, 플레이어 UI, AI 플레이어 연동. 카드 상세에서 유형 라벨을 획득 장소로 교체. ✅ 완료 (2026-04-11)
- [x] **투표 & 엔딩 고급 시스템** — 메이커 투표 탭 개선(기본 투표 질문 텍스트/선택지 옵션/투표 전 텍스트 on/off, 2차 투표 명칭 변경). 메이커 엔딩 탭 다중 선택지→분기 매핑 UI. 플레이어 퍼널 4단계 분리(투표결과→분기엔딩→개인엔딩+점수→작가후기). 2차 투표 API 구현(제출/결과공개/분기resolve). EndingStage 확장(vote-result, vote-round-2-pre-story 추가). 개인 엔딩 레거시 마이그레이션 안내. 동점 재투표 시스템. 승점 자동 판정 3종(범인 검거 결과/단서 보유/개인 투표 답변). **후속 필요**: 추가 투표 캐릭터별 분리 ✅ 완료 (2026-04-12)
- [x] **서버 기반 공용 타이머** — `SharedState.timerState`로 라운드 타이머 서버 기반 통합. GM/호스트가 시작·일시정지·재개 가능. 플레이어 공통화면 탭에서 카운트다운 표시. 합의 모드 호스트 조작 지원. 비로그인 세션 삭제 권한 수정 ✅ 완료 (2026-04-09)
- [x] **계정별 동시 세션 수 제한** — 로그인 유저 최대 3개(admin 면제), 비로그인 유저 1개(쿠키 기반 추적). 한도 초과 시 모달로 기존 세션 관리 + `/library/manage/my-sessions` 페이지 추가 ✅ 완료 (2026-04-09)
- [x] **인물 설정 관계 탭 복구** — 메이커 Step3 관계 탭 정상 확인. 플레이어 인물 정보에서 관계/인상 미입력 시 불필요한 placeholder 텍스트 제거 ✅ 완료 (2026-04-09)
- [x] **Supabase MCP 연결** — Claude/Codex가 DB 직접 쿼리 가능하도록 선행 작업 (JSON 컬럼 개선 설계 전제) ✅ 완료 (2026-04-09)

### 중간
- [x] **GM 진행 가이드(gmNote) 필드 폐지** — GM과 플레이어 진행 경험을 같게 만들기 위해 `ScriptSegment/RoundScript.gmNote` 및 `game_scripts.gm_note` 컬럼 제거. 메이커 UI에서 오프닝/대기실/라운드의 "진행 가이드" textarea 삭제, GMDashboard에서 `PhaseGuide` 섹션 제거. 메이커에서는 페이즈별 안내 텍스트(narration)만 입력하며 플레이어 공통화면과 GM 공통 보드에 같은 내용이 노출된다. ScriptEditor 기본 라벨을 "나레이션"에서 "안내 텍스트"로 교체. 기존 gm_note 테스트 데이터는 DB 마이그레이션으로 drop. ✅ 완료 (2026-04-15)
- [x] **캐릭터 카드 승리조건 배치 정돈** — 플레이어 캐릭터 탭에서 상단에 독립으로 떠있던 승리조건 블록을 프로필 패널의 배경 ↔ 상세 스토리 사이로 이동해 다른 프로필 항목과 같은 계층으로 정렬. "탭해서 확인" 토글과 엔딩 페이즈 자동 펼침 동작은 그대로 유지. ✅ 완료 (2026-04-15)
- [x] **게임 커버 GM/플레이어 진입 버튼 정책** — 공개 게임은 GM/플레이어 2-버튼, 일부공개는 링크 공유 대상을 플레이어로 한정하기 위해 플레이어 참여만 노출. 이후 세션 진입 퍼널(/play/[id]/join)은 두 가시성 공통. ✅ 완료 (2026-04-15)
- [x] **Visibility 3-mode 리팩토링** — draft 제거, `private | unlisted | public` 3-mode 체계로 전환. DB CHECK 제약조건 + RLS 정책 unlisted 포함 마이그레이션. normalizer 버그 수정. UI 워딩 YouTube 스타일(비공개/일부 공개/공개). `/game/[gameId]` 커버 페이지 신규 추가. ✅ 완료 (2026-04-10)
- [x] **통 JSON DB 컬럼 개선** — `game_content.content_json` 전면 정규화 완료. 15개 신규 테이블 생성(game_stories, game_players, game_locations, game_clues, game_scripts 등). games 테이블에 settings/rules 확장 컬럼 추가. game-repository.ts 완전 재작성(신규 테이블 기반 CRUD). content_json 비우고 backup 보존. LangChain(@langchain/core, @langchain/openai) + Langfuse 연동 검증 완료. ✅ 완료 (2026-04-10)
- [x] **메이커 AI 도우미 LangChain 전환 + Langfuse 트레이싱** — Responses API → LangChain ChatOpenAI 전환. OTel span 직접 참조 방식으로 input/output 트레이싱 안정화. step별 컨텍스트 최적화. API 에러 분류(401/429/403) + UI 표시. AI 플레이어 밀담 채팅 API/UI 신규 추가. ✅ 완료 (2026-04-10)
- [x] **유저 정보 오버레이 모바일 스크롤 버그** — 오버레이 내부 스크롤 미작동으로 하단 로그아웃 버튼 접근 불가. iOS Safari `overflow-y: scroll` + `-webkit-overflow-scrolling: touch` 또는 body scroll lock 충돌 추정. ✅ 완료 (2026-04-09, 모바일 좌우 정렬 보정 후속 반영)
- [x] **플레이어 엔딩 이후 종료 동선** — 최종 엔딩 공개 후 게임 종료 액션 ✅ 완료 (2026-04-09)
- [x] **장소 탐색 첫 획득 카드 상세 팝업** — 첫 획득 시 자동 팝업 오픈 ✅ 이미 구현됨 (acquireClue → setSelectedCard)
- [x] **일부 공개(unlisted) 세션 퇴장/파괴 정책** — GM 퇴장 시 세션 즉시 파괴, 플레이어 퇴장 시 슬롯 해제(마지막이면 세션 파괴), 퇴장 경고 팝업 강화. `POST /api/sessions/[sessionId]/leave` 신규 API. 가시성 전환 시 잔류 세션 경고/일괄 삭제. unlisted join 페이지 게임표지 네비게이션. ✅ 완료 (2026-04-10)
- [x] **미사용 세션 자동 정리 정책** — Vercel Cron Job으로 `GET /api/cron/cleanup-sessions` 매일 UTC 19:00(KST 04:00) 1회 실행. 조건: 엔딩 완료 세션 24h 초과 OR 미활동(updated_at) 24h 초과. `session-repository.listExpiredSessions(hours)` 헬퍼 추가(OR 필터로 한 쿼리). 삭제 시 기존 `createSessionBackupSnapshot` 자동 실행(롤백 가능). `CRON_SECRET` Bearer 토큰 필수(미설정 시 500 거부). Admin 삭제(`DELETE /api/sessions/[id]`, `isMakerAdmin` 가드)와 완전히 독립. 테스트: `?hours=` 쿼리로 임계값 override 가능. `vercel.json`에 crons 스펙. ✅ 완료 (2026-04-14)
- [x] **단서 획득 액션 응답 지연 개선** — (1) AI auto-acquire 후 Langfuse 트레이스를 직렬 await하던 코드 제거 — 결정론 로직이라 트레이스 불필요. AI N명 × RTT 가산 제거. (2) acquire 응답에 `sharedState/inventory/roundAcquired/roundVisitedLocations` 동봉 → SSE/폴링 대기 없이 클라가 즉시 setState. (3) `try/finally`로 버튼 잠금 해제 보장. (4) `shared_clue_discovered` + `clue_acquired` 이벤트 실시간 알림 — 초기엔 SSE로 구현했으나 Vercel 서버리스에서 in-memory broadcaster가 다른 instance에 닿지 못해 유실되는 문제 발견 → **Supabase Realtime Broadcast로 전환** (REST /realtime/v1/api/broadcast 발행 + 브라우저 anon 구독). 상단 floating pill 알림(반투명 sky/45, 2.5s 노출 후 0.8s 페이드아웃, 다수 동시 발생 시 최신순 위→아래 스택) + SSE 수신 시 폴링 backoff(2.5s). AI 자동 획득 outcome도 동일 이벤트로 브로드캐스트. "플레이어(캐릭터)" 포맷. (5) `alert()` 제거 → inline 토스트. 409 "이미 다른 플레이어 보유" 시 sharedState 낙관적 push로 버튼 즉시 `takenByOther` 전환. ✅ 완료 (2026-04-14)
- [x] **라운드 대표 이미지 업로드** — 이미 구현돼 있음. 메이커 Step5(`ScriptEditor.tsx:448`) `ImageAssetField` + `POST /api/games/[gameId]/assets?scope=rounds` 업로드 파이프라인 완비. `game.scripts.rounds[].imageUrl` 로 저장. 플레이어 공통화면(`player-shared-board.ts:65`)과 GM 보드(`GMDashboard.tsx:174`) 모두 렌더링. ✅ 완료 (2026-04-14 검증)
- [ ] **대상 작업자 찾기 UX** — 소유권 이관 시 이름/ID 검색
- [ ] **GM 없는 세션 공통화면 범위 보강**
- [ ] **예상 소요 시간 자동 요약 + 수동 덮어쓰기** — 메이커 Step1 `예상 소요 시간` 슬라이더(`estimatedDuration`)가 라운드/페이즈 타이머 설정과 완전히 따로 굴러서, 제작자가 오프닝/조사/토론/라운드 수를 바꿔도 상단 슬라이더를 직접 다시 맞춰야 하는 상태. 동시에 오른쪽 "라운드 타임라인 요약" 카드는 현재 **오프닝 + 라운드(조사+토론)** 까지만 합산하고 **투표/엔딩 페이즈** 는 빠져 있음. 계획: (1) 투표/엔딩 페이즈에도 "타이머는 안 붙지만 제작자가 예상 진행 시간을 세팅할 수 있는" 숫자 필드 추가 — 플레이어 시계가 카운트다운으로 돌아가지 않더라도 요약 합산용으로 사용. (2) 요약 카드를 "오프닝 + 라운드 × N + 투표 + 엔딩" 전 구간으로 확장하고 각 항목 세팅값이 바뀌면 즉시 재계산. (3) 상단 `예상 소요 시간`은 **자동 계산값을 기본값으로 제시하되 제작자가 원하면 수동으로 덮어쓸 수 있는 하이브리드** — 자동값과 수동값을 함께 저장(`estimatedDurationAutoMinutes`, `estimatedDurationOverrideMinutes`)하고 요약 카드에서 "자동 ○○분 / 수동 ○○분(직접 입력)" 토글 제공. 너무 경직되면 오히려 불편하므로 수동 override 이후엔 자동값과의 차이만 안내 문구로 보여주고 자동 반영은 하지 않음. (4) 라이브러리 카드 `시간 ○○분` 표기와 Step1 슬라이더 값 출처는 override가 있으면 override, 없으면 auto 합계 사용.
- [ ] **단서 검토 시스템(범인 도주/추리 난이도/모순)** — 제작자 관점에서 플레이어에게 공개되는 단서를 AI가 일괄 검토하는 전용 기능. 3개 축으로 진단: (A) 범인 도주 가능성 — 공개 단서만으로 범인 특정이 가능한지, 결정적 단서가 owned로 묶여 사장될 위험은 없는지, (B) 플레이어 추리 난이도 — round별 누적 공개 단서로 범인 후보 수 곡선 추정(너무 빨리/늦게 좁혀지는 경우 경고), (C) 단서 간 모순 — 시간/장소/동기/중복 충돌 페어 탐지. 진입점은 메이커 상단 "단서 검토" 버튼(Step 4 이후 활성) 또는 기존 Assistant Drawer 탭 추가. 3축 병렬 호출 + 종합 라벨 + 결정적 단서 하이라이트 + 충돌 페어 표 + 권고 액션(편집 위치 점프) UI. MVP는 수동 트리거 + escape risk 1축, Phase 2에 나머지 2축 + 결과 스냅샷 DB 저장(`games.last_clue_review jsonb`), Phase 3에 해시 캐싱/정밀 모델 토글. 상세: `docs/plans/20260415_CLUE_REVIEW_SYSTEM_PLAN.md`.
- [ ] **메이커 제작 도우미 레이턴시 감소 플랜** — 현재 `buildMakerAssistantContext`가 초기 JSON 통짜 시절 설계를 거의 그대로 들고 있어, 실제 답변 생성에 필요 없는 메타데이터(전체 라운드 스크립트, 전체 ending branches, 슬롯/인원 카운트 등)가 매 요청마다 함께 실리고 토큰·레이턴시를 과하게 먹고 있음. 동시에 `maker-assistant-prompts.ts` 쪽에 어투·형식 규칙(`~다` 강제, 불릿 강제, 명사형 금지, SLOT/ENTRY 포맷 등)이 하드코딩으로 계속 누적되는 중 — 목적별 프로필/후처리 정규화로 옮기면 프롬프트 길이도 줄고 규칙 변경도 코드 바깥으로 빠짐. (1) task/프로필별로 "이 요청에서 실제 참조되는 필드"만 남기는 컨텍스트 화이트리스트를 재정의 — 예: suggest_clues는 story + 대상 장소 clue 목록만, timeline_plan은 player story/secret + 기존 timeline, bullet_facts는 해당 캐릭터만. (2) Supabase 정규화 이후 `listGameMetadata`/개별 테이블 조회가 가능하므로, `normalizeGame()`으로 통 JSON을 한 번 통째로 불러와 축약하는 현재 흐름 대신 필요한 테이블만 골라 조회하는 경로로 바꿀 수 있는지 검토(특히 `game_scripts`, `game_ending_branches`, `game_vote_questions` 중 자주 안 읽히는 것). (3) 어투 규칙은 프롬프트 텍스트 대신 후처리 lint(모델 출력에서 명사형 종결을 감지해 재시도 또는 치환)로 이동해 시스템 프롬프트 길이 축소. (4) 측정: 전/후 `system+user` 토큰 수와 응답 latency를 Langfuse metadata로 비교.
- [x] **AI 플레이어 슬롯 자동 채우기 정책** — 게임 도중 빈 슬롯이 생겨도 AI가 자동으로 채우지 않도록 수정(AI fill은 lobby→opening 전환에만 실행). AI 채우기 체크박스를 세션 호스트(GM 또는 player-consensus 방 생성자)에게만 노출. phase-request API에 서버 가드 추가로 비호스트의 fillMissingWithAi는 강제 false. 헤더에 "호스트" pill 배지. `page.tsx`에서 `getCurrentMakerUser()`+`isSessionHost()` 조합으로 SSR 시점에 `isSessionHost` 확정 — 호스트는 첫 페인트부터 체크박스 활성, 비호스트는 즉시 안내 문구(클라 fetch 레이스 제거). 슬롯 보존 정책: 플레이어 이탈 시 characterSlot 해제되고 playerStates는 보존되며 같은 캐릭터로 join 시 기존 인벤토리/진행 상태 자동 인수(이미 API에서 지원). `JoinSessionPreview.slotsWithPriorProgress`로 캐릭터 선택 UI에 "이어받기 가능" 라벨 노출 + 인수 안내 문구 추가. ✅ 완료 (2026-04-14)
- [x] **플레이어 화면 스포일러 방지 개선** — (1) 엔딩 퍼널 분리로 vote-result 패널에서 진범/검거 결과 제거, 분기 엔딩 스토리 이후로 공개 순서 조정 (2026-04-13, 814f311). (2) 캐릭터 카드 승리 조건을 기본 접힘 + "탭해서 확인" 토글로 전환, 엔딩 페이즈에선 자동 펼침 (2026-04-13). ✅ 완료
- [x] **메이커 단서 추가 버튼 위치 개선** — 단서 카드 리스트 컨테이너 맨 아래에 점선 슬림 "+ 단서 추가" 버튼 추가. 헤더 버튼은 유지(빈 장소 초기 발견성). 리스트가 비어있을 땐 하단 버튼 미노출로 중복 최소화. 연속 추가 시 스크롤 왕복 제거. ✅ 완료 (2026-04-14)
- [x] **단서 유형(type) 옵션 리워크** — 동작 기반 2종(획득/공개)으로 재설계 완료 (2026-04-13). owned는 인벤토리 + 건네주기, shared는 첫 발견자만 조사회수 1회 차감 + 이후 모두 무료 열람. DB 마이그레이션(physical/testimony→owned, scene→shared) 적용. AI 플레이어 shared 첫 발견 가능. 미발견 shared 카드는 owned와 동일 UI로 스포일러 방지. 플랜: `docs/plans/20260413_CLUE_TYPE_REWORK_PLAN.md` ✅
- [x] **플레이어 화면 페이즈 퍼널 분리** — 엔딩 페이즈를 4단계 퍼널로 분리(투표결과→분기엔딩→개인엔딩+점수→작가후기). 2차 투표 시 pre-story/투표/결과+엔딩 별도 퍼널. EndingStage 확장(vote-result, vote-round-2-pre-story). ✅ 완료 (2026-04-11)
- [ ] **오프닝 페이즈 규칙 안내 자동 생성** — 밀담 인원 규칙, 페이즈별 설정 시간 등 메이커가 선택한 기본 설정 값을 기반으로 오프닝 안내 텍스트 자동 생성. 유저가 별도 텍스트 입력하는 방식이 아님. GM 공통화면 탭과 플레이어 공통화면 탭 두 곳에서 통일된 형태로 표시. 표시 레이아웃/컴포넌트 설계 선행 필요.
- [ ] **장소 입장 조건 다중(OR) 지원** — 한 장소에 여는 방법을 2개 이상 등록해 누구 하나가 열면 해제되게 확장. 현재 `Location.accessCondition: ClueCondition` 단일 필드 → `accessConditions: ClueCondition[]` 배열로 마이그레이션. (1) `types/game.ts` + `lib/game-normalizer.ts` 읽기 시 단일 → 1원소 배열로 업그레이드 (2) 서버 `cards/route.ts` 입장 체크, `locations/[locationId]/unlock/route.ts` 를 배열 순회로 변경 — 한 조건이라도 통과하면 입장 가능, `character_has_item` 조건 중 하나라도 unlock 되면 `unlockedLocationIds` 에 기록 → 전체 공개 (3) 플레이어 `PlayerView.tsx` 조건마다 "열기" 버튼 렌더(본인이 targetCharacterId 인 경우만) (4) 메이커 `LocationEditor.tsx` 의 단일 dropdown 을 "조건 카드 리스트 + +조건 추가/삭제" 로 리팩토링 — 작업량 절반 이상이 여기. 선행 작업(2026-04-15 커밋 `eeb8d4e` + `5623881`)으로 단일 조건 흐름은 확정돼 있으니 스펙 동결된 상태에서 배열 확장만 하면 됨.
- [x] **모바일 헤더 반응형 개선** — 로그인 시 헤더 버튼(가이드, 계정, 내 게임 관리 등) 증가로 모바일에서 줄바꿈 깨짐. "Murder Mystery" + "내 게임 관리"를 최우선 노출하고, 나머지(가이드 메뉴, 계정 메뉴 등)는 breakpoint 이하에서 hamburger(⋮) 메뉴로 합침. 계정 정보는 hamburger → DOM toggle로 기존 패널 재활용. Admin 세션 테이블도 모바일 카드 레이아웃 추가. ✅ 완료 (2026-04-10)
- [x] **메이커 SAVE STATUS 배너 제거 + 카드 상세 모달 중앙 배치** — 메이커 편집 페이지 상단 불필요한 SAVE STATUS 배너 삭제. 플레이어 카드 상세/현장 단서 모달을 바텀시트에서 화면 중앙 카드형 레이아웃으로 변경. 반응형 여백, 배경 클릭 닫기 지원. ✅ 완료 (2026-04-10)

### 기획·설계 인프라
- [x] **화면 설계서 인벤토리(docs/screens.json)** — 34개 화면(페이지 17 + 서브탭/모드 17)에 `P-XXX` ID 부여. 각 `page.tsx` 상단 `@screen P-###` 주석으로 코드/시트 일관성 유지. `npm run sync:screens`로 Google Sheets 덮어쓰기 동기화. ✅ 완료 (2026-04-14)
- [ ] **화면 설계 → 디자인 자산 동기화 전략** — 의사결정 결과: **Puppeteer 자동 캡처는 취소**(인증/상태 의존 화면이 많아 비용 대비 이득 작음), **직접 캡처 + 네이밍 규칙 + Drive/Sheet 자동 연동** 방향으로 전환.
  - **Phase 1 완료 (2026-04-14)**: `docs/screenshots/` 폴더 + README(파일명 규칙 `P-XXX.png` 시트 ID 일치) + `.gitignore` (이미지 비추적). `sync-screens.mjs`에 "스크린샷" 컬럼 추가 — 파일 존재 여부(`있음`/`미캡처`) 표시.
  - **Phase 2 미착수**: `scripts/sync-screenshots.mjs` — Drive API로 `docs/screenshots/*.png` 업로드, 공유 링크 획득, Sheet에 `=IMAGE(url)` 수식 자동 삽입. 필요 env: `GOOGLE_DRIVE_FOLDER_ID`. 공개 설정: 서비스계정이 만든 파일은 해당 계정 소유라 공유 링크 발급 + `permissions.create({type:"anyone", role:"reader"})` 필요.
  - **Figma 직접 연동은 추가 백로그로 보류**: 일단 Sheet 임베드로 충분. 디자이너 손이 필요할 때 Figma로 확장.
- [ ] **Git 브랜치 전략 전환** — 유저 인입 시점에 main/dev 분리 도입. 현재는 main 직접 push + Vercel 즉시 배포. 병렬 에이전트 작업 시 feature 브랜치 + worktree 활용. dev 도입 시 Vercel Preview 기반 staging 검증 추가. CLAUDE.md/AGENTS.md 지침도 함께 갱신 필요
- [x] **다자 밀담 컨텍스트 체이닝** — 다자 밀담에서 각 AI가 이전 AI 응답을 컨텍스트로 받아 답변. turnContext 파라미터로 이전 발언 누적 전달. 캐릭터 관계/타임라인/승점 조건을 프롬프트에 포함. 메타 정보(점수, 승리 조건) 노출 방지 — 원본 데이터를 LLM이 캐릭터 심리로 해석. ✅ 완료 (2026-04-10)
- [x] AI 채팅 탭 및 대화 파이프라인 — 장소 탐색 탭에 밀담 하위 탭 추가. POST /api/sessions/[sessionId]/chat API. LangChain ChatOpenAI + Langfuse OTel 트레이싱. 캐릭터별 프롬프트(배경/스토리/비밀/관계/타임라인/내면 동기). 다자 밀담 turnContext 체이닝. 메타 정보 노출 방지. ✅ 완료 (2026-04-10)
- [ ] AI 카드 교환/전달
- [ ] AI 시간 기반 행동 정책 (라운드 종료 직전)
- [ ] 시나리오별 프롬프트 override 실제 적용
- [ ] Langfuse score 체계
- [ ] 협업자 모델
- [x] ~~엔딩 투표 세부 분기 확장~~ → 높음 "투표 대상 확장 + 다중 질문 + 2차 투표"로 통합

---

## 참조 문서

| 문서 | 목적 |
|------|------|
| `docs/SPEC.md` | 전체 설계 명세 |
| `docs/screens.json` | 화면 설계서 원본. `npm run sync:screens`로 Google Sheet 동기화 (PM 협업용) |
| `docs/backlog/20260406_POST_DEPLOY_PRODUCT_BACKLOG.md` | 배포 후 백로그 세부 스펙 |
| `docs/archive/plans/` | 완료된 플랜 문서 보존 |
| `docs/operations/` | admin 운영 가이드 |
| `ai_history/` | 과거 작업 기록 (이력 참조용) |
| `docs/archive/` | 완료된 문서 보존 |
