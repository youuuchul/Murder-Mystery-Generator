#!/bin/bash
# PostToolUse hook: Write / Edit / NotebookEdit 발생 시 변경 파일을 세션 로그에 기록
# stdin: Claude Code가 JSON payload를 전달

INPUT=$(cat -)

FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    inp = d.get('tool_input', {})
    # Write/Edit: file_path, NotebookEdit: notebook_path
    path = inp.get('file_path') or inp.get('notebook_path') or ''
    print(path)
except Exception:
    print('')
" 2>/dev/null)

if [ -n "$FILE_PATH" ]; then
    LOG_FILE=".claude/session-changes.log"
    echo "$(date '+%H:%M')  $FILE_PATH" >> "$LOG_FILE"
fi
