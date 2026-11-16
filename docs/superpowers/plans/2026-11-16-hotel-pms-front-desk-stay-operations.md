# HPM-004 Front Desk Stay Operations Implementation Plan

> **For agentic workers:** Use the `subagent-driven-development` workflow for the assigned implementation areas. Implement this ticket in its dedicated worktree, use test-first changes, complete specialist review, merge only after all checks pass, then remove the worktree and branch.

**Goal:** Let authorized staff take a confirmed stay through arrival, checked-in occupancy, a room move, or an explicit no-show while safely managing walk-ins and eligible pre-check-in amendments.

**Architecture:** Keep booking lifecycle and capacity mutations in the NestJS modular monolith and keep PostgreSQL authoritative. Reuse the existing booking-row lock, room-type-before-room lock order, transactional inventory counters, room assignments, role capabilities, and staff API transport. Add a focused front-desk query/API surface and responsive RTL worklists under the protected staff layout.

**Tech Stack:** NestJS 11, TypeScript, Prisma 7, PostgreSQL, Next.js 16 App Router, React 19, Jest, Vitest, Supertest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-pms-physical-inventory-and-stays-design.md`; scope decisions: `docs/decisions/ADR-002-hotel-pms-scope.md`.

## Global Constraints

- One hotel, Persian-first RTL UI, Jalali dates in the web UI, Gregorian `YYYY-MM-DD` API/database dates, and hotel-timezone business dates.
- Money remains integer Toman; the database/API owns rates and totals. Unchanged booking nights keep their stored prices; added nights use current inventory rates.
- Preserve public booking requests as `PENDING_CONFIRMATION`; only staff walk-ins create a confirmed stay directly, and neither path captures online payment.
- Check-in is inclusive, checkout exclusive. Never infer physical occupancy from a reservation; only `CHECKED_IN` is occupied.
- A check-in must have distinct, active, same-type, unblocked, conflict-free `INSPECTED` rooms covering every remaining booked night. Serialize check-in and assignment replacement on the same booking, room-type, and sorted room-row locks.
- All consequential changes, state, capacity counters, assignment history, and audit events commit or roll back together. Audit only allowlisted status/room/date/reason data; never log guest payloads or credentials.
- Every private staff request uses the shared staff API client with `cache: 'no-store'`, credentials, and CSRF. API responses are `Cache-Control: private, no-store`; API role checks remain authoritative.
- Do not implement financial checkout, service/folio posting, settlement, or checkout UI in HPM-004. HPM-008 owns the `CHECKED_IN → CHECKED_OUT` transition after folio policy is applied.
- Keep `CHECKED_OUT` and its nullable actor/time fields available in the schema, but do not expose or execute that transition in HPM-004.
- A no-show is an explicit staff decision, never an automatic job or fee. On the scheduled arrival date it becomes available at/after the hotel's configured check-in time; an overdue confirmed stay remains eligible on later business dates while `businessDate < checkOut`.
- Early check-in is only for the scheduled arrival date before the configured check-in time, requires ADMIN/MANAGER plus a non-empty reason, and never bypasses readiness checks or creates a fee.
- Confirmed stays may be amended before check-in when `checkIn >= businessDate`; no-showed, checked-in, overdue, or departed stays cannot be amended. Room-type changes are excluded. Assignment-invalidating changes fail until staff resolves assignments.
- A room move takes effect on the hotel's current business date; source assignment history is preserved, the target is inspected/available through the remaining stay, and the vacated source room becomes `DIRTY` in the same transaction.
- Run PostgreSQL migration/concurrency checks and frontend Playwright only against the isolated `_test` database on the dedicated test container. Never reset/drop the workspace `.env` database or edit `.env`.
- Before Next.js edits, read `apps/web/AGENTS.md` and the installed Next.js 16 route/data guide under `apps/web/node_modules/next/dist/docs/`. Capture desktop and mobile screenshots; no Hallmark pass is claimed unless a reproducible project runner is found.

---

## File Map

### API

- `apps/api/prisma/schema.prisma` and a forward-only migration: lifecycle values, actor/time/reason fields, relations, and due-in/due-out indexes.
- `apps/api/src/bookings/booking-lifecycle.ts` and `booking-lifecycle.spec.ts`: legal transitions and idempotency decisions.
- `apps/api/src/bookings/bookings.service.ts`: transactional walk-in creation, check-in, no-show release, and future amendment orchestration.
- `apps/api/src/bookings/staff-bookings.service.ts` / `staff-bookings.controller.ts`: protected operations and existing booking detail integration.
- New focused DTOs under `apps/api/src/bookings/dto/`: walk-in, check-in, no-show, amendment, room-move, and front-desk query/response shapes.
- `apps/api/src/rooms/room-assignment.service.ts`: expose narrowly-scoped lock/readiness helpers for check-in and dated room moves; do not weaken HPM-003 assignment checks.
- `apps/api/src/rooms/room-board.service.ts` and DTOs: checked-in assignments provide occupancy while confirmed assignments remain assignable stays.
- `apps/api/test/staff-stays.database-spec.ts` and `staff-stays.e2e-spec.ts`: real PostgreSQL state, locking, counter, role, privacy, and HTTP behavior.

### Web

- New routes under `apps/web/src/app/staff/(dashboard)/front-desk/{arrivals,in-house,departures}/page.tsx`.
- New focused components under `apps/web/src/components/staff/front-desk/`: worklists, stay detail/actions, walk-in form, amendment form, and move/check-in/no-show confirmations; use CSS modules and existing RTL tokens.
- `apps/web/src/lib/staff-api.ts` or a focused `staff-front-desk-api.ts`: typed API methods and safe response parsing.
- `apps/web/src/components/staff/staff-dashboard-shell.tsx` and `apps/web/src/lib/staff-navigation.ts`: role-gated reception links and role-first destinations.
- `apps/web/src/components/staff/room-board/**`: checked-in stay labels and occupancy integration.
- `apps/web/src/components/booking/booking-flow.tsx` and its existing tests; `apps/web/src/app/(public)/booking/page.tsx`: show the pending-request reference and staff follow-up using the guest's submitted phone, and render the public property phone only when configured.
- New focused unit tests under `apps/web/src/components/staff/front-desk/` and `apps/web/e2e/staff-front-desk.spec.ts`; extend public booking confirmation tests for configured and null property phone.

## Tasks

### Task 1: Lifecycle schema and pure rules

**Files:** modify `apps/api/prisma/schema.prisma`, add a forward migration under `apps/api/prisma/migrations/`, modify `apps/api/src/bookings/booking-lifecycle.ts` and `booking-lifecycle.spec.ts`, and update lifecycle enums in booking DTOs.

- [x] Add failing table-driven tests for `CONFIRMED → CHECKED_IN`, `CONFIRMED → NO_SHOW`, retry idempotency, invalid transitions, and the terminal `CHECKED_OUT`/`NO_SHOW` states. Assert that existing pending/confirm/reject/cancel/expire decisions stay byte-for-byte equivalent.
- [x] Run `pnpm --filter @hotel/api test -- booking-lifecycle.spec.ts`; confirm failures are the missing stay transitions, not a test/setup error.
- [x] Add `CHECKED_IN`, `CHECKED_OUT`, and `NO_SHOW` to the Prisma enum and TypeScript lifecycle union. Add nullable checked-in/checked-out/no-show actor and timestamp fields plus `noShowReason`; add explicit `StaffUser` relations and indexes for status/check-in and status/check-out queries.
- [x] Generate a forward-only migration. Deploy it as an upgrade to isolated `hotel_hpm003_test` on port 55432 and as a fresh migration to a separate `_test` database in the same isolated container. Do not reset/drop either database.
- [x] Update the pure lifecycle resolver and run the focused lifecycle tests until green. Do not add a checkout action; `CHECKED_OUT` remains a schema-ready state for HPM-008.
- [x] Commit the schema/rules slice after `pnpm --filter @hotel/api exec prisma validate`, focused tests, and `git diff --check` pass.

### Task 2: Worklist query contract and front-desk API

**Files:** create the front-desk query/response DTOs and focused query/service module under `apps/api/src/bookings/`; extend `staff-bookings.controller.ts` or register a small controller in `bookings.module.ts`; add tests in `apps/api/test/staff-stays.e2e-spec.ts`.

- [x] Add failing HTTP tests for business-date defaulting, explicit valid Gregorian date, inclusive arrival and exclusive checkout, overdue due-ins, checked-in in-house stays, due-outs, filters by guest/reference/room, pagination, and private no-store headers.
- [x] Run the focused API e2e spec against the isolated `_test` database and verify the expected `404`/empty/list failures before adding endpoints.
- [x] Define `GET /staff/front-desk/arrivals`, `/in-house`, and `/departures` with `date`, `search`, `page`, and `pageSize`. Return only reference, guest name, stay dates, room type, unit count, minimal assigned-room/readiness state, and lifecycle timestamps needed by reception; omit phone, email, and folio amounts from worklist cards.
- [x] Require `MANAGE_BOOKINGS`, staff session, CSRF for mutations, and private no-store responses. Search only reference/name/room number. Sort deterministically by due date, then reference.
- [x] Run the focused API e2e suite and commit the query/API contract once the date boundaries, permission denial, privacy shape, and no-store assertions pass.

### Task 3: Walk-in, check-in, and no-show transactions

**Files:** modify `bookings.service.ts`, `staff-bookings.service.ts`, `room-assignment.service.ts`, and front-desk DTO/controller files; add unit and PostgreSQL tests in `apps/api/src/bookings/` and `apps/api/test/staff-stays.database-spec.ts`.

- [x] Add failing PostgreSQL tests for walk-in idempotency, two requests competing for the final room, check-in without a complete assignment set, dirty/uninspected/blocked/conflicting rooms, manager early-check-in reason/role, unchanged check-in counters, no-show reason, one-time future-only release, and check-in/no-show race serialization.
- [x] Run only `staff-stays.database-spec.ts` on the isolated test database; verify the new cases fail because their operations do not yet exist.
- [x] Implement `POST /staff/bookings/walk-ins` with a required idempotency key. It creates a same-business-date confirmed stay, locks inventory nights in order, creates immutable `BookingNight` prices, increments `bookedRooms` directly (never held rooms), and audits the actor atomically.
- [x] Implement `POST /staff/bookings/:reference/check-in`. Lock the booking first, then the room type and sorted assigned room rows. Re-read status, hotel business date/time, assignments, blocks, room activity/type/readiness, and require room-quantity coverage for every remaining stay night. Manager override affects only the time threshold.
- [x] Implement `POST /staff/bookings/:reference/no-show` with required reason. Allow it only for an unhandled due-in stay after the configured same-day check-in time or on a later business date before checkout. Lock booking, room type, rooms, and future inventory in that order; deactivate assignments and decrement only current/future `bookedRooms`; preserve past snapshots and write one audit event. An exact repeated no-show returns the stored state without another decrement/audit.
- [x] Add real unit/API/PostgreSQL checks for status, actor/time fields, response privacy, all-or-nothing rollback, duplicate idempotency, and races. Run the focused tests to green and commit this slice.

### Task 4: Future amendments and in-house room moves

**Files:** extend the booking operation DTOs/service and room-assignment service; add focused tests to `staff-stays.database-spec.ts` and `staff-stays.e2e-spec.ts`.

- [x] Add failing database tests for same-day-before-check-in and future amendments, unchanged-night prices, new-night current prices, room-quantity counter deltas, sold-out rollback, assignment-invalidating rejection, checked-in denial, valid/invalid move targets, reason/audit, and same-date move boundaries.
- [x] Run the focused database tests to confirm they fail for the missing operations.
- [x] Implement `PATCH /staff/bookings/:reference` for dates, room quantity, guest count, and guest contact fields only. Exclude room-type changes. Under booking then room-type/room/inventory locks, preserve unchanged-night rates, price added nights at current rates, update removed/added/quantity counters by delta, and update `BookingNight` plus total atomically. Reject changes that move active assignments outside the stay or reduce quantity below active assignments; do not auto-reassign rooms. Increases may leave added nights or units unassigned for staff to resolve later; check-in still requires complete coverage.
- [x] Implement `POST /staff/bookings/:reference/room-move` for one currently assigned room. Require the exact active source assignment ID, a reason, checked-in state, current business date, active same-type inspected target, no block/assignment conflict for the remaining interval, and sorted room locks. Deactivate that source assignment, create the new active interval starting today, mark the vacated source room `DIRTY`, and write one allowlisted audit event in the same transaction. Expose the assignment ID in the staff worklist so delayed retries cannot match a later reuse of the same physical room.
- [x] Preserve non-zero assignment intervals: for a move on the original assignment's start date, retain the inactive original interval and record the exact effective business date in the move audit rather than persisting an invalid zero-length interval.
- [x] Test rollback, retries, assignment history, and counters; run focused API unit/database/e2e suites to green, then commit this slice.

### Task 5: Occupancy board integration

**Files:** modify `apps/api/src/rooms/room-board.service.ts` and DTO/tests; modify `apps/web/src/lib/staff-api.ts` and room-board tests as needed.

- [x] Add a failing API test proving a checked-in reservation is shown as `OCCUPIED` with its active room context while a merely confirmed reservation remains reserved/arriving.
- [x] Run the focused room-board tests and verify that checked-in assignment contexts are currently omitted or mislabeled.
- [x] Include checked-in bookings in occupancy context while keeping the assignable editor limited to confirmed stays. Preserve date filtering, complete assignment intervals, and all HPM-003 revision semantics.
- [x] Replace the existing room-block relation join with a separately awaited query inside the same RepeatableRead transaction to remove the pg@9 concurrent-query deprecation; preserve room occupancy and assignment semantics.
- [x] Update client status unions and Persian text labels; verify occupancy is never conveyed by color alone and private data remains absent.
- [x] Run room-board API/web unit tests and focused desktop/mobile board Playwright; commit the integration.

### Task 6: Preserve the guest request follow-up promise

**Files:** modify `apps/web/src/components/booking/booking-flow.tsx`, `apps/web/src/components/booking/booking-flow.test.tsx`, and `apps/web/src/app/(public)/booking/page.tsx`.

- [x] Add failing component tests for a configured hotel phone, `contactPhone: null`, and the guest's own submitted phone after a successful public request. Assert no empty `tel:` anchor or placeholder contact is rendered.
- [x] Run `pnpm --filter @hotel/web test -- booking-flow.test.tsx`; confirm the missing follow-up copy/contact state causes the failures.
- [x] Pass the public hotel's nullable contact phone from the existing server route into `BookingFlow`. Retain the guest-entered phone in client state only for the current confirmation view; do not add it to the public booking response, route, URL, or logs.
- [x] Keep the result explicitly `PENDING_CONFIRMATION`, show the booking reference, say staff will follow up using the submitted number, and render a property call link only for a configured valid phone.
- [x] Run the focused component test and public booking Playwright after the fix. Keep the change localized to the confirmation function and its route prop; do not reformat unrelated booking-form code.

### Task 7: Responsive Persian front-desk workspaces

**Files:** create the three front-desk routes, focused UI components/CSS module, staff API methods/types and tests; update `staff-dashboard-shell.tsx`, `staff-navigation.ts`, and room-board UI.

- [ ] Add failing component tests for role denial, loading/empty/error/retry, due-in and due-out states, readiness blockers, check-in/no-show confirmation, manager-only early override, walk-in idempotency UI, amendment preview, room move validation, and success/error focus handling.
- [ ] Run the new web unit tests and verify failures describe missing UI states.
- [ ] Build desktop worklist/detail layouts and mobile cards for arrivals, in-house, and departures. Show arrivals due today and overdue separately; show checked-in stays in-house and due-outs without a fake checkout action. Keep search/date/filter state after actions and refresh server state after success.
- [ ] Add walk-in creation to arrivals, full assignment/readiness feedback and check-in/no-show actions to due-ins, a reasoned room-move action to in-house stays, future-only amendments in stay detail, and an informational departures list. Link assignment blockers to `/staff/rooms`.
- [ ] Add role-aware navigation for ADMIN/MANAGER/RECEPTIONIST and set role home routes to the appropriate front-desk queue without exposing worklists to housekeeping.
- [ ] Read the Next.js 16 route and data-fetching guides before route edits. Use the existing staff client, RTL tokens, CSS modules, accessible labels/focus/live announcements, confirmation semantics, 44px touch targets, and no horizontal overflow at 320px/390px.
- [ ] Run focused component tests, TypeScript, scoped ESLint, `git diff --check`, and frontend Playwright before Designer review. Capture desktop and mobile screenshots.

### Task 8: Specialist review, release evidence, and merge

**Files:** update `docs/implementation-tickets.md`, this plan, API OpenAPI annotations/DTO docs, and only release-relevant setup documentation; do not update root `README.md` until HPM-010.

- [ ] Run focused API unit, PostgreSQL, HTTP E2E, web unit, and room-board/front-desk Playwright; run `pnpm check` only after verifying its database URL resolves to the isolated test container. Do not test against the main `.env` database.
- [ ] Have Backend Senior review transaction/lock/counter correctness; have FDM review the Next.js implementation; run frontend E2E before Designer and Tester browser review. For each found issue, fix test-first, rerun the affected E2E, and request reviewer recheck.
- [ ] Have Designer review full-size desktop/mobile screenshots for Persian RTL hierarchy, focus/overflow, touch targets, and visible status/readiness; do not claim a Hallmark pass without a runnable project tool.
- [ ] Have Tester verify guest request compatibility, receptionist and manager roles, walk-in, arrivals/in-house/departures, early/late/no-show, amendment/move, negative/retry paths, keyboard use, and responsive behavior after E2E passes.
- [ ] Record exact commands/counts, isolated DB target, screenshots, review outcomes, and any manual-review limitations in the ticket register. Run `git diff --check` and inspect the complete branch diff for secrets/unrelated files.
- [ ] Mark HPM-004 Done only after acceptance/checks/reviews pass, fast-forward merge into local `main`, confirm the merge commit, and remove the HPM-004 Git worktree registration and branch. Preserve unrelated dirty main-checkout paths.

