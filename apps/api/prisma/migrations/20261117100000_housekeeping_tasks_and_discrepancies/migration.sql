CREATE TYPE "housekeeping_task_type" AS ENUM (
  'DEPARTURE_CLEAN',
  'STAYOVER_CLEAN',
  'INSPECTION',
  'GUEST_REQUEST',
  'RE_CLEAN'
);
CREATE TYPE "housekeeping_task_status" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "housekeeping_priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "housekeeping_completion_outcome" AS ENUM ('DONE', 'NEEDS_REWORK');
CREATE TYPE "room_discrepancy_type" AS ENUM ('SLEEP', 'SKIP');
CREATE TYPE "room_discrepancy_status" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

CREATE TABLE "housekeeping_tasks" (
  "id" UUID NOT NULL,
  "room_id" UUID NOT NULL,
  "task_type" "housekeeping_task_type" NOT NULL,
  "business_date" DATE NOT NULL,
  "priority" "housekeeping_priority" NOT NULL DEFAULT 'NORMAL',
  "status" "housekeeping_task_status" NOT NULL DEFAULT 'OPEN',
  "assigned_to_staff_user_id" UUID,
  "assigned_at" TIMESTAMPTZ(3),
  "assigned_by_staff_user_id" UUID,
  "created_by_staff_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "started_at" TIMESTAMPTZ(3),
  "started_by_staff_user_id" UUID,
  "completed_at" TIMESTAMPTZ(3),
  "completed_by_staff_user_id" UUID,
  "completion_outcome" "housekeeping_completion_outcome",
  "completion_reason" VARCHAR(500),
  "rework_of_task_id" UUID,
  "cancelled_at" TIMESTAMPTZ(3),
  "cancelled_by_staff_user_id" UUID,
  "cancellation_reason" VARCHAR(500),
  "note" VARCHAR(500),
  CONSTRAINT "housekeeping_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "housekeeping_tasks_inspection_rework_check"
    CHECK (
      "completion_outcome" IS DISTINCT FROM 'NEEDS_REWORK'::"housekeeping_completion_outcome"
      OR (
        "task_type" = 'INSPECTION'::"housekeeping_task_type"
        AND "completion_reason" IS NOT NULL
        AND length(btrim("completion_reason")) > 0
      )
    ),
  CONSTRAINT "housekeeping_tasks_rework_type_check"
    CHECK ("rework_of_task_id" IS NULL OR "task_type" = 'RE_CLEAN'::"housekeeping_task_type")
);

CREATE TABLE "room_discrepancies" (
  "id" UUID NOT NULL,
  "room_id" UUID NOT NULL,
  "business_date" DATE NOT NULL,
  "kind" "room_discrepancy_type" NOT NULL,
  "expected_occupied" BOOLEAN NOT NULL,
  "observed_occupied" BOOLEAN NOT NULL,
  "status" "room_discrepancy_status" NOT NULL DEFAULT 'OPEN',
  "reported_by_staff_user_id" UUID NOT NULL,
  "reported_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" VARCHAR(500) NOT NULL,
  "resolved_by_staff_user_id" UUID,
  "resolved_at" TIMESTAMPTZ(3),
  "resolution_reason" VARCHAR(500),
  CONSTRAINT "room_discrepancies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "room_discrepancies_observation_mismatch_check"
    CHECK (
      ("kind" = 'SLEEP'::"room_discrepancy_type" AND NOT "expected_occupied" AND "observed_occupied")
      OR ("kind" = 'SKIP'::"room_discrepancy_type" AND "expected_occupied" AND NOT "observed_occupied")
    ),
  CONSTRAINT "room_discrepancies_resolution_fields_check"
    CHECK (
      ("status" = 'OPEN'::"room_discrepancy_status" AND "resolved_by_staff_user_id" IS NULL AND "resolved_at" IS NULL AND "resolution_reason" IS NULL)
      OR ("status" = 'RESOLVED'::"room_discrepancy_status" AND "resolved_by_staff_user_id" IS NOT NULL AND "resolved_at" IS NOT NULL)
      OR ("status" = 'DISMISSED'::"room_discrepancy_status" AND "resolved_by_staff_user_id" IS NOT NULL AND "resolved_at" IS NOT NULL AND length(btrim("resolution_reason")) > 0)
    )
);

ALTER TABLE "housekeeping_tasks"
  ADD CONSTRAINT "housekeeping_tasks_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "housekeeping_tasks_assigned_to_staff_user_id_fkey"
    FOREIGN KEY ("assigned_to_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "housekeeping_tasks_assigned_by_staff_user_id_fkey"
    FOREIGN KEY ("assigned_by_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "housekeeping_tasks_created_by_staff_user_id_fkey"
    FOREIGN KEY ("created_by_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "housekeeping_tasks_started_by_staff_user_id_fkey"
    FOREIGN KEY ("started_by_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "housekeeping_tasks_completed_by_staff_user_id_fkey"
    FOREIGN KEY ("completed_by_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "housekeeping_tasks_cancelled_by_staff_user_id_fkey"
    FOREIGN KEY ("cancelled_by_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "housekeeping_tasks_rework_of_task_id_fkey"
    FOREIGN KEY ("rework_of_task_id") REFERENCES "housekeeping_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "room_discrepancies"
  ADD CONSTRAINT "room_discrepancies_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "room_discrepancies_reported_by_staff_user_id_fkey"
    FOREIGN KEY ("reported_by_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "room_discrepancies_resolved_by_staff_user_id_fkey"
    FOREIGN KEY ("resolved_by_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "housekeeping_tasks_rework_of_task_id_key"
  ON "housekeeping_tasks"("rework_of_task_id");
CREATE INDEX "housekeeping_tasks_room_id_business_date_status_idx"
  ON "housekeeping_tasks"("room_id", "business_date", "status");
CREATE INDEX "housekeeping_tasks_status_business_date_priority_idx"
  ON "housekeeping_tasks"("status", "business_date", "priority");
CREATE INDEX "housekeeping_tasks_assigned_to_staff_user_id_status_business_date_idx"
  ON "housekeeping_tasks"("assigned_to_staff_user_id", "status", "business_date");
CREATE INDEX "housekeeping_tasks_task_type_business_date_idx"
  ON "housekeeping_tasks"("task_type", "business_date");
CREATE INDEX "room_discrepancies_room_id_business_date_status_idx"
  ON "room_discrepancies"("room_id", "business_date", "status");
CREATE INDEX "room_discrepancies_status_business_date_idx"
  ON "room_discrepancies"("status", "business_date");
CREATE INDEX "room_discrepancies_reported_by_staff_user_id_reported_at_idx"
  ON "room_discrepancies"("reported_by_staff_user_id", "reported_at");
CREATE UNIQUE INDEX "room_discrepancies_one_open_per_room_date_key"
  ON "room_discrepancies"("room_id", "business_date")
  WHERE "status" = 'OPEN'::"room_discrepancy_status";
