-- Adds an explicit "inactive" flag to player_timeline_entries so the maker can
-- distinguish "the author hasn't written anything for this slot yet" (action = '')
-- from "this character has nothing to do at this slot on purpose" (inactive = true).
-- The AI validation + assistant prompts can then stop treating intentional gaps
-- as missing data, and the player editor can lock the textarea for inactive cells.

ALTER TABLE public.player_timeline_entries
  ADD COLUMN IF NOT EXISTS inactive boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.player_timeline_entries.inactive IS
  'true면 이 캐릭터는 해당 시간대에 의도적으로 비활성(N/A). false면 일반 미입력 상태.';
