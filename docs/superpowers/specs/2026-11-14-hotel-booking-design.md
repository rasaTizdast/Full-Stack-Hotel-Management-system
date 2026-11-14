# Hotel Booking Engine — Accepted Design

**Status:** Proposed for owner review
**Source:** `prd.md`, version 1.0
**Scope:** The complete MVP in PRD sections 2–15

## Product scope

Build a Persian-first booking-request system for one small hotel. Guests browse public hotel and room information, search dates and guest counts, compare available room types and server-calculated Toman totals, and submit a request without an account. Staff sign in to review requests, confirm or reject them, and administrators manage room-night inventory and prices. Pending requests hold inventory for 24 hours. There is no payment processing, guest account, external notification provider, physical room assignment, or multi-hotel tenancy.

## Architecture decision

Use the PRD's modular-monolith approach in one pnpm workspace:

- `apps/web`: Next.js App Router, React, strict TypeScript, Tailwind CSS, Persian locale, and RTL public and staff routes.
- `apps/api`: NestJS REST API, strict TypeScript, versioned routes, DTO validation, OpenAPI, and capability modules.
- PostgreSQL is the product source of truth. Prisma owns schema/migrations and routine queries; a parameterized row-locking query inside a Prisma transaction protects booking inventory.
- `infra/docker-compose.yml` provides the local PostgreSQL service. The API is the only application that accesses the product database.

The modules follow product boundaries: Hotel, Room Types, Availability, Bookings, Staff Auth, and Staff Inventory. Controllers handle HTTP, services enforce domain behavior, and persistence stays close to the modules that own it. The web app consumes REST/JSON and never connects to PostgreSQL.

### Considered approaches

1. **PRD modular monolith (selected):** two independently runnable apps share one repository and one PostgreSQL database. This meets the runtime, portfolio, local setup, and booking-concurrency requirements without introducing distributed-system overhead.
2. **Microservices:** separate hotel, booking, and staff services. This adds deployment and consistency costs and conflicts with the PRD's explicit modular-monolith and non-goal guidance.
3. **Frontend-first mock application:** build pages against local fixtures and defer the API/database. This would postpone the core availability invariant and conflict with the PRD's required vertical UI/API/database slices.

## Domain and booking rules

Persist one `Hotel`, active/inactive `RoomType` records, one `RoomNightInventory` row per room type and stay date, `Booking` and `BookingNight` snapshots, and `StaffUser` records. Add only supporting records needed for secure staff sessions and auditability. Enforce unique room-type/date inventory and non-negative inventory/price constraints in PostgreSQL. For every night, `held_rooms + booked_rooms <= total_rooms`; missing inventory means unavailable.

Dates use Gregorian `YYYY-MM-DD` business dates in API/database boundaries, UTC event timestamps, inclusive check-in, and exclusive checkout. The API rejects past, invalid, or over-30-night stays. The Persian UI displays Jalali dates and tests month/year and leap-year boundaries. All money is integer Toman, with prices and totals explicitly named in Toman units.

Booking creation validates the request, locks all relevant inventory rows in stable date order, re-reads availability, verifies capacity and prices, increments holds, and writes the booking plus per-night price snapshots in one transaction. A unique idempotency key maps retries to the original request. Any failure rolls back all inventory and booking changes. Confirmation moves held counts to booked counts; rejection, cancellation, and expiry release the correct counts exactly once. A repeat-safe API task expires pending requests after 24 hours. Staff actions and expiry serialize through database transactions/row locks.

## Staff security and errors

Use hashed passwords and server-verifiable staff sessions in secure, HttpOnly, SameSite cookies; mutations require CSRF protection. Enforce `ADMIN` and `RECEPTIONIST` capabilities in API guards, regardless of what the UI displays. Apply login rate limits and never put auth tokens in browser localStorage. Public DTOs expose only public hotel/room fields or the narrowly defined booking confirmation summary. Staff-only guest details require authorization.

Validate all API inputs at the HTTP boundary, reject unknown fields, use a consistent error body with a stable code, message, request ID, and optional field details, and avoid logging secrets or guest PII. Readiness reports database connectivity separately from process liveness.

## Web experience

Server-render public hotel and room content from the API. Use interactive client components for date/guest search, booking submission, staff filters, and staff actions. API results are authoritative; client previews never guarantee a reservation. Implement accessible semantic forms with labels, validation, loading, disabled, empty, error, and success states. Use visible focus, keyboard operation, responsive layouts, and clear non-color status indicators. The public and staff experiences remain Persian-first and RTL at mobile and desktop widths.

## Quality gates and local operation

Use Vitest, React Testing Library, and axe for web behavior; Jest for API unit tests; Supertest for API e2e tests; PostgreSQL-backed integration tests for constraints, transactions, retries, and competing last-room requests; and Playwright for guest/staff journeys. CI checks formatting, lint, strict types, unit/API/database/browser tests, migrations, and production builds. Tests use fictional data and an isolated disposable database. Docker Compose, environment examples, seed scripts, Swagger, and the README support a clean local setup. The expiry scheduler assumes one API instance and this limitation is documented.

## Delivery workflow

Create all PRD tickets in `docs/implementation-tickets.md` because no issue tracker is configured. Implement tickets in dependency order. Each ticket uses one Git worktree and one branch; after its acceptance criteria pass and required checks run, merge the branch into `main` and remove the worktree. Commits include the ticket ID. The first repository commit contains this design, the PRD, the ticket register, the backend skill, and ignore rules. The app/API scaffold is then implemented as HBE-001.

## Open decisions

The PRD's defaults are accepted as the baseline. The only implementation choice added here is to use persisted server-side staff sessions behind secure cookies, so logout can invalidate a session immediately. No product behavior changes are proposed.
