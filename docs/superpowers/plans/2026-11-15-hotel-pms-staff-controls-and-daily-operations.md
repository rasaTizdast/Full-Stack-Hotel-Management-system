# Hotel PMS Staff Controls and Daily Operations Implementation Plan

> **For agentic workers:** Implement one ticket at a time in its own Git worktree, use test-first development, obtain the role reviews listed in `docs/implementation-tickets.md`, then merge and remove that ticket's worktree.

**Goal:** Protect sensitive work with named permissions and audit history, then provide a recoverable daily close and useful operating reports.

**Architecture:** Keep existing persisted sessions and CSRF protections. Expand role checks through explicit capability policies. Store append-only audit events for consequential mutations. Add a property business-date record and a locked, idempotent close run that writes ledger charges and report snapshots using existing domain services.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Next.js, strict TypeScript, Jest/Supertest, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-pms-staff-controls-and-daily-operations-design.md`; shared policy: `docs/decisions/ADR-002-hotel-pms-scope.md`.

## Global Constraints

- Preserve Argon2id, opaque hashed server sessions, HttpOnly/SameSite cookies, CSRF/origin checks, validation, sanitized errors, request IDs, and current role protections.
- Role rules are enforced by the API. Use named accounts and least privilege; account deactivation revokes sessions.
- Audit events never store secrets, auth tokens, full guest payloads, or card data; financial rows remain the source of truth for amounts.
- Use property timezone for business date and UTC event timestamps; store stay/service dates as Gregorian dates.
- Night close is manually initiated in this release, repeat-safe, observable, and recoverable. No multi-instance scheduler claim.
- TDD covers role matrices, audit redaction, timezone boundaries, idempotency, recovery, and report totals.
- Each ticket uses its own worktree and branch; complete required automated web E2E before the tester's manual UI verification.
- Before Next.js edits, read `apps/web/AGENTS.md` and the installed Next.js 16 documentation at `apps/web/node_modules/next/dist/docs/`, including the guide relevant to the route/API change. Every private staff fetch uses request `cache: 'no-store'`, and every staff API response sets `Cache-Control: private, no-store`; tests assert both sides of this policy. Use tracked RTL tokens/CSS modules; do not rely on uncommitted UI primitives.
- Use grouped role-first navigation and desktop/mobile screenshots for designer review. `.hallmark` reports are historical; no Hallmark skill or command is registered in the repository.

---

## Ticket HPM-002 — Staff roles, account administration, and audit events

**Worktree:** `../Hotel Booking system-worktrees/HPM-002`

**Dependencies:** HPM-000; current auth system
**Files:** Prisma role/audit migration; `apps/api/src/staff-auth/**`, new `staff-admin/**` and `audit/**`; role matrix unit/API DB tests; staff management route/components/tests; Swagger.

- [ ] Add failing tests for every role/capability pair, duplicate account creation, unauthorized role change, user deactivation and reuse of an existing session, forced first-login password change, required reason, audit event redaction, and private staff cache headers.
- [ ] Add `MANAGER`, `HOUSEKEEPER`, and `CASHIER` to the existing roles; define an explicit permission matrix. Admin retains all capabilities; managers get operational/financial overrides; reception operates bookings/front desk; housekeeping updates assigned room tasks; cashier manages folios/payments.
- [ ] Add admin-only staff list/create/role-change/deactivate routes; validate username/email uniqueness; store only Argon2id hashes; add `POST /api/v1/staff/auth/change-password` and protected `/staff/change-password`; force password update on first login and restrict that session to password-change; deactivation revokes all active sessions. Do not add email reset or external identity integrations.
- [ ] Add append-only `AuditEvent` with actor, event, target, timestamp, minimal allowlisted before/after fields, and reason. Insert it through the same transaction client as room, booking, staff, maintenance, folio, payment, and close mutations. Add/verify common staff response headers `Cache-Control: private, no-store`.
- [ ] Add accessible `/staff/staff` UI and role-first grouped navigation/home destinations. Keep API authorization definitive and staff responses private/no-store.
- [ ] Run auth unit/API e2e/database, web unit/Playwright, lint/typecheck, and review audit payloads for PII/secrets.

## Ticket HPM-009 — Business date, nightly close, and reports

**Worktree:** `../Hotel Booking system-hpm-009`

**Dependencies:** HPM-004, HPM-005, HPM-006, HPM-007, HPM-008
**Files:** business-date/audit-run migration; `apps/api/src/operations/**`, folio charge helpers; API unit/database/e2e tests; dashboard/report route and components; operational runbook.

- [x] Add failing tests for Tehran business-date boundaries, due-in/out preview, one room-night posting per assignment/date, repeat close, rollback after postings but before date advance, close permission, and report totals.
- [x] Store the current property business date and close-run state/summary; use existing Hotel timezone `Asia/Tehran` and the check-in/out wall times introduced in HPM-001. Do not encode local legal/tax rates.
- [x] Implement manager-only `/staff/operations/close` preview with explicit blockers (unresolved due-in, unhandled due-out, missing checked-in assignment, failed invariant, unfinished previous close) and warnings (upcoming arrival, active in-house stay, open receivable, dirty room, maintenance block). Require confirm naming date, accommodation charges, date advance, and warning count.
- [x] Implement one all-or-nothing PostgreSQL transaction: lock Hotel/business-date row and eligible folios in stable order; post accommodation through the shared unique key; persist close result and advance date. Any failure rolls every write back; retry same date reruns, while retry after success returns the stored result.
- [x] Add `/staff/reports` for arrivals, departures, in-house, occupancy/readiness, blocks, pending requests, open balances, and daily debit/credit totals, filtered by business date and role. Never include guest phone/email in reports unless required for the role's action.
- [x] Run PostgreSQL/API tests and Playwright through a complete operating-day close, including interrupted transaction and retry. Document rollback/retry and single-instance scheduler limits.

## Ticket HPM-010 — Cross-role release QA and product documentation

**Worktree:** `../Hotel Booking system-hpm-010`

**Dependencies:** HPM-001 through HPM-009
**Files:** `apps/web/e2e/**`, `apps/api/test/**`, `docs/implementation-tickets.md`, `README.md`, `docs/operations/**`, `docs/screenshots/pms-*`, final visual audit artifacts.

- [x] Add cross-role E2E for guest request and follow-up contact, staff confirmation, room assignment, dirty-room check-in denial, inspected-room check-in, service posting, duplicate charge/payment retry, unauthorized folio denial, payment, nonzero-balance checkout denial, print, housekeeping reset, on-account collection, and close rollback/retry. Assert public responses never expose guest or folio data.
- [ ] Run the full frontend Playwright suite first. After it passed, the tester reviewed the desktop/mobile screenshot set and E2E source for guest, reception, housekeeping, cashier, manager, and admin flows; a live interactive manual walkthrough remains outstanding. Screenshot-capture findings were fixed and the affected browser suite was rerun successfully. The CUA runtime stopped because it could not determine the current browser URL confidently enough to enforce policy.
- [x] Inspect `.hallmark` artifacts and search project/global executables for a reproducible Hallmark runner. No runner is available, so no Hallmark pass is claimed. Playwright screenshots received Designer review; capture issues were fixed and rechecked. Record the missing runner and historical baseline public-room-list failure (hero ends at 1747px at 1920px) separately from new regressions.
- [x] Run root `pnpm check`, verify fresh/upgrade migrations and seed behavior, inspect print output, and resolve applicable design findings. The successful run applied all 18 migrations to three fresh isolated test databases, validated repeatable fictional seed, and passed API/web tests, Playwright, API E2E, and builds. Existing final-check database migration status was up to date. A4 PDF output and narrow print screenshot were visually inspected.
- [x] Update README for the actual implemented version: setup, roles, workflows, limitations, test gates, invoice/legal boundary, backup/restore expectations, and screenshots. Do not claim integrations or fiscal compliance that are absent.
- [x] Record exact checks, screenshots, known environment limits, commits, and merge state in the ticket register. The HPM-010 implementation commit is `1996a26`, fast-forwarded into `codex/hpm-006-010`; the original `main` worktree remains untouched. HPM-010 stays open because the live tester walkthrough and final ticket-worktree cleanup have not been completed.

## Merge gate

Do not declare whole-program completion until root release checks and the complete guest-to-checkout-to-close flow pass, the tester reports no open blocker, designer review is addressed, README matches runtime behavior, and all ticket worktrees/branches have been merged and removed.
