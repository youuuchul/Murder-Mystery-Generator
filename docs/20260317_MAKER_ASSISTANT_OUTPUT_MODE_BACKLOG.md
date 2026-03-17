# 2026-03-17 AI 제작도우미 출력 모드 백로그

## 목적

AI 제작도우미가 현재는 `상황 분석 / 발견사항 / 다음 작업` 중심 포맷으로만 답하고 있어서,
사용자가 실제 입력칸에 바로 붙여넣을 문안 생성을 요청해도 분석 문장과 섞여 나오는 문제를 정리한다.

이번 문서는 “가이드 응답”과 “삽입용 문안 생성”을 구분하는 후속 작업 방향을 고정하기 위한 백로그다.

## 현재 확인 상태

### 1. 시스템 프롬프트가 모든 task에 같은 출력 형식을 강제함

- [`src/lib/ai/maker-assistant-prompts.ts`](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/lib/ai/maker-assistant-prompts.ts) 에서
  `SUMMARY / FINDINGS / ACTIONS / QUESTIONS` 포맷을 모든 응답에 공통 적용하고 있다.
- `chat` task도 예외가 아니라, 자유 질의여도 기본적으로 “요약 + 발견사항 + 추천 작업” 구조로 답하게 되어 있다.

### 2. 출력 파서도 구조화된 분석 응답만 기대함

- [`src/lib/ai/maker-assistant-schema.ts`](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/lib/ai/maker-assistant-schema.ts) 는
  `summary`, `findings`, `suggestedActions`, `followUpQuestions` 만 파싱한다.
- 즉 현재 UI 모델 자체가 “분석형 도우미”에 맞춰져 있고,
  “오프닝 스토리 텍스트 초안”, “NPC 대사 초안”, “라운드 이벤트 문안” 같은 생성형 결과를 별도 타입으로 받지 않는다.

## 실제 문제 예시

사용자가 `오프닝 스토리 텍스트 가안 제안` 을 요청해도 아래처럼 섞여 나온다.

- 사건 설명
- 현재 빈 항목 진단
- 권장 작업
- 마지막에 일부 오프닝 초안

이 경우 메이커 입장에서는:

- 지금 나온 문장이 `상황 분석`인지
- 실제로 입력칸에 붙여넣으라는 `스토리 텍스트`인지

판단이 어렵다.

## 필요한 방향

### 1. 사용자 요청 의도를 먼저 분류해야 함

적어도 아래 두 모드는 분리해야 한다.

- `guide`
  - 현재 상태 분석
  - 모순 점검
  - 우선순위 제안
  - 어떤 항목을 채워야 하는지 가이드
- `draft`
  - 실제 입력칸에 넣을 문안 초안
  - 오프닝 스토리 텍스트
  - 엔딩 문구
  - 인물 소개 문장
  - 라운드 이벤트 문안

### 2. 프롬프트도 모드별로 달라져야 함

#### guide 모드

- 지금처럼 분석/발견사항/다음 작업 중심 유지 가능
- 단, “초안”이 섞이면 안 됨

#### draft 모드

- 분석 문장 금지
- “아래는 제안입니다”, “현재 타임라인이 비어 있습니다” 같은 메타 설명 금지
- 바로 붙여넣을 본문만 우선 출력
- 필요하면 별도 짧은 메모를 분리된 필드로 반환

## 구현 방향 제안

### 1단계. 요청 의도 분류 규칙 추가

- `message` 안의 표현을 기준으로 초안 요청을 감지
- 예시 키워드
  - `가안`
  - `문구`
  - `문안`
  - `초안`
  - `써줘`
  - `대사`
  - `스토리 텍스트`
  - `오프닝 문장`

최소안:

- 서버에서 `guide` / `draft` 추론

확장안:

- 사용자가 명시적으로 `가이드 모드`, `문안 모드`를 고를 수 있게 UI 제공

### 2단계. 응답 스키마 분리

현재:

- 단일 `MakerAssistantResult`

권장:

- `guide` 응답 스키마
- `draft` 응답 스키마

예상 방향:

```ts
type MakerAssistantResponseMode = "guide" | "draft";

interface GuideResult {
  mode: "guide";
  summary: string;
  findings: ...;
  suggestedActions: ...;
  followUpQuestions: ...;
}

interface DraftResult {
  mode: "draft";
  title?: string;
  body: string;
  notes?: string[];
}
```

### 3단계. UI 렌더링 분리

- `guide` 면 현재처럼 요약/발견사항/작업 리스트 렌더
- `draft` 면 큰 본문 카드로 렌더
- `draft` 일 때는 “이 문안을 Step N 입력칸에 붙여넣기 좋은 형식”이라는 맥락을 명확히 표시

### 4단계. Step별 draft 템플릿 추가

특히 아래 입력칸은 draft 모드 템플릿이 있으면 품질이 좋아진다.

- Step 2 오프닝 스토리 텍스트
- Step 2 피해자 배경
- Step 2 NPC 소개
- Step 3 캐릭터 비밀 / 상세 스토리
- Step 5 라운드 이벤트 텍스트
- Step 6 분기 엔딩 / 개인 엔딩

## 우선순위

- 높음
- 제작도우미가 실제 “작성 보조” 역할을 하려면 가장 먼저 해결해야 하는 UX 문제다.

## 메모

- 이 작업은 단순 프롬프트 문구 수정만으로 끝나지 않는다.
- `프롬프트`, `응답 스키마`, `서버 파싱`, `프론트 렌더링` 이 같이 바뀌어야 한다.
- 최소한 1차 구현에서는 `chat` 내부에 `guide/draft` 모드만 추가해도 체감 개선이 클 가능성이 높다.
