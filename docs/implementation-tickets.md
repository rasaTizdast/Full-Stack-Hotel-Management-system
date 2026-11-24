# Implementation Tickets

Source of truth: `prd.md`, section 15. No external issue tracker is configured, so this file is the project ticket register.

Each ticket has one owner. Work starts in its own Git worktree and branch. Set status to `In progress` when implementation starts; set it to `Done` only after acceptance criteria and required checks pass. Record branch/worktree, code, and test links before merging into `main` and removing the worktree.

Status values: `Not started`, `In progress`, `Blocked`, `Done`.

## HPM — Hotel PMS operational expansion

The following tickets extend the original booking engine into the single-property PMS defined in `docs/decisions/ADR-002-hotel-pms-scope.md`. The research baseline and confirmed implementation comparison are in `docs/hotel-pms-operational-requirements-research.md`; feature-level acceptance plans are under `docs/superpowers/plans/`.

### HPM-000 — Research, scope decision, design specs, and ticket plans

- **Priority:** P0
- **Depends on:** None
- **Owner:** Codex orchestrator
- **Status:** Done
- **Branch/worktree:** `codex/hpm-000-pms-scope-and-plans` — `../Hotel Booking system-worktrees/HPM-000`
- **Code changes:** Primary-source hotel PMS research, confirmed codebase gap analysis, ADR-002, four feature design specs, four implementation plans, and this ticket register.
- **Required checks:** Source/link review and `git diff --check` passed. Specs were reviewed for contradictions/placeholders. Backend and Front-end reviews cleared after fixes for room-deactivation locking, `/staff/services` ownership, local Next.js docs, and private-cache assertions. Tester review cleared dependency/test sequencing and lifecycle coverage. Designer review cleared the UX decisions and confirmed the guest-phone follow-up fallback when the property phone is unset.
- **Acceptance criteria:** The core and conditional requirements are sourced; current implementation status is confirmed from code; scope, architectural decisions, exclusions, ticket dependencies, per-ticket worktrees, tests, and merge gates are documented.

### HPM-001 — Physical rooms and capacity projection

- **Priority:** P0
- **Depends on:** HPM-000
- **Owner:** Backend senior + Front-end design master
- **Status:** Done
- **Branch/worktree:** `codex/hpm-001-physical-rooms` — `../Hotel Booking system-worktrees/HPM-001`
- **Plan:** `docs/superpowers/plans/2026-11-15-hotel-pms-inventory-and-front-desk.md`
- **Acceptance criteria:** Physical room records are unique within the hotel; generated labels are explicitly marked and can be replaced; rooms can be safely deactivated/reactivated; Hotel has configurable check-in/out wall times; dated RoomBlock and RoomAssignment persistence foundations exist; migration preserves every existing nightly capacity by backfilling generated units and date blocks and backfills the `blocked_rooms` snapshot; current/future capacity projections update atomically from the business date forward and cannot fall below holds/bookings; past total/blocked/held/booked snapshots remain unchanged by current room/block changes, and missing past rows report `UNAVAILABLE`; historical rate writes are rejected; room deactivation rejects active assignments with checkout today or later under the same room-row lock used by assignment/check-in; inventory reads show projected capacity for current/future dates even when a nightly rate is unset, writes accept rates only, and the UI displays derived capacity; staff can manage room units.
- **Required tests and review:** Fresh/upgrade migrations and repeatable seed; PostgreSQL suite passed (6 suites / 29 tests), schema/seed suite passed (8/8), API unit and focused API e2e suites passed; API typecheck/lint/build and web typecheck/lint passed; full web unit suite passed (**23 files / 114 tests**); full Playwright passed **38/38** on desktop and mobile, including the 390×844 amount/currency layout assertion; manual guest-to-request, staff booking, inventory, room lifecycle, mobile, and receptionist access review passed after the one 390px currency-wrap defect was fixed and rechecked. The seeded blocked-room snapshot regression was first reproduced red (`blockedRooms` expected 1, received 0) and passed after the seed fix. Test database: isolated `hotel_hpm001_test`; the development database and `.env` were not modified. No Hallmark runner was available, so no Hallmark pass is claimed.
- **Changes:** Commits `966e987` (persist blocked-room snapshots), `d862b01` (mobile staff navigation/inventory/room flows), `8ff7c13` (currency grouping), `7bbe3ee` (390px RTL equation fix), and `0896dbf` (align stale booking/search test expectations), plus physical-room/API foundation and inventory management commits on this branch. Playwright config can use the installed Chrome executable through `HBE_E2E_CHROMIUM_EXECUTABLE_PATH`.

### HPM-002 — Staff roles, account administration, and audit events

- **Priority:** P0
- **Depends on:** HPM-000
- **Owner:** Backend senior + Front-end design master
- **Status:** Done
- **Branch/worktree:** `codex/hpm-002-staff-controls` — merged to `main` as `6d1eb1c`; worktree and branch removed.
- **Plan:** `docs/superpowers/plans/2026-11-15-hotel-pms-staff-controls-and-daily-operations.md`
- **Acceptance criteria:** Named roles `ADMIN`, `MANAGER`, `RECEPTIONIST`, `HOUSEKEEPER`, and `CASHIER` have explicit server-enforced capabilities; admin can create/change/deactivate accounts; the staff list is paginated; a forced initial password change is enforced through `/staff/change-password`; case-normalized duplicate usernames/emails fail; deactivation revokes sessions; account changes cannot remove the last active admin; high-impact changes and their audit record commit atomically without secrets/full guest payloads.
- **Code changes:** Added the role-capability matrix and applied it to shipped staff APIs; admin account listing/creation/role-change/deactivation; forced password change; hashed-identity login throttling that avoids locking out a shared hotel NAT after successful logins; append-only audit records for staff, booking, room, inventory, and password changes; safe DTO/cache behavior; role-aware staff navigation and responsive account management (desktop table, mobile cards). Password-change audit writes only the forced-change state transition, never credential material. Commits: API `18e32de`, `80b7b28`, `c260dd3`, `7a11858`; web `79aa9a1`, `250e2a0`.
- **Required tests and review:** API unit suite passed **18 suites / 96 tests**; the mocked staff-auth API E2E passed **17/17** after adding a regression that asserts password audit redaction and transaction scope. The other staff/OpenAPI API E2E suites passed **7 suites / 64 tests** before the password-audit addition; PostgreSQL staff-controls/inventory integration passed **2 suites / 5 tests** before that addition. Web unit tests passed **28 files / 152 tests**, and the final account suite passed **8/8** after date/email polish. Full desktop/mobile Playwright passed **40/40** after responsive cards; the final account/password flow passed **2/2** on desktop and mobile after the timestamp and duplicate-email fixes. Full web typecheck/lint and diff checks passed; focused checks passed after the final polish. Security review found no critical/high issue; production edge headers and proxy/rate-limit topology verification are deferred to HPM-010. Designer review found no remaining layout blocker. Manual tester verified the public guest request path, but could not complete staff login/navigation review with the available UI automation; HPM-010 retains the full cross-role manual review gate. No reproducible Hallmark runner is registered, so no Hallmark pass is claimed. The isolated `hotel_hpm002_test` database was recreated after the manual guest fixture; it is empty, and the HPM-002 app servers are stopped. The root development database and `.env` database target were not reset or modified.

### HPM-003 — Room board and assignments

