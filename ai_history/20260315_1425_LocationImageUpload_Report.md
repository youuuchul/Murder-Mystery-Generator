# 장소별 이미지 업로드 지원 — Codex GPT-5

- **날짜**: 2026-03-15
- **모델**: Codex GPT-5
- **범위**: 장소 대표 이미지 업로드/서빙/플레이어 표시 구현

---

## 1. 작업 배경

이전 턴에서 `단서 카드 이미지 지원`을 완료한 뒤,
남은 우선 백로그 중 구현 난이도와 연속성을 고려해 `장소별 이미지 업로드 지원`을 바로 이어서 진행했다.

`타임라인 재설계`는 여전히 데이터 모델 결정을 먼저 해야 하므로 후순위 유지.

---

## 2. 구현 내용

### 2-1. 장소 데이터 모델 확장

- `src/types/game.ts`
  - `Location.imageUrl?: string` 추가

### 2-2. 저장 데이터 정규화

- `src/lib/game-normalizer.ts`
  - 장소 정규화 시 `imageUrl` 보정
  - 기존 단서 이미지/단서 조건 정규화 로직과 함께 저장 포맷 일관성 유지

### 2-3. 장소 이미지 업로드 API

- `src/app/api/games/[gameId]/assets/route.ts`
  - multipart 업로드 수신
  - PNG / JPG / WEBP / GIF 허용
  - 5MB 제한
  - 업로드 파일을 `data/games/{gameId}/assets/locations/` 아래 저장
- `src/app/api/games/[gameId]/assets/[...assetPath]/route.ts`
  - 저장된 자산 파일을 API 경로로 서빙
  - path traversal 방지

### 2-4. 메이커 장소 편집기 업로드 UI

- `src/app/maker/[gameId]/edit/_components/MakerEditor.tsx`
  - `gameId`를 `LocationEditor`에 전달
- `src/app/maker/[gameId]/edit/_components/LocationEditor.tsx`
  - 장소 생성 기본값에 `imageUrl` 추가
  - 파일 업로드 버튼 추가
  - 업로드 성공 시 내부 자산 URL을 장소 데이터에 연결
  - 장소 카드 헤더에 `이미지` 배지 표시
  - 미리보기 / 제거 버튼 추가
  - "업로드 후 저장" 안내 문구 추가

### 2-5. 플레이어 장소 카드 표시

- `src/app/play/[gameId]/[charId]/page.tsx`
  - 장소 탐색 카드에서 장소 대표 이미지 표시
  - 기존 단서 이미지 프레임 컴포넌트를 범용 이미지 프레임으로 확장

### 2-6. 문서 반영

- `README.md`
  - 현재 구현 상태에 장소 대표 이미지 업로드/표시 반영
  - 우선 백로그에서 `장소별 이미지 업로드 지원` 제거

---

## 3. 검증

```bash
$ npm run build
# ✓ Compiled successfully
# ✓ Generating static pages (10/10)
```

---

## 4. 현재 남은 우선 백로그

- 타임라인 시스템 재설계
- 플레이어 타임라인 / 행동 정보 UI 설계
