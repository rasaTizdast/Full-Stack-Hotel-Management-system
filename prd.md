Small-Hotel Booking Engine — Product Requirements Document

Document status: Implementation baseline
Version: 1.0
Intended audience: Development agent, reviewer, and project owner
Repository shape: One repository containing `apps/web` and `apps/api`

1. Instructions for the development agent

Read this document before changing code. Treat the requirements and rules below as the source of truth. If the repository already contains code, inspect it first and preserve useful work; do not replace working code without explaining why.

Before implementation:

Create an issue/ticket for every item in the backlog in Section 15, in the available issue tracker. Preserve the ticket IDs from this document. If no issue tracker is available, create `docs/implementation-tickets.md` with the same ticket IDs, dependencies, acceptance criteria, and status fields.

Confirm the repository has the agreed app boundaries, scripts, linting, type checking, and test commands. Record any difference from this PRD as a short decision in `docs/decisions/`.

Implement tickets in dependency order. Work in small vertical slices that connect UI, API, and database behavior. Keep ticket status current and link code changes to ticket IDs in commits or pull requests where possible.

Do not mark a ticket done unless its acceptance criteria are met and the required tests have been run successfully. Report any test that could not be run and why.

Do not add real payment processing, SMS providers, multi-hotel tenancy, or unrelated scope without an explicit product decision.

Do not use real guest data or commit secrets. Seed only fictional demo data. Do not claim clinic backend work as part of this project; this is an independently implemented portfolio project.

When a requirement is genuinely ambiguous, use the explicit defaults in this PRD. Ask the project owner only when a decision changes product behavior or creates a substantial implementation tradeoff.

2. Product summary

Build a Persian-first booking website and staff dashboard for one small hotel or guesthouse.

Guests can view room types, search dates and guest count, compare availability and total prices, then submit a booking request. A staff member reviews the request and confirms or rejects it. The hotel manages room counts and nightly prices in a private dashboard.

The project should demonstrate a complete frontend-to-backend product and sound backend fundamentals. In particular, two guests must not be able to reserve the same remaining room for overlapping nights.

2.1 Problem

A small property may handle availability and booking requests through phone calls, messaging apps, or spreadsheets. That creates manual work and makes it easy to overlook a request or promise a room that is no longer available. This product gives guests a clear request flow and gives staff one place to manage availability and booking status.

2.2 Primary users

Guest: Wants to find a suitable room, see dates and prices clearly, and send a booking request without creating an account.

Receptionist: Wants to review requests and confirm or reject them without editing the database.

Administrator: Manages room types, inventory, nightly prices, staff access, and booking requests.

2.3 Product goals

Complete the guest search-to-request journey on mobile and desktop.

Give staff a usable, protected booking and inventory dashboard.

Enforce availability and booking rules on the backend.

Make the project runnable locally from a documented monorepo setup.

Provide meaningful automated tests for web, API, database behavior, and end-to-end flows.

Provide API documentation, seeded demo content, screenshots, and an honest project README.

2.4 Success criteria

The project is considered portfolio-ready when:

A reviewer can run the documented setup and use the guest and staff flows with seeded demo data.

A guest can search, compare room types, submit a request, and receive a booking reference.

Staff can sign in, change inventory and nightly prices, review a request, and confirm or reject it.

The backend prevents overselling under concurrent booking attempts.

CI runs lint, formatting checks, TypeScript checks, unit tests, API integration tests, end-to-end tests, and production builds.

Persian RTL pages work at mobile and desktop widths, with keyboard-accessible forms and controls.

The README explains architecture, how to run tests, and what the project does and does not do.

3. MVP scope and product decisions

Use these defaults unless the project owner explicitly changes them:

Property count: One hotel. Do not build multi-tenant SaaS or a hotel marketplace.

Room inventory: Sold by room type, such as “Double Room.” Staff assign a physical room number outside this MVP.

Booking flow: Guest submits a request; staff confirms or rejects it. A submitted request is not represented as an instant confirmed booking.

Inventory hold: A pending request temporarily holds the requested rooms for 24 hours. If it is not acted on, it expires and releases inventory.

Payment: No online or offline payment processing. The hotel contacts the guest outside the application if needed.

Guest account: Not required. Collect only the guest contact fields necessary to process the request.

Staff account: Required for dashboard access. Seed a local demo administrator using environment-provided credentials; never hardcode a production password.

Language and direction: Persian-first, RTL. English is out of MVP scope unless implementation is nearly complete.

