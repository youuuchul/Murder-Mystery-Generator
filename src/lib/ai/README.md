# AI Layer README

메이커용 LLM 제작 도우미와 AI 플레이어 채팅 파이프라인을 정리한 소스 코드 근처 문서다.

## 1. 현재 상태

- **메이커 제작 도우미 V2**: LangChain ChatOpenAI 기반. 스트리밍 응답 지원.
- **AI 플레이어 채팅**: LangChain ChatOpenAI 기반. 캐릭터별 프롬프트. 다자 밀담 체이닝.
- **AI 플레이어 자동 행동**: 규칙 기반 (단서 획득, 투표). LLM 미사용.
- **공통 LLM**: `gpt-5-mini` (reasoning 모델). `@langchain/openai` ChatOpenAI.
- **트레이싱**: Langfuse OTel (startActiveObservation + span.setAttribute).
- **DB**: 정규화 테이블 기반 (game_players, game_clues 등 15개 테이블).

## 2. 아키텍처 개요

```
[메이커 AI 도우미]
MakerEditor → useMakerAssistant (stream:true)
  → POST /api/maker-assistant
    → buildMakerAssistantContext (step별 최적화)
    → LangChain ChatOpenAI.stream() → SSE 응답
    → parseMakerAssistantResult (guide/draft)
    → Langfuse OTel trace

[AI 플레이어 채팅 (밀담)]
AiChatPanel → POST /api/sessions/[sessionId]/chat
  → 권한 검증 (token + AI slot)
  → buildPlayerAgentVisibleContext (데이터 격리)
  → buildChatSystemPrompt (캐릭터 프롬프트)
  → LangChain ChatOpenAI.invoke()
  → turnContext 체이닝 (다자 밀담)
  → conversationHistory 세션 저장
  → Langfuse OTel trace

[AI 플레이어 자동 행동]
cards/route.ts → applyPlayerAgentAutoAcquireReaction (규칙 기반)
  → 전 AI 플레이어 루프 (1회 트리거 → N명 획득)
  → Langfuse trace
```

## 3. LangChain 사용 현황

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `@langchain/core` | 1.1.39 | 메시지 타입 (SystemMessage, HumanMessage) |
| `@langchain/openai` | 1.4.3 | ChatOpenAI (gpt-5-mini) |
| `@langfuse/langchain` | 5.1.0 | 설치됨 (OTel 기반으로 트레이싱하므로 직접 사용 안 함) |

### gpt-5-mini 호환성 메모

- reasoning 모델이라 `temperature` 지원 안 함
- `max_completion_tokens`로 토큰 제어 (reasoning + output 합산)
- `modelKwargs: { max_completion_tokens: N }` 으로 설정
- `finish_reason: "length"` 로 토큰 잘림 감지

## 4. 파일 구조

```
src/lib/ai/
├── langchain-openai.ts          # ChatOpenAI 팩토리 (공용)
├── openai.ts                    # 레거시 OpenAI SDK client (auto-actions용)
├── openai-error.ts              # API 에러 분류 (401/429/403)
├── langfuse.ts                  # Langfuse OTel SDK 초기화
├── maker-assistant-context.ts   # 메이커 컨텍스트 빌더 (step별 최적화)
├── maker-assistant-prompts.ts   # 메이커 시스템/유저 프롬프트
├── maker-assistant-response-mode.ts # guide/draft 자동 감지
├── maker-assistant-schema.ts    # 요청/응답 Zod 스키마 + 파서
├── maker-assistant-tracing.ts   # Langfuse trace 이름/태그/입출력 빌더
├── shared/
│   ├── player-agent-context.ts  # AI 플레이어 가시 컨텍스트 (데이터 격리)
│   └── README.md
└── player-agent/
    ├── core/
    │   └── player-agent-state.ts  # AI 슬롯 상태 관리
    ├── actions/
    │   └── auto-actions.ts        # 규칙 기반 단서 획득/투표
    ├── chat/                      # (placeholder - 로직은 API route에)
    ├── prompts/                   # (placeholder)
    └── scenario-overrides/        # (placeholder)
```

## 5. AI 플레이어 채팅 상세

### 프롬프트 구성 (`buildChatSystemPrompt`)

캐릭터 프롬프트에 포함되는 정보 (모두 DB에서 동적 로드):

| 섹션 | 소스 | 설명 |
|------|------|------|
| 당신의 배경 | `game_players.background` | 공개 배경 |
| 당신만 아는 사실 | `game_players.story` | 비공개 스토리 |
| 당신의 비밀 | `game_players.secret` | 숨겨야 할 정보 |
| 주변 인물과의 관계 | `player_relationships` → 이름 resolve | 소꿉친구, 라이벌 등 |
| 사건 당일 행적 | `player_timeline_entries` → slot label resolve | 시간대별 행동 |
| 내면 | `victoryCondition` + `scoreConditions` | LLM이 심리로 해석 |
| 현재 가진 단서 | `playerState.inventory` | 획득한 단서 제목 |
| 대화 상대 | `characterSlots` | 참가 중인 다른 캐릭터 |

