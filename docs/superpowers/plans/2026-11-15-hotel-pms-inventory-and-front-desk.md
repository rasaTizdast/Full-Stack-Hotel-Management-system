# Hotel PMS Inventory and Front Desk Implementation Plan

> **For agentic workers:** Implement one ticket at a time in its own Git worktree, use test-first development, obtain the role reviews listed in `docs/implementation-tickets.md`, then merge and remove that ticket's worktree.

**Goal:** Give staff a reliable view of each physical room and carry a guest request through assignment, arrival, occupancy, and room moves.

**Architecture:** Keep the existing modular monolith. `Room` is the physical unit, `RoomAssignment` reserves that unit for a date interval, and `RoomNightInventory` retains rates plus transactional counters while `totalRooms` becomes a projection of active rooms minus dated blocks. Booking transitions remain server-authoritative and transactional.

**Tech Stack:** NestJS 11, TypeScript, Prisma 7, PostgreSQL, Next.js 16 App Router, React 19, Vitest, Jest, Supertest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-pms-physical-inventory-and-stays-design.md`; policy decision: `docs/decisions/ADR-002-hotel-pms-scope.md`.

## Global Constraints

- Keep the product single-property and Persian-first with RTL layout.
- Keep API/storage dates Gregorian `YYYY-MM-DD`; check-in is inclusive and checkout exclusive; timestamps are UTC and business-date calculations use the Hotel timezone.
- Store money as integer Toman; the API/database remain authoritative.
- Keep public booking idempotency, inventory row locking, and existing hold/status behavior; preserve existing booking and per-night price snapshots.
- Derive sellable room capacity from physical rooms and dated out-of-order blocks; do not maintain a second staff-editable capacity source.
- Require authenticated server-side permission checks and audit consequential staff actions.
- Every behavior change begins with a failing focused test; database constraints/concurrency use PostgreSQL integration tests, not SQLite or mocked transaction guarantees.
- Complete each ticket in its own `codex/hpm-*` worktree; merge only after its tests and role review pass, then remove its worktree and branch.
- Before any Next.js change, read `apps/web/AGENTS.md` and the installed Next.js 16 documentation at `apps/web/node_modules/next/dist/docs/`, including the guide relevant to the route/API change. Every private staff fetch uses request `cache: 'no-store'`, and every staff API response sets `Cache-Control: private, no-store`; tests assert both sides of this policy.
- Use tracked global RTL tokens and CSS-module patterns from the clean branch; do not depend on the main checkout's uncommitted UI primitives. Capture desktop/mobile screenshots for designer review. Existing Hallmark artifacts are historical; no Hallmark skill/runner is registered in the project.

---

## Ticket HPM-001 — Physical rooms and capacity projection

**Worktree:** `../Hotel Booking system-worktrees/HPM-001`

**Dependencies:** HPM-000 planning ticket
**Files:** `apps/api/prisma/schema.prisma`, a forward migration, `apps/api/prisma/seed.ts`, `apps/api/src/rooms/**`, `apps/api/src/staff-inventory/**`, `apps/api/test/**`, `apps/web/src/components/staff/rooms/**`, `apps/web/src/app/staff/(dashboard)/rooms/manage/**`, inventory editor and its tests, OpenAPI docs.

- [ ] Add failing DB/API tests for room-number uniqueness/replacement, room-type ownership, historical capacity projection, date-range capacity with a missing nightly rate, rejection of browser-supplied capacity, deactivation below held/booked capacity, deactivation with an overlapping active assignment, and deactivate/reactivate projection round trips. Deactivation must lock the room row; HPM-003 tests serialization against real assignment operations.
- [ ] Migrate `Room` with hotel/type, room number, `isGenerated`, optional floor/features, active flag, and housekeeping status; add the minimal dated `RoomBlock` model with `OUT_OF_ORDER`/`CAPACITY_CLOSED` kinds, the `RoomAssignment` persistence foundation (booking/room/date interval/active/assigner/reason), and Hotel `checkInTime`/`checkOutTime` wall-clock settings (demo defaults 15:00/11:00). Preserve inventory rates, holds, bookings, and price snapshots. Backfill physical units to each type's historical maximum capacity; use date blocks on excess units to preserve every lower legacy nightly capacity. Generated backfill rooms start `DIRTY` until verified; the fictional demo seed explicitly marks its rooms `INSPECTED`. Mark generated labels for replacement with real room numbers before production.
- [ ] Add service/controller/DTO operations to list, create, edit room number and descriptive fields, deactivate, and reactivate physical rooms. Replacing a generated room number clears `isGenerated` after hotel-level uniqueness validation. In one transaction, lock the room row and recompute nightly `totalRooms = activeRooms - distinctActiveBlocks`; reject deactivation below held/booked counts or with any active assignment overlapping current/future dates. A newly inserted nightly price row must use the same projection.
- [ ] Change inventory updates to nightly price only and display derived capacity. Current/future date-range reads return projected capacity and zero counters for dates without a rate row, with a nullable rate. Persist `blockedRooms` with each current/future projection. Preserve all past capacity/counter snapshots without reprojecting them; past rows without a snapshot return `UNAVAILABLE` with nullable capacity fields. Historical rate writes are rejected, and rate-only updates touch only the requested range. Writes reject any browser-supplied `totalRooms`. Seed fictional rooms as inspected for the existing demo arrivals; do not seed guest data.
- [ ] Add protected `/staff/rooms/manage` in Persian RTL with floor/type/active/search filters, generated-label indicator, room create/edit/deactivate/reactivate actions, and clear conflict feedback, using existing tokens and CSS modules.
- [ ] Run focused API unit, PostgreSQL migration/integration, API e2e, web unit, lint/typecheck, and the web E2E suite before marking done.

## Ticket HPM-003 — Room board and assignments

**Worktree:** `../Hotel Booking system-worktrees/HPM-003`

**Dependencies:** HPM-001, HPM-002
**Files:** `apps/api/src/rooms/**`, `apps/api/src/bookings/**`, assignment operations on the `RoomAssignment` persistence foundation from HPM-001, staff room-board DTOs/tests, `apps/web/src/components/staff/room-board/**`, `/staff/rooms` route/nav, Playwright specs.

- [ ] Add failing PostgreSQL tests for overlapping assignment conflicts, room-type mismatch, assignment outside booking dates, out-of-order block conflict, multi-room assignments, unassigned arrivals, concurrent assignment contention, and assignment/deactivation serialization on the shared room-row lock.
- [ ] Implement dated assignment operations on the `RoomAssignment` persistence foundation from HPM-001, including booking, physical room, inclusive start/exclusive end, assigning actor, reason, and active history. Lock candidate room rows and verify no overlapping assignment or active block before commit. Use the shared room-row lock used by deactivation/check-in; when also locking room type for capacity, follow room-type then room-row lock order.
- [ ] Expose a staff room-board query with date, room/type/floor, occupancy, housekeeping, and block filters. Return occupancy and upcoming stay context separately from housekeeping condition.
- [ ] Allow staff to assign and unassign rooms for confirmed bookings. Require one distinct unit per booked room before check-in; preserve aggregate booking counters and idempotency.
- [ ] Build `/staff/rooms` as the default-business-date RTL board. Refresh every 30 seconds; provide manual refresh, last-updated time, stale-on-failure state, filters, and text/icon combinations for vacant+inspected, vacant+dirty, arriving, occupied, departing, and out-of-order.
- [ ] Run PostgreSQL concurrency/integration, API e2e/role checks, web unit, Playwright desktop/mobile, lint, and typecheck.

## Ticket HPM-004 — Front-desk stay operations

**Worktree:** `../Hotel Booking system-worktrees/HPM-004`

**Dependencies:** HPM-001, HPM-002, HPM-003
**Files:** booking lifecycle schema/migration, `apps/api/src/bookings/**`, staff operation query/module, staff route/components for arrivals/departures/in-house, API/web tests, Swagger, README section draft.

- [ ] Add failing service and DB tests for each legal state transition, walk-in races, check-in readiness/time/manager override, no-show release, room move boundaries, and repeat actions.
- [ ] Add `CHECKED_IN`, `CHECKED_OUT`, and `NO_SHOW` lifecycle values and actor/time fields without changing existing pending/confirmed/rejected/canceled/expired semantics.
- [ ] Add authenticated walk-in creation, due-in/in-house/due-out lists, check-in requiring a full conflict-free assignment of inspected rooms, no-show with reason, future reservation amendments, and in-house room moves. Normal check-in starts at property time; early check-in requires manager reason; late arrival remains due-in until staff action. Keep financial checkout for HPM-008.
- [ ] Allow amendments only before check-in. Preserve unchanged-night price snapshots, use current rates for newly added nights, and reject changes invalidating room assignments until staff resolves them. Make actions transactional with counters, BookingNight rows, assignments, room state, and audit records.
- [ ] Build arrival, in-house, and departure worklists with reference/name/room filters and concise Persian action dialogs.
- [ ] Preserve the existing pending-request promise on public confirmation; show the reference and say staff will follow up using the guest's submitted phone. Show the property phone only when configured; verify both configured and null `Hotel.contactPhone` cases render without empty/placeholder links. Do not imply a confirmed stay or add a guest account/self-service status route.
- [ ] Run focused API unit/database/e2e, web unit, frontend Playwright, lint/typecheck, and verify current booking flows remain green. Only then request designer visual review and tester manual-flow review.

## Merge gate

For each ticket: update the ticket register, inspect `git diff --check` and the full diff, verify no secrets or unrelated files, record commands/results, have the named specialist review it, merge to `main`, confirm the merge commit, and remove only that ticket's worktree/branch. Keep any failed ticket open in its worktree.
