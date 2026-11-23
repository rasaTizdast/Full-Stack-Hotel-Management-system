ALTER TABLE "folio_entries"
  DROP CONSTRAINT "folio_entries_corrects_entry_id_fkey";

CREATE UNIQUE INDEX "folio_entries_id_folio_id_key"
  ON "folio_entries" ("id", "folio_id");

ALTER TABLE "folio_entries"
  ADD CONSTRAINT "folio_entries_correction_same_folio_fkey"
  FOREIGN KEY ("corrects_entry_id", "folio_id")
  REFERENCES "folio_entries" ("id", "folio_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "folio_entries"
  ADD CONSTRAINT "folio_entries_amount_matches_snapshot"
  CHECK ("quantity" IS NULL OR "amount_toman" = "quantity"::BIGINT * "unit_amount_toman");

CREATE TRIGGER "folio_entries_no_truncate"
BEFORE TRUNCATE ON "folio_entries"
FOR EACH STATEMENT EXECUTE FUNCTION reject_folio_entry_mutation();