- **Priority:** P0
- **Depends on:** HPM-001, HPM-002
- **Owner:** Backend senior + Front-end design master
- **Status:** Done
- **Branch/worktree:** `codex/hpm-003-room-board-assignment` — `../Hotel Booking system-worktrees/HPM-003`
- **Plan:** `docs/superpowers/plans/2026-11-15-hotel-pms-inventory-and-front-desk.md`
- **Acceptance criteria:** Staff see all rooms with occupancy, assignments, housekeeping state, and blocks; board defaults to business date, refreshes every 30 seconds, shows last updated/stale state and explicit combinations; HPM-003 adds assignment operations on the persistence foundation created by HPM-001; distinct room units are reconciled atomically per booking; assignments match room type and stay dates and cannot overlap assignments/blocks; canceling a confirmed stay releases assignments atomically with inventory; HPM-004 requires a full distinct room set before check-in; assignment/check-in share HPM-001's room-row lock, and transactions needing both room type and room locks acquire them in room-type-then-room order. The board returns complete active assignment intervals regardless of room-card filters, defines unassigned units for the selected board date, and uses an assignment-history revision so stale replacements return 409 before writes; the editor requires an explicit review choice before retrying a stale draft.
- **Delivery:** API commits `f19a50d`–`d9910b7`; web board commit `5af96a2`; Designer polish `c658b5a`; final shared date-helper cleanup `5eddeb3` on `codex/hpm-003-room-board-assignment`.
- **Tests/review:** API unit tests **20 suites/105 tests**, PostgreSQL tests **8 suites/42 tests**, API HTTP E2E **14 suites/96 tests** passed on isolated `hotel_hpm003_test` at port 55432; web unit tests **30 files/166 tests**, typecheck, scoped ESLint, and React Doctor (no findings in new board files) passed. Full web Playwright passed **42/42** desktop/mobile before the final helper cleanup; focused room-board Playwright after the helper cleanup passed **2/2**. Backend contract review found no mismatch; final standards review of the helper patch found no issue. Designer reviewed both viewports and fixed the filtered-count label; Tester reviewed the final screenshots after E2E and found no visible layout blocker. Manual role/action checks are not claimed; those flows are covered by Playwright. Hallmark has no reproducible runner in the project, so no Hallmark pass is claimed. All browser tests used the isolated test container; the root `.env` and development application database contents were left unchanged. An initial setup attempt created only an unseeded `_test` database on port 5433; it was verified unused and removed before browser testing.

### HPM-004 — Front-desk stay operations

- **Priority:** P0
- **Depends on:** HPM-001, HPM-002, HPM-003
- **Owner:** Backend senior + Front-end design master
- **Status:** Done
- **Branch/worktree:** codex/hpm-004-front-desk — ../Hotel Booking system-worktrees/HPM-004; merged to local main, then branch/worktree removed.
- **Plan:** docs/superpowers/plans/2026-11-16-hotel-pms-front-desk-stay-operations.md; source spec: docs/superpowers/specs/2026-11-15-pms-physical-inventory-and-stays-design.md
- **Acceptance criteria:** Staff can create idempotent same-business-date walk-ins, use searchable and paginated arrivals/in-house/due-out worklists, and check in confirmed due-ins only when inspected room assignments cover every remaining night without a block or conflict. Check-in follows hotel wall time; early check-in is same-day and ADMIN/MANAGER-only with a reason. Late arrivals remain due-in until staff checks in or records a reasoned no-show. No-show releases assignments and current/future booked counters once while preserving past snapshots. Eligible confirmed stays can be amended before check-in while preserving unchanged nightly prices and rolling back sold-out or assignment-invalidating changes. In-house room moves retain dated assignment/audit history and mark the vacated room DIRTY. The room board shows OCCUPIED only for CHECKED_IN stays. Guest confirmation retains the pending-request promise and only links a configured hotel phone. Financial checkout and folio/service posting remain HPM-008 scope.
- **Code changes:** Added lifecycle schema readiness and transactional walk-in, check-in, no-show, amendment, and room-move operations; arrivals/in-house/departures APIs and responsive RTL workspaces; checked-in room-board occupancy; guest follow-up copy; exact test-only walk-in cleanup that cancels only a verified synthetic fixture and appends an audit event without altering prior audit history. Stay details now expand inside the selected card with accessible toggle state and focus return. Walk-in name, phone, and email fields have semantic names, autocomplete, and input types.
- **Delivery:** HPM-004 branch includes the lifecycle/API/web slices and follow-ups through 1ada0ab (Improve front desk stay detail access and walk-in fields). The E2E cleanup integration is committed with this ticket.
- **Tests and review (2026-11-17):** API unit tests passed 22 suites / 124 tests; PostgreSQL tests passed 77/77; API HTTP E2E passed 112/112; focused walk-in fixture cleanup DB tests passed 4/4; API typecheck, lint, and production build passed. Web unit tests passed 33 files / 211 tests; focused front-desk component tests passed 27/27; web typecheck and scoped ESLint passed. Full desktop/mobile Playwright passed 46/46 against hotel_hpm004_task1_fresh_test on port 55432 after all UI changes. React Doctor scanned the current changed UI files and reported 93/100 with no findings. Tester rechecked public and staff/admin routes at 1440px and 390px with no overflow or browser/API errors, and verified the detail toggle/focus behavior and walk-in dialog screenshots. Designer reviewed the final screenshots and source and found no actionable visual issue. No reproducible Hallmark runner is registered, so no Hallmark pass is claimed.
- **Test data and limitations:** Tests and review used only the isolated _test database; the regular development database and root .env were not changed. A review-only fictional admin was seeded only into the test database. After final review, eight exact inactive E2E-<8 hex>-R physical-room fixtures with no assignments or blocks were removed, preserving all 40 associated audit events. One synthetic walk-in submitted during testing was canceled through the guarded cleanup CLI; its original walk-in and cleanup audit events remain. Departures intentionally remain read-only here; checkout, settlement, invoices, and service folios are assigned to HPM-008.
- **Acceptance status:** Complete; all ticket checks and reviews passed. HPM-004 did not change the root README, which remains scheduled for HPM-010.

### HPM-005 — Housekeeping statuses and task board

- **Priority:** P0
- **Depends on:** HPM-001, HPM-002, HPM-003, HPM-004
- **Owner:** Backend senior + Front-end design master; Designer and Tester are required release gates
- **Status:** Done
- **Branch/worktree:** `codex/hpm-005-housekeeping` — `../Hotel Booking system-worktrees/HPM-005`; ready to merge into local `main` after this evidence update.
- **Plan:** docs/superpowers/plans/2026-11-15-hotel-pms-housekeeping-maintenance.md
- **Acceptance criteria:** Staff distinguish occupancy from DIRTY/CLEAN/INSPECTED; manual tasks use OPEN/IN_PROGRESS/COMPLETED/CANCELLED and are assigned to housekeepers; assigned work completes idempotently; failed inspection creates a re-clean task; only inspection can set INSPECTED; housekeeping can report SLEEP/SKIP but cannot alter occupancy or access folios; only reception/manager/admin can resolve after the stay state matches the observation or dismiss with a reason; default check-in readiness is enforced; responses omit unnecessary guest PII.
- **Required tests:** Task transition/lifecycle/idempotency, failed-inspection rework, and overdue inclusion/order; PostgreSQL actor/audit history; discrepancy report/resolve/dismiss permissions; role/privacy/no-store; check-in gate; API HTTP E2E; web unit and frontend Playwright before tester manual review; designer desktop/tablet/mobile review. HPM-008 supplies checkout-based SKIP correction.
- **Delivery:** API `f070fb6`, `01881ad`; staff board `d1bb532`, `488c558`, `cca3570`; HPM-005 browser fixtures `f440523`; pagination OpenAPI correction `64a22aa`.
- **Checks completed:** API unit **26 suites / 142 tests**; isolated PostgreSQL HTTP **1 suite / 5 tests**; web unit **36 files / 229 tests**; focused housekeeping UI **21/21**; web and API typecheck/lint and diff checks passed. Full Playwright passed **50/52** (**50 passed, 2 expected viewport skips, 0 failed**) in 6.6 minutes after tablet changes. The standard global setup succeeded against `hotel_hpm004_task1_fresh_test`: Prisma generated, all 9 migrations were already applied, and the authorized seed completed. No reset/drop ran. The public room-detail navigation assertion uses a 30-second limit; the route loaded in 23 seconds and passed in the full run.
- **Tester review:** Desktop/mobile housekeeping role and lifecycle flows, room board, room lifecycle, front desk, and inventory passed. The changed disclosure was manually checked at 390×844, 768×1024, 1024×768, and 1440×960. At the first three sizes it opens/closes and keeps summary/Clear visible; Apply updates the summary and Clear restores the empty state. At 1440px the disclosure is hidden and filters stay expanded. No horizontal overflow occurred. The live board had 20 terminal cards and zero OPEN/IN_PROGRESS tasks, so there was no eligible card action for a manual click; automated task-action flows passed.
- **Designer review:** Signed off on final mobile, tablet, and 1440px desktop screenshots/source. No remaining actionable layout or usability issue. No Hallmark runner/skill is available, so no Hallmark pass is claimed.
- **Test-data cleanup:** In the isolated database, all 7 active accounts matching the generated `hpm005-<role>-<random>` pattern were deactivated through the admin API with reason `HPM-005 E2E generated role-account cleanup.`; all 7 deactivation audit events were retained and all sessions revoked. One older open discrepancy with an exact `E2E-HPM005-…` marker was dismissed through the admin API with a cleanup reason; occupancy was not changed. Read-only verification found 0 active HPM-005 accounts, 0 unrevoked HPM-005 sessions, 0 open HPM-005 tasks, and 0 open HPM-005 discrepancies. Completed/cancelled task and resolved/dismissed discrepancy history remains. The test database was not reset or dropped.
- **Delivery:** API `f070fb6`, `01881ad`; board `d1bb532`, `488c558`, `cca3570`; E2E fixture/contract and stabilization commits through `39c2f48`; mobile disclosure `b982a8a` and regression `e282cdc`; tablet disclosure `0ed836c`. One final public-room-detail timeout adjustment and this evidence update are included before merge.
- **Known review note:** The earlier React Doctor score was **68/100**; its findings were reviewed during implementation. No fresh React Doctor run was made after the final responsive CSS changes. The repository has no reproducible Hallmark runner.