Dates: Display Jalali dates in the Persian UI. API and database use ISO/Gregorian business dates in `YYYY-MM-DD` form. Store event timestamps in UTC. Treat check-in as inclusive and checkout as exclusive.

Currency: Store integer amounts in Toman in fields explicitly named with the unit, such as `nightly_price_toman`; never use floating-point money. Display prices consistently as Toman.

Hotel content: Demo hotel, room descriptions, and images are seeded data. No CMS is required.

Notifications: The confirmation page displays the booking reference and current request status. Staff contacts guests manually; external email and SMS delivery are out of scope.

Deployment: Web and API may be deployed independently, but development and review use one Git repository and one local setup.

One API instance: The first deployment assumes one running API instance for the scheduled expiry task. Document this limitation; do not claim horizontally scaled job processing.

4. Non-goals

Do not implement these in the MVP:

Hotel search across multiple properties or multi-tenant accounts.

Real payment gateways, refunds, or payment reconciliation.

SMS, email, WhatsApp, or other external notification delivery.

Loyalty programs, coupons, reviews, dynamic pricing, or recommendations.

Room-number assignment, housekeeping, maintenance, or point-of-sale features.

Guest accounts, national ID collection, or document uploads.

Microservices, Kubernetes, Redis, message brokers, or a separate worker service.

A general-purpose CMS or a mobile native app.

Record any proposed non-goal expansion as a ticket for later discussion rather than silently including it.

5. Repository and technology requirements

5.1 Repository layout

Use one Git repository with independently organized applications:

hotel-booking-engine/
├── apps/
│   ├── web/                 # Next.js guest website and staff dashboard
│   └── api/                 # NestJS REST API, Prisma schema and migrations
├── docs/
│   ├── decisions/
│   ├── screenshots/
│   └── implementation-tickets.md  # fallback if no issue tracker is available
├── infra/
│   └── docker-compose.yml   # local PostgreSQL and supporting services
├── .github/workflows/       # CI
├── .env.example
├── .gitignore
├── package.json             # workspace scripts
├── pnpm-workspace.yaml
└── README.md

Do not place NestJS inside the Next.js app, or Next.js inside the API app. The web app calls the API through REST/JSON. The API is the only application that reads or writes the product database.

Use pnpm workspaces with a lockfile at the repository root. Avoid adding Turborepo or a shared package until there is a demonstrated need. If API types are shared later, generate the web client/types from the API's OpenAPI document rather than hand-maintaining duplicate request and response types.

5.2 Required stack

Web: Next.js App Router, React, TypeScript in strict mode, Tailwind CSS.

API: NestJS, TypeScript in strict mode, REST/JSON.

Persistence: PostgreSQL and Prisma migrations.

Web forms: React Hook Form and Zod, or an equivalent documented approach.

API input validation: NestJS DTO validation at the HTTP boundary.

API docs: generated OpenAPI/Swagger document.

Web unit/component tests: Vitest, React Testing Library, and jest-dom.

API unit tests: Jest.

API HTTP/e2e tests: Supertest.

Browser e2e tests: Playwright.

Local services: Docker Compose.

CI: GitHub Actions or equivalent, running the required checks on every pull request.

Use stable compatible dependency versions and commit the lockfile. Do not use plain JavaScript for app logic. Configuration files may use a format required by their tool, but application source files must be TypeScript/TSX.

5.3 Styling and UI implementation

Tailwind CSS is the required styling system for web UI.

Define reusable design tokens for color, spacing, typography, focus, and status states.

Avoid large one-off style blocks and duplicated class strings for repeated components; extract components or use a documented class composition helper where it improves maintainability.

Components must work with keyboard navigation and visible focus indicators.

Do not communicate status by color alone.

Every form has labels, validation messages, loading state, disabled state where appropriate, and a useful error state.

Use semantic HTML and accessible names for icon-only controls.

Verify RTL layout at narrow and wide viewport sizes.

6. System architecture

6.1 Runtime boundaries

Next.js web renders public hotel/room pages and provides the staff UI.

NestJS API authenticates staff, validates requests, applies booking and inventory rules, and exposes versioned REST endpoints.

PostgreSQL is the source of truth for room inventory, prices, bookings, and staff users.

Prisma handles routine queries, migrations, and transactions. The booking service may use parameterized SQL inside a Prisma transaction for explicit row locks.

A scheduled task in the API expires pending requests and releases their holds. It must be idempotent.

No frontend code connects directly to PostgreSQL.

6.2 API structure

Use a modular monolith organized by product capability. Suggested modules:

`HotelModule`

`RoomTypesModule`

