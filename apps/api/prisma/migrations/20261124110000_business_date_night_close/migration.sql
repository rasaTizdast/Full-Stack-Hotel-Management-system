CREATE TYPE "night_close_run_status" AS ENUM ('RUNNING', 'COMPLETED');

ALTER TABLE "hotels"
ADD COLUMN "business_date" DATE;

UPDATE "hotels"
SET "business_date" = (CURRENT_TIMESTAMP AT TIME ZONE "timezone")::date;

ALTER TABLE "hotels"
ALTER COLUMN "business_date" SET NOT NULL,
ALTER COLUMN "business_date" SET DEFAULT CURRENT_DATE;

CREATE FUNCTION "set_hotel_business_date_on_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."business_date" := (CURRENT_TIMESTAMP AT TIME ZONE NEW."timezone")::date;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "hotels_business_date_on_insert"
BEFORE INSERT ON "hotels"
FOR EACH ROW EXECUTE FUNCTION "set_hotel_business_date_on_insert"();

CREATE TABLE "night_close_runs" (
  "id" UUID NOT NULL,
  "hotel_id" UUID NOT NULL,
  "business_date" DATE NOT NULL,
  "next_business_date" DATE NOT NULL,
  "status" "night_close_run_status" NOT NULL DEFAULT 'RUNNING',
  "room_night_count" INTEGER NOT NULL DEFAULT 0,
  "accommodation_amount_toman" BIGINT NOT NULL DEFAULT 0,
  "warning_count" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  "actor_staff_user_id" UUID NOT NULL,

  CONSTRAINT "night_close_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "night_close_runs_hotel_id_fkey"
    FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "night_close_runs_actor_staff_user_id_fkey"
    FOREIGN KEY ("actor_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "night_close_runs_hotel_id_business_date_key"
ON "night_close_runs"("hotel_id", "business_date");

CREATE INDEX "night_close_runs_hotel_id_status_business_date_idx"
ON "night_close_runs"("hotel_id", "status", "business_date");
