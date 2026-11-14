# API application

NestJS REST API. Run it from the repository root with `pnpm dev:api` or run both applications with `pnpm dev`. See the root [README](../../README.md) for setup and quality commands.

The API loads `DATABASE_URL` from the root `.env` file or process environment.

- `GET /health/live` reports process liveness without querying PostgreSQL.
- `GET /health/ready` runs `SELECT 1` and returns HTTP 503 if PostgreSQL is unavailable.

The Prisma client is generated from `prisma/schema.prisma` before API development, type checks, e2e tests, and production builds. Generated code is ignored by Git.
