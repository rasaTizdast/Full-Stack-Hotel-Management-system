# Hotel Booking Engine Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan inline, one ticket at a time. Each ticket is completed in its own Git worktree; do not start a dependent ticket until the previous required ticket has merged.

**Goal:** Deliver the complete Persian-first small-hotel booking-request system defined by the PRD, with a public guest flow, protected staff operations, transactional inventory, local setup, and verified release gates.

**Architecture:** One pnpm workspace contains a Next.js App Router web app and a NestJS REST API. PostgreSQL is the only product data store, Prisma owns migrations and routine queries, and booking operations use short database transactions with stable row locking to prevent overselling.

**Tech Stack:** Node.js 22, pnpm workspaces, Next.js, React, strict TypeScript, Tailwind CSS, NestJS, PostgreSQL, Prisma, Vitest, React Testing Library, Jest, Supertest, Playwright, Docker Compose, and GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-14-hotel-booking-design.md`; ticket acceptance criteria and checks: `docs/implementation-tickets.md`; product source: `prd.md`.

## Global Constraints

- Deliver one hotel only; no real payment provider, SMS/email provider, guest account, physical room assignment, or multi-hotel tenancy.
- Keep application code in strict TypeScript/TSX; use Tailwind CSS, API boundary DTO validation, and generated OpenAPI documentation.
- Persist Gregorian business dates as `YYYY-MM-DD`; display Jalali dates in the Persian UI; check-in is inclusive and checkout is exclusive.
- Store money as integer Toman and name fields with the unit.
- API/database rules are authoritative; missing inventory rows mean unavailable.
- Pending booking requests hold inventory for 24 hours; state changes and inventory counters commit atomically and are idempotent.
- Use fictional demo content and environment-sourced local staff credentials; commit no secrets or real guest data.
- Provide labeled, keyboard-accessible forms with visible focus, clear loading/error/success states, and responsive RTL layouts.
- PostgreSQL integration tests prove database constraints and concurrency behavior; do not substitute SQLite or mocks for transaction guarantees.
- Each ticket has one worktree and branch; test and review it before merging to `main`, then remove its worktree and branch.

---

## File and module boundaries

- Root workspace owns package scripts, pnpm metadata, formatting/lint configuration, shared environment examples, CI, and developer documentation.
- `apps/web/src/app` owns route composition and metadata. Reusable guest and staff UI lives under `apps/web/src/components`; API clients, schemas, date conversion, and formatting live under `apps/web/src/lib`.
- `apps/api/src` is a NestJS modular monolith. Controllers and DTOs own HTTP boundaries; services own domain rules; Prisma is the data access client. Product modules are `hotel`, `room-types`, `availability`, `bookings`, `staff-auth`, and `staff-inventory`.
- `apps/api/prisma` owns schema, migrations, and fictional idempotent seed data.
- `infra` owns local PostgreSQL Compose configuration. `docs` owns the ticket register, decisions, operational guidance, and screenshots.

## Ticket execution protocol

Before each ticket, confirm `main` is clean and every earlier dependency is merged. Create a branch named `codex/<ticket-id>-<short-scope>` and a worktree at `../Hotel Booking system-worktrees/<ticket-id>`. Mark only that ticket `In progress` in the ticket register. Implement and test acceptance criteria, review the diff for secrets and unrelated changes, set the ticket to `Done` with branch, code, and test links, and commit with the ticket ID in the subject. From the main checkout, merge the ticket branch, verify the merge commit and clean state, then remove that worktree and delete the merged branch. If a required check fails, keep the ticket open and fix it in the same worktree.

Use test-first implementation for behavior: add a focused failing test, run it to establish the expected failure, implement the smallest change, and rerun the test. Run each ticket's full required checks from `docs/implementation-tickets.md` before marking it done.

---

## Implementation tasks

### Task 1: HBE-001 — Establish monorepo workspace and app boundaries

- **Worktree:** `../Hotel Booking system-worktrees/HBE-001`
- **Branch:** `codex/hbe-001-workspace`

**Files:** Create/update root `package.json`, `pnpm-workspace.yaml`, root TypeScript/ESLint/Prettier configuration, `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`, `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/nest-cli.json`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/app.controller.ts`, `apps/api/src/app.service.ts`, and `README.md`.

