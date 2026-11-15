# Hotel PMS Housekeeping and Maintenance Implementation Plan

> **For agentic workers:** Implement one ticket at a time in its own Git worktree, use test-first development, obtain the role reviews listed in `docs/implementation-tickets.md`, then merge and remove that ticket's worktree.

**Goal:** Coordinate room cleaning and repair work while preventing staff from treating an occupied, dirty, or blocked room as ready.

**Architecture:** Store occupancy through stay assignments, housekeeping condition on physical rooms, work in task/request records, and out-of-order blocks as dated inventory-affecting records. Update capacity, blocks, and audit events in one transaction.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Next.js, TypeScript, Vitest, Jest, Supertest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-pms-housekeeping-and-maintenance-design.md`; shared policy: `docs/decisions/ADR-002-hotel-pms-scope.md`.

## Global Constraints

- Keep occupancy, housekeeping condition, and maintenance availability as distinct states.
- `DIRTY`, `CLEAN`, and `INSPECTED` are the initial housekeeping states; default check-in requires `INSPECTED`.
- Only an explicit dated out-of-order block reduces sellable capacity; an open repair request alone does not.
- Room block dates use inclusive start/exclusive end; block operations cannot invalidate held/booked inventory.
- Housekeeping users cannot view folio balances or mutate rates; all API actions enforce roles and write audit history.
- Use Persian RTL UI, accessible text/icon status labels, Gregorian API dates, and integer Toman for any displayed price.
- Write and observe a failing test before production code; prove inventory races against PostgreSQL.
- Each HPM ticket gets its own Git worktree, passes its checks/review, merges, and is removed before the next ticket starts.
- Before Next.js edits, read `apps/web/AGENTS.md` and the installed Next.js 16 documentation at `apps/web/node_modules/next/dist/docs/`, including the guide relevant to the route/API change. Every private staff fetch uses request `cache: 'no-store'`, and every staff API response sets `Cache-Control: private, no-store`; tests assert both sides of this policy. Use tracked RTL tokens/CSS modules; do not depend on uncommitted primitives.
- Capture desktop/mobile screenshots for designer review. Existing Hallmark artifacts are historical; no Hallmark skill/runner is registered in this repository, so do not claim a fresh Hallmark pass without identifying a reproducible command.

---

## Ticket HPM-005 — Housekeeping statuses and task board

**Worktree:** `../Hotel Booking system-worktrees/HPM-005`

**Dependencies:** HPM-001, HPM-002, HPM-003, HPM-004
**Files:** room housekeeping/task migration; `apps/api/src/housekeeping/**`; role guards and audit integration; `apps/web/src/components/staff/housekeeping/**`; `/staff/housekeeping` route/nav; unit/database/API/Playwright tests.

- [ ] Add failing tests for allowed/denied status transitions, task assignment/completion idempotency, actor history, check-in blocking until inspection, and discrepancy report/resolve/dismiss permissions.
- [ ] Add housekeeping task records with room, task type, business date, priority, assignee, state, created/completed times, and short note; add `RoomDiscrepancy` records for SLEEP/SKIP observations. Add authenticated list/assign/complete/report/resolve endpoints with page/filter DTOs.
- [ ] Add status actions `DIRTY → CLEAN → INSPECTED`; checkout in HPM-008 will mark rooms dirty. Require task assignment or permission for completion; never change occupancy through a housekeeping action.
- [ ] Show due arrivals/departures, room/floor, priority, assignee, task status, and discrepancy queue. Exclude guest phone and billing details from housekeeping responses. Housekeeping may report a mismatch but only reception/manager may resolve it by stay action or reasoned dismissal.
- [ ] Build tablet-width Persian RTL `/staff/housekeeping` with fast status actions, keyboard access, non-color labels, loading/empty/error/success states, and accessible confirmation for completion. Exclude folio amounts and guest contact details.
- [ ] Run API unit/database/e2e and web unit tests; run frontend Playwright before manual tester review; test receptionist, housekeeping, manager, and admin boundaries.

## Ticket HPM-006 — Maintenance requests and out-of-order blocks

**Worktree:** `../Hotel Booking system-worktrees/HPM-006`

**Dependencies:** HPM-001, HPM-002, HPM-003, HPM-005
**Files:** maintenance migration; `apps/api/src/maintenance/**`, capacity projection service, audit tests; `apps/web/src/components/staff/maintenance/**`; `/staff/maintenance` route/nav; PostgreSQL/API/web/E2E tests.

- [ ] Add failing PostgreSQL cases for block date boundaries, block/booking race, rejection below reserved capacity, restoration, same-room overlapping block rejection, active assignment conflict, and safe repeated expiry/restoration.
- [ ] Add maintenance requests with category, description, priority, assignee, expected date, open/resolved timestamps, and resolution note. Add manager/reception views and role-guarded mutations.
- [ ] Add explicit `OUT_OF_ORDER` maintenance blocks and `CAPACITY_CLOSED` operating blocks using the table introduced in HPM-001. Lock the room and affected inventory rows and atomically recompute `totalRooms = activeRooms - distinctActiveBlocks`; reject blocks overlapping an assignment or reducing capacity below held/booked counts.
- [ ] Keep a maintenance request open independently of a room block; require an explicit user action to block sale. Do not implement the product-specific OOS sellability behavior in this release.
- [ ] Build `/staff/maintenance` repair queue and room block controls with date, floor, room, reason, assignee, status, and expected return filters.
- [ ] Run focused PostgreSQL/API tests, web unit and Playwright, lint/typecheck; then have designer inspect mobile and desktop and tester repeat the flow after the web E2E suite passes.

## Merge gate

Update `docs/implementation-tickets.md` with commit/worktree/test evidence. Inspect migration safety, PII scope, capacity rollback, accessibility, and role-specific serialization. Merge only after all ticket checks pass; remove that ticket's worktree and branch immediately after merge.
