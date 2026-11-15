# Folio, services, and checkout — Accepted Design

**Status:** Approved by the user's end-to-end PMS instruction; detailed scope decisions are recorded in ADR-002.

## Goal and boundaries

Provide an accurate, explainable account for each stay, including accommodation and services, with printable itemization and controlled manual settlement. The app records offline payments; it does not authorize cards or store cardholder data. Printed output is an operational folio/statement. Fiscal invoice compliance is not claimed until the deployment jurisdiction and accountant requirements are confirmed.

## Ledger model

- A booking has one folio in this release. `FolioEntry` rows are append-only and contain kind, positive integer `amountToman`, debit/credit direction, business/service date, created timestamp, actor, source, optional assigned room, description, optional quantity/unit price snapshot, and optional correction/refund link and reason. Room-night lines identify the room number; service lines identify their assigned room when applicable.
- Supported entries are accommodation charge, service charge, explicit fee/tax line, discount/adjustment, payment, and refund/reversal. This release does not calculate legal tax rates; a fee/tax line is an explicitly entered amount and the folio is not presented as a fiscal invoice. A correction adds a linked compensating row; it never edits or deletes a settled entry.
- Service catalog items have name, category, active flag, and current integer-Toman price. Posting snapshots name, quantity, unit price, service date, and actor. Existing entries do not change when catalog prices change.
- Manual payment methods are cash, bank terminal, bank transfer, or other, with optional external receipt/reference. Never accept card number, CVV, PIN, track data, or authorization secrets. A refund links to its original payment and requires a reason and role authorization.
- Current folio balance is the sum of debits minus credits. Every amount is stored as integer Toman; totals use BigInt/integer arithmetic. Zero/negative payments are rejected; a payment cannot exceed the positive balance. Refund totals cannot exceed the unrefunded amount of the linked payment. Charge/payment/refund operations serialize on the booking/folio row before reading balance.
- One accommodation posting service is called by night close and final checkout. Its deterministic key is `room-night:<roomAssignmentId>:<stayDate>` and the database enforces uniqueness, preventing cross-path duplicates. Checkout-exclusive semantics charge dates in `[checkIn, actualDeparture)`; the departure date is not charged by default.

## Workflow and checkout rule

Authorized staff can review the running folio for an in-house stay, post an allowed service, record payment, and print an interim statement. Before checkout the server posts missing accommodation nights through actual departure using the shared unique posting path, records any pending final service/adjustment, and validates balance. Ordinary checkout requires zero balance. Manager override can check out on account only with a reason; it leaves a visible positive receivable and audit event. A `CLOSED_DUE` folio accepts post-checkout payments against that receivable but no new charges. Refunds after close require manager approval and reason and remain visible as compensating entries. Final checkout, folio state, future inventory release, room assignment closure, dirty-room transition, and audit record commit in one transaction.

Early departure releases unused future room nights and leaves any applicable charge as an explicit ledger entry. No-show or cancellation fees are separate configurable postings. No silent penalty or tax is invented. A folio can be printed before checkout as an interim statement and after checkout as a final folio.

## API/UI and output

NestJS `FoliosModule` owns ledger calculations, posting permissions, balance queries, service catalog, manual settlements, corrections, and checkout orchestration. All writes validate booking state and use transactions. Unique idempotency keys prevent duplicate service/payment submissions from retries. Audit records contain actor, action, target, amount, and reason without storing payment credentials.

The protected staff folio screen shows dated itemized debits/credits, assigned room number when applicable, service quantities, payment method labels, running balance, and clear interim/final/closed-due state. A print route renders a clean RTL/print stylesheet with hotel/guest/stay data, reservation reference, itemized lines, totals, payments, balance, currency, and hotel-local print timestamp. Mark output `Interim folio` or `Final folio`; do not claim fiscal-invoice identifiers. Print fetches use request `cache: 'no-store'`; staff API and print responses set `Cache-Control: private, no-store`. Test long Persian names, LTR references/amounts, page breaks, repeated table headers, and response headers. Browser print-to-PDF is sufficient; no PDF service or email delivery is added.

## Tax and legal boundary

Tax percentages, labels, tourism levies, invoice numbering, seller/buyer identity fields, fiscal device/e-invoice payload, and retention periods are not hard-coded. Staff may post an explicit fee/tax amount with a snapshot, but the app does not calculate statutory tax and labels output as a folio/statement until a country-specific fiscal implementation is verified.

## Tests

TDD unit and PostgreSQL tests cover debit/credit arithmetic, amount bounds, room attribution, price snapshots, immutable corrections, duplicate retries, payment/refund limits, closed-due collection, service role access, settlement gates, manager overrides, concurrent posting versus checkout, early departure releases, and transactional rollback. Playwright covers in-house service posting, payment entry, zero-balance checkout, print preview, unauthorized folio access, duplicate charge/payment retry, and rejected nonzero-balance checkout.

## Excluded

Card processing, card token vault, gateway webhooks, bank reconciliation, company/direct-bill ledgers, split folios, multi-currency, fiscal certification, and POS/minibar integrations are deferred.
