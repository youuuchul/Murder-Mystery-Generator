-- Step 2 미디어/이벤트 sub-tab 정리에 필요한 새 필드.
-- - games.use_round_events: 라운드별 이벤트(나레이션·이미지·BGM·영상) 사용 여부 (default false)
-- - games.use_lobby_script: 대기실 안내 사용 여부 (default false)
-- - game_stories.default_background_music: 게임 단위 기본 BGM URL — 라운드 off 시 fallback
-- - game_scripts.enabled: 라운드 카드 개별 on/off — false면 게임 단위 기본 사용

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS use_round_events boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS use_lobby_script boolean NOT NULL DEFAULT false;

ALTER TABLE game_stories
  ADD COLUMN IF NOT EXISTS default_background_music text;

ALTER TABLE game_scripts
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT false;
