ALTER TABLE "bookings"
  ADD COLUMN "actual_departure_date" DATE;

UPDATE "bookings" AS booking
SET "actual_departure_date" = (booking."checked_out_at" AT TIME ZONE hotel."timezone")::date
FROM "room_types" AS room_type
JOIN "hotels" AS hotel ON hotel."id" = room_type."hotel_id"
WHERE booking."room_type_id" = room_type."id"
  AND booking."status" = 'CHECKED_OUT'
  AND booking."checked_out_at" IS NOT NULL;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_actual_departure_date_check"
  CHECK ("actual_departure_date" IS NULL OR "actual_departure_date" >= "check_in");

CREATE TYPE "payment_method" AS ENUM ('CASH', 'BANK_TERMINAL', 'BANK_TRANSFER', 'OTHER');

ALTER TABLE "folio_entries"
  ADD COLUMN "payment_method" "payment_method",
  ADD COLUMN "payment_reference" VARCHAR(120);

ALTER TABLE "folio_entries"
  ADD CONSTRAINT "folio_entries_payment_metadata_check"
  CHECK (
    ("kind" = 'PAYMENT' AND "direction" = 'CREDIT' AND "payment_method" IS NOT NULL AND "corrects_entry_id" IS NULL)
    OR
    ("kind" <> 'PAYMENT' AND "payment_method" IS NULL AND "payment_reference" IS NULL)
  );

ALTER TABLE "folio_entries"
  ADD CONSTRAINT "folio_entries_refund_link_check"
  CHECK (
    "kind" <> 'REFUND'
    OR ("direction" = 'DEBIT' AND "corrects_entry_id" IS NOT NULL AND "correction_reason" IS NOT NULL)
  );

ALTER TABLE "folios"
  ADD COLUMN "checkout_idempotency_key" VARCHAR(200),
  ADD COLUMN "checkout_request_hash" CHAR(64);

CREATE UNIQUE INDEX "folios_checkout_idempotency_key_key"
  ON "folios"("checkout_idempotency_key");

ALTER TABLE "folios"
  ADD CONSTRAINT "folios_checkout_idempotency_pair_check"
  CHECK (
    ("checkout_idempotency_key" IS NULL AND "checkout_request_hash" IS NULL)
    OR
    ("checkout_idempotency_key" IS NOT NULL AND "checkout_request_hash" IS NOT NULL)
  );
