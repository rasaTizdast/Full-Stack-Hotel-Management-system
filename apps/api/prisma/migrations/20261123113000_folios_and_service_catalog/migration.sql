CREATE TYPE "folio_status" AS ENUM ('OPEN', 'CLOSED', 'CLOSED_DUE');
CREATE TYPE "folio_direction" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "folio_entry_kind" AS ENUM (
  'ACCOMMODATION', 'SERVICE', 'FEE', 'TAX', 'DISCOUNT', 'ADJUSTMENT', 'PAYMENT', 'REFUND'
);

CREATE TABLE "service_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(120) NOT NULL,
  "name_key" VARCHAR(120) NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "current_price_toman" BIGINT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "service_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_items_price_positive" CHECK ("current_price_toman" > 0),
  CONSTRAINT "service_items_name_key_key" UNIQUE ("name_key")
);
CREATE INDEX "service_items_active_category_name_idx" ON "service_items" ("is_active", "category", "name");

CREATE TABLE "folios" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "booking_id" UUID NOT NULL,
  "status" "folio_status" NOT NULL DEFAULT 'OPEN',
  "closed_at" TIMESTAMPTZ(3),
  "closed_by_staff_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "folios_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "folios_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "folios_closed_by_staff_user_id_fkey" FOREIGN KEY ("closed_by_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "folios_booking_id_key" ON "folios"("booking_id");

CREATE TABLE "folio_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "folio_id" UUID NOT NULL,
  "direction" "folio_direction" NOT NULL,
  "kind" "folio_entry_kind" NOT NULL,
  "amount_toman" BIGINT NOT NULL,
  "service_date" DATE NOT NULL,
  "description_snapshot" VARCHAR(500) NOT NULL,
  "quantity" INTEGER,
  "unit_amount_toman" BIGINT,
  "room_assignment_id" UUID,
  "room_number_snapshot" VARCHAR(32),
  "service_item_id" UUID,
  "source" VARCHAR(32) NOT NULL,
  "idempotency_key" VARCHAR(200),
  "request_hash" CHAR(64),
  "actor_staff_user_id" UUID,
  "corrects_entry_id" UUID,
  "correction_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "folio_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "folio_entries_positive_amount" CHECK ("amount_toman" > 0),
  CONSTRAINT "folio_entries_quantity_snapshot_pair" CHECK (("quantity" IS NULL) = ("unit_amount_toman" IS NULL)),
  CONSTRAINT "folio_entries_quantity_positive" CHECK ("quantity" IS NULL OR "quantity" > 0),
  CONSTRAINT "folio_entries_unit_amount_positive" CHECK ("unit_amount_toman" IS NULL OR "unit_amount_toman" > 0),
  CONSTRAINT "folio_entries_correction_reason_required" CHECK ("corrects_entry_id" IS NULL OR length(trim("correction_reason")) >= 3),
  CONSTRAINT "folio_entries_folio_id_fkey" FOREIGN KEY ("folio_id") REFERENCES "folios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "folio_entries_room_assignment_id_fkey" FOREIGN KEY ("room_assignment_id") REFERENCES "room_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "folio_entries_service_item_id_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_items"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "folio_entries_actor_staff_user_id_fkey" FOREIGN KEY ("actor_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "folio_entries_corrects_entry_id_fkey" FOREIGN KEY ("corrects_entry_id") REFERENCES "folio_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "folio_entries_idempotency_key_key" ON "folio_entries"("idempotency_key");
CREATE INDEX "folio_entries_folio_service_created_idx" ON "folio_entries"("folio_id", "service_date", "created_at", "id");
CREATE INDEX "folio_entries_assignment_date_idx" ON "folio_entries"("room_assignment_id", "service_date");
CREATE INDEX "folio_entries_corrects_entry_idx" ON "folio_entries"("corrects_entry_id");

INSERT INTO "folios" ("booking_id", "status", "created_at", "updated_at")
SELECT "id", 'OPEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "bookings";

CREATE FUNCTION create_folio_for_booking() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "folios" ("booking_id", "status", "created_at", "updated_at")
  VALUES (NEW."id", 'OPEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("booking_id") DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "bookings_create_folio_after_insert"
AFTER INSERT ON "bookings"
FOR EACH ROW EXECUTE FUNCTION create_folio_for_booking();

CREATE FUNCTION reject_folio_entry_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'folio entries are append-only' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "folio_entries_are_immutable"
BEFORE UPDATE OR DELETE ON "folio_entries"
FOR EACH ROW EXECUTE FUNCTION reject_folio_entry_mutation();
