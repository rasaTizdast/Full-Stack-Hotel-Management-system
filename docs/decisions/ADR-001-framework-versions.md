# ADR-001: Framework versions for the local Node runtime

- **Date:** 2026-11-14
- **Status:** Accepted

## Context

The local environment runs Node.js 22.19.0 and pnpm 10.26.2. The PRD requires Next.js, NestJS, strict TypeScript, Tailwind CSS, and Jest for API unit tests. Current official documentation requires Node 20.9 or newer for Next.js 16 and Node 20 or newer for NestJS 11. The NestJS 12 application runtime accepts Node 22.12 or newer, but its generator requires Node 22.22.3 or newer. The current runtime can run the NestJS 11 CLI and generated app.

## Decision

Use Next.js 16.4.6, React 19.3.1, Tailwind CSS 4.3.5, NestJS 11.2.10, and Nest CLI 11.0.24. Pin pnpm 10.26.2 through the root `packageManager` field. Keep the project Node engine floor at 22.12.0. Use ESLint 9 in the web app because the current Next.js React and accessibility plugins declare peer support through ESLint 9; use ESLint 10 in the Nest app, whose flat-config toolchain supports it.

## Consequences

The selected versions are compatible with the local Node runtime and retain the NestJS Jest workflow required by the PRD. Separate ESLint majors avoid peer mismatches in the generated Next.js plugin chain. Upgrade the Nest major version after the local Node runtime meets the newer generator requirement and the API test setup is verified against that major.
