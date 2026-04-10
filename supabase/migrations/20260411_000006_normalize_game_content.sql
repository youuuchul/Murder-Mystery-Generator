-- ============================================================================
-- Migration 006: game_content.content_json 전면 정규화
--
-- 단일 JSONB blob → 개별 테이블 분리
-- 목적: AI 챗봇 레이턴시 개선, 행 단위 쿼리, Supabase 대시보드 가독성
-- ============================================================================

-- ─── 1. games 테이블 확장 (settings + rules 흡수) ────────────────────────

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS cover_image_position_x smallint NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS cover_image_position_y smallint NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS opening_duration_minutes smallint NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS phases jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS private_chat_config jsonb NOT NULL DEFAULT '{"enabled":false,"maxGroupSize":2,"durationMinutes":5}',
  ADD COLUMN IF NOT EXISTS card_trading_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS clues_per_round smallint NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS allow_location_revisit boolean NOT NULL DEFAULT false;

-- ─── 2. game_stories (1:1, story + victim + culprit) ────────────────────

CREATE TABLE IF NOT EXISTS public.game_stories (
  game_id uuid PRIMARY KEY REFERENCES public.games (id) ON DELETE CASCADE,
  synopsis text NOT NULL DEFAULT '',
  incident text NOT NULL DEFAULT '',
  gm_overview text,
  map_image_url text,
  victim_name text NOT NULL DEFAULT '',
  victim_background text NOT NULL DEFAULT '',
  victim_image_url text,
  culprit_player_id text NOT NULL DEFAULT '',
  motive text NOT NULL DEFAULT '',
  method text NOT NULL DEFAULT '',
  timeline_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. game_timeline_slots ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_timeline_slots (
  id text NOT NULL,
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  slot_label text NOT NULL DEFAULT '',
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, id)
);

CREATE INDEX IF NOT EXISTS game_timeline_slots_game_id_idx
  ON public.game_timeline_slots (game_id, sort_order);

-- ─── 4. game_npcs ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_npcs (
  id text NOT NULL,
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  background text NOT NULL DEFAULT '',
  image_url text,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, id)
);

CREATE INDEX IF NOT EXISTS game_npcs_game_id_idx
  ON public.game_npcs (game_id);

-- ─── 5. game_players ─────────────────────────────────────��──────────────

CREATE TABLE IF NOT EXISTS public.game_players (
  id text NOT NULL,
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  background text NOT NULL DEFAULT '',
  story text NOT NULL DEFAULT '',
  secret text NOT NULL DEFAULT '',
  victory_condition text NOT NULL DEFAULT 'arrest-culprit'
    CHECK (victory_condition IN ('avoid-arrest', 'uncertain', 'arrest-culprit', 'personal-goal')),
  personal_goal text,
  score_conditions jsonb NOT NULL DEFAULT '[]',
  card_image text,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, id)
);

CREATE INDEX IF NOT EXISTS game_players_game_id_idx
  ON public.game_players (game_id, sort_order);

-- ─── 6. player_timeline_entries ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.player_timeline_entries (
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  player_id text NOT NULL,
  slot_id text NOT NULL,
  action text NOT NULL DEFAULT '',
  PRIMARY KEY (game_id, player_id, slot_id)
);

CREATE INDEX IF NOT EXISTS player_timeline_entries_player_idx
  ON public.player_timeline_entries (game_id, player_id);

-- ─── 7. player_relationships ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.player_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  player_id text NOT NULL,
  target_type text NOT NULL DEFAULT 'player'
    CHECK (target_type IN ('player', 'victim', 'npc')),
  target_id text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  sort_order smallint NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS player_relationships_game_player_idx
  ON public.player_relationships (game_id, player_id);

-- ─── 8. player_related_clues ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.player_related_clues (
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  player_id text NOT NULL,
  clue_id text NOT NULL,
  note text NOT NULL DEFAULT '',
  PRIMARY KEY (game_id, player_id, clue_id)
);

CREATE INDEX IF NOT EXISTS player_related_clues_player_idx
  ON public.player_related_clues (game_id, player_id);

-- ─── 9. game_locations ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_locations (
  id text NOT NULL,
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  image_url text,
  unlocks_at_round smallint,
  owner_player_id text,
  access_condition jsonb,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, id)
);

CREATE INDEX IF NOT EXISTS game_locations_game_id_idx
  ON public.game_locations (game_id, sort_order);

-- ─── 10. game_clues ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_clues (
  id text NOT NULL,
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'physical'
    CHECK (type IN ('physical', 'testimony', 'scene')),
  image_url text,
  location_id text,
  condition jsonb,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, id)
);

CREATE INDEX IF NOT EXISTS game_clues_game_id_idx
  ON public.game_clues (game_id);
CREATE INDEX IF NOT EXISTS game_clues_location_idx
  ON public.game_clues (game_id, location_id);

