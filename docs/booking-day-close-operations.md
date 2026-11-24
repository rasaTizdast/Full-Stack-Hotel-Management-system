# Business date and night close

The property business date is a persisted hotel-local date. Timestamps remain UTC; stay dates, service dates, and the close date are date-only values in the property's configured timezone. The first release uses the hotel's configured timezone (currently `Asia/Tehran`) and a **manual** manager/admin close. No scheduler or automatic close is installed.

## Close a business day

1. Open **Staff → Operations → Close business day** and review the displayed hotel date, proposed next date, accommodation amount, warnings, and blockers.
2. Resolve every blocker first. This includes unhandled due-ins or due-outs, missing room assignments for checked-in stays, failed booking/folio invariants, or an unfinished prior run. Warnings such as active stays, open receivables, dirty rooms, and maintenance blocks need review but do not prevent closing.
3. Confirm only after the dialog shows the intended date, accommodation charge count and amount, next date, and remaining warning count.
4. The close posts each eligible assigned room night through the same folio posting service and unique assignment/date key used by checkout. The ledger postings, close-run summary, audit event, and date advance commit in one PostgreSQL transaction. No local tax or fee rate is inferred.

## If the request fails or times out

- Refresh the close screen. If the property date is still the date you intended to close, review the new preview, correct any blocker, and retry that same date. A failed transaction leaves its room-night postings, run row, audit event, and date change rolled back.
- If the property date advanced, treat the close as committed. A repeated API request for the successfully closed date returns its stored result without posting a second room night or advancing again.
- If the browser lost the response after a commit, verify the current property date and the folio ledger before acting. Do not manually add a room-night charge to compensate for an uncertain response.
- If a prior run remains unfinished, stop and investigate the database and audit history before retrying. Do not delete close-run or ledger rows to clear the blocker.

## Reports and limits

Reports filter stay lists and ledger totals by business date. Open folio balances, the active room register, room readiness, active blocks, and pending queues are current-state views; the system does not keep historical snapshots for those fields. Reports omit guest phone and email.

The API still has the existing single-process expiry worker. Night close itself is manual and has no scheduler. Run one API instance until expiry scheduling has distributed coordination; a future automated or multi-instance close requires a separate scheduling and operational decision.