`AvailabilityModule`

`BookingsModule`

`StaffAuthModule`

`StaffInventoryModule`

Controllers handle HTTP concerns. Services implement product rules. Prisma access should remain behind a small, understandable persistence boundary; do not add generic repository abstractions without a concrete need.

6.3 Web structure

Use Next.js App Router routes for public pages and staff pages. Public hotel and room content can be rendered on the server. Date search, booking form, dashboard filtering, and staff actions may use client components where interaction requires them. All booking decisions are revalidated by the API; client calculations are previews only.

6.4 Data flow

Guest submits dates and guest count.

Web requests availability from the API.

API returns room types, nightly prices, and availability based on current database state.

Guest selects a room type and number of rooms, then submits contact details.

API rechecks all nights and creates a temporary inventory hold and pending request in one transaction.

Staff confirms or rejects the request from the dashboard.

Expiry task releases holds for pending requests that pass the 24-hour deadline.

7. Domain model and data rules

The agent may refine names but must preserve these concepts and invariants.

7.1 Entities

Hotel: One seeded property, with slug, name, address, description, timezone, and public contact details.

RoomType: Hotel relation, name, slug, description, maximum guests per room, amenities, active flag, and display order.

RoomNightInventory: One row per room type and stay date. Includes total rooms, held rooms, booked rooms, and nightly Toman price. Enforce a unique constraint on room type plus stay date.

Booking: Random, non-sequential public reference; status; dates; guest count; room type; room quantity; guest name; normalized phone; optional email; total price snapshot; creation time; expiry time; status timestamps.

BookingNight: One row per booked night, with nightly price and quantity/amount snapshot. Enables accurate totals if prices later change.

StaffUser: Username/email, password hash, role, active flag, and timestamps.

AuditEvent: Optional in MVP, but recommended for staff status and inventory edits. Do not record secrets or unnecessary guest data.

A single booking request books one room type and one room quantity. Multi-room-type carts are out of MVP.

7.2 Inventory invariant

For every room type and date:

`held_rooms >= 0`

`booked_rooms >= 0`

`held_rooms + booked_rooms <= total_rooms`

`total_rooms >= 0`

`nightly_price_toman >= 0`

Availability is `total_rooms - held_rooms - booked_rooms`. Missing inventory rows mean the room type is unavailable for that night; do not assume unlimited capacity.

Staff may not lower total rooms below the already held plus booked amount. Existing bookings retain their stored price snapshots when staff changes a nightly rate.

7.3 Date and price rules

Check-in must be before checkout.

The range includes each night starting on check-in and excludes checkout.

The guest count must fit within the maximum capacity of the selected room quantity.

Search must reject invalid, past, excessively long, or unsupported date ranges with a clear message. Define a documented maximum stay length in the API; use 30 nights for the initial limit.

Calculate totals on the server from each night’s stored rate multiplied by room quantity.

The UI may show an estimated total, but the API response is authoritative.

Normalize Iranian mobile numbers into a consistent format before saving; reject invalid numbers with a field-level error.

Jalali calendar conversion must be tested at month/year boundaries and leap-year dates.

8. Booking lifecycle and concurrency behavior

8.1 Statuses

Use these statuses:

`PENDING_CONFIRMATION`: guest submitted the request; inventory is held until staff action or expiry.

`CONFIRMED`: staff accepted the request; inventory is booked.

`REJECTED`: staff declined it; the hold is released.

`CANCELLED`: staff cancelled a request before stay; inventory is released for the affected nights.

`EXPIRED`: the 24-hour pending period ended; inventory is released.

Allowed transitions:

Pending → Confirmed

Pending → Rejected

Pending → Cancelled

Pending → Expired (expiry task only)

Confirmed → Cancelled (staff only; before the stay begins)

Terminal statuses cannot be changed back to pending or confirmed. Repeated status actions must be idempotent or return a clear conflict response without changing inventory twice.

8.2 Atomic booking algorithm

Creating a booking must be one all-or-nothing database transaction:

Validate the request and calculate the required stay dates.

Lock the relevant inventory rows in a stable chronological order.

Re-read the rows after acquiring locks.

Verify every night has enough available rooms and a valid price.

Increment held-room counts for all nights.

Insert the booking and its nightly price snapshots.

Commit. If any date is unavailable or a database step fails, roll back every change.

Use an idempotency key for booking creation so a retried HTTP request cannot create a duplicate booking. Store the key with a unique constraint and return the original result for a repeated equivalent request.

