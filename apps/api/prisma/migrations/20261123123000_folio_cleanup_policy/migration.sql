ALTER TABLE "folios"
  DROP CONSTRAINT "folios_booking_id_fkey";

ALTER TABLE "folios"
  ADD CONSTRAINT "folios_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
