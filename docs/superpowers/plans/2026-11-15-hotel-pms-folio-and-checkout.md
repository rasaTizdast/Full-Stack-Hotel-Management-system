# Hotel PMS Folio and Checkout Implementation Plan

> **For agentic workers:** Implement one ticket at a time in its own Git worktree, use test-first development, obtain the role reviews listed in `docs/implementation-tickets.md`, then merge and remove that ticket's worktree.

**Goal:** Produce an accurate stay bill containing room nights and services, record offline settlements, and safely check guests out with a printable folio.

**Architecture:** Use one append-only folio ledger per booking. Every posting snapshots description, amount, quantity, source, and service date. Payment records store method/reference but no card credentials. Checkout coordinates balance validation, final postings, stay state, room condition, and future inventory release in one PostgreSQL transaction.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Next.js App Router, TypeScript, browser print CSS, Vitest, Jest, Supertest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-pms-folio-and-checkout-design.md`; shared policy: `docs/decisions/ADR-002-hotel-pms-scope.md`.

## Global Constraints

- Money is integer Toman (`BigInt` in storage and decimal strings at JSON boundaries); no floating point.
- Ledger entries are append-only; corrections and refunds create linked compensating entries with actor and reason.
- Price and service descriptions are immutable snapshots. Repeated requests use idempotency keys.
- Manual payment methods only. Never store card numbers, CVV, PIN, track data, or gateway authorization credentials.
- Ordinary checkout requires a zero balance; manager on-account checkout requires a reason and remains visibly receivable.
- Final checkout, folio close, future-night release, assignment closure, and dirty-room state commit atomically.
- Printed document is an operational folio/statement; do not label it a legally certified tax invoice until jurisdiction-specific validation is completed.
- Use TDD and PostgreSQL transaction tests for balance races/rollback. Run web E2E before the tester does manual UI review.
- Each ticket uses a separate worktree/branch and is merged/cleaned up only after its checks and review pass.
- Before Next.js edits, read `apps/web/AGENTS.md` and the installed Next.js 16 documentation at `apps/web/node_modules/next/dist/docs/`, including the guide relevant to the route/API change. Every private staff fetch uses request `cache: 'no-store'`, and every staff API/print response sets `Cache-Control: private, no-store`; tests assert both sides of this policy.
- Use tracked RTL tokens and CSS modules; do not depend on uncommitted UI primitives. Designer review inspects desktop/mobile and print preview. Existing Hallmark files are historical; no Hallmark skill/runner is registered in the repository.

---

## Ticket HPM-007 — Folio ledger and service catalog

**Worktree:** `../Hotel Booking system-worktrees/HPM-007`

**Dependencies:** HPM-002, HPM-004
**Files:** folio/service schema migration; `apps/api/src/folios/**`; audit and OpenAPI modules; API unit/database/e2e specs; `apps/web/src/lib/staff-folios-api.ts`; `apps/web/src/components/staff/folios/**`, `apps/web/src/components/staff/services/**`; `/staff/folios/[bookingId]` and `/staff/services` routes; unit tests.

- [x] Write failing tests for debit-credit balance arithmetic, immutable price snapshots, forbidden edits/deletes, duplicate idempotency keys, booking-state restrictions, and cashier/reception/manager permissions.
- [x] Add `ServiceItem` with active/category/name/current price; add `FolioEntry` with direction, kind, integer amount, service date, optional assigned room, description snapshot, quantity/unit amount, actor, source, idempotency key, correction/refund link, and reason. Add one locked accommodation posting service with unique key `room-night:<roomAssignmentId>:<stayDate>` shared by close and checkout.
- [x] Implement create/edit-deactivate catalog endpoints (admin/manager) and folio query/post/adjust endpoints. Financial correction creates a new linked entry; the original record remains immutable.
- [x] Build manager/admin `/staff/services` catalog UI for item name/category/price/active state, with duplicate/invalid-price feedback and tests; catalog price changes never rewrite prior folio snapshots.
- [x] Test that service-catalog fetches send request `cache: 'no-store'` and that catalog/folio API responses include `Cache-Control: private, no-store`.
- [x] Post accommodation and service charges only for valid stays. Accommodation lines identify room number and cover `[checkIn, actualDeparture)`; checkout date is excluded. Lock booking/folio before balance reads, enforce database idempotency, and return server-computed balance.
- [x] Add an RTL folio view with a dated itemized ledger, room attribution, debit/credit indicators, service quantity and price, running balance, role-appropriate posting/adjustment actions, and interim-statement state.
- [x] Run API unit/database/e2e, web unit, Playwright, lint/typecheck, assert `Cache-Control: private, no-store` on folio/catalog APIs, and confirm public DTOs never include folio details.

## Ticket HPM-008 — Manual settlement, final checkout, and printing

**Worktree:** `../Hotel Booking system-worktrees/HPM-008`

**Dependencies:** HPM-003, HPM-004, HPM-005, HPM-006, HPM-007
**Files:** folio payment/checkout migration; `apps/api/src/folios/**`, booking lifecycle service; payment/checkout API and DB tests; staff folio/checkout UI, print route/styles, Playwright specs.

- [x] Write failing tests for accepted manual methods, positive payment bounds, overpayment rejection, refund ceiling, post-checkout collection, nonzero-balance denial, manager override reason, duplicate retry, concurrent checkout/posting, early departure release, and rollback.
- [x] Add payment/refund ledger entries for CASH, BANK_TERMINAL, BANK_TRANSFER, or OTHER with optional receipt reference. Reject zero/negative and over-balance payments, cardholder-data fields, refunds above the unrefunded source payment, and unreasoned corrections. Closed-due folios accept payment collection only; no new charges. Record the collector, date, method, and reference for post-checkout receivable collection.
- [x] Make checkout lock booking/folio and call the shared accommodation posting service, validate balance, permit manager override only for a positive receivable with reason, then close folio/assignments, release unused inventory, mark room dirty, set actual departure once, and insert audit in the same transaction.
- [x] Add a manager/admin checked-in stay extension with a required audited reason, room/block/capacity checks, nightly rate snapshots, and assignment-history preservation so overdue stays can reach final checkout without dropping room-move attribution.
- [x] Create authenticated `/staff/folios/[bookingId]/print` with request `cache: 'no-store'` and response `Cache-Control: private, no-store`, clean RTL print CSS, hotel/stay/guest summary, room-attributed service/accommodation lines, totals, payments, balance, `Interim folio`/`Final folio` label, and hotel-local print timestamp. Assert the response header and request option; browser print-to-PDF is the output path.
- [x] Run API DB/e2e and web unit/E2E, including unauthorized folio access, duplicate charge/payment retry, and nonzero-balance denial. Inspect page breaks, repeated table headers, long Persian names, LTR references/amounts, and desktop/narrow print preview.

## Merge gate

Require the backend specialist's review of ledger immutability, amount arithmetic, settlement race safety, and permissions; require designer review of folio readability and print layout; require tester review only after frontend E2E passes. Record evidence in the ticket register before merge and worktree removal.
