-- Visibility 리팩토링: draft 제거 + unlisted 추가
-- 4-mode (draft/private/unlisted/public) → 3-mode (private/unlisted/public)

-- 1. 기존 draft 게임을 private으로 일괄 변환
UPDATE public.games SET visibility = 'private' WHERE visibility = 'draft';

-- 2. CHECK 제약조건 변경: draft 제거 + unlisted 추가
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_visibility_check;
ALTER TABLE public.games ADD CONSTRAINT games_visibility_check
  CHECK (visibility IN ('private', 'unlisted', 'public'));

-- 3. RLS SELECT 정책에 unlisted 포함
-- games: visibility = 'public' → visibility IN ('public', 'unlisted')
DROP POLICY IF EXISTS games_select_public_or_owner ON public.games;
CREATE POLICY games_select_public_or_owner
  ON public.games
  FOR SELECT
  USING (visibility IN ('public', 'unlisted') OR auth.uid() = owner_id);

-- game_content: 서브쿼리 내 동일 변경
DROP POLICY IF EXISTS game_content_select_public_or_owner ON public.game_content;
CREATE POLICY game_content_select_public_or_owner
  ON public.game_content
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.games
      WHERE games.id = game_content.game_id
        AND (games.visibility IN ('public', 'unlisted') OR games.owner_id = auth.uid())
    )
  );
