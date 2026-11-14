# API application

NestJS REST API. Run it from the repository root with `pnpm dev:api` or run both applications with `pnpm dev`. See the root [README](../../README.md) for setup and quality commands.

The API loads `DATABASE_URL` from the root `.env` file or process environment.

- `GET /health/live` reports process liveness without querying PostgreSQL.
- `GET /health/ready` runs `SELECT 1` and returns HTTP 503 if PostgreSQL is unavailable.
- Product API routes use the `/api/v1` prefix. Request bodies are capped at 1 MiB and malformed JSON receives a sanitized error response.
- DTO validation transforms known fields, rejects unknown fields, and returns stable field-level errors without echoing submitted values. Every request receives a server-generated `X-Request-Id`; internal errors log only that ID, the exception type, and status.

The Prisma client is generated from `prisma/schema.prisma` before API development, type checks, e2e tests, and production builds. Generated code is ignored by Git.