**Produces:** Root `dev`, per-app development, `lint`, `typecheck`, `format:check`, and `build` commands; independently runnable Next.js and NestJS applications; strict TypeScript; Tailwind CSS in the web app; a committed root `pnpm-lock.yaml`.

- [x] Create the HBE-001 worktree and mark HBE-001 in progress.
- [x] Scaffold both apps with strict TypeScript and the declared boundaries; keep app source in TS/TSX.
- [x] Add root workspace scripts and initial setup instructions to README.
- [x] Run root and app type checks, lint, formatting check, and both production builds.
- [x] Mark HBE-001 done, commit `feat(HBE-001): establish monorepo workspace`, merge to `main`, and remove the worktree and branch.

### Task 2: HBE-002 — Add local PostgreSQL and environment configuration

- **Worktree:** `../Hotel Booking system-worktrees/HBE-002`
- **Branch:** `codex/hbe-002-postgres-config`

**Files:** Create `infra/docker-compose.yml`, `.env.example`, and API configuration/database/readiness modules under `apps/api/src`; extend `README.md` and API e2e tests.

**Produces:** Documented database start/stop commands, validated environment configuration, Prisma connectivity, liveness and database readiness endpoints, and actionable database-unavailable responses.

- [x] Create the HBE-002 worktree after HBE-001 merges and mark the ticket in progress.
- [x] Write readiness success and database-unavailable integration tests before implementation.
- [x] Configure PostgreSQL health checks and a persistent local volume in Compose; keep credentials in local environment variables.
- [x] Wire Nest configuration and Prisma connection lifecycle; keep readiness distinct from liveness.
- [x] Run the required readiness integration cases and document the Compose workflow.
- [ ] Mark done, commit `feat(HBE-002): configure local PostgreSQL`, merge, and remove the worktree and branch.

### Task 3: HBE-003 — Create schema, migrations, and fictional seed data

- **Worktree:** `../Hotel Booking system-worktrees/HBE-003`
- **Branch:** `codex/hbe-003-schema-seed`

**Files:** Create `apps/api/prisma/schema.prisma`, migration directories, `apps/api/prisma/seed.ts`, Prisma scripts, and PostgreSQL integration tests for schema constraints and seed repeatability.

**Produces:** Hotel, RoomType, RoomNightInventory, Booking, BookingNight, and StaffUser tables with the PRD's indexes, foreign keys, uniqueness, and non-negative/count checks; repeat-safe fictional demo seed.

- [x] Create the HBE-003 worktree and mark it in progress.
- [x] Write database integration cases for unique room-type/date inventory, inventory bounds, non-negative Toman prices, and repeat seed behavior.
- [x] Implement Prisma schema and create a forward-only initial migration.
- [x] Seed one hotel, multiple room types, future inventory, and an admin whose credentials come from environment configuration.
- [x] Apply migrations to a fresh PostgreSQL database, inspect migration status, run the seed twice, and run all constraint cases.
- [x] Mark done and commit `feat(HBE-003): add hotel booking schema and seed`.
- [ ] Merge after orchestrator review, then remove the worktree and branch.

### Task 4: HBE-004 — Define API errors and request validation

- **Worktree:** `../Hotel Booking system-worktrees/HBE-004`
- **Branch:** `codex/hbe-004-api-validation`

**Files:** Add shared API DTO/error/request-context utilities under `apps/api/src/common`; configure `apps/api/src/main.ts`; add Supertest cases for valid DTOs, invalid DTOs, unknown fields, request IDs, and redaction.

**Produces:** `/api/v1` prefix, global whitelist/forbid validation, stable error JSON, request IDs, and safe logging behavior.

