ALTER TYPE "booking_status" ADD VALUE 'CHECKED_IN';
ALTER TYPE "booking_status" ADD VALUE 'CHECKED_OUT';
ALTER TYPE "booking_status" ADD VALUE 'NO_SHOW';

ALTER TABLE "bookings"
  ADD COLUMN "checked_in_at" TIMESTAMPTZ(3),
  ADD COLUMN "checked_in_by_staff_user_id" UUID,
  ADD COLUMN "checked_out_at" TIMESTAMPTZ(3),
  ADD COLUMN "checked_out_by_staff_user_id" UUID,
  ADD COLUMN "no_show_at" TIMESTAMPTZ(3),
  ADD COLUMN "no_show_by_staff_user_id" UUID,
  ADD COLUMN "no_show_reason" VARCHAR(500);

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_checked_in_by_staff_user_id_fkey"
    FOREIGN KEY ("checked_in_by_staff_user_id")
    REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "bookings_checked_out_by_staff_user_id_fkey"
    FOREIGN KEY ("checked_out_by_staff_user_id")
    REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "bookings_no_show_by_staff_user_id_fkey"
    FOREIGN KEY ("no_show_by_staff_user_id")
    REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "bookings_status_check_out_idx"
  ON "bookings"("status", "check_out");