### HPM-006 — Maintenance requests and out-of-order blocks

- **Priority:** P0
- **Depends on:** HPM-001, HPM-002, HPM-003, HPM-005
- **Owner:** Backend senior + Front-end design master
- **Status:** Done — reopened after review found that a migration-generated `CAPACITY_CLOSED` block could be restored and erase an HPM-001 nightly-capacity snapshot, and that the block's exclusive end date was conflated with its optional expected-return forecast. Both are fixed and covered by regressions.
- **Branch/worktree:** The correction commit `c5dbdbc` was made on the HPM-010 topic branch and is included in the fast-forward of `main` to `7c037de`. The divergent earlier tip `6fa784a` is preserved by `archive/hpm-006-maintenance-blocks-6fa784a`; its stale missing-worktree registration was pruned.
- **Plan:** `docs/superpowers/plans/2026-11-15-hotel-pms-housekeeping-maintenance.md`
- **Acceptance criteria:** Repairs have category/priority/assignee/due/resolved state; open repairs are separate from inventory blocks; managers create dated out-of-order or capacity-closed blocks with reasons; blocks update capacity transactionally and cannot invalidate holds/bookings/assignments; room restoration is safe and repeatable; HPM-001 migration-generated capacity-preservation blocks cannot be restored; block end date and optional expected-return forecast are separate.
- **Required tests:** Block/booking race, date boundaries, capacity rollback, same-room overlap rejection, active assignment conflict, occupied-room block denial, restoration/idempotency, immutable legacy capacity preservation, optional return forecast, permissions, API/web E2E, upgrade migration.
- **Evidence:** Regression tests were observed failing first: legacy system-block restoration returned 200 before the guard, and a distinct expected-return forecast was initially rejected. After the fix, the focused isolated PostgreSQL maintenance suite passed **11/11**, the maintenance UI suite passed **7/7**, and maintenance Playwright passed on desktop and mobile (**2/2**). API unit tests passed **27 suites / 149 tests**; the full isolated PostgreSQL suite passed **42 suites / 269 tests** with **93.11% statements / 88.92% branches / 98.21% functions / 95% lines**; web unit tests passed **43 files / 263 tests** with **91.71% statements / 88.88% branches / 100% functions / 92.9% lines**. Root `pnpm check` passed all 10 gates, including fresh isolated migrations, fictional seed, Playwright (**60 passed, 2 expected viewport skips, 0 failed**), API E2E/OpenAPI (**17 suites / 122 tests**), and API/web production builds. Fresh databases `hotel_check_f382ea9ed1_test`, `hotel_playwright_f382ea9ed1_test`, and `hotel_api_e2e_f382ea9ed1_test` each applied all 19 migrations. Desktop/mobile screenshots were reviewed after regeneration; the designer found no blocking findings. The 19th migration separately applied to the isolated `hotel_hpm010_final_check_20261124_test` database. No Hallmark pass is claimed because no reproducible runner is available.

### HPM-007 — Folio ledger and service catalog

- **Priority:** P0
- **Depends on:** HPM-002, HPM-004
- **Owner:** Backend senior + Front-end design master
- **Status:** Done
- **Branch/worktree:** `codex/hpm-007` at `7e9b5a6`, integrated into `main` by the fast-forward to `7c037de`; clean ticket worktree and topic branch removed after release QA.
- **Plan:** `docs/superpowers/plans/2026-11-15-hotel-pms-folio-and-checkout.md`
- **Acceptance criteria:** Each stay has an append-only itemized folio; room/service lines store room attribution, integer Toman, and immutable snapshots; one shared locked posting service and database key prevent duplicate room-night charges across checkout/night-close; authorized corrections add compensating entries with reasons; managers/admins can manage the `/staff/services` catalog without rewriting existing postings; public DTOs never reveal folios; private requests/responses enforce and test both no-store controls.
- **Required tests:** BigInt balance math, room/night boundaries, immutable snapshots, cross-path duplicate protection, duplicate idempotency, role checks, PostgreSQL rollback, API e2e, web unit/E2E.
- **Code changes:** Additive folio/service schema and integrity migrations; booking-triggered empty folios; database-enforced append-only ledger and sequence; locked service/accommodation posting, immutable catalog snapshots, compensating corrections, permissions, private API headers; manager/admin service catalog and staff folio routes with a front-desk link.
- **Evidence:** API unit **27 suites / 145 tests**; HPM-007 PostgreSQL suite **8/8**; folio API E2E **2/2**; web unit **41 files / 248 tests**; folio/catalog component and API-client tests **9/9**; focused Playwright **2/2** (desktop and mobile); API/web lint and typecheck passed. All 15 migrations applied to isolated `hotel_hpm007_fresh_e2e_test`; rerun reported no pending migrations. API and web assertions cover `private, no-store`; public booking responses contain no folio fields. Desktop (1440 px) and mobile (390 px) folio/catalog screenshots were inspected.
- **Broader suite note:** A full Playwright run on the existing `hotel_hpm007_test` database passed **46**, skipped **2**, and failed **8** cases outside the HPM-007 scenario: HPM-005 housekeeping fixture room availability, public-site room detail, same-day walk-in capacity, and mobile cases after an API process disconnect. The ticket-specific desktop/mobile folio flow passed; rerun and resolve full release-suite failures in HPM-010 before release.

### HPM-008 — Manual settlement, final checkout, and printing

- **Priority:** P0
- **Depends on:** HPM-003, HPM-004, HPM-005, HPM-006, HPM-007
- **Owner:** Backend senior + Front-end design master
- **Status:** Done
- **Branch/worktree:** `codex/hpm-008-checkout-print-folio` at `9e6137c`, integrated into `main` by the fast-forward to `7c037de`; clean ticket worktree and topic branch removed after release QA.
- **Plan:** `docs/superpowers/plans/2026-11-15-hotel-pms-folio-and-checkout.md`
- **Acceptance criteria:** Positive cash/bank-terminal/bank-transfer/other settlements are recorded without cardholder data; payments cannot exceed balance; refunds are limited to unrefunded source payment; closed-due folios accept collection but no new charges; ordinary checkout requires zero balance; manager on-account override requires reason; checkout, final charges, folio state, future-night release, assignment close, dirty-room transition, and audit are atomic; overdue in-house stays require a reasoned manager/admin extension with capacity and rate snapshots; historical room moves retain correct room-night attribution; staff can print an authenticated no-store RTL operational folio with room attribution and interim/final timestamp.
- **Required tests:** Nonzero-balance denial, manager override, payment/refund limits, post-checkout collection, duplicate retries, concurrent post/checkout, early departure release, overdue extension through final checkout, historical room attribution, transaction rollback, unauthorized print, print layout and end-to-end flow.
- **Evidence:** API unit **27 suites / 145 tests**; isolated PostgreSQL DB suite **14 suites / 114 tests**; folio API E2E **1 suite / 2 tests**; web unit **42 files / 254 tests**; focused browser E2E **2/2 desktop Chromium**; API and web lint/typecheck/build passed. Production print-route smoke returned HTTP 200 with `Cache-Control: private, no-store`. All 16 migrations applied to isolated `_test` databases. Regenerated PDF inspection confirmed 2 A4 pages, repeated table headers, readable long Persian guest names and LTR amounts/references, complete totals/footer, and safe page margins. Backend, tester, and designer reviews passed.

### HPM-009 — Business date, night close, and reports

