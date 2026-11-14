ALTER TABLE "bookings"
ADD COLUMN "internal_note" VARCHAR(1000),
ADD COLUMN "cancellation_reason" VARCHAR(500);
