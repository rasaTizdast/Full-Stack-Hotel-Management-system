# Physical inventory and stay operations — Accepted Design

**Status:** Approved by the user's end-to-end PMS instruction; detailed scope decisions are recorded in ADR-002.

## Goal and boundaries

Turn room-type-only capacity into a physical-room operation while preserving the existing public request flow and its anti-oversell guarantees. The first slice adds rooms, assignments, arrivals/in-house/departure worklists, and check-in/no-show/room-move actions. Folio settlement and final checkout are implemented in the billing slice so a guest cannot be checked out with an unexplained balance.

One property remains the deployment boundary. Direct guest requests and staff-confirmed reservations remain supported. Staff can also create a walk-in reservation. Group blocks, multi-property chains, OTA/channel distribution, native keycard encoding, guest ID scanning, and external notifications remain deferred.

## Architecture

Keep the modular monolith and existing module ownership. Add `RoomsModule` for room catalog, date blocks, assignment checks, and room board queries; extend `BookingsModule` for staff-created and changed stays and lifecycle transitions; add dedicated `StaffOperationsModule` only if arrival/departure queries do not fit existing booking responsibilities. HPM-001 creates the `RoomAssignment` persistence foundation so room deactivation can protect planned stays; HPM-003 adds assignment operations, overlap enforcement, and the room board. `apps/web` adds a physical room board and a front-desk workspace under the existing protected staff layout. PostgreSQL remains authoritative; all mutations use Prisma transactions and explicit row locks where concurrent capacity or room assignment can conflict.

`RoomNightInventory` continues to hold per-night Toman rates and held/booked counters, and retains the recorded capacity for each date as an as-of-date snapshot. For today and future dates, `totalRooms` is a derived projection: active rooms of the type minus distinct rooms with an overlapping active capacity block (`OUT_OF_ORDER` or `CAPACITY_CLOSED`); `blockedRooms` is stored with the projection. Capacity mutations update only inventory rows from the property's business date forward. Past rows are preserved, including total, blocked, held, and booked counts, and are never recomputed from today's rooms or blocks. A past date with no inventory row has `UNAVAILABLE` capacity (`null` capacity/counters) rather than a projection based on today's room list. Rate-only updates reject ranges that start before the business date and touch only the requested current/future range. The staff date-range query returns each current/future night with projected room capacity and zero counters even when no rate row exists; its price is `null` until staff sets one. Inventory updates accept rate fields only, never capacity. Overlapping active blocks for one room are rejected under a room-row lock.

## Domain rules

- `Room` belongs to the one Hotel and one RoomType. Room number is unique within the hotel. Backfilled rooms carry a read-only `isGenerated` marker until staff replaces the generated label; newly created rooms are not generated. Floor and descriptive features are optional. Inactive rooms cannot receive new assignments.
- Generated backfill rooms remain `DIRTY` until staff verifies the physical room. The fictional demo seed may mark its explicit demo rooms `INSPECTED`; production data is never implicitly considered ready.
- Deactivation locks the physical room row also used by assignment/check-in and fails with a stable conflict if any current/future active assignment overlaps. Staff must explicitly reassign or end the assignment first; reducing aggregate capacity alone is not sufficient protection.
- A `RoomAssignment` links a booking, physical room, inclusive start date, exclusive end date, assigning staff member, change reason, and active flag; HPM-001 creates its persistence foundation and HPM-003 implements assignment operations. The room type must match the booking room type; the assignment interval must be inside the booking interval; and it cannot overlap an active assignment or out-of-order block. Assignment mutation and check-in lock the same room row. When a transaction also needs both locks, acquire the room-type lock before the room-row lock, matching HPM-001 capacity mutations and avoiding reverse-order deadlocks. Multi-room bookings require one distinct room per booked unit before check-in.
- Booking states expand to include `CHECKED_IN`, `CHECKED_OUT`, and `NO_SHOW`. Existing `PENDING_CONFIRMATION`, `CONFIRMED`, `REJECTED`, `CANCELLED`, and `EXPIRED` transitions and their counter semantics remain intact.
- Check-in is allowed only for a confirmed due-in booking, after all units are assigned, with no room/date conflicts, and with each assigned room in `INSPECTED` state. Normal check-in starts at the hotel's configured check-in time. Early check-in requires an inspected room plus a manager override and reason; no early fee is invented. Late arrivals remain due-in until staff checks them in or records a no-show; no automatic no-show fee or transition is applied.
- No-show is a staff action on an eligible due-in booking. It releases future inventory and assignments exactly once and records actor/time/reason. Any fee is a separate folio ledger posting, never an invisible inventory-side charge.
- An in-house move closes the prior assignment at the effective business date, opens a new non-overlapping assignment, and checks the target room's readiness and occupancy. Existing charges and original reservation snapshots remain unchanged.
- Future confirmed stays may be amended only before check-in. The service atomically recalculates inventory counters and `BookingNight` rows. Unchanged nights keep their stored price; added nights use the current nightly rate. Reject amendments that reduce room quantity below active assignments or put an assignment outside the new dates; staff must resolve assignments first.
- Check-out, after financial settlement policy is evaluated, records actual departure, releases future nights for an early departure, closes assignments, and marks rooms dirty. The Billing spec owns the atomic ledger/balance/check-out boundary.
- Dates remain Gregorian `YYYY-MM-DD` at API/database boundaries, hotel timezone for business date, check-in inclusive, checkout exclusive. UI shows Jalali dates.