- **Priority:** P1
- **Depends on:** HPM-004, HPM-005, HPM-006, HPM-007, HPM-008
- **Owner:** Backend senior + Front-end design master
- **Status:** Done
- **Branch/worktree:** `codex/hpm-009-night-close-reports` at `a134c7c` and detached E2E commit `aea21a6` are integrated into `main` by the fast-forward to `7c037de`; ticket worktrees and topic branch removed after release QA.
- **Plan:** `docs/superpowers/plans/2026-11-15-hotel-pms-staff-controls-and-daily-operations.md`
- **Acceptance criteria:** Managers preview blockers separately from warnings, confirm a named business date/effects, run an all-or-nothing manual close, post at most one accommodation charge per assignment/date through the shared checkout service, advance business date once, retry safely after rollback, and view role-filtered summaries.
- **Required tests:** Tehran timezone boundaries, rollback after charge inserts before date advance, retry after rollback and success, cross-path duplicate prevention, report totals against ledger fixtures, permissions, API/web E2E.
- **Delivery:** Business-date/night-close migration, operations API, Jalali staff close/report screens, and [manual close runbook](booking-day-close-operations.md). Commits: `9462257`, `1b1e15c`, `aea21a6`.
- **Checks:** Fresh isolated `hotel_hpm009_e2e_20261124_test` received all 17 migrations and seed; existing isolated `hotel_hpm009_final_20261124_test` reported no pending migrations. API unit **27 suites / 146 tests**; HPM-009 PostgreSQL HTTP suite **1 suite / 4 tests**; web unit **43 files / 259 tests**; ticket Playwright **2/2** across desktop and mobile with axe checks; API/web typecheck and lint, API/web production builds, and `git diff --check` passed. The close test injects a date-advance failure and verifies rollback/retry. Test-only `pg` client-query and injected-failure logs were non-fatal.
- **Designer review:** Desktop and mobile report, close preview, and confirmation were reviewed; RTL hierarchy and responsive dialog passed with no blocking issue. Screenshots are in `output/playwright/hpm009/`.
- **Operating limits:** Night close is manual; no scheduler is installed. The existing expiry worker remains single-process, so multiple API replicas are a deployment gate. Historical readiness, active-room, block, open-balance, and pending-queue snapshots are not stored; the report labels those values as current state. The development database and original dirty checkout were not modified.

### HPM-010 — Cross-role release QA and product documentation

