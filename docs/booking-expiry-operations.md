# Booking expiry operation

The API runs an in-process expiry worker once per minute. Each pass selects up to 100 expired pending bookings, then locks each booking and its inventory rows before releasing held rooms and recording `EXPIRED` in one transaction. The database clock decides whether a request has expired.

The current deployment supports one API instance. Do not horizontally scale the API until expiry scheduling has distributed coordination. Repeated scans are safe because each booking transition is serialized and terminal bookings do not change inventory again.

The worker logs only the internal booking ID and a sanitized error code when a scan or transition fails. It does not log guest names, phone numbers, email addresses, notes, or booking payloads. Failed items are eligible for a later scan.