- [x] Create the HBE-004 worktree and mark it in progress.
- [x] Add API e2e tests for valid and invalid input, malformed/unknown fields, error codes, request IDs, field details, and absence of sensitive data in logs/responses.
- [x] Implement global validation and the exception filter without changing domain behavior.
- [x] Run the API e2e suite and confirm every error path uses the stable response shape; lint, typecheck, format, and build checks also pass.
- [ ] Mark done, commit `feat(HBE-004): standardize API validation and errors`, merge, and remove the worktree and branch.

### Task 5: HBE-005 — Build public hotel and room-type endpoints

- **Worktree:** `../Hotel Booking system-worktrees/HBE-005`
- **Branch:** `codex/hbe-005-public-catalog-api`

**Files:** Add `apps/api/src/hotel` and `apps/api/src/room-types` modules, response DTOs, Prisma queries, unit tests, and API e2e privacy/serialization tests.

**Produces:** Public read-only hotel details and active room types; no guest, staff, or internal database fields leak through response DTOs.

- [x] Create the HBE-005 worktree and mark it in progress.
- [x] Write service tests and HTTP cases for public fields, inactive rooms, and serialization privacy.
- [x] Implement versioned GET endpoints and explicit public response DTOs.
- [x] Run service unit tests and API e2e checks against PostgreSQL seed data.
- [x] Mark done and commit `feat(HBE-005): expose public hotel and rooms`.
- [ ] Merge after orchestrator review, then remove the worktree and branch.

### Task 6: HBE-006 — Implement availability and server-side price preview

- **Worktree:** `C:\hb\HBE-006` (short Windows path to support reliable cleanup)
- **Branch:** `codex/hbe-006-availability`

**Files:** Add `apps/api/src/availability` query DTOs, response DTOs, service, controller, date/price utilities, unit tests, and PostgreSQL-backed API integration tests.

**Produces:** Availability for every night in a requested stay, capacity validation, and integer-Toman price breakdown using exclusive checkout semantics.

- [x] Create the HBE-006 worktree and mark it in progress.
- [x] Write unit cases for date boundaries, missing rows, capacity, nightly multiplication, totals, invalid/past dates, and the 30-night limit.
- [x] Write PostgreSQL API integration cases for full-range availability and checkout exclusivity.
- [x] Implement validated availability queries and server-calculated totals using integer arithmetic.
- [x] Run unit, PostgreSQL e2e/integration tests, strict install, lint, typecheck, format, and build checks.
- [x] Mark done and commit `feat(HBE-006): add availability search` after all required checks pass.
- [ ] Merge after orchestrator review, then remove the worktree and branch.

### Task 7: HBE-007 — Implement staff authentication and authorization

- **Worktree:** `../Hotel Booking system-worktrees/HBE-007`
- **Branch:** `codex/hbe-007-staff-auth`

**Files:** Add `apps/api/src/staff-auth` DTOs, services, controllers, guards, cookie/CSRF handling, persisted session support, rate limiting, unit tests, and API e2e tests; extend Prisma schema/migrations only for session records required by the accepted spec.

**Produces:** Login, logout, current-user routes, hashed passwords, immediately invalidatable server-side sessions, CSRF-protected mutations, and ADMIN/RECEPTIONIST authorization.

- [x] Create the HBE-007 worktree and mark it in progress.
- [x] Write policy unit tests and HTTP cases for unauthenticated access, roles, secure cookie flags, CSRF, logout invalidation, rate limiting, and CORS origin policy.
- [x] Implement password verification, opaque persisted sessions, cookie lifecycle, guards, and role policy.
- [x] After rebasing onto current `main`, run API unit tests (9 suites, 39 tests), API e2e tests (7 suites, 29 tests), and PostgreSQL integration tests (2 suites, 8 tests); verify redaction and session invalidation.
- [x] Pass frozen-lockfile install, lint, typecheck, format check, production build, and isolated migration status.
- [x] Mark ticket done and commit `feat(HBE-007): add secure staff authentication`.
- [x] Merge to `main`, delete the branch, and remove its Git worktree registration.
- **Cleanup note:** Windows left residual `apps` and `node_modules` folders at the former worktree path; no recursive deletion was attempted.

### Task 8: HBE-008 — Implement transactional booking requests and idempotency