## Interfaces and UX

Route ownership: `/staff/rooms` is the operational room board; `/staff/rooms/manage` is physical room CRUD; `/staff/front-desk/arrivals`, `/staff/front-desk/in-house`, and `/staff/front-desk/departures` are stay worklists; existing `/staff/bookings` and `/staff/inventory` retain request and rate responsibilities. Staff navigation is role-aware and grouped; `/staff` renders role-specific operational summaries.

The public confirmation remains a pending request, displays the reservation reference, and tells the guest staff will follow up using the phone number they submitted. Display the hotel's phone only when configured (and other public contacts only when present); a null `Hotel.contactPhone` must never render an empty link or placeholder and does not block booking. Test confirmation behavior with both a configured phone and `contactPhone: null`.

New private staff views use the existing guarded staff API client and configured API origin with credentials and CSRF; the API enforces exact-origin CORS. Requests use `cache: 'no-store'` and staff API/print responses set `Cache-Control: private, no-store`. Do not pass private records through unguarded public/server-rendered components. Follow the current protected staff shell and cookie/CSRF client. Before changing Next.js code, read `apps/web/AGENTS.md` and the installed Next.js 16 guide under `apps/web/node_modules/next/dist/docs/` in that ticket worktree.

The room board defaults to the property business date, shows last-updated time, refreshes every 30 seconds, and has manual refresh. On refresh failure it retains the last board and marks it stale. It distinguishes vacant+inspected, vacant+dirty, arriving, occupied, departing, and out-of-order with visible text/icon labels, never color alone. Reception gets arrivals, departures, and in-house lists with search by guest/reference/room. Housekeeping roles can see necessary task details without billing data or unnecessary guest contact fields.

Actions use confirmation for consequential transitions and show the server's final state. Conflict, not-ready, already-checked-in, stale-version, and capacity errors have stable API codes and actionable Persian UI messages. Staff pages retain keyboard operation, visible focus, narrow-screen layouts, RTL semantics, and explicit loading/empty/error/success states.

## Security, migration, and verification

Extend the existing role guard and session/CSRF conventions. Never trust a hidden UI action for authorization. Write audit events for room assignment/move, check-in, no-show, override, block, and capacity-affecting room changes. Preserve all guest PII protections and do not log form payloads.

Use forward-only migrations. Backfill physical units up to each type's maximum existing capacity with generated labels and mark them for replacement before a real deployment. Preserve each night’s existing capacity by adding date blocks to excess generated rooms where legacy capacity was lower. Existing held/booked counters and booking price snapshots must remain unchanged. Test fresh migration and an upgrade fixture containing variable nightly capacities plus pending, confirmed, cancelled, and expired requests.

Required tests cover room uniqueness, active assignment overlap under concurrent requests, inventory projection updates/rollback, multi-room assignment, lifecycle transition matrix, check-in readiness/permissions, no-show idempotency, early departure capacity release, and public privacy. Playwright covers guest request through staff confirmation and the new front-desk actions at desktop and mobile widths.

## Work excluded

Final payment settlement, service posting, legal/fiscal invoice certification, nightly close, reporting, external integrations, and multi-property support belong to separate specs or later decisions.