Staff confirmation, cancellation, rejection, and expiry must also update status and inventory counters transactionally. The expiry process must lock/claim each booking before releasing its hold, and safely handle repeated runs or competing staff actions.

Do not rely on a frontend availability result to guarantee a booking. Availability can change at any time; the create-booking transaction is the final authority.

9. Functional requirements

9.1 Public guest experience

FR-PUB-01: Display hotel name, address/contact, description, and active room types.

FR-PUB-02: Provide accessible check-in, checkout, and guest-count inputs.

FR-PUB-03: Validate date order and supported range before search.

FR-PUB-04: Show available room types for the entire date range, room capacity, amenities, nightly rates, and total price.

FR-PUB-05: Let the guest choose a room type and quantity; prevent selecting more guests than capacity allows.

FR-PUB-06: Collect guest name, Iranian mobile number, and optional email; explain that this creates a request awaiting staff confirmation.

FR-PUB-07: Submit one booking request with an idempotency key. Prevent accidental duplicate submission from repeated clicks.

FR-PUB-08: On success, show a non-sequential booking reference, request status, dates, room details, guest count, and price summary. Do not expose staff-only or database identifiers.

FR-PUB-09: Show clear empty, loading, validation, API failure, and availability-changed states.

FR-PUB-10: Public pages must not expose guest lists, staff data, booking contact details, internal notes, or authentication secrets.

9.2 Staff dashboard

FR-STAFF-01: Require staff authentication for every staff API and page.

FR-STAFF-02: Support `ADMIN` and `RECEPTIONIST` roles. Receptionists can view and process bookings. Admins can also change inventory and rates.

FR-STAFF-03: Display a booking list with status, booking reference, arrival/departure dates, guest count, room type, and minimal contact information needed for staff action.

FR-STAFF-04: Filter bookings by status and arrival date; search by booking reference or phone.

FR-STAFF-05: Let authorized staff confirm or reject pending requests with an optional internal note.

FR-STAFF-06: Let authorized staff cancel a confirmed booking before the stay begins, with a required reason.

FR-STAFF-07: Provide inventory editing by room type and date range, including total rooms and nightly Toman price.

FR-STAFF-08: Prevent an inventory edit that would make held plus booked rooms exceed capacity.

FR-STAFF-09: Display action success/failure and reflect the server’s latest state after an action.

FR-STAFF-10: Do not let a receptionist access admin-only inventory mutation endpoints.

9.3 API and operational behavior

FR-API-01: Prefix endpoints with `/api/v1`.

FR-API-02: Validate all request parameters and DTOs on the server; reject unknown/invalid fields where practical.

FR-API-03: Return consistent error JSON with a stable error code, human-readable message, optional field errors, and request ID.

FR-API-04: Generate and serve OpenAPI/Swagger documentation in development.

FR-API-05: Add pagination to staff booking lists.

FR-API-06: Add basic rate limiting to public booking creation and staff login.

FR-API-07: Add health/readiness endpoints. Readiness should fail if the database cannot be reached.

FR-API-08: Log request IDs and operational errors without logging passwords, auth cookies, full guest phone numbers, or booking form payloads.

10. Initial API contract

The exact DTO field names can be refined, but the behavior must remain stable and documented.

Public endpoints

`GET /api/v1/hotel` — public hotel content.

`GET /api/v1/room-types` — active room types.

`GET /api/v1/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&guests=N` — available room types and price preview for every night.

`POST /api/v1/bookings` — create request; requires `Idempotency-Key` header.

Staff endpoints

`POST /api/v1/staff/auth/login`

`POST /api/v1/staff/auth/logout`

`GET /api/v1/staff/auth/me`

`GET /api/v1/staff/bookings?status=&arrivalFrom=&arrivalTo=&search=&page=&pageSize=`

`GET /api/v1/staff/bookings/`

`POST /api/v1/staff/bookings//confirm`

`POST /api/v1/staff/bookings//reject`

`POST /api/v1/staff/bookings//cancel`

`GET /api/v1/staff/inventory?roomTypeId=&from=&to=`

`PUT /api/v1/staff/inventory` — batch update for a date range and room type.

All staff routes require authenticated authorization checks in the API, regardless of whether the web page hides the controls.

11. Security, privacy, accessibility, and localization

Security and privacy

Hash staff passwords with a well-maintained password-hashing library. Never store plaintext passwords.

Use secure, HttpOnly, SameSite cookies for staff auth, with CSRF protection for state-changing requests. Do not store auth tokens in localStorage.

Enforce role permissions on the API, not only in the UI.

Use parameterized database queries. Never interpolate user input into SQL.