- **Worktree:** `C:\hb\HBE-008`
- **Branch:** `codex/hbe-008-booking-requests`

**Files:** Add booking request DTOs/controller/service and transactional persistence under `apps/api/src/bookings`; add database integration tests for rollback, price snapshots, retry, and concurrent last-room requests.

**Produces:** One booking request for one room type and quantity, random public reference, per-night price snapshots, temporary holds, and stable idempotency-key behavior.

- [x] Create the HBE-008 worktree and mark it in progress.
- [x] Add unit cases for input/capacity/total rules and PostgreSQL tests for rollback, snapshots, duplicate retries, and concurrent last-room attempts.
- [x] Implement one transaction that locks inventory nights in chronological order, re-reads availability, increments holds, and inserts booking snapshots.
- [x] Ensure unavailable inventory returns an availability-changed error and leaves no partial writes.
- [x] After rebasing onto current `main`, run API unit tests (13 suites, 59 tests), API e2e tests (9 suites, 45 tests), PostgreSQL integration tests (4 suites, 14 tests), frozen install, isolated migration deploy/status, lint/typecheck/format, and production build.
- [x] Mark done and commit `feat(HBE-008): add atomic booking requests`.
- [x] Merge to `main` (`ccf819b`), remove the Git worktree registration, and delete the branch.
  - **Cleanup note:** Windows left residual `apps` and `node_modules` folders at the former worktree path; no recursive deletion was attempted.

### Task 9: HBE-009 — Implement booking transitions and expiry

- **Worktree:** `C:\hb\HBE-009`
- **Branch:** `codex/hbe-009-booking-lifecycle`

**Files:** Extend `apps/api/src/bookings` with a status state machine and transactional counter transitions; add a scheduled expiry provider and unit/PostgreSQL race tests.

**Produces:** Allowed pending/confirmed/rejected/cancelled/expired transitions, exactly-once inventory release/conversion, and repeat-safe 24-hour expiry.

- [x] Create the HBE-009 worktree and mark it in progress.
- [x] Write state-machine cases for allowed/disallowed transitions and database tests for idempotency, counter updates, and expiry races.
- [x] Implement transaction-locked transitions and an idempotent expiry scan that records no guest PII.
- [x] After rebasing onto current `main`, run API unit tests (15 suites/79 tests), API e2e tests (9 suites/45 tests), PostgreSQL tests (5 suites/22 tests), migration status, lint/typecheck/format, and production build.
- [x] Mark done and commit `feat(HBE-009): add booking lifecycle and expiry`.
- [x] Merge to `main` (`c99005d`), remove the Git worktree registration, and delete the branch.
  - **Cleanup note:** Windows left residual `apps` and `node_modules` folders at the former worktree path; no recursive deletion was attempted.

### Task 10: HBE-010 — Build staff inventory API

- **Worktree:** `C:\hb\HBE-010`
- **Branch:** `codex/hbe-010-inventory-api`

**Files:** Add `apps/api/src/staff-inventory` DTOs/controller/service and PostgreSQL/API tests for roles, constraints, atomic batches, and booking snapshots.

**Produces:** Admin-only range reads and atomic batch updates of nightly prices and capacity; receptionists cannot mutate inventory.

- [x] Create the HBE-010 worktree and mark it in progress.
- [x] Write HTTP role tests and PostgreSQL cases for capacity bounds, unchanged booking snapshots, and full-batch rollback.
- [x] Implement date-range inventory queries and updates inside a transaction with field-level validation errors.
- [x] After rebasing onto current `main`, run API unit tests (11 suites/48 tests), API e2e tests (8 suites/39 tests), and PostgreSQL integration tests (3 suites/10 tests); pass frozen install, migration status, lint, typecheck, Prettier, and production build.
- [x] Mark done and commit `feat(HBE-010): add staff inventory API`; merge to `main` (`6ff4223`), delete the branch, and remove the Git worktree registration.
  - **Cleanup note:** Windows left residual `apps` and `node_modules` folders at the former worktree path; no recursive deletion was attempted.

