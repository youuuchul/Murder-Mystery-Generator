# 메이커 검증 힌트 + 접속 주소 정리 + 플레이어 구조 개편 — Codex GPT-5

- **날짜**: 2026-03-13
- **모델**: Codex GPT-5
- **범위**: 메이커 검증 힌트, LAN/Tunnel 접속 주소 수정, UI 이모지 제거, GM 보드 후속 정리, 스크립트 입력 UX 개선, 플레이어 `story` 구조 정리

---

## 1. 사용자 요청 요약

1. README와 최신 `ai_history` 기준으로 오늘 작업 플랜 확정
2. 제작 네비게이터 검증 힌트 1차 구현
3. `npm run dev` 로컬 Wi-Fi 접속 404 원인 확인 및 정리
4. 앱 전반의 이모지 제거
5. GM 보드 후속 정리
6. `ScriptEditor` 빈 입력 UX 개선
7. 플레이어 탭에서 알리바이 칸 제거 후 `배경 / 상세 스토리 / 비밀` 구조로 정리

---

## 2. 구현 내용

### 2-1. 메이커 검증 힌트 1차 구현

**조치**
- `src/lib/maker-validation.ts` 신규 추가
- 제목, 플레이어 수 불일치, 피해자/범인 누락, 장소/단서 누락, 스크립트 누락을 스텝별 이슈로 계산
- `StepWizard.tsx`에 `확인 n / 주의 n` 배지, 툴팁, 현재 단계 요약 박스 연결
- 편집 화면 `MakerEditor.tsx`에서 검증 결과를 계산해 네비게이터와 연동

**결과**
- 메이커에서 저장은 막지 않되, 어디가 비었는지 즉시 찾을 수 있는 1차 가이드가 생김

### 2-2. 로컬 Wi-Fi 404 원인 수정

**발견**
- `npm run dev`가 3000 포트 사용 불가 시 3001 등으로 자동 이동했는데,
  GM 화면이 LAN 주소를 항상 `:3000`으로 복사하고 있어 플레이어가 잘못된 URL로 접속하고 있었음

**조치**
- `GMDashboard.tsx`에서 현재 브라우저 포트를 기준으로 LAN 주소 계산
- `scripts/tunnel.mjs`도 실제 Next dev 포트를 탐지해 터널을 연결하도록 수정
- README 접속 안내를 `GM 화면에 표시된 주소` 기준으로 변경

**결과**
- `npm run dev`와 `npm run dev:tunnel` 모두 실제 실행 포트를 기준으로 접속 주소를 노출하게 됨

### 2-3. UI 이모지 제거

**조치**
- `join`, `library`, `maker`, `play`, `GM` 화면 전반의 장식/상태/단서 타입 이모지 제거
- 단서 타입, 카드 헤더, 빈 상태, 이벤트 로그 등에서 텍스트 라벨 중심으로 정리

**결과**
- AI 생성 티가 강하게 나는 장식 요소가 줄고, 물적 증거가 전부 칼처럼 느껴지는 문제도 제거됨

### 2-4. GM 보드 후속 정리

**조치**
- `GMDashboard.tsx`의 페이즈별 보드 설정에 `showSharedImage` 플래그 추가
- 오프닝/엔딩에서는 공통 이미지/지도 패널을 숨기고, 라운드 및 기타 페이즈에서는 유지

**결과**
- GM 보드가 오프닝/엔딩에서 과하게 중복되지 않고, 라운드 진행 중 미디어 보드 역할에 더 집중하게 됨

### 2-5. ScriptEditor 입력 UX 개선

**조치**
- `ScriptEditor.tsx`를 재구성해 세그먼트/라운드별 작성 상태 배지 추가
- 빈 나레이션/가이드 필드에 회색 예시 패널과 안내 문구 제공
- 엔딩 성공/실패 분기 작성 여부를 개별 상태로 표시

**결과**
- 입력 화면이 비어 보이지 않고, 무엇을 어떤 톤으로 써야 하는지 메이커가 바로 이해할 수 있게 됨

### 2-6. 플레이어 구조 `story` 기준으로 정리

**조치**
- `src/types/game.ts`의 `Player`에 `story` 필드 추가, `alibi`는 legacy optional로 유지
- `game-normalizer.ts`에서 기존 `alibi` 데이터를 `story`로 자동 마이그레이션
- `game-sanitizer.ts`에서 타 플레이어의 `story / secret / alibi` 제거
- `PlayerEditor.tsx`에서 알리바이 입력 칸 삭제 후 `배경 / 상세 스토리 / 비밀 / 반전 정보` 구조로 변경
- 플레이어 화면 `page.tsx`에서 알리바이 카드 제거 후 `상세 스토리`, `비밀 / 반전 정보` 토글로 분리
- 검증 힌트와 Step Wizard 설명도 새 구조에 맞게 수정

**결과**
- 플레이어 데이터 구조가 `배경 / 상세 스토리 / 비밀`로 정리됐고,
  기존 저장 데이터와의 호환도 유지됨

---

## 3. 수정 파일

| 파일 | 작업 |
|---|---|
| `src/lib/maker-validation.ts` | 메이커 스텝 검증 규칙 신규 |
| `src/app/maker/new/_components/StepWizard.tsx` | 검증 배지, 툴팁, 단계 요약 연동 |
| `src/app/maker/[gameId]/edit/_components/MakerEditor.tsx` | 검증 결과 연결 |
| `src/app/play/[gameId]/_components/GMDashboard.tsx` | 현재 포트 기준 LAN URL, GM 보드 shared image 제어, 이모지 제거 |
| `scripts/tunnel.mjs` | 실제 Next dev 포트 탐지 후 터널 연결 |
| `src/app/maker/[gameId]/edit/_components/ScriptEditor.tsx` | 상태 배지, 빈 입력 예시, 분기 상태 UX |
| `src/types/game.ts` | `Player.story` 추가, `alibi` legacy optional 전환 |
| `src/lib/game-normalizer.ts` | legacy `alibi` → `story` 정규화 |
| `src/lib/game-sanitizer.ts` | 타 플레이어 `story`/`secret` sanitize |
| `src/app/maker/[gameId]/edit/_components/PlayerEditor.tsx` | 알리바이 제거, 상세 스토리/비밀 구조로 재편 |
| `src/app/play/[gameId]/[charId]/page.tsx` | 알리바이 카드 제거, 개인 정보 토글 분리 |
| `src/app/join/**`, `src/app/library/**`, `src/app/maker/**`, `src/app/play/**` | 이모지 제거 및 텍스트 라벨 정리 |
| `README.md` | 구현 상태, 접속 방식, 백로그 갱신 |

---

## 4. 검증

```bash
$ npm run build
# ✓ Compiled successfully
# ✓ Generating static pages (10/10)
```

추가로 이모지 스캔은 `src` 기준 0건으로 확인했다.

---

## 5. 남은 우선 백로그

- 타임라인 시스템 재설계
  - on/off
  - 시간대 슬롯
  - 캐릭터별 입력 구조
- 플레이어 타임라인 / 행동 정보 UI 설계
  - 현재 `배경 / 상세 스토리 / 비밀` 이후 단계
  - 플레이어 화면에서 어떤 방식으로 행동 흐름을 보여줄지 결정 필요
- 단서 카드 이미지 입력 + 인벤토리 카드형 상세 UI
- 장소별 이미지 업로드 지원

## 6. 이후 기능

- LLM 기반 시나리오 제작 도우미
- 카드 PDF 출력
- 게임 패키지 내보내기/가져오기
- 모바일 PWA 지원
