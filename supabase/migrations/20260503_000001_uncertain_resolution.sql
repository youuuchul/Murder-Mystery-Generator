-- ============================================================================
-- Migration: 미확신(uncertain) 캐릭터 트리거 시스템
--
-- 사용자 결정(2026-05-03): victoryCondition === "uncertain" 캐릭터의 게임 도중
-- 입장 결정 트리거를 메이커가 정의 가능. 트리거는 라운드 도달 / 단서 노출 2종.
--
-- 데이터 모델:
-- - game_players.uncertain_resolution jsonb nullable
--   = { triggers: UncertainResolutionTrigger[]; defaultResolveAs?: "culprit" | "innocent" }
--   triggers 빈 array 또는 컬럼 null = "라벨만 유지, 자동 결정 안 함" 모드.
--
-- score_conditions JSONB는 기존 컬럼 유지. 신규 ScoreConditionType (target-player-not-arrested,
-- target-player-arrested, clue-collection)과 fallback 구조는 모두 JSONB 안에서 표현되므로
-- 컬럼 추가 불필요.
--
-- sessions.shared_state JSONB도 그대로 — uncertainResolutions 필드는 JSONB 내부 추가.
-- ============================================================================

ALTER TABLE public.game_players
  ADD COLUMN IF NOT EXISTS uncertain_resolution jsonb;

COMMENT ON COLUMN public.game_players.uncertain_resolution IS
  '미확신 캐릭터의 게임 도중 입장 결정 트리거. NULL 또는 triggers 빈 array면 자동 결정 비활성. 메이커가 round-reached / clue-seen 트리거 array + defaultResolveAs를 정의.';