Validate and length-limit every user-controlled field.

Apply login and public booking rate limits.

Use non-sequential public booking references.

Return only the minimum guest information needed on each screen.

Never log secrets, cookies, passwords, or full guest details.

Keep secrets in environment variables; commit only placeholders in `.env.example`.

Use HTTPS for any deployed environment.

Accessibility

Target WCAG 2.1 AA behavior for core flows.

All inputs have programmatic labels and clear errors.

All actions are keyboard-accessible and show focus.

Modals, if used, manage focus correctly and support escape behavior.

Status and validation messages are announced to assistive technology.

Test with keyboard-only navigation and automated axe checks on key pages.

Persian and RTL

Set document language and direction explicitly.

Use RTL layout without reversing semantic date order or numeric values incorrectly.

Display dates in Jalali in the UI and send Gregorian ISO dates to the API.

Format prices consistently as Toman with Persian-friendly digits and separators.

Test localized phone validation, long Persian labels, empty states, and error text.

Avoid hardcoding text inside components; keep user-facing strings in a locale dictionary even if only Persian ships initially.

12. Test strategy and release gates

The project needs a test pyramid: fast unit tests for rules, integration tests against the real database, API tests through HTTP, and browser tests for complete user journeys. Do not substitute mocks for the PostgreSQL concurrency tests.

12.1 Frontend tests

Unit tests (Vitest): date conversion, currency formatting, form schemas, capacity calculations, status labels, and reusable utility functions.

Component tests (React Testing Library): search form, room cards, booking form, price summary, staff booking row/actions, error/loading/empty states.

Accessibility checks: axe for guest search/booking and staff login/booking pages; include keyboard interaction checks.

Browser end-to-end (Playwright): guest searches, submits a booking, sees request confirmation; staff logs in, confirms/rejects request, and sees updated status.

Test RTL rendering at a narrow mobile viewport and desktop viewport. Prefer assertions on user-visible behavior over snapshots.

12.2 Backend tests

Unit tests (Jest): date range, total-price calculation, capacity validation, status-transition rules, permission policy, and expiry decisions.

API e2e tests (Supertest): DTO validation, status codes, error format, public/staff route behavior, authentication, authorization, pagination, and rate limiting behavior.

Database integration tests: run migrations and tests against PostgreSQL. Verify unique constraints, foreign keys, inventory updates, booking rollback, idempotency, cancellation/rejection, and expiry.

Concurrency integration test: issue at least two overlapping booking attempts concurrently for the final room. Exactly one may obtain the hold; the inventory invariant must remain true.

Migration/seed checks: a fresh database can migrate and seed; repeated seed behavior is safe for demo data.

Use isolated test data and clean/reset the test database between suites. Never point tests at a production database.

12.3 Cross-app and operational tests

Contract check that the generated OpenAPI document is valid and web API calls match it.

Playwright tests run against the web app and API with a test PostgreSQL database.

Smoke test local startup, health/readiness, and production builds.

Add CI jobs for formatting, lint, TypeScript checks, web unit tests, API unit tests, PostgreSQL integration/e2e tests, Playwright e2e, and builds.

Keep booking-domain tests comprehensive; target at least 80% branch coverage for the booking and inventory services. Do not pursue 100% overall coverage by adding low-value tests.

Run a small repeatable load check against availability search and report the dataset and result in project documentation. Do not claim production-scale performance from a local test.

On release, manually verify both guest and staff flows and inspect responsive RTL pages.

12.4 Required repository scripts

Expose root scripts with clear names, including equivalents of:

`dev` — run web and API in development.

`dev`, `dev` — run either app individually.

`db`, `db`, `db`, `db:test`.

`lint`, `format`, `typecheck`.

`test`, `test`, `test`, `test`.

`build`, `check` — all required local/CI checks.

If a script cannot run on a developer machine without Docker, document the prerequisite and provide a clear error message.

13. Definition of Done

A feature is done only when all applicable points are true:

Requirements and acceptance criteria are satisfied.

TypeScript strict checks, lint, and formatting checks pass.

Unit and relevant integration/e2e tests pass.

Loading, empty, error, and success states exist for user-facing flows.

API validation and permissions are enforced server-side.

RTL, responsive layout, and keyboard accessibility are checked.

OpenAPI and README are updated for any API or setup change.

No secret, real guest data, or misleading claim is committed.

The linked ticket is updated with implementation notes and test evidence.

14. Suggested development sequence

Implement one vertical slice at a time:

Monorepo, local PostgreSQL, CI skeleton, and demo seed.

