# Changelog

All notable changes to BEYU OS are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
semantic versioning. Contract compatibility is tracked separately through
`BEYU_CONTRACTS_VERSION` in `@beyu/types`.

## [1.0.0] — 2026-08-11

First release of the BEYU OS control plane for BEYU FAMILY TRUST.

Feature-level implementation status is tracked in
[`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md). Not every
domain in the specification is complete; that document is the honest account of
what exists.

### Added

**Foundations**
- pnpm + Turborepo monorepo covering apps, services, packages and
  infrastructure.
- `@beyu/types`: canonical shared contracts. Enforces BEYU FAMILY TRUST as the
  parent organization, rejects the forbidden "BEYU GROUP" name, and validates
  the Trust → Holding → Country → Sector LLC hierarchy with BEYU FOUNDATION
  modelled as a sister organization.

**Data layer**
- PostgreSQL schema across six migrations: 106 tables in 17 schemas spanning
  identity, organization, ownership, governance, strategy, risk, compliance,
  capital, waterfall, documents, workflow, notifications, reporting, audit,
  integrations, AI and the organization builder.
- Row-level security for tenant and record-ownership isolation, enforced by the
  database independently of application code.
- Domain invariants enforced as database constraints and triggers: a single
  Trust root, no self-ownership, ownership within 0–10000 basis points, no
  duplicate current interests, approved capital allocations requiring an
  approver, and immutability of approved waterfall calculations.
- Dual driver: a PostgreSQL server in production, and PostgreSQL 16 compiled to
  WASM in-process for local development and CI.

**Security and governance**
- Deny-by-default policy engine combining RBAC, ABAC and obligations across 15
  roles. Enforces MFA step-up for high-impact actions, OS and tenant
  boundaries, and a data-classification ceiling under which sector-sensitive
  data can never be reached through BEYU OS.
- Append-only, SHA-256 hash-chained audit trail. Mutation is blocked at the
  database, in permission construction, and at request time.
- AI governance: agents cannot impersonate a user or exceed the principal they
  act for. Reads and exports proceed within scope; every mutation is downgraded
  to a recommendation awaiting human approval.
- scrypt password hashing, HS256 tokens that reject `alg: none`, and secret
  redaction in logs.

**Waterfall**
- Deterministic distribution engine using integer minor units and basis points,
  with explicit half-away-from-zero rounding and no floating-point arithmetic.
- Configurable, versioned rule sets. Calculations pin the rule-set version and
  an order-independent hash of their inputs, so historical results are
  reproducible and never silently mutated.
- Conservation is a hard invariant: allocated plus unallocated always equals
  the inflow.
- Strategic decisioning only. Execution belongs to Finance OS.

**API**
- NestJS service exposing `/api/v1` with OpenAPI documentation.
- Global authorization guard that fails closed: an endpoint declaring no
  required permission is denied rather than served.
- Global audit interceptor recording every mutation, including denials and
  failures.
- Request correlation ids, uniform error envelopes that withhold internals in
  production, and health and readiness probes.
- Authentication: login, refresh, logout and `/auth/me`. Refresh tokens are
  stored only as hashes and rotate on every use, replayed tokens are rejected,
  and an unknown account is indistinguishable from a wrong password in both
  response and timing. Accounts lock after five failed attempts.
- Organization hierarchy endpoints: list, read, subtree, ancestors, create,
  update and move. The canonical hierarchy, the single Trust root and the
  SECTOR_LLC governance boundary are enforced on write, and a move rewrites the
  materialized path of the whole subtree in one statement. There is
  deliberately no delete: a node that stops operating is set to DISSOLVED so
  the ownership, governance and audit history it anchors stays interpretable.

### Security

- Fixed a privilege-escalation defect found by the test suite: the trust
  administrator role was granted update and delete on the audit trail through a
  broad resource fan-out, contradicting the append-only guarantee. Prohibited
  resource and action pairs can no longer be acquired through a broad grant.

### Fixed

- PGlite did not create intermediate directories, so a fresh clone failed on
  first migration.
- Dependency injection relied on reflected parameter types, which the
  development runtime does not emit; every request failed until tokens were
  made explicit.
- Placing BEYU FOUNDATION under the holding company returned a generic
  parent-type error instead of the specific sister-organization explanation.
- The forbidden-name check compared against the exact string, so a name with
  doubled internal whitespace was accepted by both the validator and the
  database CHECK constraint. Whitespace is now normalized before comparison and
  the phrase is rejected wherever it appears as a whole word, in the legal name
  as well as the display name.
- A forbidden name produced a 500 rather than a 400: the framework-free
  validator throws a plain error that nothing translated at the HTTP boundary.
- The seed and the repository wrote materialized paths in two different
  conventions, which silently broke subtree and ancestor queries against seeded
  rows. The self-inclusive form is now canonical, migration 0007 recomputes
  every existing row from the parent links, and a CHECK constraint keeps future
  writes consistent.
- The audit hash treated an omitted nullable field differently from an explicit
  `null`, because canonical JSON drops undefined keys but keeps null ones. Every
  such field is stored as SQL NULL and read back as `null`, so verification
  recomputed a different hash and reported untouched records as tampered — a
  false accusation of tampering on any entry appended without its optional
  fields. Undefined is now collapsed to null inside the hash function itself, so
  no caller can reintroduce the divergence.

### Known limitations

- The Kafka event driver is stubbed and throws rather than silently dropping
  events; the in-process bus is fully functional for development.
- Several domain modules exist as schema and contracts ahead of their API
  surface. See `docs/IMPLEMENTATION_STATUS.md`.
