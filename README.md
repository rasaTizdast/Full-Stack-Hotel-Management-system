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
pnpm install
```

## Run the applications

```powershell
pnpm dev
```

The web and API applications can also be started independently:

```powershell
pnpm dev:web
pnpm dev:api
```

## Quality checks

```powershell
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
```

Database, seed, test, API documentation, and demo instructions will be added with their respective implementation tickets.
