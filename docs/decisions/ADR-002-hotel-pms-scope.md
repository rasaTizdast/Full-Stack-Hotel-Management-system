# ADR-002: Expand the booking engine into a single-property PMS

- **Status:** Accepted for implementation under the user's full PMS request
- **Date:** 2026-11-15
- **Supersedes:** Only the exclusions in PRD v1.0 that conflict with this decision

## Context

The original PRD intentionally stopped at room-type booking requests. The requested product now includes operational room visibility, assignment, stay execution, housekeeping, maintenance, checkout, and itemized service billing. The current NestJS/Prisma/PostgreSQL API and Next.js app already provide a tested booking foundation.

## Decision

1. Keep one property, the existing modular monolith, PostgreSQL, REST API, Persian RTL UI, Jalali display dates, Gregorian API/storage dates, and integer Toman amounts.
2. Add physical rooms as the canonical source of physical capacity. Preserve `RoomNightInventory` as the per-night rate and transactional hold/booked counter ledger; `totalRooms` is always recomputed as active physical rooms minus distinct rooms with an overlapping active capacity block (`OUT_OF_ORDER` maintenance or `CAPACITY_CLOSED` operating decision). This applies to new rate rows and to room/block create, reactivate, deactivate, resolve, and expiry. A room/block mutation locks affected inventory rows and rejects any projection below held plus booked counts.
3. Preserve the guest request-and-staff-confirmation flow. Confirmed stays can be assigned room units; check-in requires a conflict-free assignment and an inspected room. Normal check-in starts at the property's configured wall time; early check-in requires an inspected room and manager override with reason. Late arrivals stay due-in until staff records check-in or no-show; no automatic fee or no-show transition is applied. Staff can create walk-ins and manage arrivals, departures, and in-house stays. Guest confirmation says the request is pending, provides the reservation reference, and says staff will follow up using the guest's submitted phone number. Show the property's phone only when configured; never display an empty/placeholder contact. No account, self-service lookup, or messaging provider is included.
4. Track front-office occupancy, housekeeping condition, and maintenance availability as distinct facts. An open maintenance task does not itself block a room; an explicit dated out-of-order block does. Only one active out-of-order interval may exist per room at a time; overlapping blocks are rejected under a room-row lock. Out-of-order rooms reduce sellable capacity and cannot be assigned.
5. Store folio activity as an append-only ledger with immutable price/service snapshots and a single locked posting path. Accommodation is charged once per assigned room and stay date in `[checkIn, actualDeparture)`; night close and checkout share a database-unique key. Staff can post services, record offline/manual payments, corrections/refunds, and print room-attributed folios. Payments are positive and cannot exceed the positive balance; refunds cannot exceed the unrefunded amount of their source payment. Ordinary checkout requires zero balance; a manager may record a positive on-account receivable, and cashier can collect it after checkout without posting new charges.
6. Add named staff roles for administration, management, reception, housekeeping, and cashiering. Enforce permissions in the API and write an audit record for consequential room, booking, staff, and financial actions.
7. Add a property-local business date and manually initiated night close with an exception preview. Close is all-or-nothing in one database transaction: ledger postings, run result, and business-date advance commit together or all roll back; retry after rollback reruns the same date without duplicate charges. Keep the first release single-instance and document scheduling/replica limits.
8. Leave online card capture, card-data storage, fiscal-device/e-invoice certification, OTA/channel distribution, POS/door-lock/ID-scan integrations, multi-property tenancy, guest accounts, and external messaging out of this implementation.

## Consequences

- The migration must preserve every existing room-night capacity/rate and booking hold. Backfill physical units up to the maximum capacity per room type using clearly marked generated room numbers; where a legacy night has lower sellable capacity, create dated `CAPACITY_CLOSED` blocks on the excess generated units so availability does not increase. Production rollout must import the property's real room list before accepting bookings.
- Room creation, deactivation, and out-of-order scheduling must update projected capacity transactionally and reject changes that would invalidate held or booked inventory.
- A room cannot be deactivated while an active assignment overlaps the current or future date range. Staff must reassign first; deactivation and assignment/check-in serialize on the same room-row lock.
- The existing inventory UI changes from editing physical capacity to showing derived capacity and editing nightly rates. Staff add, deactivate, or block physical rooms in the room-management workflows.
- A new nightly inventory row initializes capacity from the room/block projection and never accepts capacity from the browser. Assignments must match room type, stay within booking dates, avoid active assignments/blocks, and use a room-row lock shared with check-in.
- Future stay amendments are allowed only before check-in. They update counters and booking-night snapshots atomically; unchanged nights keep stored price, added nights use the current rate, and changes invalidating room assignments are rejected until rooms are reassigned.
- The room board defaults to the property business date, displays vacant and housekeeping states separately, refreshes every 30 seconds with manual refresh/last-updated time, and shows stale state if refresh fails.
- New private staff pages use the guarded same-origin API/client pattern, `no-store` sensitive responses, and do not pass private data through unguarded public/server-rendered routes. Exact route ownership is listed in the front-end plan.
- Guest self-service lookup is out of scope; request confirmation explains staff confirmation and gives the reference. Staff follow-up uses the submitted guest phone. The property's phone/email is shown only when configured; a missing contact never blocks booking or produces a broken/placeholder link.
- A printed folio is an operational statement, not a claim of legal/fiscal invoice compliance. Local tax, numbering, identity, and reporting obligations remain deployment-specific.
- Manual payment entries record how an offline payment was accepted; the app never stores card numbers, CVVs, PINs, or magnetic-stripe data.
- On-account checkouts use a `CLOSED_DUE` folio state until post-checkout collection settles the balance; closed-due folios accept payments but no new charges. Night-close preview labels blockers and warnings and requires confirmation naming the business date and effects.

## Alternatives considered

- **Keep aggregate room-type inventory only:** rejected because staff cannot answer which room is occupied, empty, clean, assigned, or blocked.
- **Replace the current app with a full hotel suite or microservices:** rejected because it discards tested booking logic and adds deployment/consistency overhead without a multi-property or integration requirement.
- **Add live payment and channel integrations immediately:** deferred because providers, jurisdictions, certification, and operational ownership are not specified.
