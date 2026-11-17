# Housekeeping and maintenance — Accepted Design

**Status:** Approved by the user's end-to-end PMS instruction; detailed scope decisions are recorded in ADR-002.

## Goal and boundaries

Give reception and room attendants one current view of room readiness and work. This subsystem depends on physical rooms and assignments. Housekeeping condition is stored separately from occupancy. Maintenance work is tracked separately from cleaning; a maintenance item blocks sale only when a user creates an explicit dated out-of-order block.

## Domain and workflows

- Each active physical room has one housekeeping status: `DIRTY`, `CLEAN`, or `INSPECTED`. Checkout sets `DIRTY`; a cleaning completion sets `CLEAN`; inspection can set `INSPECTED`. Only a room in `INSPECTED` state is eligible for the default check-in rule.
- A `HousekeepingTask` records room, task type (departure clean, stayover clean, inspection, guest request), requested business date, priority, assigned user, status, completion time, and a short operational note. Assignment and completion are auditable. Repeating task completion is idempotent.
- The task board sorts arriving guests and overdue departure cleans ahead of routine stayovers, with staff filters for floor, room, due date, task type, assignee, and state. Mobile staff can update task/status with a short action path.
- A `MaintenanceRequest` records room, category, description, priority, assignee, opened/due/resolved timestamps, and resolution note. Open requests remain visible until resolved.
- A `RoomBlock` table is introduced with physical-room foundations; this ticket adds its user workflow. It records room, start/end dates, kind (`OUT_OF_ORDER` for maintenance or `CAPACITY_CLOSED` for an operating decision), reason, creator, and optional expected return. It is the only mechanism in this release that removes the unit from sellable capacity. Creation rejects an interval overlapping another active block for that room, an active assignment, or capacity that would oversell held/booked inventory. Expiry/restoration is repeat-safe and capacity uses distinct blocked rooms.
- Distinct housekeeping and occupancy values expose discrepancy reports; status updates cannot silently switch a room from occupied to vacant.
- Add `RoomDiscrepancy` records for `SLEEP` (front desk says vacant, attendant observes occupied) and `SKIP` (front desk says occupied, attendant observes vacant), with room, business date, reporter, note, status, resolver, resolution time, and resolution reason. Housekeeping can report but cannot change occupancy. Reception/manager resolves by performing the correct check-in/out or dismissing with a reason; the record remains in history.

## API and UI

NestJS `HousekeepingModule` and `MaintenanceModule` expose authenticated, paginated boards and mutation routes with DTO validation and role checks. Reception sees readiness, maintenance flags, and discrepancy queue. Housekeeping users can update tasks/room conditions and report discrepancies but cannot change occupancy, see folio balances, or change inventory/rates. Managers/admins can assign work and create/remove dated blocks. Checkout in the billing slice, not this slice, changes the room to `DIRTY`.

Next.js staff routes add a Housekeeping board and a Maintenance queue. Status is communicated by text/icon as well as color. Forms include labels, validation, loading, empty, error, success, and stale-update states. The existing Persian RTL tokens and responsive staff shell are reused; no new visual system is introduced.

## Invariants and tests

Room blocks use hotel-local date boundaries and exclusive end dates. Capacity projection, block rows, and audit entries update atomically using the same inventory locks as booking creation. New nightly inventory rows also subtract distinct active blocks. A room cannot be assigned while a block overlaps. Out-of-order operations cannot invalidate held/booked quantities or assignments. Task completion and maintenance resolution preserve actor/time history.

TDD coverage includes housekeeping state transitions, role restrictions, task assignment/completion idempotency, discrepancy report/resolve/dismiss flows, role separation between reporting and occupancy mutation, date-boundary behavior, concurrent block versus booking behavior, rejected capacity reductions, audit history, and staff API e2e. Playwright covers reception seeing readiness, housekeeping completing work/reporting a discrepancy, reception resolving it, and the room becoming eligible for check-in.

## Excluded

Automated task scheduling, housekeeping labor/payroll, mobile native apps, guest messaging, room sensors, vendor maintenance integrations, and attachments are deferred.
## HPM-005 implementation clarifications

- Automated task scheduling remains excluded. Reception, managers, and admins can create operational tasks manually; managers and admins assign or reassign work to active housekeepers. A housekeeper cannot claim an unassigned task.
- Task types are DEPARTURE_CLEAN, STAYOVER_CLEAN, INSPECTION, GUEST_REQUEST, and RE_CLEAN. Priorities are LOW, NORMAL, HIGH, and URGENT, defaulting to NORMAL. Task states are OPEN, IN_PROGRESS, COMPLETED, and CANCELLED. Starting work changes OPEN to IN_PROGRESS; completion is idempotent and retains actor/time history. Only managers/admins can cancel, with a reason.
- A completed cleaning or re-clean task changes room condition to CLEAN. A passed inspection changes CLEAN to INSPECTED. A failed inspection requires a reason, changes the room to DIRTY, completes the inspection with NEEDS_REWORK outcome, and creates an OPEN RE_CLEAN task. A guest-request task does not change room condition. A housekeeping action never changes occupancy.
- Housekeeping board responses show room occupancy separately from housekeeping condition and task state, without guest names, reservation references, phone/email, rates, or folio data. Reception/management may see only the minimal due-arrival/departure context needed for readiness.
- A discrepancy report submits observed occupied/vacant state. The server snapshots current occupancy and derives SLEEP or SKIP; a report is rejected when observed and recorded occupancy agree. Reporting never changes occupancy. Reception, managers, and admins can resolve only after a stay action makes live occupancy agree with the observation, or dismiss with a reason. Checkout-dependent SKIP correction is enabled by HPM-008; until then the report remains open or is dismissed with a reason.