Hotel and room-type API plus public read-only UI.

Nightly inventory model and availability search.

Guest booking request with transactional holds and idempotency.

Staff login and protected booking list/actions.

Staff inventory editor and expiry task.

Frontend/browser tests, accessibility, responsive RTL polish.

Documentation, screenshots, demo instructions, and final end-to-end pass.

Do not build every UI screen against fake data and postpone API integration to the end.

15. Implementation ticket backlog

Create the following tickets before coding. The listed dependencies define the preferred order, not a reason to block unrelated work. Each ticket must have one owner, a status, and links to its code changes and tests.

HBE-001 — Establish monorepo workspace and app boundaries

Priority: P0
Depends on: None
Scope: Create root workspace and `apps/web`, `apps/api`, `docs`, and `infra` structure. Scaffold Next.js and NestJS apps. Configure strict TypeScript and root scripts.
Acceptance criteria:

Both apps start independently and from a root development command.

App source uses TypeScript/TSX with strict checks enabled.

Web styling uses Tailwind CSS.

Lockfile and workspace metadata are at repository root.

README gives initial setup commands.

Tests/checks: root and app type checks, lint, formatting check, and both app builds run.

HBE-002 — Add local PostgreSQL and environment configuration

Priority: P0
Depends on: HBE-001
Scope: Add Docker Compose for PostgreSQL, environment examples, API database connection, and health/readiness endpoints.
Acceptance criteria:

A developer can start and stop the local database with documented commands.

Secrets are not committed.

API readiness reports database availability.

Database connection failures return a useful startup/readiness error.

Tests/checks: readiness success and database-unavailable integration cases.

HBE-003 — Create initial schema, migrations, and fictional seed data

Priority: P0
Depends on: HBE-002
Scope: Add Hotel, RoomType, RoomNightInventory, Booking, BookingNight, and StaffUser schema; constraints, indexes, migrations, and idempotent demo seed.
Acceptance criteria:

Unique room-type/date inventory constraint exists.

Inventory count and money constraints are enforced.

Seed creates one hotel, multiple room types, future inventory, and a demo admin from environment configuration.

Re-running the seed does not duplicate demo rows.

No real guest data is present.

Tests/checks: fresh migration, migration status, seed repeatability, and constraint integration tests.

HBE-004 — Define API error format and request validation

Priority: P0
Depends on: HBE-001
Scope: Add global validation, consistent error JSON, request IDs, and API version prefix.
Acceptance criteria:

Invalid input is rejected before service operations.

Errors include a stable code, message, request ID, and field details where applicable.

Unknown or malformed fields cannot silently alter business data.

Sensitive request fields are not logged.

Tests/checks: API e2e tests for valid/invalid DTOs and error format.

HBE-005 — Build public hotel and room-type endpoints

Priority: P0
Depends on: HBE-003, HBE-004
Scope: Implement public read-only hotel and active room type endpoints.
Acceptance criteria:

Hotel endpoint returns only public content.

Room endpoint returns active room types and safe public fields.

Inactive room types are not exposed as bookable.

Response DTOs do not contain staff, guest, or database-only fields.

Tests/checks: service unit tests and API e2e privacy/serialization checks.

HBE-006 — Implement availability search and server-side price preview

Priority: P0
Depends on: HBE-005
Scope: Validate date range and guest count, query each stay night, and return available room types with price breakdown.
Acceptance criteria:

Checkout date is exclusive.

Missing inventory or unavailable nights make a room type unavailable for the requested full range.

Capacity is checked against guest count.

Total is calculated using integer Toman amounts on the server.

Invalid, past, and over-30-night ranges are rejected clearly.

Tests/checks: unit tests for dates/prices and PostgreSQL-backed API integration tests for availability boundaries.

HBE-007 — Implement staff authentication and authorization

Priority: P0
Depends on: HBE-003, HBE-004
Scope: Staff login/logout/current-user endpoints, secure cookie handling, password hashing, CSRF protection, roles, and login rate limiting.
Acceptance criteria:

Unauthenticated requests cannot access staff resources.

Receptionist and admin permissions differ as defined in Section 9.

No auth token is stored in browser localStorage.

Passwords are stored only as hashes.

Logout invalidates the staff session.

Tests/checks: unit tests for authorization policy and API e2e tests for login, logout, cookie, CSRF, and role access.

HBE-008 — Implement transactional booking requests and idempotency

Priority: P0
Depends on: HBE-006
Scope: Create booking request, nightly price snapshots, inventory holds, public reference, and idempotency handling in one transaction.
Acceptance criteria:

