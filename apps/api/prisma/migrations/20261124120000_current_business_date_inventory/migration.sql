WITH active_room_counts AS (
  SELECT room."room_type_id", COUNT(*)::integer AS "active_rooms"
  FROM "rooms" AS room
  WHERE room."is_active" = true
  GROUP BY room."room_type_id"
),
active_block_counts AS (
  SELECT room."room_type_id", COUNT(DISTINCT block."room_id")::integer AS "blocked_rooms"
  FROM "room_blocks" AS block
  JOIN "rooms" AS room ON room."id" = block."room_id"
  JOIN "hotels" AS hotel ON hotel."id" = room."hotel_id"
  WHERE block."is_active" = true
    AND room."is_active" = true
    AND block."start_date" <= hotel."business_date"
    AND block."end_date" > hotel."business_date"
  GROUP BY room."room_type_id"
),
current_booking_counts AS (
  SELECT
    booking."room_type_id",
    booking_night."stay_date",
    COALESCE(
      SUM(booking_night."room_quantity") FILTER (
        WHERE booking."status" = 'PENDING_CONFIRMATION'::"booking_status"
          AND booking."expires_at" > CURRENT_TIMESTAMP
      ),
      0
    )::integer AS "held_rooms",
    COALESCE(
      SUM(booking_night."room_quantity") FILTER (
        WHERE booking."status" IN (
          'CONFIRMED'::"booking_status",
          'CHECKED_IN'::"booking_status"
        )
      ),
      0
    )::integer AS "booked_rooms"
  FROM "bookings" AS booking
  JOIN "booking_nights" AS booking_night ON booking_night."booking_id" = booking."id"
  JOIN "room_types" AS room_type ON room_type."id" = booking."room_type_id"
  JOIN "hotels" AS hotel ON hotel."id" = room_type."hotel_id"
    AND hotel."business_date" = booking_night."stay_date"
  GROUP BY booking."room_type_id", booking_night."stay_date"
),
current_rates AS (
  SELECT DISTINCT ON (inventory."room_type_id")
    inventory."room_type_id",
    inventory."nightly_price_toman"
  FROM "room_night_inventory" AS inventory
  JOIN "room_types" AS room_type ON room_type."id" = inventory."room_type_id"
  JOIN "hotels" AS hotel ON hotel."id" = room_type."hotel_id"
  WHERE inventory."stay_date" >= hotel."business_date"
  ORDER BY inventory."room_type_id", inventory."stay_date" ASC
)
INSERT INTO "room_night_inventory" (
  "id",
  "room_type_id",
  "stay_date",
  "total_rooms",
  "blocked_rooms",
  "held_rooms",
  "booked_rooms",
  "nightly_price_toman",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  room_type."id",
  hotel."business_date",
  GREATEST(
    COALESCE(active_room_counts."active_rooms", 0)
      - COALESCE(active_block_counts."blocked_rooms", 0),
    0
  ),
  COALESCE(active_block_counts."blocked_rooms", 0),
  COALESCE(current_booking_counts."held_rooms", 0),
  COALESCE(current_booking_counts."booked_rooms", 0),
  current_rates."nightly_price_toman",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "room_types" AS room_type
JOIN "hotels" AS hotel ON hotel."id" = room_type."hotel_id"
LEFT JOIN active_room_counts
  ON active_room_counts."room_type_id" = room_type."id"
LEFT JOIN active_block_counts
  ON active_block_counts."room_type_id" = room_type."id"
LEFT JOIN current_booking_counts
  ON current_booking_counts."room_type_id" = room_type."id"
  AND current_booking_counts."stay_date" = hotel."business_date"
JOIN current_rates
  ON current_rates."room_type_id" = room_type."id"
ON CONFLICT ("room_type_id", "stay_date") DO NOTHING;
