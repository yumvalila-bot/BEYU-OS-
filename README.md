<div align="center">

# BEYU OS

**The organizational, governance, strategic, capital-allocation, risk,
compliance and intelligence control plane of BEYU FAMILY TRUST.**

`v1.0.0` · Proprietary and confidential

</div>

---

## What BEYU OS is

BEYU OS is the system of record for how BEYU FAMILY TRUST is structured, owned,
governed and directed. It holds the organizational hierarchy, ownership
records, governance decisions, strategic objectives, risk and compliance
posture, capital allocation and the distribution waterfall — with a
tamper-evident audit trail beneath all of it.

It is a **control plane**, not an operations system. BEYU OS decides; the
sector operating systems execute.

## Where BEYU OS ends

```
                    BEYU FAMILY TRUST
                            │
            ┌───────────────┴───────────────┐
            │                               │
   BEYU HOLDING COMPANY            BEYU FOUNDATION
            │                      (sister organization,
            │                       independent FOUNDATION OS)
   Country Holding Companies
            │
      Sector LLCs
════════════╪══════════════════════════════════  BEYU OS boundary
            │
   Health OS · Finance OS · Agriculture OS
   (sector operations — governed independently)
```

Two boundaries are load-bearing and enforced in code:

**BEYU OS governs down to the Sector LLC and no further.** Everything inside a
sector belongs to that sector's own operating system. BEYU OS does not absorb
sector operations, does not merge those systems into itself, and does not
invent new ones. Cross-system integration happens only through versioned APIs,
events and contracts — never shared database access.

**BEYU FOUNDATION is a sister of BEYU HOLDING COMPANY, not a subsidiary.** It
attaches directly to the Trust and runs an independent FOUNDATION OS. Placing
it beneath the holding company is rejected by the hierarchy validator and by a
database constraint.

The parent entity is **BEYU FAMILY TRUST**. It is never "BEYU GROUP" — that
name is rejected by the domain model, by a database CHECK constraint, by a lint
rule and by a CI guardrail.

## Implementation status

This release is a **backend foundation, not a usable end-user product.** The
data model, security model, authorization engine, audit chain and waterfall
engine are built and tested. The domain API surface, authentication endpoints
and both frontends are not.

**Read [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) before
planning against this repository.** It labels every feature IMPLEMENTED,
PARTIALLY IMPLEMENTED, STUBBED or DEFERRED, and does not overstate anything.

| | |
| --- | --- |
| **Solid** | Schema and database-enforced invariants · authorization engine · audit chain · waterfall engine · AI governance · API runtime |
| **Missing** | Login endpoints · domain REST handlers · web app · mobile app · Noelia and HIVE services |
| **Not real** | Kafka driver, Redis, S3 and external connectors — all STUBBED and failing loudly |
| **Verified** | 165 tests passing · typecheck clean across 11 projects · zero lint errors |

## Getting started

Requires Node 22+ and pnpm 9.12.3. Docker is optional.

```bash
corepack enable && corepack prepare pnpm@9.12.3 --activate
pnpm install
cp .env.example .env

# No Docker needed: PostgreSQL 16 compiled to WASM runs in-process
pnpm db:migrate && pnpm db:seed
pnpm dev

# Or against real infrastructure
make up && pnpm db:migrate && pnpm db:seed
```

The API listens on `http://localhost:4000`, with OpenAPI at `/api/docs`.

```bash
curl http://localhost:4000/api/v1/health
```

Useful commands:

```bash
make check       # typecheck + lint + test
make verify-audit  # recompute and verify the audit hash chain
make help        # everything else
```

## Repository layout

| Path | Contents |
| --- | --- |
| `services/beyu-api` | NestJS control-plane API — the system of record |
| `services/noelia`, `services/hive` | AI services *(deferred)* |
| `apps/beyu-web` | Next.js web application *(deferred)* |
| `flutter/beyu` | Adaptive Flutter mobile application *(deferred)* |
| `packages/types` | Canonical shared contracts |
| `packages/auth` | Authorization policy engine and AI governance |
| `packages/security` | Audit chain, password hashing, tokens |
| `packages/events` | Versioned event bus |
| `packages/config` | Environment configuration with fail-fast validation |
| `infrastructure/` | Docker, Kubernetes, Terraform, monitoring |
| `docs/` | Implementation status and design notes |

## Design principles

These are enforced by code, tests and CI rather than left to convention. The
full list is in [`CONTRIBUTING.md`](CONTRIBUTING.md).

**Authorization is deny-by-default and lives in the backend.** Every request is
evaluated by the policy engine. An endpoint that declares no required
permission is denied rather than served, so a forgotten annotation fails
closed. The UI never decides access.

**Frontends never touch the database.** Clients reach data only through the
authorized API, and no operating system shares a database with another.

**The audit trail is append-only.** Records are SHA-256 chained and immutable,
enforced in three independent layers. Tampering breaks the chain and is
detected.

**Nothing business-specific is hard-coded.** Ownership percentages, waterfall
rules and country regulations are configuration and data. No country is
special-cased in source.

**History is never rewritten.** Waterfall rules are versioned; a completed
calculation pins its rule version and input hash. Changing rules creates a new
version and leaves past results intact.

**Money is never a float.** Amounts are integer minor units, percentages are
integer basis points, and rounding is explicit.

**AI recommends; humans execute.** Noelia and HIVE hold no unrestricted
database access, cannot bypass authorization, and cannot exceed the user they
act for. Every mutation is downgraded to a recommendation awaiting human
approval.

**Implementation status is reported honestly.** A stub fails loudly rather than
pretending to work.

## Security

Security policy, threat model and reporting process:
[`SECURITY.md`](SECURITY.md). Never commit `.env` files, keys or credentials.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, the non-negotiable rules and
review expectations.

## Licence

Proprietary and confidential. Copyright © 2026 BEYU FAMILY TRUST. All rights
reserved. See [`LICENSE`](LICENSE).
