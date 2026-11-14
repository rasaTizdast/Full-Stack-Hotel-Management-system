# API application

NestJS REST API. Run it from the repository root with `pnpm dev:api` or run both applications with `pnpm dev`. See the root [README](../../README.md) for setup and quality commands.

The API loads `DATABASE_URL` from the root `.env` file or process environment.

- `GET /health/live` reports process liveness without querying PostgreSQL.
- `GET /health/ready` runs `SELECT 1` and returns HTTP 503 if PostgreSQL is unavailable.
- Product API routes use the `/api/v1` prefix. Request bodies are capped at 1 MiB and malformed JSON receives a sanitized error response.
- DTO validation transforms known fields, rejects unknown fields, and returns stable field-level errors without echoing submitted values. Every request receives a server-generated `X-Request-Id`; internal errors log only that ID, the exception type, and status.
- Staff login is available at `POST /api/v1/staff/auth/login`; `GET /api/v1/staff/auth/me` returns the current staff identity and a refreshed CSRF token, and `POST /api/v1/staff/auth/logout` revokes the persisted session. The API stores only SHA-256 hashes of opaque session and CSRF values; the session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Browser login requires an `Origin` or `Referer` matching `WEB_ORIGIN`. Credentialed CORS is limited to that exact origin. Set `WEB_ORIGIN` to the HTTPS frontend origin in production; local development defaults to `http://localhost:3000`.
- Staff mutations must send the CSRF token from the login or current-user response in `X-CSRF-Token`; keep it in memory and do not store it in localStorage. The session cookie is sent with browser requests using `credentials: 'include'`. Login allows five attempts per client address in a 15-minute in-process window.
- Staff inventory is read at `GET /api/v1/staff/inventory?roomTypeId=<uuid>&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`; `endDate` is exclusive and missing nights have null inventory values. `PUT /api/v1/staff/inventory` accepts the same room type and date range plus `totalRooms` and a string `nightlyPriceToman`, applying both values atomically to each night. Both roles may read, while only admins may update; the API rejects capacity below held plus booked rooms.

The Prisma client is generated from `prisma/schema.prisma` before API development, type checks, e2e tests, and production builds. Generated code is ignored by Git.
