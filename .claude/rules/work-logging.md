# Work Logging Protocol

## 언제 작성하나

의미 있는 작업 단위가 완료될 때마다:
- 새 기능 구현 완료
- 설계/명세 작성 완료
- 버그 수정 완료
- 주요 리팩토링 완료

## 파일 네이밍 컨벤션

```
ai_history/YYYYMMDD_HHMM_TaskName_Report.md
```

**TaskName 규칙**
- PascalCase, 공백 없이 언더스코어로 연결
- 2~4개 단어, 동사+명사 또는 명사+명사 조합
- 무엇을 했는지 명확히 표현

**예시**
```
20260305_1600_ProjectInit_SpecDesign_Report.md
20260306_0930_MakerUI_Implementation_Report.md
20260306_1500_SessionSystem_Design_Report.md
20260307_1100_CardTransfer_BugFix_Report.md
```

## 보고서 구조

```markdown
# [작업명] — 작업 보고서

- 날짜: YYYY-MM-DD
- 소요 세션: N회
- 담당: Claude [모델명]

---

## 1. User Prompt
사용자 원본 요청 (요약 가능)

## 2. Thinking Process
- 핵심 설계 결정과 근거
- 고려한 대안과 선택 이유
- 가정 및 전제 조건

## 3. Execution Result
- 생성/수정된 파일 목록 (표 형태)
- 확정된 아키텍처/로직 요약
- 검증 결과 (실행 로그, 테스트 결과 등)

## 4. 다음 단계 (선택)
- [ ] 후속 작업 목록
```

## 자동화 지원

- **PostToolUse hook**: 파일 변경 시 `.claude/session-changes.log` 자동 기록
- **Stop hook**: 변경 파일 5개 이상이면 보고서 작성 권장 알림 출력
- **doc-writer 에이전트**: "doc-writer 에이전트로 보고서 작성해줘" 요청 시 자동 생성

## 세션 로그 초기화

보고서 작성 완료 후 세션 로그 초기화:
```bash
> .claude/session-changes.log
```
