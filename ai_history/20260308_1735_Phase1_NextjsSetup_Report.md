# Phase 1 킥오프 — Next.js 세팅 & 코어 기반 구현 — 작업 보고서

- 날짜: 2026-03-08
- 소요 세션: 1회
- 담당: Claude Sonnet 4.6

---

## 1. User Prompt

"Implement the following plan: Phase 1 킥오프 — Next.js 세팅 & 코어 기반 구현"
빈 디렉토리 골격에서 Next.js 프로젝트를 수동으로 초기화하고, Phase 1 코어 루프(타입 → 저장 → 라이브러리 UI → 메이커 기본)를 구현.

## 2. Thinking Process

- 수동 초기화: `create-next-app` 대신 설정 파일 직접 작성하여 기존 폴더 구조 보존
- `better-sqlite3` 제거: Node v25에서 네이티브 빌드 실패 → Phase 1은 JSON 파일만 사용, SQLite는 Phase 2에서 추가
- `next.config.ts` → `next.config.mjs`: Next.js 14는 `.ts` 설정 파일 미지원
- `crypto.randomUUID()`: 외부 uuid 패키지 없이 Node 내장 API 활용
- `/` → `/library` 리다이렉트: `redirect()` 서버 함수로 처리
- `export const dynamic = "force-dynamic"`: 라이브러리 페이지는 항상 최신 파일 목록을 서버에서 렌더링

## 3. Execution Result

### 생성된 파일 목록

| 파일 | 설명 |
|------|------|
| `package.json` | next, react, react-dom, typescript, tailwindcss, zod |
| `tsconfig.json` | paths alias `@/*` → `./src/*` |
| `next.config.mjs` | webpack fallback 설정 |
| `tailwind.config.ts` | mystery/dark 커스텀 컬러, 애니메이션 |
| `postcss.config.mjs` | tailwindcss + autoprefixer |
| `src/app/globals.css` | Tailwind directives + CSS 변수 |
| `src/app/layout.tsx` | Root layout |
| `src/app/page.tsx` | `/library` 리다이렉트 |
| `src/types/game.ts` | GamePackage, GameSettings, Story, Character, Clue, CardSet, Scripts |
| `src/types/session.ts` | GameSession, PlayerState, SharedState |
| `src/types/api.ts` | API 요청/응답 타입 |
| `src/lib/storage/game-storage.ts` | listGames, getGame, saveGame, deleteGame |
| `src/app/api/games/route.ts` | GET(목록), POST(생성) |
| `src/app/api/games/[gameId]/route.ts` | GET, PUT, DELETE |
| `src/app/library/page.tsx` | 게임 목록 (서버 컴포넌트) |
| `src/app/library/_components/GameCard.tsx` | 게임 카드 UI |
| `src/app/library/_components/GameGrid.tsx` | 빈 상태 포함 그리드 |
| `src/app/maker/new/page.tsx` | 새 게임 wizard 페이지 |
| `src/app/maker/new/_components/StepWizard.tsx` | 5단계 스텝 네비게이션 |
| `src/app/maker/new/_components/SettingsForm.tsx` | Step 1 기본 설정 폼 |
| `src/components/ui/Button.tsx` | variant × size 공용 버튼 |
| `src/components/ui/Card.tsx` | hover 효과 카드 컨테이너 |

### 검증 결과

```
npm install       → 106 packages 설치 완료
npm run build     → ✓ Compiled successfully (타입 오류 0)

Route 확인:
/ → /library      → HTTP 307 ✓
/library          → HTTP 200 ✓
/maker/new        → HTTP 200 ✓
/api/games GET    → { "games": [] } ✓
/api/games POST   → 201 + game.json 생성 ✓

data/games/{id}/metadata.json 생성 확인 ✓
data/games/{id}/game.json 생성 확인 ✓
```

## 4. 트러블슈팅 기록

### TS-001 — `better-sqlite3` 네이티브 빌드 실패

- **환경**: Node v25.6.1 (arm64 darwin)
- **증상**: `npm install` 시 `node-gyp rebuild` 실패. `v8config.h:13: "C++20 or later required."` 컴파일 오류
- **원인**: `better-sqlite3 v9.6.0`은 Node 25용 prebuilt binary가 없어 소스 빌드를 시도하지만, Node 25 헤더가 C++20을 요구하는데 시스템 clang이 대응 못 함
- **해결**: Phase 1은 JSON 파일 I/O만 사용하므로 `better-sqlite3` 의존성 자체를 제거. SQLite는 Phase 2(세션 시스템) 구현 시 `node-lts` 전환 또는 `@libsql/client` 대안 검토
- **재발 방지**: SQLite 네이티브 패키지 설치 전 `node --version` 확인. Node 22 LTS 권장

### TS-002 — `next.config.ts` 미지원

- **증상**: `npm run build` 시 `"Configuring Next.js via 'next.config.ts' is not supported"` 오류
- **원인**: Next.js 14는 TypeScript 설정 파일(`.ts`) 미지원. Next.js 15+부터 지원
- **해결**: `next.config.ts` → `next.config.mjs`로 이름 변경 후 `import type` 구문 제거, JSDoc `@type` 주석으로 타입 유지
- **재발 방지**: `package.json`의 next 버전 확인 후 `.mjs` 사용 (Next.js 14 기준)

### TS-003 — API route에서 미사용 import

- **증상**: `v4 as uuidv4 from "crypto"` — crypto 모듈에는 named export `v4`가 없음 (uuid 패키지 착각)
- **해결**: 해당 import 제거 후 `crypto.randomUUID()` 전역 API 직접 사용 (Node 14.17+ 내장)

---

## 5. 다음 단계

- [ ] Phase 1.5: 메이커 Step 2~5 (사건/인물/단서/스크립트 에디터)
- [ ] `/maker/[gameId]/edit` 편집 페이지
- [ ] 라이브러리에서 삭제 버튼 연동 (Client Component)
- [ ] Phase 2: SQLite 세션 시스템, `/play/[gameId]` GM 뷰
