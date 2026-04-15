-- GM 전용 진행 가이드(gm_note) 필드 제거.
-- GM과 플레이어 모두 narration 하나로 통일해 메이커 UX와 진행 경험을 일치시킨다.

ALTER TABLE public.game_scripts
  DROP COLUMN IF EXISTS gm_note;
