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

- [x] Add failing DB/API tests for room-number uniqueness/replacement, room-type ownership, historical capacity projection, date-range capacity with a missing nightly rate, rejection of browser-supplied capacity, deactivation below held/booked capacity, deactivation with an overlapping active assignment, and deactivate/reactivate projection round trips. Deactivation must lock the room row; HPM-003 tests serialization against real assignment operations.
- [x] Migrate `Room` with hotel/type, room number, `isGenerated`, optional floor/features, active flag, and housekeeping status; add the minimal dated `RoomBlock` model with `OUT_OF_ORDER`/`CAPACITY_CLOSED` kinds, the `RoomAssignment` persistence foundation (booking/room/date interval/active/assigner/reason), and Hotel `checkInTime`/`checkOutTime` wall-clock settings (demo defaults 15:00/11:00). Preserve inventory rates, holds, bookings, and price snapshots. Backfill physical units to each type's historical maximum capacity; use date blocks on excess units to preserve every lower legacy nightly capacity. Generated backfill rooms start `DIRTY` until verified; the fictional demo seed explicitly marks its rooms `INSPECTED`. Mark generated labels for replacement with real room numbers before production.
- [x] Add service/controller/DTO operations to list, create, edit room number and descriptive fields, deactivate, and reactivate physical rooms. Replacing a generated room number clears `isGenerated` after hotel-level uniqueness validation. In one transaction, lock the room row and recompute nightly `totalRooms = activeRooms - distinctActiveBlocks`; reject deactivation below held/booked counts or with any active assignment overlapping current/future dates. A newly inserted nightly price row must use the same projection.
- [x] Change inventory updates to nightly price only and display derived capacity. Current/future date-range reads return projected capacity and zero counters for dates without a rate row, with a nullable rate. Persist `blockedRooms` with each current/future projection. Preserve all past capacity/counter snapshots without reprojecting them; past rows without a snapshot return `UNAVAILABLE` with nullable capacity fields. Historical rate writes are rejected, and rate-only updates touch only the requested range. Writes reject any browser-supplied `totalRooms`. Seed fictional rooms as inspected for the existing demo arrivals; do not seed guest data.
- [x] Add protected `/staff/rooms/manage` in Persian RTL with floor/type/active/search filters, generated-label indicator, room create/edit/deactivate/reactivate actions, and clear conflict feedback, using existing tokens and CSS modules.
- [x] Run focused API unit, PostgreSQL migration/integration, API e2e, web unit, lint/typecheck, and the web E2E suite before marking done. Final browser suite: 38/38 desktop/mobile; manual reviewer confirmed guest, staff, inventory, room lifecycle, responsive, keyboard, and receptionist flows. A 390×844 currency-wrap issue found in manual review was fixed, covered by geometry assertion, and manually rechecked.

**HPM-001 completion record (2026-11-16):** `966e987` persists `blockedRooms` for seeded snapshots; `d862b01`, `8ff7c13`, and `7bbe3ee` refine the mobile staff flows and repair the RTL rate equation; `0896dbf` updates stale unit assertions to the current accessible booking labels and availability copy. Full PostgreSQL suite passed (6 suites / 29 tests), API typecheck/lint passed, full web unit suite passed (23 files / 114 tests), focused web typecheck/lint passed, and Playwright passed 38/38 on the isolated `hotel_hpm001_test` database. Designer and manual tester reviewed the responsive screens; the tester verified the final 390×844 fix and admin/receptionist access boundaries. Chrome tests used the configured installed-browser path. The project has no Hallmark runner; no Hallmark pass is claimed.

## Ticket HPM-003 — Room board and assignments

**Worktree:** `../Hotel Booking system-worktrees/HPM-003`

**Dependencies:** HPM-001, HPM-002
**Files:** `apps/api/src/rooms/**`, `apps/api/src/bookings/**`, assignment operations on the `RoomAssignment` persistence foundation from HPM-001, staff room-board DTOs/tests, `apps/web/src/components/staff/room-board/**`, `/staff/rooms` route/nav, Playwright specs.

- [x] Add failing PostgreSQL tests for overlapping assignment conflicts, room-type mismatch, assignment outside booking dates, out-of-order block conflict, multi-room assignments, unassigned arrivals, concurrent assignment contention, and assignment/deactivation serialization on the shared room-row lock.
- [x] Implement dated assignment operations on the `RoomAssignment` persistence foundation from HPM-001, including booking, physical room, inclusive-start/exclusive end, assigning actor, reason, and active history. Lock candidate room rows and verify no overlapping assignment or active block before commit. Use the shared room-row lock used by deactivation/check-in; when also locking room type for capacity, follow room-type then room-row lock order.
- [x] Expose a staff room-board query with date, room/type/floor, occupancy, housekeeping, and block filters. Return occupancy and upcoming stay context separately from housekeeping condition.
- [x] Allow staff to assign and unassign rooms for confirmed bookings. Preserve aggregate booking counters and idempotency; HPM-004 requires a complete set of distinct room assignments before check-in.
- [x] Build `/staff/rooms` as the default-business-date RTL board. Refresh every 30 seconds; provide manual refresh, last-updated time, stale-on-failure state, filters, and text/icon combinations for vacant+inspected, vacant+dirty, arriving, occupied, departing, and out-of-order.
- [x] Run PostgreSQL concurrency/integration, API e2e/role checks, web unit, Playwright desktop/mobile, lint, and typecheck.

