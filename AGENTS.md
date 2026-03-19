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

## 참조 문서

- [CLAUDE.md](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/CLAUDE.md)
- [문서 인덱스](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/docs/README.md)
- [배포 검토](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/docs/research/20260319_VERCEL_SUPABASE_DEPLOYMENT_REVIEW.md)
- [로컬 데이터/배포 리스크](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/docs/research/20260319_LOCAL_DATA_DEPLOYMENT_RISK.md)
- [접근 분리 백로그](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/docs/backlog/20260319_LIBRARY_MAKER_ACCESS_BACKLOG.md)
- [접근 분리 계획](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/docs/plans/20260319_LIBRARY_MAKER_ACCESS_PLAN.md)