### Task 11: HBE-011 — Build staff booking list and management API

- **Worktree:** `C:\hb\HBE-011`
- **Branch:** `codex/hbe-011-staff-bookings-api`

**Files:** Extend `apps/api/src/bookings` with staff list/detail/filter DTOs and routes; add Supertest pagination, privacy, search, and transition cases.

**Produces:** Deterministic pagination, filtering by status/arrival date, search by reference/phone, authorized detail views, and domain-service-backed actions.

- [x] Create the HBE-011 worktree and mark it in progress.
- [x] Write API cases for deterministic pagination, status/date filters, reference/phone search, guest privacy, and conflicts on invalid transitions.
- [x] Implement staff-only routes using booking services and minimal response DTOs.
- [x] Run focused staff-bookings e2e (11 tests), all API unit tests (15 suites/79 tests), all API e2e tests (10 suites/56 tests), and PostgreSQL integration tests (5 suites/22 tests); pass frozen install, migration status, lint, typecheck, Prettier, and production build.
- [x] Commit `feat(HBE-011): add staff booking management API`.
- [x] Rebase/merge `410fc6e` into `main`, then remove the branch and worktree (orchestrator-owned).
  - **Cleanup note:** Windows left residual `apps` and `node_modules` folders at the former worktree path; no recursive deletion was attempted.

### Task 12: HBE-012 — Build Persian RTL public site shell and hotel pages

- **Worktree:** `C:\hb\HBE-012` (short Windows path to support reliable cleanup)
- **Branch:** `codex/hbe-012-public-site`

**Files:** Build `apps/web/src/app/layout.tsx`, public home/room routes, Tailwind tokens in `globals.css`, reusable layout/navigation/footer components, typed public API client, Vitest tests, and Playwright smoke coverage.

**Produces:** Persian RTL shell with API-loaded hotel/room content, responsive navigation/footer, accessible focus/heading structure, and loading/error/not-found states.

- [x] Create the HBE-012 worktree and mark it in progress.
  - [x] Add component and API-client tests for content states and semantic/accessible navigation (Vitest: 6 passed).
  - [x] Implement the RTL layout and typed server-side data fetching from HBE-005 endpoints.
  - [x] Add responsive public page smoke checks for narrow and wide viewports (Playwright: 4 passed across desktop and mobile).
  - [x] Run Vitest and the public Playwright smoke test; format, lint, typecheck, and production build pass.
  - [x] Commit `feat(HBE-012): build Persian public site` and merge to `main`.
  - [x] Delete the branch and remove its Git worktree registration.
  - **Cleanup note:** Windows left residual `apps` and `node_modules` folders at the former worktree path; no recursive deletion was attempted.

### Task 13: HBE-013 — Build date search and availability results UI

- **Worktree:** `C:\hb\HBE-013`
- **Branch:** `codex/hbe-013-search-ui`

**Files:** Add search components and schemas under `apps/web/src/components/search`; add Jalali/Gregorian date conversion, price formatting, and API query utilities under `apps/web/src/lib`; add Vitest and Playwright search tests.

**Produces:** Accessible date/guest search, Gregorian ISO API requests, availability cards with capacity/amenities/Toman totals, and distinct empty/loading/error/unavailable states.

- [x] Create the HBE-013 worktree and mark it in progress.
- [x] Add failing tests for form validation, Jalali month/year and leap-year boundaries, API date payloads, and visible result/error states.
- [x] Implement the accessible Persian RTL search UI and date adapter; keep availability and price decisions server-authoritative.
- [x] After rebasing onto current `main`, run web Vitest (20/20), API unit (13 suites/59 tests), API e2e (9 suites/45 tests), PostgreSQL integration (4 suites/14 tests), and Playwright (6/6 across desktop/mobile) using `hotel_booking_hbe013_test` and ticket-specific web/API ports 3013/4013; frozen install, migration deploy/status, lint, typecheck, format, and production build pass.
- [x] Commit `feat(HBE-013): add Persian availability search`.
- [x] Merge to `main` (`8226c67`), remove the Git worktree registration, and delete the branch.
  - **Cleanup note:** Windows left residual `apps` and `node_modules` folders at the former worktree path; no recursive deletion was attempted.

