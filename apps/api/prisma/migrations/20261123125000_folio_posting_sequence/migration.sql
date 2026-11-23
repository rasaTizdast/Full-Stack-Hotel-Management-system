ALTER TABLE "folio_entries"
  ADD COLUMN "entry_number" BIGSERIAL NOT NULL;

CREATE UNIQUE INDEX "folio_entries_entry_number_key"
  ON "folio_entries" ("entry_number");

DROP INDEX "folio_entries_folio_service_created_idx";
CREATE INDEX "folio_entries_folio_service_sequence_idx"
  ON "folio_entries" ("folio_id", "service_date", "entry_number");
