# Hotel Booking Engine

A Persian-first booking request system for one small hotel. Guests will search availability and submit booking requests; staff will manage requests, room-night inventory, and prices. Staff confirmation is required. This project does not process payments.

The repository is being implemented against the [product requirements](prd.md). Current ticket progress is tracked in [docs/implementation-tickets.md](docs/implementation-tickets.md).

## Requirements

- Node.js 22.12 or newer
- Corepack and pnpm 10.26.2
- Docker Desktop for the local PostgreSQL service (added in HBE-002)

## Setup

```powershell
corepack enable
corepack prepare pnpm@10.26.2 --activate
Copy-Item .env.example .env
pnpm install
pnpm db:up
```

`.env.example` contains local-only example credentials. Change `POSTGRES_PASSWORD` and the matching password in `DATABASE_URL` before using this setup on a shared machine. The example database publishes on port `5433` to avoid colliding with a PostgreSQL service already listening on `5432`; set `POSTGRES_PORT` if that port is also taken.

## Run the applications

```powershell
pnpm dev
```

The web and API applications can also be started independently:

```powershell
pnpm dev:web
pnpm dev:api
```

The API serves product endpoints under `/api/v1`. Health checks remain unprefixed for monitoring: `GET /health/live` checks the process; `GET /health/ready` runs a database query and returns HTTP 503 with setup guidance when the database is unavailable. API request errors include a stable code, message, and request ID; DTO validation rejects unknown fields.

## Quality checks

```powershell
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm --filter @hotel/api run test:e2e
pnpm build
```

`pnpm test` runs the web and API unit/component suites across the workspace. To generate the web core-utility coverage summary and HTML report, run `pnpm --filter @hotel/web test:coverage`; the report is written to `apps/web/coverage/`.

Stop the local database with:

```powershell
pnpm db:down
```

The named PostgreSQL volume remains available after `db:down`, so local data is preserved when the container stops.
