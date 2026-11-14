ALTER TABLE "bookings"
ADD COLUMN "idempotency_request_hash" CHAR(64);
