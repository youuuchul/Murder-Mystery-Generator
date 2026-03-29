# Murder Mystery Generator — Agent Rules

이 파일은 Codex용 프로젝트 규칙 파일이다.
가능하면 [CLAUDE.md](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/CLAUDE.md) 와 같은 방향을 유지한다.

## 서비스 요약

머더미스터리 시나리오를 직접 제작하고, 오프라인 세션을 디지털 카드와 GM 보드로 진행하는 플랫폼.

## 현재 기준 기술 스택

- Framework: Next.js 14+ App Router
- Language: TypeScript + Zod
- Styling: Tailwind CSS
- Current persistence: 로컬 JSON 파일 (`data/games`, `data/sessions`)
- Current realtime: SSE + polling fallback

## 목표 배포 스택

- Hosting: Vercel
- Auth / Database / Storage / Realtime candidate: Supabase

배포 준비 시 판단 기준:

- 로컬 파일 저장을 그대로 유지한 채 Vercel에 올리는 방향은 피한다.
- 장기적으로는 `Vercel + Supabase` 조합을 기준으로 설계한다.
- 메이커 권한은 `편집은 자기 게임만`, 플레이는 `공개 라이브러리` 기준으로 분리한다.

## 제품 원칙

1. 서버가 진실의 원천이다.
2. 플레이어 민감정보는 토큰/권한 기준으로 필터링한다.
3. 공개 플레이 동선과 제작/관리 동선을 분리한다.
4. 배포 구조는 가능한 한 단일 권한 모델로 정리한다.

## UI 생성 / 평가 기준

메이커나 플레이어 UI를 여러 에이전트로 나눠 작업할 때는, 생성자와 평가자 모두 아래 4가지 기준을 공통으로 사용한다.

1. `디자인 품질 (Design quality)`
   - 색상, 타이포그래피, 레이아웃, 이미지가 하나의 분위기와 정체성으로 읽히는지 본다.
2. `독창성 (Originality)`
   - 템플릿 레이아웃, 라이브러리 기본값, 흔한 AI 생성 패턴이 아니라 실제로 선택한 흔적이 있는지 본다.
   - 보라색 그라디언트 위 흰 카드 같은 전형적 AI 패턴은 실패로 본다.
3. `완성도 (Craft)`
   - 타이포그래피 위계, 간격 일관성, 대비, 색 조화, 인터랙션 디테일이 안정적인지 본다.
4. `기능성 (Functionality)`
   - 미학과 별개로, 사용자가 이 화면이 무엇을 하는지 이해하고 주요 액션을 쉽게 찾을 수 있는지 본다.

추가 규칙:

- 사용자에게 보이는 문구에는 `작업했다`, `분리했다`, `정리했다` 같은 구현자 시점 메타 설명을 넣지 않는다.
- 내부 설계 의도보다 사용자가 지금 무엇을 입력하고 어떤 효과가 있는지 바로 이해하는 문구를 우선한다.
- 평가자는 시각 품질만 보지 말고, 하드코딩된 메타 문구나 구현 흔적도 함께 찾는다.

## 참조 문서

- [CLAUDE.md](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/CLAUDE.md)
- [문서 인덱스](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/docs/README.md)
- [배포 검토](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/docs/research/20260319_VERCEL_SUPABASE_DEPLOYMENT_REVIEW.md)
- [로컬 데이터/배포 리스크](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/docs/research/20260319_LOCAL_DATA_DEPLOYMENT_RISK.md)
- [접근 분리 백로그](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/docs/backlog/20260319_LIBRARY_MAKER_ACCESS_BACKLOG.md)
- [접근 분리 계획](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/docs/plans/20260319_LIBRARY_MAKER_ACCESS_PLAN.md)