API rechecks every requested date while holding inventory locks.

Inventory changes and booking creation either all commit or all roll back.

Repeated request with the same idempotency key does not create a duplicate.

Public response contains only the reference, status, dates, room details, guest count, and price summary.

Unavailable dates return an availability-changed error with no partial inventory changes.

Tests/checks: unit tests for totals/validation and PostgreSQL integration tests for rollback, price snapshot, duplicate retry, and concurrent last-room booking.

HBE-009 — Implement booking status transitions and expiry worker

Priority: P0
Depends on: HBE-008, HBE-007
Scope: Confirm, reject, cancel pending/confirmed request, and expire 24-hour pending requests.
Acceptance criteria:

Only allowed transitions from Section 8 are accepted.

Every transition and inventory counter update is transactional.

Repeating an action does not release inventory twice.

Expired pending bookings release all holds.

Staff action racing with expiry produces one valid final state.

Expiry task is safe to run repeatedly and logs failures without guest PII.

Tests/checks: status state-machine unit tests, database integration tests, and expiry race/idempotency tests.

HBE-010 — Build staff inventory API

Priority: P0
Depends on: HBE-006, HBE-007
Scope: Read and batch-update inventory and nightly prices by room type/date range.
Acceptance criteria:

Admin can set capacity and price for a date range.

Receptionist cannot mutate inventory.

Capacity cannot be lowered below held plus booked rooms.

Existing booking snapshots remain unchanged after a price edit.

Batch update is atomic and reports invalid dates/values.

Tests/checks: API e2e role checks and PostgreSQL integration tests for constraints and batch rollback.

HBE-011 — Build staff booking list and management API

Priority: P0
Depends on: HBE-007, HBE-009
Scope: Paginated staff booking list/detail, filters, search, and status actions.
Acceptance criteria:

Staff can filter by status and arrival date and search by reference or phone.

Pagination is deterministic.

Guest details are available only to authorized staff.

Confirm/reject/cancel actions call the domain service and return current state.

Invalid transitions return a conflict response.

Tests/checks: API e2e tests for pagination, filters, privacy, and role/status behavior.

HBE-012 — Build Persian RTL public site shell and hotel pages

Priority: P0
Depends on: HBE-001, HBE-005
Scope: Shared layout, Persian locale strings, hotel home/room pages, Tailwind design tokens, responsive nav/footer.
Acceptance criteria:

Document language and RTL direction are correct.

Public content is loaded from the API, not hardcoded in page components.

Layout works on mobile and desktop.

Accessible heading structure, focus styles, and semantic controls are present.

Loading, API error, and not-found states are designed.

Tests/checks: Vitest component tests and Playwright smoke test for public pages.

HBE-013 — Build date search and availability results UI

Priority: P0
Depends on: HBE-006, HBE-012
Scope: Date/guest search form, Jalali display adapter, API query, results cards, capacity and total price display.
Acceptance criteria:

Form blocks invalid ranges before calling API.

API receives Gregorian ISO dates.

Every price is labeled as Toman and matches the API response.

Empty, loading, validation, unavailable, and server-error states are distinct.

Date conversion covers month/year and leap-year boundaries.

Tests/checks: Vitest date/form tests, component behavior tests, and Playwright search flow.

HBE-014 — Build guest booking form and confirmation page

Priority: P0
Depends on: HBE-008, HBE-013
Scope: Room quantity selection, guest contact form, total summary, submit state, duplicate-click prevention, and confirmation display.
Acceptance criteria:

Guest can submit a request without an account.

Name and normalized Iranian mobile are validated.

Guest sees that staff confirmation is pending.

Repeated clicks/retries cannot create duplicate bookings.

Confirmation page does not expose internal IDs or guest information beyond the user's current form session.

If availability changed, guest can return to search and choose again.

Tests/checks: Vitest schema/component tests and Playwright guest booking flow, including API error path.

HBE-015 — Build staff login and protected dashboard shell

Priority: P0
Depends on: HBE-007, HBE-012
Scope: Staff login page, protected route layout, current-user state, navigation, logout, and unauthorized redirect.
Acceptance criteria:

Staff pages are inaccessible when signed out.

Login errors are understandable and do not reveal whether a username exists.

Admin-only navigation is not shown to receptionists.

API authorization remains enforced if a user manually calls an endpoint.

Session expiry is handled cleanly.

Tests/checks: component tests and Playwright login/role/expired-session flows.

HBE-016 — Build staff booking operations UI

