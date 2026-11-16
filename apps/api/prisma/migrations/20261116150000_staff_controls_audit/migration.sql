ALTER TYPE "staff_role" ADD VALUE 'MANAGER';
ALTER TYPE "staff_role" ADD VALUE 'HOUSEKEEPER';
ALTER TYPE "staff_role" ADD VALUE 'CASHIER';

ALTER TABLE "staff_users"
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT lower(btrim("email"))
    FROM "staff_users"
    GROUP BY lower(btrim("email"))
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT lower(btrim("username"))
    FROM "staff_users"
    GROUP BY lower(btrim("username"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Resolve case-insensitive staff username/email duplicates before this migration.';
  END IF;
END;
$$;

UPDATE "staff_users"
SET "email" = lower(btrim("email")),
    "username" = btrim("username");

CREATE UNIQUE INDEX "staff_users_email_normalized_key"
  ON "staff_users" (lower(btrim("email")));

CREATE UNIQUE INDEX "staff_users_username_normalized_key"
  ON "staff_users" (lower(btrim("username")));

CREATE TABLE "audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_staff_user_id" UUID,
  "event_name" VARCHAR(80) NOT NULL,
  "target_type" VARCHAR(80) NOT NULL,
  "target_id" VARCHAR(128) NOT NULL,
  "reason" VARCHAR(500),
  "before" JSONB,
  "after" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_events_actor_staff_user_id_fkey"
    FOREIGN KEY ("actor_staff_user_id")
    REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "audit_events_actor_staff_user_id_created_at_idx"
  ON "audit_events"("actor_staff_user_id", "created_at");

CREATE INDEX "audit_events_target_type_target_id_created_at_idx"
  ON "audit_events"("target_type", "target_id", "created_at");

CREATE FUNCTION "prevent_audit_event_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are append-only.'
    USING ERRCODE = '55000', CONSTRAINT = 'audit_events_append_only';
END;
$$;

CREATE TRIGGER "audit_events_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "prevent_audit_event_mutation"();

CREATE TRIGGER "audit_events_no_truncate"
  BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "prevent_audit_event_mutation"();
