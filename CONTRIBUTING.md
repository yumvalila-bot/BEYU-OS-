# Contributing to BEYU OS

## Getting started

```bash
corepack enable && corepack prepare pnpm@9.12.3 --activate
pnpm install
cp .env.example .env

# Option A — real infrastructure (requires Docker)
make up && pnpm db:migrate && pnpm db:seed

# Option B — no Docker: embedded PostgreSQL (WASM), the default
pnpm db:migrate && pnpm db:seed

pnpm dev
```

Before opening a pull request:

```bash
make check   # typecheck + lint + test
```

## Repository layout

| Path | Contents |
| --- | --- |
| `apps/beyu-web` | Next.js web application |
| `flutter/beyu` | Flutter mobile application (adaptive, not a WebView) |
| `services/beyu-api` | NestJS control-plane API — the system of record |
| `services/noelia`, `services/hive` | AI services |
| `packages/*` | Shared contracts, auth, security, events, config, UI |
| `infrastructure/*` | Docker, Kubernetes, Terraform, monitoring |

## Non-negotiable rules

These encode decisions from the BEYU OS specification. A change that breaks one
will be rejected regardless of how well it is written.

**The parent organization is BEYU FAMILY TRUST.** Never "BEYU GROUP". The name
is validated in code and the forbidden variant throws.

**BEYU OS ends at the Sector LLC boundary.** It governs the Trust, the Holding
Company, Country Holding Companies and Sector LLCs. Operations *inside* a
sector belong to that sector's own operating system. Do not absorb them, do not
merge those systems into BEYU OS, and do not invent new ones.

**BEYU FOUNDATION is a sister of BEYU HOLDING COMPANY**, not a subsidiary. It
attaches directly to the Trust and runs an independent FOUNDATION OS.

**Authorization is mandatory and lives in the backend.** Never enforce access
control only in the UI. Every endpoint declares a required permission; the
global guard denies anything that does not.

**Frontends never access PostgreSQL.** No direct database access from clients,
and no shared database between operating systems. Cross-OS integration goes
through versioned APIs, events and contracts.

**Nothing business-specific is hard-coded.** Ownership percentages, waterfall
distribution rules and country regulations are configuration and data — not
constants in source. No country, Tanzania included, may be special-cased in
code.

**Waterfall rules are versioned and historical calculations are immutable.** A
completed calculation pins the rule-set version and a hash of its inputs.
Changing rules creates a new version; it never rewrites past results. BEYU OS
decides strategy only — Finance OS executes. No financial execution lives here.

**The audit trail is append-only.** Never add an endpoint, permission or
migration that can update or delete audit records.

**AI recommends; humans execute.** AI agents get no unrestricted database
access, cannot bypass authorization, and cannot exceed the user they act for.
Every high-impact action requires human approval.

**Never commit secrets.** No `.env`, keys, certificates or credentials.
Integrations store a reference to a secret manager, never the secret itself.

**Describe implementation status honestly.** Label work IMPLEMENTED,
PARTIALLY IMPLEMENTED, STUBBED or DEFERRED. Do not present a mock as
production-ready. A stub should fail loudly rather than pretend to succeed.

## Money and percentages

All monetary amounts are integer **minor units** (cents), in fields suffixed
`Minor`. All percentages are integer **basis points**, 0–10000. Floating point
is never used for money — rounding is explicit and half-away-from-zero.

## Testing

Tests are expected with behavioural changes. Aim them at the invariant, not the
implementation: that the audit chain detects tampering, that a role cannot
escape its tenant, that a waterfall conserves its inflow.

When a test fails, read the implementation before changing the assertion. Some
failures are bad assumptions in the test; others are real defects. Both have
happened in this codebase.

Database-level invariants belong in migrations as constraints and triggers, not
only in application code.

## Commits and pull requests

Use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`,
`chore:`), with a scope where it helps: `feat(waterfall): ...`.

A pull request should explain what changed and why, note any migration, and
call out anything touching authorization, tenancy, audit or the AI boundary so
it gets the review it needs.
