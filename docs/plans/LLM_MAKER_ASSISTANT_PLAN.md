# LLM Maker Assistant Plan

## 현재 상태

- 2026-03-15 기준 V1 초기 구현 완료
- 현재 메이커 편집 화면에서 우하단 런처 + 우측 드로어로 사용 가능
- 이 문서는 이후 개선 항목과 확장 범위를 이어서 정리하는 기준 문서로 유지한다

## 1. 목적

이 문서는 2026-03-15 기준 다음 백로그 1순위인 `LLM 기반 시나리오 제작 도우미`의 구현 계획을 정리한다.

- 우선순위 1: 메이커 편집 중 바로 쓰는 제작 보조 LLM
- 우선순위 2: RAG/LLM 기반 NPC 생성

현재 판단으로 2번은 나중이 맞다. 지금 게임 데이터는 `GamePackage` 1개 안에 충분히 구조화되어 있고, 먼저 필요한 문제도 `검색`보다 `검증/제안/우선순위 안내`에 가깝다. 따라서 V1은 RAG 없이 진행하는 편이 더 단순하고 구현 리스크가 낮다.

## 2. 해결하려는 문제

메이커는 현재 Step 1~5를 왔다 갔다 하며 직접 작성하고 있지만, 다음 세 가지에서 도움을 받으면 제작 속도가 크게 빨라진다.

1. 단서, 타임라인, 배경 스토리 사이의 서사적 충돌을 빨리 찾기
2. 입력된 캐릭터/배경/비밀을 기준으로 어울리는 단서를 제안받기
3. 현재 작업 상태를 보고 다음에 무엇부터 채워야 하는지 추천받기

핵심은 별도 페이지가 아니라, 편집 화면 안에서 바로 물어보고 바로 반영하는 흐름이다.

## 3. V1 범위

### 포함

- `단서-타임라인 검증`
  - 시간대별 행동과 단서 설명이 서로 충돌하는지 점검
  - 범인, 장소, 사건 설명과 맞지 않는 단서/알리바이 문장을 찾아줌
  - 기존 `validateMakerGame()`가 잡는 필수 누락 외에, 의미적 모순을 잡는 역할
- `단서 제안`
  - 피해자 정보, 사건 설명, 캐릭터 배경, 비밀, 장소, 기존 단서를 읽고 새 단서 아이디어 제안
  - 단서 제목, 타입, 배치 장소, 어떤 의심을 강화하는지까지 함께 제시
- `다음 작업 추천`
  - 현재 Step, 검증 상태, 작성 밀도 기준으로 다음 2~4개의 우선 작업 추천
  - 예: "Step 3에서 A/B 캐릭터 비밀 먼저 채우기", "Step 4에서 빈 장소 제거 또는 단서 배치" 등
- `채팅형 인터페이스`
  - 자유 질문 가능
  - 대신 첫 버전은 아래 3개 빠른 액션 버튼을 같이 제공
    - `모순 점검`
    - `단서 제안`
    - `다음 작업 추천`

### 제외

- NPC 자동 생성
- 벡터 DB / 임베딩 / 검색 파이프라인
- 대규모 장기 메모리
- 답변을 클릭 한 번에 데이터에 자동 반영하는 기능

V1은 `제안과 검토`까지만 한다. 실제 반영은 제작자가 확인 후 수동 입력한다.

## 4. UX 제안

### 기본 배치

- 위치: 메이커 편집 화면 우하단 고정 버튼
- 동작: 버튼 클릭 시 우측 드로어 오픈
- 범위: 우선 `/maker/[gameId]/edit` 화면에서만 노출

전역 `layout.tsx`에 바로 붙이기보다, 메이커 화면에만 먼저 붙이는 편이 맞다. 이 기능은 플레이어/GM용이 아니라 제작용 보조 도구이기 때문이다.

### Desktop

- 우하단 `Assistant` 플로팅 버튼
- 열리면 우측 폭 420~480px 정도 드로어
- 메인 편집 영역은 그대로 유지
- 사용자는 Step 2/3/4를 보면서 동시에 AI 응답을 읽을 수 있음