### Task 14: HBE-014 — Build guest booking form and confirmation

- **Worktree:** `C:\hb\HBE-014`
- **Branch:** `codex/hbe-014-booking-flow`

**Files:** Add booking form/confirmation routes and components under `apps/web/src`; add Zod/RHF validation, Iranian mobile normalization, idempotency client, and Vitest/Playwright guest journey cases.

**Produces:** No-account guest submission, capacity-aware room quantity, contact validation, duplicate-submit protection, availability-changed recovery, and privacy-safe pending confirmation page.

- [x] Create the HBE-014 worktree and mark it in progress.
- [x] Add schema/component tests and Playwright success/recovery cases; exercise duplicate-click protection in the component suite.
- [x] Implement accessible form states, normalized Iranian mobile input, capacity-aware room quantity, server-priced totals, stable idempotency keys, and the HBE-008 booking contract.
- [x] Filter the booking proxy response to the public confirmation fields; verify no guest PII or internal IDs are shown or forwarded to the browser.
- [x] After rebasing onto current `main`, run web Vitest (12 files/46 tests), API unit tests (15 suites/79 tests), API e2e (9 suites/45 tests), PostgreSQL integration (5 suites/22 tests on fresh `hotel_booking_hbe014_db_test`), and Playwright (10/10 desktop/mobile) against guarded `hotel_booking_hbe014_test`; frozen install, migration deploy/status, typecheck, lint, format, production build, and diff checks pass.
- [x] Commit `feat(HBE-014): add guest booking flow`.
- [x] Merge to `main` (`2244183`), remove the Git worktree registration, and delete the branch.
  - **Cleanup note:** Windows left residual `apps` and `node_modules` folders at the former worktree path; no recursive deletion was attempted.

### Task 15: HBE-015 — Build staff login and protected dashboard shell

- **Worktree:** `C:\hb\HBE-015`
- **Branch:** `codex/hbe-015-staff-shell`

**Files:** Add staff login and protected route groups under `apps/web/src/app/staff`; add typed staff API/session utilities, navigation, role-aware views, and component/Playwright tests.

**Produces:** Sign-in, current-user state, logout, protected staff routes, unauthorized redirect, role-specific navigation, and graceful session expiry handling.

- [x] Create the HBE-015 worktree and mark it in progress.
- [x] Add component and browser tests for signed-out access, successful login, receptionist/admin navigation, and expired session.
- [x] Implement cookie-based session handling without localStorage token storage.
- [x] Verify API guards still deny forbidden requests when called outside the UI.
- [x] Run component and Playwright tests.
- [x] Mark done and commit `feat(HBE-015): add protected staff dashboard shell`.
- [x] Parent orchestrator rebases, merges `520e507` to `main`, and removes the worktree registration and branch.
  - **Cleanup note:** Windows left residual `apps` and `node_modules` folders at the former worktree path; no recursive deletion was attempted.

### Task 16: HBE-016 — Build staff booking operations UI

- **Worktree:** `C:\hb\HBE-016`
- **Branch:** `codex/hbe-016-booking-ops-ui`

**Files:** Add staff booking list/detail/action components under `apps/web/src/components/staff/bookings`; add filters, confirmation dialogs, status feedback, Vitest, Playwright, and axe cases.

**Produces:** Search/filterable booking operations with authorized minimal contact detail, explicit confirmation for risky actions, stale-state/conflict handling, and mobile keyboard access.

