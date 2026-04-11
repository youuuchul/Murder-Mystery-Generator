-- ═══════════════════════════════════════════════════════════════════
-- Migration 007: Advanced Gameplay
--   A. 획득 전 단서 표시 설정 (preview clues)
--   B+C. 투표 대상 확장 + 다중 질문 + 2차 투표
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── A. 획득 전 단서 미리보기 ──────────────────────────────────

-- 장소별 토글: 이 장소의 단서를 획득 전에 미리보기 텍스트로 노출할지
ALTER TABLE public.game_locations
  ADD COLUMN IF NOT EXISTS preview_clues_enabled boolean NOT NULL DEFAULT false;

-- 단서별 미리보기 텍스트
ALTER TABLE public.game_clues
  ADD COLUMN IF NOT EXISTS preview_title text,
  ADD COLUMN IF NOT EXISTS preview_description text;

-- ─── B+C. 투표 확장 ───────────────────────────────────────────

-- games: 고급 투표 활성화 플래그
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS advanced_voting_enabled boolean NOT NULL DEFAULT false;

-- 투표 질문 테이블 (다중 질문 + 2차 투표 지원)
CREATE TABLE IF NOT EXISTS public.game_vote_questions (
  id text NOT NULL,
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  vote_round smallint NOT NULL DEFAULT 1,
  label text NOT NULL DEFAULT '',
  description text,
  target_mode text NOT NULL DEFAULT 'players-only'
    CHECK (target_mode IN ('players-only', 'players-and-npcs', 'custom-choices')),
  is_primary boolean NOT NULL DEFAULT false,
  sort_order smallint NOT NULL DEFAULT 0,
  trigger_condition jsonb,
  pre_story_text text,
  pre_story_video_url text,
  pre_story_background_music text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, id)
);

CREATE INDEX IF NOT EXISTS game_vote_questions_game_idx
  ON public.game_vote_questions (game_id);

-- 질문별 커스텀 선택지
CREATE TABLE IF NOT EXISTS public.game_vote_question_choices (
  id text NOT NULL,
  game_id uuid NOT NULL,
  question_id text NOT NULL,
  label text NOT NULL DEFAULT '',
  description text,
  sort_order smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, question_id, id),
  FOREIGN KEY (game_id, question_id)
    REFERENCES public.game_vote_questions (game_id, id) ON DELETE CASCADE
);

-- 엔딩 분기 트리거 확장: 커스텀 질문/선택지 연결
-- trigger_type CHECK 제약조건 업데이트 (custom-choice-selected 추가)
ALTER TABLE public.game_ending_branches
  DROP CONSTRAINT IF EXISTS game_ending_branches_trigger_type_check;

ALTER TABLE public.game_ending_branches
  ADD CONSTRAINT game_ending_branches_trigger_type_check
    CHECK (trigger_type IN (
      'culprit-captured',
      'specific-player-arrested',
      'wrong-arrest-fallback',
      'custom-choice-selected'
    ));

ALTER TABLE public.game_ending_branches
  ADD COLUMN IF NOT EXISTS trigger_question_id text,
  ADD COLUMN IF NOT EXISTS trigger_choice_id text;

-- ─── RLS 정책 ─────────────────────────────────────────────────

-- game_vote_questions: games와 동일한 정책
ALTER TABLE public.game_vote_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "game_vote_questions_select"
  ON public.game_vote_questions FOR SELECT
  USING (true);

CREATE POLICY "game_vote_questions_insert"
  ON public.game_vote_questions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.games WHERE id = game_id)
  );

CREATE POLICY "game_vote_questions_update"
  ON public.game_vote_questions FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.games WHERE id = game_id)
  );

CREATE POLICY "game_vote_questions_delete"
  ON public.game_vote_questions FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.games WHERE id = game_id)
  );

-- game_vote_question_choices: 동일 패턴
ALTER TABLE public.game_vote_question_choices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "game_vote_question_choices_select"
  ON public.game_vote_question_choices FOR SELECT
  USING (true);

CREATE POLICY "game_vote_question_choices_insert"
  ON public.game_vote_question_choices FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.games WHERE id = game_id)
  );

CREATE POLICY "game_vote_question_choices_update"
  ON public.game_vote_question_choices FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.games WHERE id = game_id)
  );

CREATE POLICY "game_vote_question_choices_delete"
  ON public.game_vote_question_choices FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.games WHERE id = game_id)
  );

COMMIT;
