CREATE TYPE "maintenance_category" AS ENUM (
  'PLUMBING',
  'ELECTRICAL',
  'HVAC',
  'APPLIANCE',
  'STRUCTURAL',
  'SAFETY',
  'OTHER'
);

CREATE TYPE "maintenance_request_status" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "maintenance_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "room_id" UUID NOT NULL,
  "category" "maintenance_category" NOT NULL,
  "description" VARCHAR(1000) NOT NULL,
  "priority" "housekeeping_priority" NOT NULL DEFAULT 'NORMAL',
  "status" "maintenance_request_status" NOT NULL DEFAULT 'OPEN',
  "expected_date" DATE NOT NULL,
  "assigned_to_staff_user_id" UUID,
  "assigned_at" TIMESTAMPTZ(3),
  "assigned_by_staff_user_id" UUID,
  "created_by_staff_user_id" UUID NOT NULL,
  "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ(3),
  "resolved_by_staff_user_id" UUID,
  "resolution_note" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "maintenance_requests_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "maintenance_requests_assigned_to_staff_user_id_fkey"
    FOREIGN KEY ("assigned_to_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "maintenance_requests_assigned_by_staff_user_id_fkey"
    FOREIGN KEY ("assigned_by_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "maintenance_requests_created_by_staff_user_id_fkey"
    FOREIGN KEY ("created_by_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "maintenance_requests_resolved_by_staff_user_id_fkey"
    FOREIGN KEY ("resolved_by_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "maintenance_requests_resolution_state_check"
    CHECK (
      ("status" = 'OPEN' AND "resolved_at" IS NULL AND "resolved_by_staff_user_id" IS NULL AND "resolution_note" IS NULL)
      OR
      ("status" = 'RESOLVED' AND "resolved_at" IS NOT NULL AND "resolved_by_staff_user_id" IS NOT NULL AND "resolution_note" IS NOT NULL)
    )
);

CREATE INDEX "maintenance_requests_room_id_status_opened_at_idx"
  ON "maintenance_requests"("room_id", "status", "opened_at");
CREATE INDEX "maintenance_requests_status_expected_date_priority_idx"
  ON "maintenance_requests"("status", "expected_date", "priority");
CREATE INDEX "maintenance_requests_assigned_to_staff_user_id_status_expected_date_idx"
  ON "maintenance_requests"("assigned_to_staff_user_id", "status", "expected_date");
CREATE INDEX "maintenance_requests_created_at_idx"
  ON "maintenance_requests"("created_at");