- [x] Create the HBE-016 worktree and mark it in progress.
- [x] Add action-state/error component tests and a staff processing Playwright flow with axe checks.
- [x] Implement list/detail/filter views against HBE-011 and status actions through the API.
- [x] Verify UI refreshes from returned server state and reports conflicts without guessing; selecting another booking closes the pending action and the action target is reference-bound.
- [x] Run Vitest (72/72), full Playwright (26/26, 13 desktop + 13 mobile, including Axe), API unit (79/79), API e2e (56/56), PostgreSQL integration (28/28), lint, typecheck, format, and production build.
- [x] Mark done, commit `feat(HBE-016): add staff booking operations UI` plus action-race/auth-fixture and verification docs, merge `1075b4901f1d2f39f642cef618102f6d2337b1e0` into `main`, and remove the worktree registration and branch.
  - **Cleanup note:** Windows left residual `apps` and `node_modules` folders at `C:\hb\HBE-016`; no recursive deletion was attempted.

### Task 17: HBE-017 — Build staff inventory calendar/editor

- **Worktree:** `C:\hb\HBE-017`
- **Branch:** `codex/hbe-017-inventory-ui`

**Files:** Add inventory calendar/range editor under `apps/web/src/components/staff/inventory`; add role-aware dashboard navigation, date/price schemas, component/API behavior tests, Playwright, and accessibility checks.

**Produces:** Admin range editing for room counts and nightly prices, clear reservation-bound errors, multi-date results, and no inventory controls for receptionists.

- [x] Create the HBE-017 worktree and mark it in progress.
- [x] Add editor validation and API behavior tests for capacity below held/booked rooms and unchanged booking snapshots.
- [x] Implement admin-only range reads and batch saves through HBE-010; expose all inventory room types only to admins, including inactive types marked clearly in the picker.
- [x] Add browser coverage proving admin edits succeed and receptionist edits are absent/denied, using the shared worker-scoped session fixture without persisted cookies.
- [x] Run unit tests (API 80, web 85), API e2e (59/59), PostgreSQL integration (28/28), Playwright (32/32, 16 desktop + 16 mobile, including Axe), lint, typecheck, format, build, and React Doctor 100/100 on `hotel_booking_hbe017_final_20261114_test`.
- [ ] Mark done, commit `feat(HBE-017): add staff inventory editor`, merge, and remove the worktree and branch.

### Task 18: HBE-018 — Add frontend unit/component and accessibility suite

- **Worktree:** `../Hotel Booking system-worktrees/HBE-018`
- **Branch:** `codex/hbe-018-web-test-suite`

**Files:** Configure Vitest, React Testing Library, jest-dom, coverage, axe, test setup, RTL keyboard/accessibility checks, and root `test` script/documentation.

**Produces:** User-visible tests covering date/price/validation utilities and search, booking, and staff component success/error/loading/empty states.

- [ ] Create the HBE-018 worktree and mark it in progress.
- [ ] Configure jsdom, Vitest, RTL, jest-dom, coverage, and axe with deterministic test utilities.
- [ ] Add missing user-behavior tests for keyboard use, accessible names, validation, and all required visible states.
- [ ] Run the complete web suite and record core behavior coverage.
- [ ] Mark done, commit `test(HBE-018): add web behavior and accessibility suite`, merge, and remove the worktree and branch.

### Task 19: HBE-019 — Add backend unit, API e2e, and PostgreSQL integration suite

- **Worktree:** `C:\hb\HBE-019`
- **Branch:** `codex/hbe-019-api-test-suite`

**Files:** Configure API Jest unit/e2e projects, Supertest bootstrap, isolated PostgreSQL test lifecycle, coverage thresholds, safe database-preparation helpers, and concurrency integration tests under `apps/api`.

**Produces:** Repeatable tests for booking rules, validation/errors, authentication/roles, pagination, PostgreSQL rollback/idempotency/concurrency, and at least 80% branch coverage for booking/inventory services.

- [x] Create the HBE-019 worktree and mark it in progress.
- [x] Configure isolated `_test` database validation, create-if-missing setup, additive migrations, and fixture cleanup without production credentials or destructive database resets.
- [x] Add/complete focused domain unit tests and HTTP e2e tests for public/staff APIs.
- [x] Run PostgreSQL tests proving no more than one successful hold for concurrent last-room attempts.
- [x] Run all backend test projects and enforce 80% branch coverage on booking/inventory services.
- [x] Mark done and commit `test(HBE-019): add PostgreSQL API test suite` plus `test(HBE-019): prepare PostgreSQL test database`.
- [x] Rebase/merge `fc2d0bd` into `main`, then remove the branch and worktree (orchestrator-owned).
  - **Cleanup note:** Windows left residual `apps` and `node_modules` folders at the former worktree path; no recursive deletion was attempted.

