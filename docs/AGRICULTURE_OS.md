# BEYU AGRICULTURE OS — Architecture & Implementation Status

> Sector OS under **AGRICULTURE LLC**. Built to the federation contract in
> [`OS_FEDERATION.md`](./OS_FEDERATION.md): standalone service, own database,
> own identity plane, zero-default capabilities, no shared storage with the
> control plane, Health OS, or Finance OS.

| | |
|---|---|
| Service | `services/beyu-agriculture-api` (`@beyu/agriculture-api`) |
| Shared types | `packages/agriculture-types` (`@beyu/agriculture-types`) |
| API port | `4002` (after control plane `4000`, Health OS `4001`) |
| Database | dedicated Postgres `5434` (or embedded PGLite for local/test) |
| JWT issuer | `beyu-agriculture-os` — control-plane/Health tokens are NOT valid here |
| Registration | control-plane seed already registers `os_id='agriculture-os'` (SECTOR_OS, sector `AGRICULTURE`, capabilities `{}`, status REGISTERED) |
| Stack | NestJS + node-postgres/PGLite, class-validator, argon2id, HMAC-SHA256 audit hash chain |

## 1. Domain scope

Farming operations end-to-end, mirroring the depth of `beyu-health-api`:

- **Identity & tenancy** — users, roles, permissions, JWT auth (login, refresh rotation, logout), multi-tenant with `tenant → entity → country` isolation.
- **Farms & land** — farms, fields, soil records, land usage transitions (FALLOW/COVER_CROP/…).
- **Crop production** — crop catalog, crop cycles (PLANNED→PLANTED→HARVESTED/TERMINATED), split harvests with moisture-gated storage, yield computation (t/ha).
- **Livestock** — herds, animals with lifecycle events, health events (vaccination/treatment), production records.
- **Inventory** — warehouses, input items (seed/fertilizer), stock levels, movements (receipt/issue/adjustment/transfer).
- **Procurement** — counterparties (suppliers/buyers), purchase orders and sales orders with lifecycle transitions, contracts.
- **Operations** — equipment, maintenance logs, fuel logs, workers, work orders (assignment + lifecycle).
- **Compliance** — certifications, inspections, lot traceability (lot → harvest → field → farm chain).
- **Audit** — append-only, HMAC-SHA256 hash-chained trail per tenant with `verify-audit` CLI proving chain integrity.

## 2. Security architecture

1. **RLS first.** Every domain schema has `ROW LEVEL SECURITY` with tenant-scoped policies driven by `app.tenant_id` / role GUCs; the app connects as a non-superuser role in Postgres deployments.
2. **App-layer defence in depth.** `DomainRepository.assertRowVisible()` re-asserts tenant visibility on every single-object read/write path (404, never 403 — no existence leak). This covers privileged-driver environments (CI PGLite connection) where Postgres bypasses RLS for the table owner.
3. **Tenant derivation is server-side.** Child rows inherit `tenant_id` from their parent (farm/field/counterparty…). Client-supplied `tenantId` is only accepted for standalone entities and cross-checked (`mismatch → 400`, except SUPER_ADMIN).
4. **RBAC.** Permission codes per resource (`farm:READ/WRITE`, `audit:READ`, …). SUPER_ADMIN and AUDITOR are cross-tenant read-exempt by design; every other role is tenant-pinned.
5. **Audit hash chain.** `prev_hash = HMAC(row, prev_hash)`; any mutation or deletion breaks `verify-audit`.

## 3. Federation stance

- Registered in the control plane `organization.os_registry` by the existing BEYU OS seed; capabilities remain `{}` (isolation is the default; grants are an explicit, audited operator action).
- `CROSS_OS_READ` is permanently denied; this OS never reads control-plane or Health data and vice versa.
- Integration surface is this service's versioned REST API (`/api/v1`) plus append-only audit; no shared database, no shared identity store.

## 4. Implementation status

| Area | Status |
|---|---|
| Migrations (RLS, constraints, hash-chain triggers) | **DONE** |
| Domain modules (8 sectors above) | **DONE** |
| Auth (argon2id, refresh rotation, JWT) | **DONE** |
| Tenant isolation + IDOR hardening | **DONE** |
| Test suite (`node --test`, e2e via HTTP) | **DONE — 182/182 green** |
| `docker-compose.agriculture.yml` (5434/4002) | **DONE** |
| `.env.example` AGRICULTURE section | **DONE** |
| Control-plane registration | **DONE (pre-existing seed row)** |
| Web frontend | NOT IN SCOPE of this integration (API-first, like health's initial landing) |