### 메타 정보 노출 방지

- victoryCondition/scoreConditions는 원본 데이터로 전달
- LLM이 "캐릭터 심리로 해석해서 행동에 반영. 절대 그대로 말하지 마세요" 지시
- 하드코딩된 심리 매핑 없음 (LLM 자체 해석)
- 절대 규칙: 점수, 승리 조건, 목표, 입장 같은 게임 메타 용어 언급 금지

### 다자 밀담 컨텍스트 체이닝

```
[플레이어]: 범인이 누구라고 생각해?
  → AI-A 호출 (turnContext: [])
[AI-A]: 나는 김탐정이 의심돼.
  → AI-B 호출 (turnContext: [{AI-A: "나는 김탐정이 의심돼."}])
[AI-B]: 김탐정? 오히려 AI-A가 더 수상해.
```

- 클라이언트(`AiChatPanel`)가 `turnReplies` 배열을 누적
- 각 API 호출 시 `turnContext` 파라미터로 이전 AI 응답 전달
- 서버가 `turnContext` 메시지를 플레이어 메시지 뒤에 추가

### 데이터 격리

- `buildPlayerAgentVisibleContext()`가 `buildGameForPlayer()`를 호출
- 해당 캐릭터가 볼 수 있는 정보만 추출
- 획득하지 않은 단서, 다른 캐릭터의 비밀은 절대 포함 안 됨

## 6. 메이커 AI 도우미 상세

### 변경 이력 (V1 → V2)

| 항목 | V1 | V2 (현재) |
|------|----|----|
| LLM 호출 | OpenAI Responses API 직접 | LangChain ChatOpenAI |
| 응답 방식 | 동기 (25초 대기) | SSE 스트리밍 + fallback |
| 컨텍스트 | 전체 GamePackage 전송 | step별 필요 데이터만 |
| 트레이싱 | @langfuse/openai observeOpenAI | OTel span.setAttribute 직접 |
| DB | content_json 통 blob | 15개 정규화 테이블 |

### 스트리밍 프로토콜

- `Content-Type: text/event-stream`
- `event: chunk` + `data: {"text":"..."}` — 텍스트 조각
- `event: done` + `data: {"task":"...","result":{...}}` — 파싱된 최종 결과
- `event: error` + `data: {"error":"..."}` — 에러
- 클라이언트: 청크를 실시간 렌더 → done 시 파싱 결과로 교체

## 7. Langfuse 트레이싱

### 구조

```
OTel NodeSDK + LangfuseSpanProcessor
  → startActiveObservation (parent trace)
    → propagateAttributes (userId, sessionId, tags)
    → span.setAttribute("langfuse.observation.input/output", ...)
    → ChatOpenAI 내부 OTel span (자동 포착)
  → forceFlushLangfuseTracing (서버리스 flush)
```

### OTel context 유실 방지

`updateActiveObservation`은 `trace.getActiveSpan()`에 의존하므로 `await` 후 유실 가능.
대신 `await` 전에 `trace.getActiveSpan()`으로 span 참조 캡처 → `span.setAttribute()` 직접 호출.

### trace 이름 패턴

| 패턴 | 예시 |
|------|------|
| 메이커 AI | `maker-assistant.validate-consistency.guide` |
| AI 채팅 | `player-agent.chat.리에나 그린벨` |
| 자동 획득 | `player-agent.auto-acquire` |

## 8. env 설정

| 변수 | 용도 |
|------|------|
| `OPENAI_API_KEY` | OpenAI API 키 |
| `OPENAI_MODEL` | 모델명 (기본: gpt-5-mini) |
| `OPENAI_REASONING_EFFORT` | reasoning 강도 (low/medium/high) |
| `OPENAI_ASSISTANT_ENABLED` | 메이커 AI 기능 토글 |
| `LANGFUSE_PUBLIC_KEY` | Langfuse 공개 키 |
| `LANGFUSE_SECRET_KEY` | Langfuse 비밀 키 |
| `LANGFUSE_BASE_URL` | Langfuse 엔드포인트 |

## 9. 이후 작업

### 단기
- AI 플레이어 캐릭터 스탠스 강화 (협력/숨기기/인정 판단)
- 대화 메모리 관리 (라운드별 요약)
- 메이커 AI 스트리밍 체감 레이턴시 튜닝

### 중기
- AI 카드 교환/양도 (도구 호출 기반)
- AI 투표 참여 (대화 흐름 기반)
- 시나리오별 프롬프트 override

### 장기
- RAG + LLM 기반 NPC 제작
- Langfuse score 체계
- 시나리오 템플릿 검색/재활용
