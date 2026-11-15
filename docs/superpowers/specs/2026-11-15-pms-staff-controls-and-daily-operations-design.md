# Staff controls and daily operations — Accepted Design

**Status:** Approved by the user's end-to-end PMS instruction; detailed scope decisions are recorded in ADR-002.

## Goal and boundaries

Make consequential hotel operations attributable and give staff a reliable view of the hotel's business day. This slice depends on room operations and the folio ledger. It adds named, least-privilege staff capabilities; an append-only business audit log; a timezone-aware business date; a repeat-safe manual night close; and operational summaries.

## Staff access and audit

- Keep the existing hashed passwords, persisted opaque server sessions, HttpOnly/SameSite cookies, CSRF proof, origin checks, and login rate limits.
- Extend named roles to `ADMIN`, `MANAGER`, `RECEPTIONIST`, `HOUSEKEEPER`, and `CASHIER`. API policies are explicit per capability: reception manages reservations and front-desk transitions; housekeeping updates assigned room tasks/status; cashier posts charges/payments and prints folios; manager handles overrides, corrections/refunds, room blocks, and daily close; admin additionally manages staff and property configuration.
- Add admin-controlled staff list/create/role-change/deactivate operations. Staff creation requires an admin-supplied initial password and sets `mustChangePassword`; until changed, the session can use only the password-change route. No email reset provider is assumed. Duplicate usernames/emails and unauthorized role changes fail; deactivation revokes all active sessions.
- The forced password update is served at `/staff/change-password` and `POST /api/v1/staff/auth/change-password`; it requires the current password, CSRF, and a new password meeting the existing credential policy. Do not leak whether a username/email exists in public responses.
- Add append-only `AuditEvent` with actor id, event name, target type/id, timestamp, minimal before/after fields, and required reason for overrides. Avoid full guest payload snapshots, passwords, cookies, and payment credentials. Financial ledger rows remain their own authoritative history and are referenced by audit entries. The mutation and audit insert use the same transaction client so neither can commit alone.
- Staff API list routes paginate and redact data by role. UI visibility is convenience only; server guards are authoritative.

| Capability | ADMIN | MANAGER | RECEPTIONIST | HOUSEKEEPER | CASHIER |
|---|---:|---:|---:|---:|---:|
| Manage staff/property | Yes | No | No | No | No |
| Edit room types/rates and room catalog | Yes | Yes | No | No | No |
| Manage bookings, assignments, arrivals, check-in/no-show/moves | Yes | Yes | Yes | No | No |
| View room board and guest/reference context | Yes | Yes | Yes | Assigned work/room only | Room number only when linked to a folio |
| Update housekeeping tasks/condition | Yes | Yes | No | Yes | No |
| Create/resolve maintenance and out-of-order/capacity blocks | Yes | Yes | No | No | No |
| View folios, balances, and print | Yes | Yes | Yes | No | Yes |
| Post services and record/collect payments | Yes | Yes | No | No | Yes |
| Adjust/refund, on-account checkout override | Yes | Yes | No | No | No |
| Complete zero-balance checkout | Yes | Yes | Yes | No | Yes |
| Run night close and view financial reports | Yes | Yes | No | No | No |

## Business date, night close, and reports

