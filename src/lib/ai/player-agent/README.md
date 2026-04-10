# Player Agent Layer

AI 플레이어 전용 계층. GM 없는 세션, 인원 부족 시 AI 자동 채우기, 밀담 채팅에 사용된다.

## 현재 구현 상태

| 기능 | 상태 | 위치 |
|------|------|------|
| AI 슬롯 상태 관리 | 구현 완료 | `core/player-agent-state.ts` |
| 자동 단서 획득 | 구현 완료 | `actions/auto-actions.ts` |
| 자동 투표 | 로직 구현, 호출 미연결 | `actions/auto-actions.ts` |
| 밀담 채팅 | 구현 완료 | `../../app/api/sessions/[sessionId]/chat/route.ts` |
| 가시 컨텍스트 | 구현 완료 | `../shared/player-agent-context.ts` |

## 폴더 구조

```
player-agent/
├── core/
│   └── player-agent-state.ts   # AI 슬롯 초기화, 상태 동기화, 런타임 상태
├── actions/
│   └── auto-actions.ts         # 규칙 기반 단서 획득 + 투표 (LLM 미사용)
└── README.md
```

### 채팅이 이 폴더에 없는 이유

밀담 채팅은 Next.js API route에서 직접 구현했다.

- API route: `src/app/api/sessions/[sessionId]/chat/route.ts`
- UI: `src/app/play/[gameId]/[charId]/_components/AiChatPanel.tsx`
- 공유 컨텍스트: `src/lib/ai/shared/player-agent-context.ts`

LangChain ChatOpenAI 호출, 프롬프트 조립, 이력 저장이 모두 route 안에 있다.
향후 프롬프트가 복잡해지면 이 폴더로 분리할 수 있다.

## 동작 원리

### 자동 단서 획득 (`auto-actions.ts`)

- 트리거: 인간 플레이어가 단서 획득 시
- 모든 AI 플레이어가 각각 1개씩 단서 획득 (루프)
- 규칙 기반: 씬 단서 제외, 중복 제외, 라운드 잠금, 조건식 평가
- 결정론적 선택: `sessionId:playerId:roundKey` 해시

### 밀담 채팅

- LangChain ChatOpenAI (gpt-5-mini)
- 캐릭터 프롬프트: 배경, 스토리, 비밀, 관계, 타임라인, 내면 동기
- 데이터 격리: `buildPlayerAgentVisibleContext` → 해당 캐릭터 공개 정보만
- 다자 밀담: `turnContext`로 이전 AI 응답 누적 전달
- 메타 노출 방지: 점수/승리조건/목표 → LLM이 캐릭터 심리로 해석

## 원칙

- AI 플레이어는 자기에게 공개된 정보만 사용한다
- 획득 전 단서, 다른 캐릭터 비밀은 절대 포함 안 됨
- 게임 메타 용어(점수, 승리 조건, 목표)를 대화에서 언급하지 않는다
- 메이커 도우미와 원본 데이터는 공유하되, 응답 파이프라인은 분리
