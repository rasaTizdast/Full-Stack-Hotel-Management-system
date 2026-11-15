ALTER TABLE "room_night_inventory"
  ADD COLUMN "blocked_rooms" INTEGER NOT NULL DEFAULT 0;

UPDATE "room_night_inventory" AS inventory
SET "blocked_rooms" = (
  SELECT COUNT(DISTINCT block."room_id")::integer
  FROM "room_blocks" AS block
  JOIN "rooms" AS room ON room."id" = block."room_id"
  WHERE room."room_type_id" = inventory."room_type_id"
    AND room."is_active" = true
    AND block."is_active" = true
    AND block."start_date" <= inventory."stay_date"
    AND block."end_date" > inventory."stay_date"
);

ALTER TABLE "room_night_inventory"
  ADD CONSTRAINT "room_night_inventory_blocked_rooms_check"
  CHECK ("blocked_rooms" >= 0);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "room_night_inventory" AS inventory
    WHERE inventory."total_rooms" + inventory."blocked_rooms" <> (
      SELECT COUNT(*)
      FROM "rooms" AS room
      WHERE room."room_type_id" = inventory."room_type_id"
        AND room."is_active" = true
    )
  ) THEN
    RAISE EXCEPTION 'Historical capacity snapshots do not match the physical-room backfill.';
  END IF;
END $$;
