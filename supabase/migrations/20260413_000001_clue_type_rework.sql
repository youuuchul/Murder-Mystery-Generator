-- Clue 유형을 physical/testimony/scene 3종에서 owned/shared 2종으로 전환.
--
-- physical, testimony -> owned
-- scene               -> shared
--
-- 적용:
--   Supabase Dashboard > SQL Editor 에 붙여넣고 실행
--   또는 supabase db push (CLI 연결 시)

BEGIN;

-- 1. CHECK 제약 제거 (기존 3종 제한)
ALTER TABLE public.game_clues
  DROP CONSTRAINT IF EXISTS game_clues_type_check;

-- 2. 데이터 변환
UPDATE public.game_clues
SET type = 'owned'
WHERE type IN ('physical', 'testimony');

UPDATE public.game_clues
SET type = 'shared'
WHERE type = 'scene';

-- 3. game_cards.clue_type 동기화 (카드셋 복제본)
UPDATE public.game_cards
SET clue_type = 'owned'
WHERE card_type = 'clue' AND clue_type IN ('physical', 'testimony');

UPDATE public.game_cards
SET clue_type = 'shared'
WHERE card_type = 'clue' AND clue_type = 'scene';

-- 4. 기본값 변경 ('physical' -> 'owned')
ALTER TABLE public.game_clues
  ALTER COLUMN type SET DEFAULT 'owned';

-- 5. 새 CHECK 제약 추가 (owned/shared만 허용)
ALTER TABLE public.game_clues
  ADD CONSTRAINT game_clues_type_check
  CHECK (type IN ('owned', 'shared'));

COMMIT;
