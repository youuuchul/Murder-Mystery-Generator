-- ═══════════════════════════════════════════════════════════════════
-- Migration 008: 투표 & 엔딩 구조 재설계
--   - 엔딩 트리거 타입 정리 (6종)
--   - n:1 선택지 매핑 (trigger_choice_ids)
--   - 투표 질문 purpose (ending/personal)
--   - 기존 데이터 마이그레이션
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- 1. 기존 데이터 마이그레이션 (CHECK 변경 전에 값 먼저 변환)
UPDATE public.game_ending_branches
  SET trigger_type = 'culprit-escaped'
  WHERE trigger_type IN ('wrong-arrest-fallback', 'specific-player-arrested');

UPDATE public.game_ending_branches
  SET trigger_type = 'custom-choice-matched'
  WHERE trigger_type = 'custom-choice-selected';

-- 2. trigger_type CHECK 재정의
ALTER TABLE public.game_ending_branches
  DROP CONSTRAINT IF EXISTS game_ending_branches_trigger_type_check;

ALTER TABLE public.game_ending_branches
  ADD CONSTRAINT game_ending_branches_trigger_type_check
    CHECK (trigger_type IN (
      'culprit-captured',
      'culprit-escaped',
      'custom-choice-matched',
      'custom-choice-fallback',
      'vote-round-2-matched',
      'vote-round-2-fallback'
    ));

-- 3. n:1 매핑용 배열 컬럼
ALTER TABLE public.game_ending_branches
  ADD COLUMN IF NOT EXISTS trigger_choice_ids text[] NOT NULL DEFAULT '{}';

-- 기존 단수 trigger_choice_id → 배열로 마이그레이션
UPDATE public.game_ending_branches
  SET trigger_choice_ids = ARRAY[trigger_choice_id]
  WHERE trigger_choice_id IS NOT NULL AND trigger_choice_id != '';

-- 4. 투표 질문 purpose
ALTER TABLE public.game_vote_questions
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'ending'
    CHECK (purpose IN ('ending', 'personal'));

COMMIT;