### Task 20: HBE-020 — Add Playwright guest/staff end-to-end suite

- **Worktree:** `../Hotel Booking system-worktrees/HBE-020`
- **Branch:** `codex/hbe-020-playwright-e2e`

**Files:** Add root/app Playwright configuration, fictional-data fixtures, browser tests, web/API/database startup scripts, and failure-only trace/screenshot artifacts.

**Produces:** Browser proof for guest search/request, staff login/confirm or reject, inventory capacity rejection, and mobile/desktop RTL paths with order-independent resettable data.

- [ ] Create the HBE-020 worktree and mark it in progress.
- [ ] Configure Playwright projects, app/API readiness waits, isolated database reset, and fictional fixtures.
- [ ] Add guest and staff journeys plus inventory oversell rejection at mobile and desktop viewport sizes.
- [ ] Configure trace and screenshots to retain only on failure and contain fictional data only.
- [ ] Run the full browser suite from a clean test database.
- [ ] Mark done, commit `test(HBE-020): add guest and staff browser flows`, merge, and remove the worktree and branch.

### Task 21: HBE-021 — Add OpenAPI, contract checks, README, and demo materials

- **Worktree:** `../Hotel Booking system-worktrees/HBE-021`
- **Branch:** `codex/hbe-021-docs-demo`

**Files:** Complete Swagger decorators/configuration and OpenAPI validation; update `README.md`; add demo instructions and reviewed screenshots under `docs/screenshots`.

**Produces:** Development Swagger UI, architecture/setup/seed/test/troubleshooting documentation, accurate no-payment booking-request description, environment-sourced demo login, and Persian RTL screenshots without fabricated metrics.

- [ ] Create the HBE-021 worktree and mark it in progress.
- [ ] Generate and validate the OpenAPI document against implemented routes and DTOs.
- [ ] Follow the README from a clean checkout using documented prerequisites, setup, seed, test, and troubleshooting steps.
- [ ] Capture public and staff screenshots using fictional seeded data and inspect for secrets/PII.
- [ ] Run the documented release-gate commands.
- [ ] Mark done, commit `docs(HBE-021): document API and demo flows`, merge, and remove the worktree and branch.

### Task 22: HBE-022 — Add CI quality and release gates

- **Worktree:** `../Hotel Booking system-worktrees/HBE-022`
- **Branch:** `codex/hbe-022-ci-gates`

**Files:** Add `.github/workflows/ci.yml`; align root scripts and README commands; configure ephemeral PostgreSQL, browser installation, test artifacts, and build/test job dependencies.

**Produces:** Pull-request CI for formatting, lint, strict types, unit/API/PostgreSQL/Playwright tests, migrations, and production builds without production secrets; root `check` mirrors documented gates.

- [ ] Create the HBE-022 worktree and mark it in progress.
- [ ] Add CI jobs with isolated PostgreSQL and no production credentials.
- [ ] Run each release-gate script locally and ensure workflow failure output names the package and command.
- [ ] Verify the workflow on a clean branch and inspect all required job definitions.
- [ ] Mark done, commit `ci(HBE-022): enforce project quality gates`, merge, and remove the worktree and branch.

## Plan self-review

- **Coverage:** HBE-001 through HBE-022 are all represented, in dependency order, with their documented scope and required checks. Booking invariants, localization, access control, API docs, local operation, CI, and portfolio materials are assigned to explicit tasks.
- **Completeness scan:** No unresolved implementation placeholders remain. Each task has a named ticket, worktree, branch, file boundary, deliverable, and verification steps.
- **Interface consistency:** The plan consistently uses `apps/web/src`, `apps/api/src`, the six capability module names in the accepted spec, `infra/docker-compose.yml`, root pnpm scripts, and the PRD's ticket IDs.
