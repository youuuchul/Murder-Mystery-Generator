-- 표지 이미지 크롭에서 좌우/상하 위치뿐 아니라 확대 비율까지 저장한다.
-- 메이커 미리보기, 라이브러리 카드, 공개 상세 화면이 같은 원본 값을 사용한다.

BEGIN;

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS cover_image_zoom numeric(4,2) NOT NULL DEFAULT 1.00;

ALTER TABLE public.games
  ALTER COLUMN cover_image_zoom SET DEFAULT 1.00;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'games_cover_image_zoom_range'
      AND conrelid = 'public.games'::regclass
  ) THEN
    ALTER TABLE public.games
      ADD CONSTRAINT games_cover_image_zoom_range
      CHECK (cover_image_zoom >= 1.00 AND cover_image_zoom <= 2.50)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.games
  VALIDATE CONSTRAINT games_cover_image_zoom_range;

COMMENT ON COLUMN public.games.cover_image_zoom IS
  '표지 이미지 카드/상세 크롭 확대 비율. 1.00=원본 object-cover 기준, 최대 2.50.';

COMMIT;
