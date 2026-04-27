-- ═══════════════════════════════════════════════════════════════════
-- Migration: 투표 질문 personal_target_player_id 컬럼 추가
--   - VoteQuestion.personalTargetPlayerId (purpose='personal'일 때
--     해당 질문을 받을 플레이어 ID)를 영속화하기 위한 컬럼
--   - 코드(types/game.ts)와 메이커 UI는 이미 존재했으나 DB 컬럼이 없어
--     저장이 누락되고 모든 캐릭터에게 personal 질문이 노출되던 버그 수정
--   - Player.id가 text 타입이므로 동일하게 text NULL 로 추가
--   - FK 제약은 걸지 않음 (Player가 별도 테이블 + cascade는 application
--     레벨에서 처리)
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.game_vote_questions
  ADD COLUMN IF NOT EXISTS personal_target_player_id text NULL;

COMMIT;