- **Priority:** P0 release gate
- **Depends on:** HPM-001 through HPM-009
- **Owner:** Tester + Designer + Codex orchestrator
- **Status:** Done
- **Branch/worktree:** `codex/hpm-010-release-qa-readme` at `04f3653`, integrated into `main` by the fast-forward to `7c037de`; ticket worktree and topic branch removed after release QA.
- **Plan:** `docs/superpowers/plans/2026-11-15-hotel-pms-staff-controls-and-daily-operations.md`
- **Acceptance criteria:** Frontend E2E passes before manual UI review and reruns before each defect recheck; negative flows cover unauthorized folio, dirty-room check-in, duplicate posting, nonzero-balance checkout, and interrupted/retried close; guest/reception/housekeeping/cashier/manager/admin flows pass; full root release checks pass; production-edge security headers and trusted-proxy/login-limiter topology are verified or left as explicit deployment gates if no live environment is available; current visual audit command is recorded if available (otherwise no Hallmark pass is claimed); README reflects shipped features and limitations; all ticket worktrees/branches are removed.
- **Code changes:** Added a cashier-only dashboard entry and an exact booking-reference folio lookup that exposes only guest name, stay dates, lifecycle, and balance for in-house or positive receivable folios. The API conceals other booking states, requires `VIEW_FOLIOS`, and sends `private, no-store`. Also retained the repeatable business-date seed and current-date inventory migration; isolated coverage, Playwright, and API E2E on fresh `_test` databases; completed receptionist walk-in, folio settlement/checkout/print, housekeeping, maintenance, and night-close browser flows; stabilized mobile housekeeping filters and per-test staff sessions; and fixed HPM008 ledger/print labeling and narrow print layout. Role workflow screenshots are tracked in `docs/screenshots/pms-*`.
- **Checks (2026-11-24):** The final root `pnpm check` passed all 10 gates: formatting, lint, API/web typechecks, API/web unit tests, PostgreSQL migrations/integration/coverage, fictional seed, web coverage, desktop/mobile Playwright, API E2E/OpenAPI, and both production builds. API unit **27 suites / 149 tests**; web unit **44 files / 265 tests**; PostgreSQL integration **42 suites / 270 tests** with API coverage **93.11% statements / 88.92% branches / 98.21% functions / 95% lines**; web coverage **91.77% statements / 88.38% branches / 100% functions / 92.95% lines**; Playwright **60 passed / 2 expected viewport skips / 0 failed**; API E2E/OpenAPI **17 suites / 122 tests**. Fresh databases `hotel_check_f34186b7b4_test`, `hotel_playwright_f34186b7b4_test`, and `hotel_api_e2e_f34186b7b4_test` each received all 19 migrations. Confirmed and fixed the shared-database order sensitivity in staff-stays E2E: the preserved HPM-005 property had the same old creation timestamp and could be selected instead of the suite fixture. The fixture is now deterministically older; the reproduced failing suite passed **15/15**, and the full API E2E passed **122/122**. The cashier lookup, privacy fields, role access, positive receivable, settled, and pre-check-in cases also passed focused API/web suites. Playwright used the installed Chrome executable because the Playwright CDN returned HTTP 403 for the bundled browser download.
- **Visual review:** Prior live walkthrough on 2026-11-24 covered desktop guest search/request, receptionist walk-in and room assignment, housekeeper maintenance request, manager maintenance assignment/resolution and room block, service catalog, folio charge/payment/checkout/print, report, and night close; an admin confirmed the earlier guest request. At 390px, guest search/request and manager confirmation, housekeeping view, night-close view, and folio print were reviewed without horizontal overflow. A fresh in-app browser (separate from the user's personal Chrome) completed the six-role walkthrough against `hotel_hpm010_manual_20261124_094822_test`: guest search/request; receptionist queue/confirmation/walk-in/assignment and early-check-in denial; manager reasoned early check-in, service catalog, night-close/report, maintenance resolution, and block restore; housekeeper board and maintenance request; cashier lookup, service posting, manual settlement, final checkout, and print; and admin account list. The cashier lookup result and print page were checked on desktop. Cashier lookup, housekeeping, maintenance, arrivals, and staff-account views were checked in the narrow in-app viewport (355 CSS px; document width 341px, so no horizontal page overflow). The current cashier route also passed real-browser Playwright on desktop and mobile. The source-only Designer review of the cashier route found no concrete UI or responsive blocker; it did not review screenshots. The source-only Tester review confirmed the successful lookup's `private, no-store` assertion and found no other concrete coverage gap; it did not rerun tests. Prior Designer review covered the cross-role screens and print artifacts. No Hallmark pass is claimed.
- **Visual audit:** No reproducible Hallmark runner is registered or installed; no Hallmark pass is claimed. Historical `.hallmark` artifacts are not a current run. The known baseline public-room-list issue (hero ends at 1747px at 1920px) is historical and separate from the current reviewed screens.
- **README and deployment gates:** README now documents roles, guest and staff workflows, limits, test database behavior, folio/legal boundary, backup/restore expectations, and tracked screenshots. No production environment was available: TLS, trusted proxy addresses, edge rate limiting/security headers, secret rotation/storage, access monitoring, and encrypted off-host backup/restore drills remain explicit pre-real-use gates; no statutory fiscal compliance or integration is claimed.
- **Integration:** Local `main` was fast-forwarded from `abda57e` to `7c037de` on 2026-11-24, including HPM-006–010, the HPM-006 correction, HPM-010 evidence, and the cashier folio lookup. Remote commits `978f1b0` and `716965c` were merged in `1e8e619` and pushed to `origin/main`; a fresh fetch verified local and remote `main` at `1e8e619`. The original checkout's 392 pre-existing status entries were preserved in Git stash `829acfbfe743c50abf2413fc5d8836ad6ecbfe26` (including untracked `.hallmark/` and `.playwright-cli/`) before the project directory was switched to `main` at `4fad015`. The duplicate sibling checkout and all HPM ticket/release worktrees and topic branches were removed; the original project path is the sole registered worktree on `main`. The divergent HPM-006 tip `6fa784a` is preserved as `archive/hpm-006-maintenance-blocks-6fa784a`; its stale worktree registration was pruned, and its old topic branch was removed. HPM-010 `.env`, print-review PNGs, and Playwright output from HPM-007 through HPM-010 plus two integration artifacts are preserved in the sibling `Hotel Booking system-hpm-010-review-artifacts-20261124` archive.
- **Required tests:** `pnpm check`, fresh and upgrade migration checks, full cross-role Playwright, screenshot/print review, live interactive walkthrough, and final git/worktree audit. The automated gates, screenshot/print review, six-role live walkthrough, cashier lookup flow, and final cleanup audit pass. No production environment was available, so the documented production security/backup items remain deployment gates.

## HBE-001 — Establish monorepo workspace and app boundaries

- **Priority:** P0
- **Depends on:** None
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-001-workspace` — `../Hotel Booking system-worktrees/HBE-001`
- **Code changes:** `apps/web/`, `apps/api/`, root pnpm/TypeScript/Prettier configuration, `README.md`, and `docs/decisions/ADR-001-framework-versions.md`.
- **Tests:** `pnpm install --frozen-lockfile --strict-peer-dependencies`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm --filter @hotel/api test:e2e`, and `pnpm build` passed. Independent and combined dev-server smoke checks returned HTTP 200 from the Persian web app and API.
- **Scope:** Create root workspace and `apps/web`, `apps/api`, `docs`, and `infra` structure. Scaffold Next.js and NestJS apps. Configure strict TypeScript and root scripts.

**Acceptance criteria:**

- Both apps start independently and from a root development command.
- App source uses TypeScript/TSX with strict checks enabled.
- Web styling uses Tailwind CSS.
- Lockfile and workspace metadata are at repository root.
- README gives initial setup commands.

**Required tests/checks:** root and app type checks, lint, formatting check, and both app builds run.

## HBE-002 — Add local PostgreSQL and environment configuration

- **Priority:** P0
- **Depends on:** HBE-001
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-002-postgres-config` — `../Hotel Booking system-worktrees/HBE-002`
- **Code changes:** `infra/docker-compose.yml`, `.env.example`, root database scripts and setup docs, API ConfigModule/Joi validation, Prisma 7 PostgreSQL adapter/client lifecycle, `/health/live`, `/health/ready`, API e2e coverage, and cross-platform Prettier line-ending configuration.
- **Tests:** Frozen strict-peer install, lint, typecheck, format check, unit tests, API e2e (2 suites/4 tests), and production builds passed. PostgreSQL 18 Compose health passed; live API readiness returned 200 with PostgreSQL running, returned sanitized 503 guidance when stopped, and recovered after restart. Liveness remained 200 during the outage.
- **Scope:** Add Docker Compose for PostgreSQL, environment examples, API database connection, and health/readiness endpoints.

**Acceptance criteria:**

- A developer can start and stop the local database with documented commands.
- Secrets are not committed.
- API readiness reports database availability.
- Database connection failures return a useful startup/readiness error.

**Required tests/checks:** readiness success and database-unavailable integration cases.

## HBE-003 — Create initial schema, migrations, and fictional seed data

- **Priority:** P0
- **Depends on:** HBE-002
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-003-schema-seed` — `../Hotel Booking system-worktrees/HBE-003`
- **Code changes:** Added PostgreSQL models and a forward-only migration with database-enforced inventory, money, booking-date, and quantity checks; added fictional 90-night inventory and environment-configured Argon2id demo admin seed.
- **Tests:** Fresh `prisma migrate deploy` and `prisma migrate status` passed; PostgreSQL integration suite passed (7 tests); API typecheck, lint, build, unit tests (1), and e2e tests (4) passed.
- **Scope:** Add Hotel, RoomType, RoomNightInventory, Booking, BookingNight, and StaffUser schema; constraints, indexes, migrations, and idempotent demo seed.

**Acceptance criteria:**

- Unique room-type/date inventory constraint exists.
- Inventory count and money constraints are enforced.
- Seed creates one hotel, multiple room types, future inventory, and a demo admin from environment configuration.
- Re-running the seed does not duplicate demo rows.
- No real guest data is present.

**Required tests/checks:** fresh migration, migration status, seed repeatability, and constraint integration tests.

## HBE-004 — Define API error format and request validation

- **Priority:** P0
- **Depends on:** HBE-001
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-004-api-validation` — `../Hotel Booking system-worktrees/HBE-004`
- **Code changes:** `apps/api/src/common/configure-api-application.ts`, `apps/api/src/common/api-exception.filter.ts`, `apps/api/src/main.ts`, API e2e tests, API dependencies, and setup documentation. Health routes remain unprefixed for monitoring.
- **Tests:** `apps/api/test/validation.e2e-spec.ts` covers valid/invalid DTOs, unknown fields, malformed JSON, safe internal errors, request IDs, field details, and redaction. Full API e2e: 3 suites/10 tests passed. `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, and `pnpm build` passed.
- **Scope:** Add global validation, consistent error JSON, request IDs, and API version prefix.

**Acceptance criteria:**

- Invalid input is rejected before service operations.
- Errors include a stable code, message, request ID, and field details where applicable.
- Unknown or malformed fields cannot silently alter business data.
- Sensitive request fields are not logged.

**Required tests/checks:** API e2e tests for valid/invalid DTOs and error format.

## HBE-005 — Build public hotel and room-type endpoints

- **Priority:** P0
- **Depends on:** HBE-003, HBE-004
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-005-public-catalog-api` — `../Hotel Booking system-worktrees/HBE-005`
- **Code changes:** Added public hotel and active room-type modules, response DTOs, and privacy-limited Prisma queries. Added a direct Express dependency required by the shared request middleware, plus a safe `_test`-only API e2e environment loader.
- **Tests:** Service unit tests verify safe fields and active-room query behavior. PostgreSQL-backed API e2e tests verify public serialization and inactive-room filtering (4 suites/12 tests passed). API unit suite (3 suites/5 tests), database suite (7 tests), lint, typecheck, format check, build, and frozen-lockfile install passed. E2e setup rejected a non-test database URL before connecting.
- **Scope:** Implement public read-only hotel and active room type endpoints.

**Acceptance criteria:**

- Hotel endpoint returns only public content.
- Room endpoint returns active room types and safe public fields.
- Inactive room types are not exposed as bookable.
- Response DTOs do not contain staff, guest, or database-only fields.

**Required tests/checks:** service unit tests and API e2e privacy/serialization checks.

## HBE-006 — Implement availability search and server-side price preview

- **Priority:** P0
- **Depends on:** HBE-005
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-006-availability` — `C:\hb\HBE-006`
- **Code changes:** Added the versioned availability endpoint, strict Gregorian date-range handling in the hotel timezone, per-night inventory/capacity checks, a 1–20 guest limit, exact integer-Toman price strings, explicit response DTOs, and a narrow safe error allowlist.
- **Tests:** API unit tests passed (6 suites/27 tests), API e2e passed (5 suites/17 tests), and PostgreSQL integration passed (7 tests). Migration status is up to date. Frozen install, lint, typecheck, formatting, and build passed; e2e refuses non-`_test` databases.
- **Scope:** Validate date range and guest count, query each stay night, and return available room types with price breakdown.

**Acceptance criteria:**

- Checkout date is exclusive.
- Missing inventory or unavailable nights make a room type unavailable for the requested full range.
- Capacity is checked against guest count.
- Total is calculated using integer Toman amounts on the server.
- Invalid, past, and over-30-night ranges are rejected clearly.

**Required tests/checks:** unit tests for dates/prices and PostgreSQL-backed API integration tests for availability boundaries.

## HBE-007 — Implement staff authentication and authorization

- **Priority:** P0
- **Depends on:** HBE-003, HBE-004
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-007-staff-auth` — `../Hotel Booking system-worktrees/HBE-007`
- **Code changes:** Added staff login/logout/current-user routes, Argon2id verification, persisted opaque sessions with hashed credentials, CSRF and same-origin protections, role guards, bounded login rate limiting, exact-origin credentialed CORS, safe response DTOs, and the forward-only `20261114110051_add_staff_sessions` migration.
- **Tests:** After rebasing onto current `main`, API unit tests passed (9 suites, 39 tests), API e2e tests passed (7 suites, 29 tests), and isolated PostgreSQL tests passed (2 suites, 8 tests). Lint, typecheck, Prettier check, production build, frozen-lockfile install, and migration status passed; the isolated database is up to date.
- **Scope:** Staff login/logout/current-user endpoints, secure cookie handling, password hashing, CSRF protection, roles, and login rate limiting.

**Acceptance criteria:**

- Unauthenticated requests cannot access staff resources.
- Receptionist and admin permissions differ as defined in Section 9.
- No auth token is stored in browser localStorage.
- Passwords are stored only as hashes.
- Logout invalidates the staff session.

**Required tests/checks:** unit tests for authorization policy and API e2e tests for login, logout, cookie, CSRF, and role access.

## HBE-008 — Implement transactional booking requests and idempotency

- **Priority:** P0
- **Depends on:** HBE-006
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-008-booking-requests` — `C:\hb\HBE-008`
- **Code changes:** Added `POST /api/v1/bookings` with validated guest inputs, Iranian mobile normalization, bounded public rate limiting, idempotency-key request fingerprints, chronological PostgreSQL inventory row locks, transactional holds and booking-night price snapshots, random public references, and a PII-limited response projection. Added a forward-only migration for idempotency request hashes and safe availability/capacity/idempotency error codes.
- **Tests:** After rebasing onto current `main`, API unit tests passed (13 suites, 59 tests); API e2e tests passed (9 suites, 45 tests); isolated PostgreSQL tests passed (4 suites, 14 tests). Frozen-lockfile install, isolated migration deploy/status, lint, typecheck, Prettier check, and production build passed.
- **Merge/cleanup:** Merged to `main` in `ccf819b`; branch and Git worktree registration removed. Windows left residual `apps` and `node_modules` folders at the former worktree path.
- **Scope:** Create booking request, nightly price snapshots, inventory holds, public reference, and idempotency handling in one transaction.

**Acceptance criteria:**

- API rechecks every requested date while holding inventory locks.
- Inventory changes and booking creation either all commit or all roll back.
- Repeated request with the same idempotency key does not create a duplicate.
- Public response contains only the reference, status, dates, room details, guest count, and price summary.
- Unavailable dates return an availability-changed error with no partial inventory changes.

**Required tests/checks:** unit tests for totals/validation and PostgreSQL integration tests for rollback, price snapshot, duplicate retry, and concurrent last-room booking.

## HBE-009 — Implement booking status transitions and expiry worker

- **Priority:** P0
- **Depends on:** HBE-008, HBE-007
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-009-booking-lifecycle` — `C:\hb\HBE-009`
- **Code changes:** Added transaction-locked status transitions with inventory conversion/release, idempotent 60-second expiry scans with safe error logging, and internal cancellation/note fields. Documented the single-API-instance worker limit.
- **Tests:** After rebasing onto current `main`, API unit tests passed (15 suites/79 tests); API e2e tests passed (9 suites/45 tests); isolated PostgreSQL tests passed (5 suites/22 tests), including status/counter transitions, repeated expiry, and staff-confirmation-versus-expiry concurrency. Four migrations applied and status is up to date; lint, typecheck, Prettier check, and production build passed.
- **Merge/cleanup:** Merged to `main` in `c99005d`; branch and Git worktree registration removed. Windows left residual `apps` and `node_modules` folders at the former worktree path.
- **Scope:** Confirm, reject, cancel pending/confirmed request, and expire 24-hour pending requests.

**Acceptance criteria:**

- Only allowed transitions from Section 8 are accepted.
- Every transition and inventory counter update is transactional.
- Repeating an action does not release inventory twice.
- Expired pending bookings release all holds.
- Staff action racing with expiry produces one valid final state.
- Expiry task is safe to run repeatedly and logs failures without guest PII.

**Required tests/checks:** status state-machine unit tests, database integration tests, and expiry race/idempotency tests.

## HBE-010 — Build staff inventory API

- **Priority:** P0
- **Depends on:** HBE-006, HBE-007
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-010-inventory-api` — `C:\hb\HBE-010`
- **Code changes:** Added authenticated staff inventory range reads and admin-only atomic range updates, strict date/value validation, row locks and capacity protection, stable `CAPACITY_BELOW_RESERVED` errors, and safe per-night response DTOs. Booking price snapshots remain unchanged.
- **Tests:** After rebasing onto current `main`, API unit tests passed (11 suites/48 tests), API e2e tests passed (8 suites/39 tests), and isolated PostgreSQL tests passed (3 suites/10 tests), including database constraint and range rollback coverage. Frozen install, migration status, lint, typecheck, Prettier, and production build passed.
- **Merge/cleanup:** Merged to `main` in `6ff4223`; branch and Git worktree registration removed. Windows left residual `apps` and `node_modules` folders at the former worktree path.
- **Scope:** Read and batch-update inventory and nightly prices by room type/date range.

**Acceptance criteria:**

- Admin can set capacity and price for a date range.
- Receptionist cannot mutate inventory.
- Capacity cannot be lowered below held plus booked rooms.
- Existing booking snapshots remain unchanged after a price edit.
- Batch update is atomic and reports invalid dates/values.

**Required tests/checks:** API e2e role checks and PostgreSQL integration tests for constraints and batch rollback.

## HBE-011 — Build staff booking list and management API

- **Priority:** P0
- **Depends on:** HBE-007, HBE-009
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-011-staff-bookings-api` — `C:\hb\HBE-011`
- **Merge/cleanup:** Merged to `main` in `410fc6e`; branch and Git worktree registration removed. Windows left residual `apps` and `node_modules` folders at the former worktree path.
- **Code changes:** Added role-protected staff list/detail and confirm/reject/cancel routes, validated filters and deterministic pagination, phone/reference search, and explicit list/detail DTOs that limit guest information to staff views. Actions delegate to the booking transition service and return the current booking state.
- **Tests:** After rebase, web unit tests passed (16 files/58 tests), API unit tests passed (15 suites/79 tests), API e2e passed (10 suites/56 tests), and PostgreSQL integration tests passed (5 suites/22 tests) on fresh isolated database `hotel_booking_hbe011_db_test`. Frozen install, migration status (4 migrations; up to date), lint, typecheck, Prettier check, production build, and diff checks passed.
- **Scope:** Paginated staff booking list/detail, filters, search, and status actions.

**Acceptance criteria:**

- Staff can filter by status and arrival date and search by reference or phone.
- Pagination is deterministic.
- Guest details are available only to authorized staff.
- Confirm/reject/cancel actions call the domain service and return current state.
- Invalid transitions return a conflict response.

**Required tests/checks:** API e2e tests for pagination, filters, privacy, and role/status behavior.

## HBE-012 — Build Persian RTL public site shell and hotel pages

- **Priority:** P0
- **Depends on:** HBE-001, HBE-005
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-012-public-site` — `C:\hb\HBE-012`
- **Code changes:** Persian RTL home, room list/detail pages, shared public shell, typed server-side API client, loading/error/not-found states, local fonts, and responsive visual system.
- **Tests:** Vitest 6/6; Playwright 4/4 across desktop and mobile; format, lint, typecheck, and production build pass.
- **Scope:** Shared layout, Persian locale strings, hotel home/room pages, Tailwind design tokens, responsive nav/footer.

**Acceptance criteria:**

- Document language and RTL direction are correct.
- Public content is loaded from the API, not hardcoded in page components.
- Layout works on mobile and desktop.
- Accessible heading structure, focus styles, and semantic controls are present.
- Loading, API error, and not-found states are designed.

**Required tests/checks:** Vitest component tests and Playwright smoke test for public pages.

## HBE-013 — Build date search and availability results UI

- **Priority:** P0
- **Depends on:** HBE-006, HBE-012
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-013-search-ui` / `C:\hb\HBE-013`
- **Code changes:** Persian RTL date/guest search, tested Jalali/Gregorian adapter, same-origin availability proxy, API-priced room cards, and distinct validation/loading/empty/unavailable/server-error states.
- **Tests:** After rebasing onto current `main`, web Vitest passed (20/20), API unit tests passed (13 suites/59 tests), API e2e passed (9 suites/45 tests), PostgreSQL integration passed (4 suites/14 tests), and Playwright passed (6/6 across desktop and mobile). Frozen install, isolated migration deploy/status, lint, typecheck, format, and production build passed.
- **Merge/cleanup:** Merged to `main` in `8226c67`; branch and Git worktree registration removed. Windows left residual `apps` and `node_modules` folders at the former worktree path.
- **Scope:** Date/guest search form, Jalali display adapter, API query, results cards, capacity and total price display.

**Acceptance criteria:**

- Form blocks invalid ranges before calling API.
- API receives Gregorian ISO dates.
- Every price is labeled as Toman and matches the API response.
- Empty, loading, validation, unavailable, and server-error states are distinct.
- Date conversion covers month/year and leap-year boundaries.

**Required tests/checks:** Vitest date/form tests, component behavior tests, and Playwright search flow.

## HBE-014 — Build guest booking form and confirmation page

- **Priority:** P0
- **Depends on:** HBE-008, HBE-013
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-014-booking-flow` / `C:\hb\HBE-014`
- **Code changes:** `/booking` request/confirmation page, accessible guest form, validation/idempotency client, privacy-filtering booking proxy, and search-to-book link.
- **Tests:** After rebasing onto current `main`, web Vitest passed (46/46), API unit tests passed (15 suites/79 tests), API e2e passed (9 suites/45 tests), PostgreSQL integration passed (5 suites/22 tests on a fresh isolated `hotel_booking_hbe014_db_test`), and Playwright passed (10/10 on desktop/mobile using guarded `hotel_booking_hbe014_test`). Frozen install, migration deploy/status, lint, typecheck, format, production build, and diff checks passed.
- **Merge/cleanup:** Merged to `main` in `2244183`; branch and Git worktree registration removed. Windows left residual `apps` and `node_modules` folders at the former worktree path.
- **Scope:** Room quantity selection, guest contact form, total summary, submit state, duplicate-click prevention, and confirmation display.

**Acceptance criteria:**

- Guest can submit a request without an account.
- Name and normalized Iranian mobile are validated.
- Guest sees that staff confirmation is pending.
- Repeated clicks/retries cannot create duplicate bookings.
- Confirmation page does not expose internal IDs or guest information beyond the user's current form session.
- If availability changed, guest can return to search and choose again.

**Required tests/checks:** Vitest schema/component tests and Playwright guest booking flow, including API error path.

## HBE-015 — Build staff login and protected dashboard shell

- **Priority:** P0
- **Depends on:** HBE-007, HBE-012
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-015-staff-shell` — `C:\hb\HBE-015`
- **Merge/cleanup:** Merged to `main` in `520e507`; branch and Git worktree registration removed. Windows left residual `apps` and `node_modules` folders at the former worktree path.
- **Code changes:** Added a Persian staff sign-in page and session-gated dashboard shell; credentialed API requests keep the session in an HttpOnly cookie and the CSRF token in memory. Added receptionist/admin navigation, logout, expiry redirect, responsive RTL styling in a staff-scoped CSS module, production API URL validation, and consistent demo-hotel branding.
- **Tests:** Frozen install passed. Web unit/component tests passed (16 files, 58 tests); Playwright passed (18 tests across desktop and mobile), including signed-out route and direct API denial, login/logout, role navigation, session expiry, keyboard flow, and axe WCAG A/AA. API unit tests passed (79), API e2e passed (45), and PostgreSQL integration tests passed (22) on a fresh isolated test database. Web/API lint, typecheck, production build, repository format check, and React Doctor (100/100) passed. Four Prisma migrations were applied and the test schema was up to date.
- **Scope:** Staff login page, protected route layout, current-user state, navigation, logout, and unauthorized redirect.

**Acceptance criteria:**

- Staff pages are inaccessible when signed out.
- Login errors are understandable and do not reveal whether a username exists.
- Admin-only navigation is not shown to receptionists.
- API authorization remains enforced if a user manually calls an endpoint.
- Session expiry is handled cleanly.
- Production staff API requests require an explicitly configured HTTPS base URL; invalid configuration must not send credentials.
- Private staff data must stay behind guarded staff APIs until a server-aware page guard is available; the current anonymous staff page response contains only the generic shell.

**Required tests/checks:** component tests and Playwright login/role/expired-session flows.

## HBE-016 — Build staff booking operations UI

- **Priority:** P0
- **Depends on:** HBE-011, HBE-015
- **Owner:** Codex
- **Status:** Completed and merged to `main` (`1075b4901f1d2f39f642cef618102f6d2337b1e0`)
- **Branch/worktree:** `codex/hbe-016-booking-ops-ui` — removed after merge
- **Code changes:** Staff booking list/detail/filter/action UI, API client, responsive styles, action-state regression coverage, and shared E2E staff session fixture.
- **Tests:** Web Vitest 72/72; full Playwright 26/26 (13 desktop + 13 mobile, including Axe); API unit 79/79; API e2e 56/56; PostgreSQL integration 28/28; lint, typecheck, format, build, and diff checks passed.
- **Scope:** Booking table, filtering, details view, confirm/reject/cancel actions, status feedback.

**Acceptance criteria:**

- Staff can find a booking by status/date/reference/phone.
- Guest data is limited to the authorized staff view.
- Confirm/reject/cancel require a final confirmation step where accidental action is plausible.
- UI reflects updated server state and handles stale/conflict responses.
- Keyboard navigation and mobile layout work.

**Required tests/checks:** Vitest action/error-state tests, Playwright staff processing flow, and axe check.

**Cleanup note:** Windows left residual `apps` and `node_modules` folders at `C:\hb\HBE-016`; the Git worktree registration and branch were removed.

## HBE-017 — Build staff inventory calendar/editor

- **Priority:** P1
- **Depends on:** HBE-010, HBE-015
- **Owner:** Codex
- **Status:** Completed and merged to `main` (`0972ce9f5c56e9f5ee411e5ac5d9ace6cea52332`)
- **Branch/worktree:** `codex/hbe-017-inventory-ui` — removed after merge
- **Code changes:** Admin range editor and API; admin-only room-type options include inactive types with an explicit label; shared worker-scoped E2E staff fixture.
- **Tests:** Unit 165 total (API 80, web 85); API e2e 59/59; PostgreSQL integration 28/28; Playwright 32/32 (16 desktop + 16 mobile, including Axe); lint, typecheck, format, build, and React Doctor 100/100 passed.
- **Scope:** Room type/date-range inventory editor for room count and nightly price.

**Acceptance criteria:**

- Admin can view and edit date ranges.
- Receptionist cannot see or submit inventory mutations.
- UI explains why an edit is rejected when capacity is below reservations.
- Saving multiple dates reports success or field-specific errors.
- Existing bookings are not repriced.

**Required tests/checks:** component/API behavior tests, Playwright admin-versus-receptionist test, accessibility check.

**Cleanup note:** Windows left residual `apps` and `node_modules` folders at `C:\hb\HBE-017`; the Git worktree registration and branch were removed.

## HBE-018 — Add frontend unit/component and accessibility suite

- **Priority:** P0
- **Depends on:** HBE-012, HBE-013, HBE-014
- **Owner:** Codex
- **Status:** Completed and merged to `main` (`eeab44bca362c7aae0746d4f349de37584a229b1`)
- **Branch/worktree:** `codex/hbe-018-web-test-suite` — removed after merge
- **Code changes:** Added V8 coverage reporting and aggregate floors for the core availability, Jalali/date, booking-schema, and inventory/capacity utilities; documented root `pnpm test` and the web coverage command. Added axe scans and keyboard search submission to the existing guest browser flows. Axe exposed two public color-token contrast failures, fixed by reusing the accessible staff token values. ESLint now ignores generated coverage reports.
- **Tests:** Web Vitest passed (21 files/85 tests); core coverage: 91.08% statements, 88.23% branches, 100% functions, 92.9% lines (floors 88/80/95/90). Root `pnpm test` passed (web 85, API 15 suites/80). Playwright passed 32/32 desktop/mobile cases, including guest search/booking axe checks and staff journeys, on isolated `hotel_booking_hbe018_full_test`. Lint, typecheck, format check, API/web production builds, and React Doctor (100/100) passed.
- **Cleanup note:** Windows left residual `apps` and `node_modules` folders at `C:\hb\HBE-018`; the Git worktree registration and branch were removed.
- **Scope:** Configure Vitest, React Testing Library, coverage reporting, axe, and user behavior tests.

**Acceptance criteria:**

- Core formatting, date, validation, and capacity utilities have tests.
- Search, booking, and staff components cover success/error/loading/empty behavior.
- Tests assert user-visible outcomes rather than implementation details.
- RTL keyboard and accessible-name checks are included.
- Root `test` script is documented.

**Required tests/checks:** suite runs in CI; record coverage for core web behavior.

## HBE-019 — Add backend unit, API e2e, and PostgreSQL integration suite

- **Priority:** P0
- **Depends on:** HBE-006 through HBE-011
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-019-api-test-suite` — `C:\hb\HBE-019`
- **Merge/cleanup:** Merged to `main` in `fc2d0bd`; branch and Git worktree registration removed. Windows left residual `apps` and `node_modules` folders at the former worktree path.
- **Code changes:** Fixed the seed test so it verifies existing bookings are preserved and cleans only its own fixtures. Added `_test` database URL validation, safe create-if-missing setup, additive migration preparation, and repeatable booking/inventory branch-coverage gates.
- **Tests:** API unit tests passed (15 suites/79 tests), API e2e passed (10 suites/56 tests), PostgreSQL integration tests passed (6 suites/28 tests), and the combined coverage suite passed (21 suites/107 tests). Branch coverage: BookingsService 81.25%, StaffInventoryService 83.33%. Frozen install, migration status, lint, typecheck, Prettier check, production build, and diff checks passed. Database preparation was verified against the isolated `hotel_booking_hbe019_test`; no reset/drop was run.
- **Scope:** Repeatable backend checks, isolated test database guard and preparation, fixture cleanup, coverage, and concurrency tests.

**Acceptance criteria:**

- Booking rules have unit tests.
- HTTP validation, error format, auth, permissions, and pagination have API e2e tests.
- Integration tests use PostgreSQL, not SQLite or repository mocks, for transactional guarantees.
- Concurrent last-room booking test proves at most one successful hold.
- Booking and inventory services meet 80% branch coverage target.

**Required tests/checks:** isolated `_test` database guard, additive migrations, fixture cleanup, integration suite, and coverage report run in CI.

## HBE-020 — Add Playwright guest/staff end-to-end suite

- **Priority:** P0
- **Depends on:** HBE-014, HBE-016, HBE-017, HBE-018, HBE-019
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-020-playwright-e2e` / `C:\hb\HBE-020`
- **Merge/cleanup:** Merged into `main` as `10594d4`; branch and Git worktree registration removed. Windows left residual `apps` and `node_modules` directories at the former worktree path.
- **Code changes:** Added a real-hold inventory oversell browser case with staff rejection cleanup; isolated browser guest, staff, and inventory fixture phones from the API staff-booking fixture prefix; made guest/staff booking cleanup failure-safe with exact-phone fallback lookup, rejected pending/cancelled confirmed fixtures, restored inventory snapshots, and revoked staff worker sessions after refreshing CSRF; waited for the asynchronous staff booking-list request before asserting route interception.
- **Tests:** The original full Playwright run passed 34/34 (17 desktop + 17 mobile), then API e2e passed 59/59 against the same fresh `hotel_booking_hbe020_combined_213857_test` database. The cleanup follow-up passed two consecutive full Playwright reruns (34/34 each) and API e2e 59/59 against the same `hotel_booking_hbe020_followup_215950_test` database without database reset/drop. The browser guest/staff/inventory fixtures use separate `0914`/`0915`/`0916` prefixes, avoiding the `09123` prefix searched by API staff-booking tests. PostgreSQL integration passed 28/28 on a separate fresh `hotel_booking_hbe020_pg_214221_test` database. Final root `pnpm test` passed (API 15 suites/80 tests; web 21 files/85 tests); lint, typecheck, full format check, production build, and React Doctor (100/100) passed.
- **Scope:** Browser tests against the web app, API, and disposable test database.

**Acceptance criteria:**

- Guest can search and submit a request.
- Staff can sign in and confirm or reject it.
- Inventory editor rejects overselling capacity.
- RTL mobile and desktop smoke paths pass.
- Test data is reset and tests do not depend on order.

**Required tests/checks:** Playwright suite runs in CI with trace/screenshot artifacts on failure only; artifacts contain only fictional seeded data.

## HBE-021 — Add OpenAPI, contract checks, README, and demo materials

- **Priority:** P0
- **Depends on:** HBE-005 through HBE-020
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-021-openapi-docs` — `C:\hb\HBE-021` (merged as `fe4b6db`; Git branch and worktree registration removed)
- **Code changes:** Registered development/test-only Swagger UI, JSON, and YAML from DTO metadata; documented implemented public, booking, health, and staff routes, schemas, cookie auth, CSRF, idempotency headers, and the expected 403 from Swagger login Try it out due to the `WEB_ORIGIN` guard. Rewrote the README with architecture, clean setup, seed, demo, troubleshooting, release-check guidance, and the browser login note. Added a reproducible screenshot capture script and reviewed Persian RTL guest and staff screenshots.
- **Tests:** After rebasing onto `main` at `8c73a9e`, full `pnpm check` passed all 10 gates: format, lint, typecheck, unit tests (API 80; web 85), API PostgreSQL coverage (108 tests; booking branch coverage 81.25%, inventory 83.33%), API seed, web coverage (85 tests; 91.08% statements / 88.23% branches), Playwright desktop/mobile (34/34), API e2e and OpenAPI contract (60/60), and API/web production builds. OpenAPI contract test passed separately (1/1) after asserting the login-origin guidance. Live Swagger UI and JSON returned HTTP 200; the JSON listed 16 paths. Prisma migrations and seed passed on isolated `hotel_booking_hbe021_readme_test`. The Playwright-managed Chromium download stalled locally; for both full checks, a temporary backed-up config selected installed Chrome and restored the managed-Chromium config in `finally`. README setup and screenshots were reviewed; no secrets or real guest data were included.
- **Cleanup:** Windows left residual `apps` and `node_modules` folders at `C:\hb\HBE-021` after Git removed the worktree registration. These leftovers were not recursively deleted.
- **Scope:** Complete API docs, validate OpenAPI, document setup and architecture, add screenshots and demo flow.

**Acceptance criteria:**

- Swagger/OpenAPI is available in development.
- README has architecture, prerequisites, setup, seed, test, and troubleshooting instructions.
- README labels the project as a booking-request system with staff confirmation and no online payment.
- Demo login credentials are clearly development-only and sourced from environment configuration.
- Screenshots show the Persian RTL public and staff flows.
- No fabricated customer metrics or claims are included.

**Required tests/checks:** follow README from a clean checkout and run all release-gate scripts.

## HBE-022 — Add CI quality and release gates

- **Priority:** P0
- **Depends on:** HBE-001, HBE-018, HBE-019, HBE-020
- **Owner:** Codex
- **Status:** Done
- **Branch/worktree:** `codex/hbe-022-ci-gates` / `C:\hb\HBE-022` (merged as `023cea8`; Git branch and worktree registration removed)
- **Code changes:** Added a pull-request/push GitHub Actions release-gate job with a per-job PostgreSQL 18 service, fictional CI-only credentials, read-only repository permissions, managed Chromium installation, and failure-only Playwright artifact upload. Added a root `pnpm check` runner that prints each package command and stops on the first failure. Aligned Playwright ports across config and staff fixtures and removed the system-Chrome channel so CI uses Playwright-managed Chromium.
- **Tests:** `pnpm install --frozen-lockfile`; `pnpm check` passed formatting, lint, types, API/web unit tests, API PostgreSQL migration/integration/coverage (21 suites/108 tests; booking branch 81.25%, inventory 83.33%), seed, web coverage (21 files/85 tests; 91.08% statements, 88.23% branches, 100% functions, 92.9% lines), Playwright 34/34, API e2e/OpenAPI 59/59, and production builds. Local Playwright used the installed-Chrome fallback because the managed Chromium download stalled at about 10%; the final no-channel config listed all 34 projects/tests and `playwright install --dry-run chromium` resolved the CI browser. `actionlint` and final format/diff checks passed. No live GitHub Actions run or branch-protection setting was available locally.
- **Cleanup:** Windows left residual `apps` and `node_modules` folders at `C:\hb\HBE-022` after Git removed the worktree registration. These leftovers were not recursively deleted.
- **Scope:** Configure CI for formatting, lint, type checks, tests, migrations/integration, Playwright, and builds.

**Acceptance criteria:**

- Pull requests cannot pass CI if required checks fail.
- Test database is isolated and ephemeral.
- CI does not require production secrets.
- Failure output identifies the failing package and command.
- Root `check` script matches the documented release gates.

**Required tests/checks:** verify CI on a clean branch and confirm each required job is visible.
