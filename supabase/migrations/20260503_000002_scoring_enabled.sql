-- ============================================================================
-- Migration: 게임 단위 점수 시스템 toggle (scoring_enabled)
--
-- 사용자 결정(2026-05-03): 승점 없이 승리조건(범인/무고 라벨)만 있는 게임을 표현할 수 있도록
-- 게임 단위 toggle 추가. default true (기존 게임 영향 0).
--
-- false면:
-- - 메이커 [승점] 탭 비활성 / 미노출
-- - 결과 화면 점수 표시 X
-- - 점수 평가 자체 skip (Player.scoreConditions 무시)
-- ============================================================================

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS scoring_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.games.scoring_enabled IS
  '게임 단위 점수 시스템 사용 여부. true=점수 평가 + UI 표시, false=승점 없이 승리조건 라벨만.';