-- ─── 11. game_scripts ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_scripts (
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  phase text NOT NULL,
  round_number smallint NOT NULL DEFAULT 0,
  narration text NOT NULL DEFAULT '',
  image_url text,
  video_url text,
  background_music text,
  gm_note text,
  unlocked_location_ids text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, phase, round_number)
);

CREATE INDEX IF NOT EXISTS game_scripts_game_id_idx
  ON public.game_scripts (game_id);

-- ─── 12. game_cards ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  card_type text NOT NULL CHECK (card_type IN ('character', 'clue', 'event')),
  -- character card
  player_id text,
  front_text text,
  back_text text,
  -- clue card
  clue_id text,
  clue_title text,
  clue_description text,
  clue_type text,
  clue_image_url text,
  -- event card
  round_number smallint,
  event_title text,
  event_description text,
  unlocked_location_ids text[] DEFAULT '{}',
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_cards_game_type_idx
  ON public.game_cards (game_id, card_type);

-- ─── 13. game_ending_config (1:1) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_ending_config (
  game_id uuid PRIMARY KEY REFERENCES public.games (id) ON DELETE CASCADE,
  author_notes_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 14. game_ending_branches ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_ending_branches (
  id text NOT NULL,
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  trigger_type text NOT NULL DEFAULT 'wrong-arrest-fallback'
    CHECK (trigger_type IN ('culprit-captured', 'specific-player-arrested', 'wrong-arrest-fallback')),
  target_player_id text,
  story_text text NOT NULL DEFAULT '',
  personal_endings_enabled boolean NOT NULL DEFAULT false,
  video_url text,
  background_music text,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, id)
);

CREATE INDEX IF NOT EXISTS game_ending_branches_game_idx
  ON public.game_ending_branches (game_id);

-- ─── 15. branch_personal_endings ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.branch_personal_endings (
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  branch_id text NOT NULL,
  player_id text NOT NULL,
  title text,
  body_text text NOT NULL DEFAULT '',
  PRIMARY KEY (game_id, branch_id, player_id)
);

CREATE INDEX IF NOT EXISTS branch_personal_endings_branch_idx
  ON public.branch_personal_endings (game_id, branch_id);

-- ─── 16. game_author_notes ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_author_notes (
  id text NOT NULL,
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, id)
);

CREATE INDEX IF NOT EXISTS game_author_notes_game_idx
  ON public.game_author_notes (game_id);

-- ─── 17. updated_at 트리거 (신규 테이블용) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'game_stories', 'game_players', 'game_locations',
    'game_clues', 'game_scripts', 'game_ending_config'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_%I_updated_at ON public.%I;
       CREATE TRIGGER set_%I_updated_at
       BEFORE UPDATE ON public.%I
       FOR EACH ROW
       EXECUTE FUNCTION public.set_updated_at();',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END
$$;

-- ─── 18. RLS 활성화 + 정책 ──────────────────────────────────────────────

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'game_stories', 'game_timeline_slots', 'game_npcs',
    'game_players', 'player_timeline_entries', 'player_relationships',
    'player_related_clues', 'game_locations', 'game_clues',
    'game_scripts', 'game_cards', 'game_ending_config',
    'game_ending_branches', 'branch_personal_endings', 'game_author_notes'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

    -- SELECT: public/unlisted 또는 소유자
    EXECUTE format(
      'CREATE POLICY %I_select_policy ON public.%I FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.games
          WHERE games.id = %I.game_id
            AND (games.visibility IN (''public'', ''unlisted'') OR games.owner_id = auth.uid())
        )
      );',
      tbl, tbl, tbl
    );

    -- INSERT: 소유자만
    EXECUTE format(
      'CREATE POLICY %I_insert_policy ON public.%I FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.games
          WHERE games.id = %I.game_id
            AND games.owner_id = auth.uid()
        )
      );',
      tbl, tbl, tbl
    );

    -- UPDATE: 소유자만
    EXECUTE format(
      'CREATE POLICY %I_update_policy ON public.%I FOR UPDATE
        USING (EXISTS (SELECT 1 FROM public.games WHERE games.id = %I.game_id AND games.owner_id = auth.uid()))
        WITH CHECK (EXISTS (SELECT 1 FROM public.games WHERE games.id = %I.game_id AND games.owner_id = auth.uid()));',
      tbl, tbl, tbl, tbl
    );

    -- DELETE: 소유자만
    EXECUTE format(
      'CREATE POLICY %I_delete_policy ON public.%I FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM public.games
          WHERE games.id = %I.game_id
            AND games.owner_id = auth.uid()
        )
      );',
      tbl, tbl, tbl
    );
  END LOOP;
END
$$;

-- ─── 19. game_content 백업 컬럼 (마이그레이션 완료 후 제거 예정) ─────────

ALTER TABLE public.game_content
  ADD COLUMN IF NOT EXISTS content_json_backup jsonb;

-- content_json → backup 복사 (기존 데이터 안전 보관)
UPDATE public.game_content
SET content_json_backup = content_json
WHERE content_json_backup IS NULL;
