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

**Worktree:** ../Hotel Booking system-worktrees/HPM-005

**Dependencies:** HPM-001, HPM-002, HPM-003, HPM-004
**Owner:** Backend senior + Front-end design master
**Files:** housekeeping Prisma migration; apps/api/src/housekeeping/**; role/capability and audit integration; apps/web/src/lib/staff-housekeeping-api.ts; apps/web/src/components/staff/housekeeping/**; staff route/navigation; unit, PostgreSQL, HTTP E2E, web unit, and Playwright tests.

### Frozen implementation contract

- Task types: DEPARTURE_CLEAN, STAYOVER_CLEAN, INSPECTION, GUEST_REQUEST, RE_CLEAN.
- Task states: OPEN, IN_PROGRESS, COMPLETED, CANCELLED. Priorities: LOW, NORMAL, HIGH, URGENT; default NORMAL. Completion outcomes: DONE and NEEDS_REWORK; NEEDS_REWORK is valid only for INSPECTION and requires a short reason.
- Receptionist, manager, and admin may create manual tasks. Managers/admins assign or reassign only to active HOUSEKEEPER staff and may cancel with a reason. Housekeepers may start and complete only tasks assigned to themselves; managers/admins may start or complete any task. No self-claim. Repeated completion returns the stored result and adds no duplicate audit event.
- Completed DEPARTURE_CLEAN, STAYOVER_CLEAN, or RE_CLEAN changes room condition to CLEAN. A passed INSPECTION changes CLEAN to INSPECTED. A failed INSPECTION records NEEDS_REWORK, changes the room to DIRTY, and creates one OPEN RE_CLEAN task. GUEST_REQUEST completion does not change room condition. Only an INSPECTED room passes the existing default check-in gate.
- HTTP routes: GET/POST /api/v1/staff/housekeeping/tasks; PATCH /api/v1/staff/housekeeping/tasks/:id/assignment; POST /api/v1/staff/housekeeping/tasks/:id/start; POST /api/v1/staff/housekeeping/tasks/:id/complete; POST /api/v1/staff/housekeeping/tasks/:id/cancel; GET /api/v1/staff/housekeeping/discrepancies; POST /api/v1/staff/housekeeping/rooms/:roomId/discrepancies; POST /api/v1/staff/housekeeping/discrepancies/:id/resolve; POST /api/v1/staff/housekeeping/discrepancies/:id/dismiss; GET /api/v1/staff/housekeeping/rooms; GET /api/v1/staff/housekeeping/assignees.
- Request payloads: task creation {roomId,taskType,businessDate,priority?,note?}; assignment {assigneeStaffUserId,priority?}; completion {outcome:DONE|NEEDS_REWORK,reason?}; task cancellation and discrepancy dismissal {reason}; discrepancy report {businessDate,observedOccupied,note}; start, resolve, and list actions have no request body beyond their query parameters.
- Roles: HOUSEKEEPER reads only assigned tasks, starts/completes own assignments, and reports discrepancies; RECEPTIONIST/MANAGER/ADMIN read room readiness, create tasks, and resolve/dismiss discrepancies; MANAGER/ADMIN assign/reassign/cancel and read assignable-housekeeper options; CASHIER is denied. Task-list businessDate is the board/reference date, defaulting to the current hotel business date; optional dueDate filters the exact task due date. Other filters are page, pageSize, roomId, floor, taskType, assigneeStaffUserId, status, and priority. Without dueDate, include OPEN/IN_PROGRESS tasks due on or before the board date plus all tasks due on that date; older completed/cancelled items appear only under an explicit dueDate filter. Return { businessDate, items, pagination: { page, pageSize, totalItems, totalPages } } following the existing staff-worklist envelope.
- Task items include safe room context, separate occupancy and condition, task state/type/priority/dueDate/outcome, isOverdue, arrivalDue, departureDue, assignee {id,username}, and permitted actions. Sort arrival readiness first, overdue departure cleans next, then other due work by priority and dueDate. Include minimal arrival/departure due context. The rooms endpoint returns active room options with room number/floor/condition/occupancy/due flags; the assignees endpoint returns active HOUSEKEEPER {id,username} options only to managers/admins. Omit guest names, booking references, guest contact details, prices, and folio data from all housekeeping responses. Every private fetch is no-store; API responses are private, no-store.
- A discrepancy report submits observedOccupied plus a short note; the server snapshots expected occupancy and derives SLEEP/SKIP. Reception, manager, and admin can resolve only after live occupancy matches the observation, or dismiss with a required reason. HPM-008 owns checkout-based SKIP correction. Room occupancy and housekeeping filters must remain separate. If an existing room-assignment board contract is reused, retain complete assignment intervals through filters; unassignedRoomQuantity means units unassigned on the selected board date.

### Task 1 — Persistence and transition rules (Backend senior)

**Files:** apps/api/prisma/schema.prisma; a new housekeeping migration; apps/api/src/housekeeping/housekeeping.rules.ts and unit tests; focused PostgreSQL tests.

- [x] Write failing unit tests for task transitions, assignment requirements, completion outcomes, failed-inspection re-clean creation rules, and forbidden occupancy changes.
- [x] Add task/discrepancy enums and tables with restrictive history-preserving relations, hotel scoping, created/updated and actor fields, and indexes for room/date, state/date, assignee/date, and discrepancy status/date.
- [x] Implement pure transition/validation rules for OPEN → IN_PROGRESS → COMPLETED and OPEN/IN_PROGRESS → CANCELLED; only inspection may return NEEDS_REWORK.
- [x] Run unit tests to observe the expected failures before production changes, then pass them and focused PostgreSQL migration/persistence tests.

### Task 2 — Transactional API, roles, audit, and privacy (Backend senior)

**Files:** apps/api/src/housekeeping/**; staff capability definitions; apps/api/src/audit/** only where needed; API HTTP E2E and database tests.

- [x] Add filtered, paginated task and discrepancy list DTOs; manual task creation; manager/admin assignment/cancellation; assigned-housekeeper start/completion; discrepancy report/resolve/dismiss endpoints.
- [x] Serialize condition changes, active-assignment reads, task completion, and audit writes in one transaction using the existing roomType → room lock order before re-reading occupancy/readiness.
- [x] Completion of cleaning/re-clean updates condition to CLEAN; passing inspection sets INSPECTED; failed inspection sets DIRTY and atomically records the inspection result plus one OPEN RE_CLEAN task. Keep occupancy and sellable capacity unchanged.
- [x] Derive SLEEP/SKIP server-side from the expected occupancy snapshot and observedOccupied. Reject reports without a mismatch. Require current occupancy to match observation before resolution; require reason for dismissal.
- [x] Add failing then passing API/unit/PostgreSQL tests for permissions, check-in readiness, no occupancy mutation, idempotent retries/concurrency, audit actor/time, both SLEEP and SKIP derivation/resolution history, response privacy, pagination, CSRF, and private no-store headers. Housekeeping serialization must omit guest identity/contact, reservation reference, rate, and folio data.

### Task 3 — Staff client, route, and operational board (Front-end design master)

**Files:** apps/web/src/lib/staff-housekeeping-api.ts and tests; apps/web/src/components/staff/housekeeping/**; apps/web/src/app/staff/(dashboard)/housekeeping/page.tsx; staff navigation and role tests.

- [x] Read apps/web/AGENTS.md and the installed Next.js 16 documentation for the route/data-fetch pattern before editing.
- [x] Add typed no-store clients matching the frozen API contract. Add /staff/housekeeping and role navigation; HOUSEKEEPER home opens this route, RECEPTIONIST/MANAGER/ADMIN can reach readiness/discrepancy actions, and CASHIER is denied.
- [x] Build the RTL task-first board using tracked tokens and CSS modules: business date/refresh status, due-date and room/work filters, urgency-ordered work list, separate occupancy/condition/task labels, arrival/departure context, and a discrepancy queue. Use task details and assignee identity only; never show guest contact or billing data.
- [x] Provide clear loading, empty-today, no-filter-match, stale, retry, permission, conflict/already-completed, success, and failure states. Use keyboard-accessible labeled filters, visible focus, accessible confirmation, and focus return.
- [x] Add component/client/navigation tests for role-specific actions, status text, validation, and all board states. Do not depend on uncommitted UI primitives from the root checkout.

### Task 4 — Acceptance and review (Tester + Designer; orchestrated by root)

**Files:** apps/web E2E tests and HPM-005 completion evidence in docs/implementation-tickets.md and this plan.

- [x] Run API unit, focused PostgreSQL, API HTTP E2E, web unit, typecheck/lint, then frontend Playwright. Use only the isolated test database target authorized for this run; identify server, port, and database before any migration/test command. Do not reset/drop a database.
- [x] E2E-generated task/discrepancy notes use a unique E2E-HPM005-<runId> marker. Preserve completed/resolved/dismissed history and all audit rows; cancel only exact unfinished tasks and dismiss only exact open reports created by that run.
- [x] Playwright covers manager assignment, housekeeper assigned-task start/completion, failed-inspection re-clean, real SLEEP reporting, receptionist/manager resolution or reasoned dismissal, check-in readiness, cashier denial, no-store/privacy, and no occupancy mutation. API/PostgreSQL E2E covers real SLEEP and SKIP derivation and resolution eligibility. A UI-only historical SKIP presentation test may stub the discrepancy response; do not create a checked-in stay solely for a browser test while checkout remains in HPM-008.
- [x] After frontend Playwright passes, tester manually checks real role sessions at desktop, tablet portrait/landscape, and 390px mobile. Designer reviews screenshots and source for hierarchy, responsive behavior, RTL, touch targets, keyboard/focus, error states, and fit with the existing design system. Record any fixes and repeat both automated and manual gates.
- [x] Complete HPM-005 only when migration, role/privacy, API and web checks pass, tester reports no outstanding issues, designer signs off, and the worktree is ready to merge.

## Ticket HPM-006 — Maintenance requests and out-of-order blocks

**Worktree:** `../Hotel Booking system-worktrees/HPM-006`

**Dependencies:** HPM-001, HPM-002, HPM-003, HPM-005
**Files:** maintenance migration; `apps/api/src/maintenance/**`, capacity projection service, audit tests; `apps/web/src/components/staff/maintenance/**`; `/staff/maintenance` route/nav; PostgreSQL/API/web/E2E tests.

- [x] Add failing PostgreSQL cases for block date boundaries, block/booking race, rejection below reserved capacity, restoration, same-room overlapping block rejection, active assignment conflict, and safe repeated expiry/restoration.
- [x] Add maintenance requests with category, description, priority, assignee, expected date, open/resolved timestamps, and resolution note. Add manager/reception views and role-guarded mutations.
- [x] Add explicit `OUT_OF_ORDER` maintenance blocks and `CAPACITY_CLOSED` operating blocks using the table introduced in HPM-001. Lock the room and affected inventory rows and atomically recompute `totalRooms = activeRooms - distinctActiveBlocks`; reject blocks overlapping an assignment or reducing capacity below held/booked counts.
- [x] Keep a maintenance request open independently of a room block; require an explicit user action to block sale. Do not implement the product-specific OOS sellability behavior in this release.
- [x] Build `/staff/maintenance` repair queue and room block controls with date, floor, room, reason, assignee, status, and expected return filters.
- [x] Run focused PostgreSQL/API tests, web unit and Playwright, lint/typecheck; then inspect mobile and desktop and repeat the flow after the web E2E suite passes. Playwright passed on desktop and mobile; both screenshots reviewed.
- [x] Preserve migration-generated legacy `CAPACITY_CLOSED` blocks from restoration so nightly-capacity snapshots cannot be erased. Cover the rejection and unchanged capacity in PostgreSQL tests; show a clear system-block explanation instead of a restore form.
- [x] Store the block's exclusive end date separately from its optional expected-return forecast. Validate the forecast within the block interval and cover both omitted and supplied forecasts in API and UI tests.
- [x] Rerun the complete root release check after these regressions: `pnpm check` passed all 10 gates, including all 19 migrations, 42 PostgreSQL suites / 269 tests, 43 web test files / 263 tests, 60 browser passes / 2 expected skips, 17 API E2E suites / 122 tests, and both production builds. Focused maintenance PostgreSQL passed 11/11, maintenance UI passed 7/7, and maintenance Playwright passed 2/2 desktop/mobile.

## Merge gate

Update `docs/implementation-tickets.md` with commit/worktree/test evidence. Inspect migration safety, PII scope, capacity rollback, accessibility, and role-specific serialization. Merge only after all ticket checks pass; remove that ticket's worktree and branch immediately after merge.