- `Hotel` stores timezone (`Asia/Tehran` by current demo default), check-in/out wall times, and current business date. Timestamps remain UTC; stay and service dates remain date-only in hotel-local business terms.
- A manager previews close exceptions: due-ins, no-shows needing decision, due-outs, checked-in stays, dirty/blocked rooms, unposted accommodation, open folio balances, and failed prior close steps.
- A close run is created under a lock on the property business-date row and uses the same accommodation posting service/unique room-assignment/date key as checkout. Configured fee/tax postings are explicit; no tax rate is inferred. The entire close is all-or-nothing in one transaction: ledger postings, run result, and business-date advance all commit together or roll back. A retry after rollback reruns the same date; a retry after success returns the prior result without duplicate charges or a second date advance.
- The preview distinguishes **blockers** (unfinished prior close, due-out stay not checked out/extended, due-in without check-in/no-show decision, checked-in stay missing room assignment, invariant or posting failure) from **warnings** (upcoming arrivals, active stays, open receivables, dirty rooms, maintenance blocks). Close cannot proceed with blockers. Manager confirms a screen naming business date, accommodation charges to post, date advance, and warning count.
- The close is manual in the first release. The existing one-process expiry-worker constraint remains documented; multiple API replicas require a separate distributed-job decision.
- Dashboard/report views include arrivals, departures, in-house, room occupancy/readiness, maintenance blocks, pending requests, folio balances, and daily charge/payment summaries. Reports are derived from authoritative bookings, room states, and ledger rows, with date filters and role-based visibility.

## UI/API and verification

NestJS `StaffAdminModule`, `AuditModule`, and `OperationsModule` own these policies and reports. Protected staff routes preserve the current RTL shell and responsive behavior. Role-first home destinations focus reception on arrivals/in-house/departures, housekeeping on room tasks, cashier on open folios, managers on close/exceptions/reports, and admins on staff/property configuration. Navigation is grouped by role rather than rendered as one long undifferentiated list.

Use the existing tokens in `apps/web/src/app/globals.css` and established CSS-module conventions; do not assume uncommitted UI primitives exist. New staff pages use the protected client shell and existing guarded staff API client against the configured API origin, with credentials and CSRF; the API enforces exact-origin CORS. Requests use `cache: 'no-store'`, and staff API responses set `Cache-Control: private, no-store`. Do not pass private staff payloads through unguarded server-rendered/public components. Before changing Next.js source, read `apps/web/AGENTS.md` and the installed Next.js 16 documentation at `apps/web/node_modules/next/dist/docs/`, including the guide relevant to the route/API change.

Tests cover the role-permission matrix, duplicate/unauthorized account operations, account deactivation/session revocation, required audit reasons, event redaction, Tehran business-date boundaries, duplicate close prevention, failure after room-night postings but before date advance (all writes roll back), report totals against ledger fixtures, and cross-role API access. Full Playwright runs before manual UI review across guest, reception, housekeeping, cashier, manager, and admin flows.

### Staff route ownership

| Route | Primary role | Purpose |
|---|---|---|
| `/staff` | Role-aware | Operational home and priority exceptions |
| `/staff/bookings` | Reception/manager/admin | Booking requests and search |
| `/staff/inventory` | Manager/admin | Nightly rates and derived capacity |
| `/staff/rooms` | Reception/manager/housekeeping | Physical room board |
| `/staff/rooms/manage` | Manager/admin | Physical room catalog |
| `/staff/front-desk/arrivals` | Reception/manager | Due-in list and check-in |
| `/staff/front-desk/in-house` | Reception/manager | Occupied stays and room moves |
| `/staff/front-desk/departures` | Reception/cashier/manager | Due-outs and checkout |
| `/staff/housekeeping` | Housekeeping/manager | Cleaning and inspection tasks |
| `/staff/maintenance` | Manager/admin | Repair queue and room blocks |
| `/staff/services` | Manager/admin | Charge catalog and active prices |
| `/staff/folios/[bookingId]` | Cashier/reception/manager | Stay folio and settlement |
| `/staff/folios/[bookingId]/print` | Cashier/reception/manager | No-store print view |
| `/staff/operations/close` | Manager/admin | Night-close preview and result |
| `/staff/reports` | Manager/admin | Operational and financial summaries |
| `/staff/staff` | Admin | Named staff accounts and roles |
| `/staff/change-password` | Any staff member with `mustChangePassword` | Required initial password update |

## Excluded

Multi-property role scopes, automated multi-instance schedulers, payroll, statutory reports, accounting exports, and external identity providers are deferred.