### Task 1: Assignment operations and room-board API

- [x] Add a booking-scoped PUT /staff/bookings/:reference/room-assignments that reconciles the desired assignment interval set in one transaction. API/database dates are Gregorian YYYY-MM-DD, timestamps are UTC, the hotel timezone defines business date, and intervals are inclusive-start/exclusive-end inside the confirmed booking. Require a reason, preserve removed rows as inactive history, and make identical-set retries idempotent without duplicate audit events. Return an opaque revision derived from complete retained assignment history; require the editor's expected revision for a changed set and return `ROOM_ASSIGNMENT_STALE` (409) before writes when another editor has changed it. Enforce the staff capability server-side, audit consequential changes atomically, and return private, no-store responses.
- [x] Enforce matching room type, active rooms, no conflicting active assignment or active block over each requested interval, unique room IDs, and no more assigned room units than the booking quantity. Assignment operations do not change booking or nightly inventory counters or public booking idempotency. Validate the entire desired set before writes and roll back the whole replacement if any room conflicts.
- [x] When staff cancels a confirmed booking, deactivate its active room assignments and write safe audit history in the same transaction as the existing cancellation/inventory release. Preserve lock order: booking row, room type, affected room rows in sorted order, then inventory rows.
- [x] In one transaction, lock the room-type row before the physical room row, then serialize against concurrent assignments and deactivation. Re-read current booking/room/assignment state after locks, write safe audit events atomically, and return stable conflict codes.
- [x] Add a private, no-store room-board query defaulting to the hotel's business date, with date, room type, floor, occupancy, housekeeping, stay-context, and block filters. Return occupancy and reservation context as separate fields. Include confirmed bookings overlapping the selected date with their complete active assignment interval set (regardless of visible room-card filters), room type label, an assignment-history revision, and unassigned unit count for the selected board date so the client can safely submit the full desired set; omit guest phone/email.
- [x] Add focused unit/API/PostgreSQL tests for overlap boundaries, wrong type, invalid dates, active blocks, multi-room assignment limits, unassigned confirmed bookings, identical-set idempotent retries, counters unchanged, unauthorized roles, all-or-nothing failed replacements, reversed room order, concurrent assignment/deactivation on the shared room lock, and cancellation-versus-assignment with atomic assignment release.

### Task 2: Staff room-board page and assignment workflow

- [x] Add protected `/staff/rooms` using the current role-aware staff shell, RTL tokens, CSS modules, and the Next.js 16 route guide. Keep `/staff/rooms/manage` as the physical catalog page; navigation must expose the operational board to authorized reception staff. Browser requests for private staff data must set fetch cache to `no-store`.
- [x] Render all rooms and any stay context with explicit Persian text and icon labels, including vacant+inspected, vacant+dirty, arriving/reserved, departing, active blocks, and true occupied state when the API has lifecycle evidence. Do not infer occupancy from a reservation assignment.
- [x] Add filters for date, room type, floor, occupancy, housekeeping, and block/stay context as separate dimensions. Default to the API business date, refresh every 30 seconds, provide manual refresh and last-updated time, retain the last board on refresh failure, and mark stale data clearly.
- [x] Let staff choose a confirmed booking, edit its full desired assignment set from the complete board assignment intervals, and save additions/removals atomically with a reason and the revision captured when editing begins; show the assigned stay dates and minimal reference/guest name context without contact details. `unassignedRoomQuantity` means unassigned units on the selected board date. On `ROOM_ASSIGNMENT_STALE` (409), load and show the latest complete assignments and keep the user's draft separate; require explicit review/confirmation of which set to apply before retrying with the new revision.
- [x] Add client/component tests for loading, empty, errors, filters, stale refresh, labels, and assignment outcomes; add desktop/mobile Playwright coverage for authorized access, assignment/unassignment, and responsive layout. Capture desktop and mobile screenshots for designer review.

HPM-003 execution ruling: Confirmed room assignments do not prove physical occupancy. The existing booking lifecycle has no CHECKED_IN state until HPM-004, so this ticket reports a reserved/arriving/departing context and only emits OCCUPIED when lifecycle evidence exists. That avoids showing a reserved room as vacant while keeping occupancy truthful.

**Task 1 completion record (2026-11-16):** API implementation and two review-fix rounds are committed through `d9910b7`. Final API unit tests passed (20 suites/105 tests), PostgreSQL tests (8 suites/42 tests), and HTTP E2E (14 suites/96 tests); API typecheck/lint and formatting passed. Fix round 2 adds the assign → clear → stale retry regression and verifies no extra audit or assignment writes. The scoped independent review found no remaining issues.

**Task 2 completion record (2026-11-16):** The protected room board, navigation, no-store client, complete-set editor, and stale-revision choices shipped in `5af96a2`; Designer clarity polish shipped in `c658b5a`. Web unit tests passed (29 files/163 tests), typecheck and scoped lint passed, and Playwright passed 42/42 across desktop/mobile; after the Designer label change, the focused room-board run passed 2/2. Designer reviewed both screenshots and found no layout blocker. Tester completed screenshot-only visual review; a separate live-session launch was rejected by automatic policy before any server or credentials started, so manual role/action checks are not claimed. Functional flows remain covered by Playwright. The project has no reproducible Hallmark runner; no Hallmark pass is claimed.

**HPM-003 completion record (2026-11-16):** API, web, and visual-polish changes are ready through `c658b5a`; see the implementation ticket register for the full verification counts and review notes.

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
