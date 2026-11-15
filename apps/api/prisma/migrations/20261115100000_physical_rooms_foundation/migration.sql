CREATE TYPE "housekeeping_status" AS ENUM ('DIRTY', 'CLEAN', 'INSPECTED');
CREATE TYPE "room_block_kind" AS ENUM ('OUT_OF_ORDER', 'CAPACITY_CLOSED');

ALTER TABLE "hotels"
  ADD COLUMN "check_in_time" VARCHAR(5) NOT NULL DEFAULT '15:00',
  ADD COLUMN "check_out_time" VARCHAR(5) NOT NULL DEFAULT '11:00';

CREATE TABLE "rooms" (
  "id" UUID NOT NULL,
  "hotel_id" UUID NOT NULL,
  "room_type_id" UUID NOT NULL,
  "room_number" VARCHAR(32) NOT NULL,
  "floor" VARCHAR(32),
  "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "housekeeping_status" "housekeeping_status" NOT NULL DEFAULT 'DIRTY',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_generated" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "rooms_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rooms_room_number_check" CHECK (length(btrim("room_number")) > 0)
);

CREATE TABLE "room_blocks" (
  "id" UUID NOT NULL,
  "room_id" UUID NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "kind" "room_block_kind" NOT NULL DEFAULT 'OUT_OF_ORDER',
  "reason" VARCHAR(500) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_staff_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "room_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "room_blocks_date_range_check" CHECK ("end_date" > "start_date"),
  CONSTRAINT "room_blocks_reason_check" CHECK (length(btrim("reason")) > 0)
);

CREATE TABLE "room_assignments" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "room_id" UUID NOT NULL,
  "room_type_id" UUID NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "assigned_by_staff_user_id" UUID,
  "change_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "room_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "room_assignments_date_range_check" CHECK ("end_date" > "start_date")
);

CREATE UNIQUE INDEX "room_types_id_hotel_id_key" ON "room_types"("id", "hotel_id");
CREATE UNIQUE INDEX "bookings_id_room_type_id_key" ON "bookings"("id", "room_type_id");
CREATE UNIQUE INDEX "rooms_hotel_id_room_number_key" ON "rooms"("hotel_id", "room_number");
CREATE UNIQUE INDEX "rooms_id_room_type_id_key" ON "rooms"("id", "room_type_id");
CREATE INDEX "rooms_room_type_id_is_active_room_number_idx" ON "rooms"("room_type_id", "is_active", "room_number");
CREATE INDEX "rooms_room_type_id_floor_is_active_idx" ON "rooms"("room_type_id", "floor", "is_active");
CREATE INDEX "room_blocks_room_id_is_active_start_date_end_date_idx" ON "room_blocks"("room_id", "is_active", "start_date", "end_date");
CREATE INDEX "room_blocks_start_date_end_date_idx" ON "room_blocks"("start_date", "end_date");
CREATE INDEX "room_assignments_room_id_is_active_start_date_end_date_idx" ON "room_assignments"("room_id", "is_active", "start_date", "end_date");
CREATE INDEX "room_assignments_booking_id_is_active_idx" ON "room_assignments"("booking_id", "is_active");
CREATE INDEX "room_assignments_start_date_end_date_idx" ON "room_assignments"("start_date", "end_date");

ALTER TABLE "hotels"
  ADD CONSTRAINT "hotels_check_in_time_check"
    CHECK ("check_in_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "hotels_check_out_time_check"
    CHECK ("check_out_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_hotel_id_fkey"
    FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rooms_room_type_id_hotel_id_fkey"
    FOREIGN KEY ("room_type_id", "hotel_id") REFERENCES "room_types"("id", "hotel_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "room_blocks"
  ADD CONSTRAINT "room_blocks_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "room_blocks_created_by_staff_user_id_fkey"
    FOREIGN KEY ("created_by_staff_user_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "room_assignments"
  ADD CONSTRAINT "room_assignments_booking_id_room_type_id_fkey"
    FOREIGN KEY ("booking_id", "room_type_id") REFERENCES "bookings"("id", "room_type_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "room_assignments_room_id_room_type_id_fkey"
    FOREIGN KEY ("room_id", "room_type_id") REFERENCES "rooms"("id", "room_type_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "room_assignments_assigned_by_staff_user_id_fkey"
    FOREIGN KEY ("assigned_by_staff_user_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Materialize the legacy room-type capacities as physical demo units. Mark
-- their labels so a deployment can replace them with the property's real rooms.
-- Keep their housekeeping state DIRTY until staff verifies the real rooms.
WITH type_capacity AS (
  SELECT
    room_type."id" AS room_type_id,
    room_type."hotel_id" AS hotel_id,
    COALESCE(MAX(inventory."total_rooms"), 0) AS max_rooms
  FROM "room_types" AS room_type
  LEFT JOIN "room_night_inventory" AS inventory
    ON inventory."room_type_id" = room_type."id"
  GROUP BY room_type."id", room_type."hotel_id"
), room_slots AS (
  SELECT
    type_capacity.room_type_id,
    type_capacity.hotel_id,
    generate_series(1, type_capacity.max_rooms) AS room_slot
  FROM type_capacity
)
INSERT INTO "rooms" (
  "id", "hotel_id", "room_type_id", "room_number", "housekeeping_status",
  "is_active", "is_generated", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  room_slots.hotel_id,
  room_slots.room_type_id,
  'GEN-' || left(replace(room_slots.room_type_id::text, '-', ''), 8) || '-' || lpad(room_slots.room_slot::text, 10, '0'),
  'DIRTY'::"housekeeping_status",
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM room_slots;

-- Preserve variable nightly capacity by closing only the excess generated
-- physical units for each legacy room-night. Adjacent dates remain separate
-- one-night records, so no block overlaps itself.
INSERT INTO "room_blocks" (
  "id", "room_id", "start_date", "end_date", "kind", "reason",
  "is_active", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  room."id",
  inventory."stay_date",
  inventory."stay_date" + 1,
  'CAPACITY_CLOSED'::"room_block_kind",
  'Preserve legacy room-type nightly capacity during physical-room migration.',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "room_night_inventory" AS inventory
JOIN "rooms" AS room
  ON room."room_type_id" = inventory."room_type_id"
 AND room."is_generated" = true
WHERE split_part(room."room_number", '-', 3)::integer > inventory."total_rooms";

-- Migration is lossless only if the generated units and date blocks reproduce
-- every pre-migration sellable capacity exactly. Counters and rates are never
-- rewritten by this migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "rooms"
    WHERE "is_generated" = true
      AND "housekeeping_status" <> 'DIRTY'::"housekeeping_status"
  ) THEN
    RAISE EXCEPTION 'Generated placeholder rooms must require housekeeping verification.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "room_night_inventory" AS inventory
    WHERE inventory."total_rooms" <> (
      SELECT COUNT(*)
      FROM "rooms" AS room
      WHERE room."room_type_id" = inventory."room_type_id"
        AND room."is_active" = true
    ) - (
      SELECT COUNT(DISTINCT block."room_id")
      FROM "room_blocks" AS block
      JOIN "rooms" AS room ON room."id" = block."room_id"
      WHERE room."room_type_id" = inventory."room_type_id"
        AND room."is_active" = true
        AND block."is_active" = true
        AND block."start_date" <= inventory."stay_date"
        AND block."end_date" > inventory."stay_date"
    )
  ) THEN
    RAISE EXCEPTION 'Physical room backfill did not preserve a legacy nightly capacity.';
  END IF;
END $$;
