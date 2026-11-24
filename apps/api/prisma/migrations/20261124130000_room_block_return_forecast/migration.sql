ALTER TABLE "room_blocks"
  ADD COLUMN "expected_return_date" DATE;

-- Existing staff-created blocks used their exclusive end date as the displayed
-- expected return. Preserve that value while leaving migration-generated
-- capacity-preservation blocks without a forecast.
UPDATE "room_blocks"
SET "expected_return_date" = "end_date"
WHERE "created_by_staff_user_id" IS NOT NULL;

CREATE INDEX "room_blocks_expected_return_date_idx"
  ON "room_blocks"("expected_return_date");

ALTER TABLE "room_blocks"
  ADD CONSTRAINT "room_blocks_expected_return_date_in_interval"
  CHECK (
    "expected_return_date" IS NULL OR
    ("expected_return_date" >= "start_date" AND "expected_return_date" <= "end_date")
  );