### Mobile / 작은 화면

- 메이커는 주로 PC 사용이지만, 작은 화면에서는 우측 드로어 대신 전체 폭 바텀 시트 또는 풀스크린 패널로 전환

### 드로어 구성

1. 상단
   - 제목: `제작 도우미`
   - 현재 Step 표시
   - 현재 보고 있는 게임 제목
2. 빠른 액션
   - `모순 점검`
   - `단서 제안`
   - `다음 작업 추천`
3. 응답 영역
   - 요약
   - 주요 이슈/제안 카드
   - 필요 시 자유 답변
4. 입력 영역
   - 자유 질문 textarea
   - 보내기 버튼

### 왜 챗봇 + 빠른 액션 구조인가

- 완전 자유 채팅만 두면 사용자가 무엇을 물어봐야 할지 모호하다
- 버튼만 두면 확장성이 없다
- 따라서 첫 화면은 액션 버튼 중심, 세부 보완은 자유 질문으로 받는 구성이 가장 실용적이다

## 5. 기능 상세

### A. 모순 점검

입력 컨텍스트:

- 사건 개요
- 피해자 정보
- 범인
- 타임라인 슬롯
- 플레이어별 행동 타임라인
- 장소
- 단서
- 기존 deterministic validation 결과

출력 예시:

- `오류`: 20:00 슬롯에서 A는 주방에 있었다고 적혀 있는데, 같은 시간 관련 단서가 "A가 서재에서 목격됐다"고 설명함
- `주의`: 피해자의 사망 경위상 독살인데, 핵심 단서가 총상 중심으로 설계되어 서사가 분산됨
- `애매`: 범인의 이동 경로가 두 슬롯 사이에서 비어 있어 추리 연결이 약함

### B. 단서 제안

입력 컨텍스트:

- 사건 설명
- 피해자 정보
- 플레이어 공개 배경
- 플레이어 개인 스토리/비밀
- 기존 단서 목록
- 장소 목록

출력 예시:

- 단서 제목
- 단서 타입
- 추천 배치 장소
- 관련 플레이어
- 어떤 의심을 만들거나 해소하는지
- 기존 단서와 어떻게 연결되는지

권장 출력 개수:

- 기본 3개
- `더 제안해줘` 요청 시 추가 3개

### C. 다음 작업 추천

입력 컨텍스트:

- 현재 Step
- Step별 validation 결과
- 작성 밀도
  - 빈 캐릭터 수
  - 비밀 미작성 수
  - 타임라인 미입력 수
  - 빈 장소 수
  - 빈 단서 설명 수
  - 스크립트 미작성 수

출력 예시:

- 지금 가장 먼저 할 일 1~3개
- 왜 그 순서인지
- 어느 Step에서 작업해야 하는지

## 6. 언어 / 기술 선택

V1은 전부 현재 스택 안에서 끝내는 게 맞다.

- 프론트엔드: TypeScript + React + Next.js App Router
- 백엔드: Next.js Route Handler
- 모델 호출: OpenAI Responses API
- 응답 검증: Zod
- 상태 관리: 로컬 React state

### 왜 Python/별도 서버를 안 쓰는가

- 현재 앱이 이미 Next.js 단일 프로젝트 구조다
- V1은 파일 업로드 처리나 벡터 인덱싱보다 `현재 편집 중인 JSON 기반 컨텍스트를 모델에 보내는 일`이 핵심이다
- 별도 Python 서비스는 운영 복잡도만 올린다

나중에 Phase 2에서 NPC용 오프라인 인덱싱이나 대량 데이터 전처리가 필요해지면, 그때 Python + `uv`를 검토하면 된다.

## 7. 모델 선택

### 기본 모델

- 기본: `gpt-5-mini`

이유:

- 메이커 보조는 대화 왕복이 많고, 응답 속도가 중요하다
- 검증/제안/정리 품질이 필요하지만, 매번 최고 비용 모델이 필요한 작업은 아니다
- OpenAI 공식 모델 문서에서 `GPT-5 mini`는 GPT-5의 더 빠르고 비용 효율적인 버전으로 안내된다
  - 참고: [OpenAI Models](https://platform.openai.com/docs/models)

### 상위 모델 사용 시점

- 정밀 전체 리뷰 버튼이 필요해지면 `gpt-5`를 별도 옵션으로 추가
- 예: 출시 직전 전체 시나리오 품질 점검, 긴 시나리오 종합 리뷰

### 실제 확인 결과

2026-03-15에 현재 `.env`의 `OPENAI_API_KEY`로 OpenAI Responses API에 직접 호출해 `gpt-5-mini` 응답을 확인했다.

- HTTP status: `200`
- 호출 모델: `gpt-5-mini`
- 실제 응답 모델 문자열: `gpt-5-mini-2025-08-07`
- 간단 입력 `ping`에 대해 정상 텍스트 응답 반환

즉, 현재 환경에서는 `gpt-5-mini` 사용이 가능하다.

## 8. OpenAI API 사용 방침

### 권장 API

- OpenAI `Responses API` 사용

이유:

- 단일 인터페이스로 텍스트 생성과 상태 기반 대화를 다루기 쉽다
- `previous_response_id`를 이용해 멀티턴 대화 연결이 가능하다
- Structured Outputs와 같이 쓰기 좋다

참고:

- [Responses API](https://platform.openai.com/docs/api-reference/responses)
- [Conversation State](https://platform.openai.com/docs/guides/conversation-state)
- [Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)

### 응답 형식

자유 텍스트만 받지 말고, 가능한 한 구조화된 JSON으로 받는 편이 좋다.

권장 응답 구조:

```ts
interface MakerAssistantResult {
  summary: string;
  findings: {
    severity: "error" | "warning" | "idea";
    title: string;
    detail: string;
    relatedStep?: number;
    relatedPlayerId?: string;
    relatedClueId?: string;
    relatedSlotId?: string;
  }[];
  suggestedActions: {
    label: string;
    reason: string;
    step: number;
  }[];
  followUpQuestions: string[];
}
```

이렇게 해두면 프론트에서 카드 UI로 바로 렌더링할 수 있다.

### 대화 상태

V1에서는 DB 저장 없이 클라이언트 메모리 상태만 사용한다.

- 클라이언트가 `previousResponseId`를 들고 있음
- 다음 질문 시 함께 전송
- 페이지 새로고침 시 세션 리셋

이 정도면 제작 보조 도구로는 충분하다.

## 9. 아키텍처 제안

### 프론트엔드

메이커 편집기의 현재 로컬 상태를 직접 전달해야 하므로, `MakerEditor` 내부에서 보조 UI를 마운트하는 구조가 맞다.

권장 파일:

- `src/app/maker/[gameId]/edit/_components/MakerAssistantDock.tsx`
- `src/app/maker/[gameId]/edit/_components/MakerAssistantLauncher.tsx`
- `src/app/maker/[gameId]/edit/_components/MakerAssistantDrawer.tsx`
- `src/app/maker/[gameId]/edit/_components/MakerAssistantMessageList.tsx`
- `src/app/maker/[gameId]/edit/_components/useMakerAssistant.ts`

권장 연결 방식:

1. `MakerEditor.tsx`가 현재 `game`, `currentStep`, `validation`을 이미 가지고 있음
2. 이 값을 `MakerAssistantDock`에 그대로 전달
3. 드로어에서 액션 버튼 또는 자유 질문 발생
4. 클라이언트가 현재 메모리 상태 기반으로 API 호출
5. 응답 렌더링

### 백엔드

권장 파일:

- `src/app/api/maker-assistant/route.ts`
- `src/lib/ai/openai.ts`
- `src/lib/ai/maker-assistant-context.ts`
- `src/lib/ai/maker-assistant-prompts.ts`
- `src/lib/ai/maker-assistant-schema.ts`
- `src/types/assistant.ts`

역할 분리:

- `route.ts`
  - 요청 검증
  - task 분기
  - OpenAI 호출
  - 응답 반환
- `openai.ts`
  - OpenAI client 생성
  - env 확인
- `maker-assistant-context.ts`
  - task별로 필요한 게임 데이터만 뽑아 compact context 생성
- `maker-assistant-prompts.ts`
  - 시스템 프롬프트 / task별 지시문 관리
- `maker-assistant-schema.ts`
  - structured output schema 정의

## 10. 컨텍스트 설계

가장 중요한 원칙은 `전체 게임 데이터를 매번 무조건 다 보내지 않는 것`이다.

### 공통 최소 컨텍스트

- `title`
- `settings.playerCount`
- `story.incident`
- `story.location`
- `story.timeline`
- `story.culpritPlayerId`
- `players`
- `locations`
- `clues`
- `currentStep`
- `validationSummary`

### task별 축약

#### `validate_consistency`

- 플레이어 이름
- 타임라인 슬롯/행동
- 단서 제목/설명/장소
- 장소 이름
- 범인 ID
- 피해자 사망 경위

#### `suggest_clues`

- 피해자 정보
- 사건 설명
- 캐릭터 배경/비밀
- 현재 단서 제목/설명
- 장소 목록

#### `suggest_next_steps`

- 현재 Step
- validation 이슈 목록
- 빈 필드 개수 요약
- 각 Step 완성도 요약

이렇게 분리해야 토큰 낭비가 줄고, 응답도 더 안정적이다.

## 11. 프롬프트 전략

### 시스템 프롬프트 공통 원칙

- 한국어로 답변
- 추리 게임 제작 보조 역할에 집중
- 이미 deterministic validation으로 잡히는 단순 필수값 누락만 반복하지 않기
- 모순 지적 시 반드시 근거 2개 이상 연결하기
- 제안은 바로 입력 가능한 형태로 주기
- 장황한 서론 금지

### task별 추가 원칙

#### 모순 점검

- "모순", "애매", "보강 아이디어"로 나눠서 출력
- 근거가 약하면 단정하지 말고 `추정`으로 표시

#### 단서 제안

- 단서 제목, 내용, 장소, 연결 이유를 반드시 포함
- 이미 있는 단서와 지나치게 중복되는 제안은 피하기

#### 다음 작업 추천

- 지금 Step에서 끝낼 일과, 다음 Step으로 넘어가기 전 최소 조건을 같이 말하기

## 12. 필요한 환경 변수

필수:

- `OPENAI_API_KEY`

권장:

- `OPENAI_MODEL=gpt-5-mini`
- `OPENAI_REASONING_EFFORT=low`

선택:

- `OPENAI_ASSISTANT_ENABLED=true`

비고:

- 현재 `.env`에는 `OPENAI_API_KEY`가 이미 들어 있다
- 실제 구현 시 `.env.example`를 추가해 공유 가능한 기본 템플릿을 만드는 편이 좋다

## 13. 필요한 패키지

현재 `package.json`에는 OpenAI SDK가 없다. 구현 시작 시 아래 패키지 추가가 필요하다.

```bash
npm install openai
```

추가 라이브러리는 우선 불필요하다. Zod는 이미 사용 중이므로 그대로 활용하면 된다.

## 14. 실제 구현 파일 목록

### 반드시 추가

- `src/app/api/maker-assistant/route.ts`
- `src/lib/ai/openai.ts`
- `src/lib/ai/maker-assistant-context.ts`
- `src/lib/ai/maker-assistant-prompts.ts`
- `src/lib/ai/maker-assistant-schema.ts`
- `src/types/assistant.ts`
- `src/app/maker/[gameId]/edit/_components/MakerAssistantDock.tsx`
- `src/app/maker/[gameId]/edit/_components/MakerAssistantLauncher.tsx`
- `src/app/maker/[gameId]/edit/_components/MakerAssistantDrawer.tsx`
- `src/app/maker/[gameId]/edit/_components/MakerAssistantMessageList.tsx`
- `src/app/maker/[gameId]/edit/_components/useMakerAssistant.ts`

### 수정 필요

- `src/app/maker/[gameId]/edit/_components/MakerEditor.tsx`
  - 현재 `game`, `currentStep`, `validation`을 assistant에 전달
- `README.md`
  - 사용 방법 및 env 안내 업데이트

### 선택

- `.env.example`
- `src/lib/maker-validation.ts`
  - LLM 전용 compact summary helper 추가 가능

## 15. 권장 API 계약

### 요청

```ts
type MakerAssistantTask =
  | "validate_consistency"
  | "suggest_clues"
  | "suggest_next_steps"
  | "chat";

interface MakerAssistantRequest {
  task: MakerAssistantTask;
  game: GamePackage;
  currentStep: number;
  message?: string;
  previousResponseId?: string | null;
}
```

### 응답

```ts
interface MakerAssistantResponse {
  task: MakerAssistantTask;
  previousResponseId: string | null;
  result: MakerAssistantResult;
}
```

## 16. 구현 순서

### Phase 1

1. `openai` SDK 설치
2. env 로더와 client 래퍼 작성
3. assistant request/response 타입과 schema 정의
4. 컨텍스트 빌더 작성
5. `/api/maker-assistant` route 구현
6. 메이커 드로어 UI 구현
7. `MakerEditor`에 연결

### Phase 2

1. 빠른 액션 버튼 연결
2. 응답 카드 UI 다듬기
3. `previousResponseId` 기반 멀티턴 연결
4. 에러/로딩/재시도 UX 보강

### Phase 3

1. `정밀 전체 리뷰` 옵션 분리
2. 결과 복사/삽입 보조 UX
3. 필요 시 스트리밍 응답 추가

V1은 Phase 1 + Phase 2까지만 해도 충분하다.

## 17. 검증 체크리스트

구현 후 최소 확인 항목:

1. env 누락 시 API가 명확한 에러 메시지를 반환하는지
2. 빈 게임에서도 서버 오류 없이 응답하는지
3. Step 3 타임라인이 많은 게임에서도 응답 시간이 허용 가능한지
4. 단서 없는 게임에서 `단서 제안`이 정상 동작하는지
5. 모순 없는 게임에서도 무리한 오류를 남발하지 않는지
6. 드로어가 메이커 UI를 가리지 않고 작업 흐름을 유지하는지

## 18. Phase 2: RAG / NPC 생성 메모

이 항목은 현재는 보류한다.

나중에 필요한 경우에만 아래 순서로 진입한다.

1. NPC가 어떤 역할인지 정의
   - 메이커 보조 NPC인지
   - 플레이 중 상호작용 NPC인지
2. 검색 대상 분리
   - 시나리오 전체
   - 플레이어별 비밀
   - 세션 중 발생 로그
3. 임베딩 저장소 결정
   - 로컬 파일
   - SQLite
   - 외부 벡터 DB

현재 시점에서는 이 복잡도를 감당할 이유가 없다. V1의 제작 보조가 먼저다.

## 19. 결론

다음 작업은 `RAG/NPC`가 아니라 `메이커 편집 화면 안에서 바로 쓰는 LLM 제작 도우미`를 먼저 붙이는 게 맞다.

가장 현실적인 첫 버전은 아래 조합이다.

- 위치: 메이커 편집 화면 우하단 버튼 + 우측 드로어
- 모델: `gpt-5-mini`
- API: OpenAI Responses API
- 출력: Structured JSON + 카드 UI
- 역할: 모순 점검, 단서 제안, 다음 작업 추천
- 범위: 저장 전 현재 `MakerEditor` 로컬 상태 기준

이 구조면 기존 메이커 플로우를 깨지 않고 바로 붙일 수 있고, 이후 `정밀 리뷰`, `자동 초안 생성`, `RAG/NPC`로도 자연스럽게 확장된다.