Priority: P0
Depends on: HBE-011, HBE-015
Scope: Booking table, filtering, details view, confirm/reject/cancel actions, status feedback.
Acceptance criteria:

Staff can find a booking by status/date/reference/phone.

Guest data is limited to the authorized staff view.

Confirm/reject/cancel require a final confirmation step where accidental action is plausible.

UI reflects updated server state and handles stale/conflict responses.

Keyboard navigation and mobile layout work.

Tests/checks: Vitest action/error-state tests, Playwright staff processing flow, and axe check.

HBE-017 — Build staff inventory calendar/editor

Priority: P1
Depends on: HBE-010, HBE-015
Scope: Room type/date-range inventory editor for room count and nightly price.
Acceptance criteria:

Admin can view and edit date ranges.

Receptionist cannot see or submit inventory mutations.

UI explains why an edit is rejected when capacity is below reservations.

Saving multiple dates reports success or field-specific errors.

Existing bookings are not repriced.

Tests/checks: component/API behavior tests, Playwright admin-versus-receptionist test, accessibility check.

HBE-018 — Add frontend unit/component and accessibility suite

Priority: P0
Depends on: HBE-012, HBE-013, HBE-014
Scope: Configure Vitest, React Testing Library, coverage reporting, axe, and user behavior tests.
Acceptance criteria:

Core formatting, date, validation, and capacity utilities have tests.

Search, booking, and staff components cover success/error/loading/empty behavior.

Tests assert user-visible outcomes rather than implementation details.

RTL keyboard and accessible-name checks are included.

Root `test` script is documented.

Tests/checks: suite runs in CI; record coverage for core web behavior.

HBE-019 — Add backend unit, API e2e, and PostgreSQL integration suite

Priority: P0
Depends on: HBE-006 through HBE-011
Scope: Configure Jest, Supertest, test database lifecycle, coverage, and concurrency tests.
Acceptance criteria:

Booking rules have unit tests.

HTTP validation, error format, auth, permissions, and pagination have API e2e tests.

Integration tests use PostgreSQL, not SQLite or repository mocks, for transactional guarantees.

Concurrent last-room booking test proves at most one successful hold.

Booking and inventory services meet 80% branch coverage target.

Tests/checks: isolated database reset, migrations, integration suite, and coverage report run in CI.

HBE-020 — Add Playwright guest/staff end-to-end suite

Priority: P0
Depends on: HBE-014, HBE-016, HBE-017, HBE-018, HBE-019
Scope: Browser tests against the web app, API, and disposable test database.
Acceptance criteria:

Guest can search and submit a request.

Staff can sign in and confirm or reject it.

Inventory editor rejects overselling capacity.

RTL mobile and desktop smoke paths pass.

Test data is reset and tests do not depend on order.

Tests/checks: Playwright suite runs in CI with trace/screenshot artifacts on failure only; artifacts contain only fictional seeded data.

HBE-021 — Add OpenAPI, contract checks, README, and demo materials

Priority: P0
Depends on: HBE-005 through HBE-020
Scope: Complete API docs, validate OpenAPI, document setup and architecture, add screenshots and demo flow.
Acceptance criteria:

Swagger/OpenAPI is available in development.

README has architecture, prerequisites, setup, seed, test, and troubleshooting instructions.

README labels the project as a booking-request system with staff confirmation and no online payment.

Demo login credentials are clearly development-only and sourced from environment configuration.

Screenshots show the Persian RTL public and staff flows.

No fabricated customer metrics or claims are included.

Tests/checks: follow README from a clean checkout and run all release-gate scripts.

HBE-022 — Add CI quality and release gates

Priority: P0
Depends on: HBE-001, HBE-018, HBE-019, HBE-020
Scope: Configure CI for formatting, lint, type checks, tests, migrations/integration, Playwright, and builds.
Acceptance criteria:

Pull requests cannot pass CI if required checks fail.

Test database is isolated and ephemeral.

CI does not require production secrets.

Failure output identifies the failing package and command.

Root `check` script matches the documented release gates.

Tests/checks: verify CI on a clean branch and confirm each required job is visible.

16. Open decisions for implementation

The defaults in Section 3 are sufficient to begin. If the project owner later has access to a real small hotel or guesthouse, validate these workflow details before changing scope:

Whether staff confirmation is the actual booking policy or if the property confirms instantly.

How inventory is currently represented: room types, physical rooms, or both.

The exact cancellation policy and whether the property needs check-in/check-out tracking.

Whether the hotel needs English in the MVP.

Document accepted changes as decisions and update affected requirements and tickets before implementation.
