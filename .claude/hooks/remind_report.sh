#!/bin/bash
# Stop hook: 세션에서 변경된 파일이 일정 수 이상이면 ai_history 보고서 작성을 안내
# 너무 잦은 알림을 피하기 위해 임계값(5개) 이상일 때만 출력

LOG_FILE=".claude/session-changes.log"
THRESHOLD=5

if [ ! -f "$LOG_FILE" ] || [ ! -s "$LOG_FILE" ]; then
    exit 0
fi

COUNT=$(wc -l < "$LOG_FILE" | tr -d ' ')

if [ "$COUNT" -ge "$THRESHOLD" ]; then
    DATE=$(date +"%Y%m%d_%H%M")
    echo ""
    echo "┌─ ai_history 보고서 작성 권장 ─────────────────────────────"
    echo "│  이번 세션 변경 파일: ${COUNT}개"
    echo "│  doc-writer 에이전트를 사용하거나 직접 작성하세요."
    echo "│  예시 파일명: ai_history/${DATE}_TaskName_Report.md"
    echo "└────────────────────────────────────────────────────────────"
fi
