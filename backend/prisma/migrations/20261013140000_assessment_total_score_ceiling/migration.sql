-- Reject stored assessments whose total exceeds the snapshot max.
-- Inspect existing rows before adding the CHECK; do not edit 20261012180353_init_mvp.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM assessments
    WHERE total_score > max_score
  ) THEN
    RAISE EXCEPTION 'Cannot add assessments_total_score_lte_max: rows have total_score > max_score';
  END IF;
END $$;

ALTER TABLE "assessments"
  ADD CONSTRAINT "assessments_total_score_lte_max"
  CHECK ("total_score" <= "max_score");
