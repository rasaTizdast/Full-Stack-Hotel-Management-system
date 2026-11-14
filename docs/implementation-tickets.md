# Implementation Tickets

Source of truth: `prd.md`, section 15. No external issue tracker is configured, so this file is the project ticket register.

Each ticket has one owner. Work starts in its own Git worktree and branch. Set status to `In progress` when implementation starts; set it to `Done` only after acceptance criteria and required checks pass. Record branch/worktree, code, and test links before merging into `main` and removing the worktree.

Status values: `Not started`, `In progress`, `Blocked`, `Done`.

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
- **Status:** Implemented; awaiting orchestrator merge
- **Branch/worktree:** `codex/hbe-020-playwright-e2e` / `C:\hb\HBE-020`
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
- **Status:** Not started
- **Branch/worktree:** —
- **Code changes:** —
- **Tests:** —
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
- **Status:** Not started
- **Branch/worktree:** —
- **Code changes:** —
- **Tests:** —
- **Scope:** Configure CI for formatting, lint, type checks, tests, migrations/integration, Playwright, and builds.

**Acceptance criteria:**

- Pull requests cannot pass CI if required checks fail.
- Test database is isolated and ephemeral.
- CI does not require production secrets.
- Failure output identifies the failing package and command.
- Root `check` script matches the documented release gates.

**Required tests/checks:** verify CI on a clean branch and confirm each required job is visible.
