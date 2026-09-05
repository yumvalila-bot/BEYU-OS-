# BEYU OS — Test Report

Date: 2026-08-11 · Commit: `f2f59af` · Branch: `arena/019ff05a-beyu-os`

This report covers two kinds of testing. The first is the automated suite that
runs in CI. The second is adversarial black-box testing against the API running
as a real HTTP server — forged tokens, injection payloads, malformed bodies,
concurrent writes and deliberate database tampering. The second kind is what
found the defect described in section 6.

---

## 1. Summary

| | Result |
|---|---|
| Automated tests | **209 pass / 0 fail** |
| Typecheck (11 projects) | **0 errors** |
| Lint (`eslint .`) | **0 errors**, 20 warnings |
| Defects found this pass | **1** (fixed in `f2f59af`) |
| Adversarial probes run | 40+ against a live server |

Per-project test counts:

| Project | Tests |
|---|---|
| `packages/types` | 13 |
| `packages/config` | 14 |
| `packages/events` | 18 |
| `packages/auth` | 43 |
| `packages/security` | 34 |
| `services/beyu-api` | 87 |
| **Total** | **209** |

The warnings are all `@typescript-eslint/no-explicit-any` at framework
boundaries where the type genuinely is unknown. They are warnings, not errors,
by deliberate configuration.

---

## 2. Method

The automated suite runs against PostgreSQL 16 compiled to WASM, in-process, so
every test exercises the real schema, real constraints and real triggers rather
than a mock. CI additionally applies the migrations to a real PostgreSQL 16
server, twice, to prove idempotence.

For the adversarial pass the API was started as an ordinary HTTP server on port
3001 with a seeded database and two users: a `TRUST_ADMINISTRATOR` and an
`AUDITOR`. Everything below was sent over the wire with `curl`. No test double
was involved at any point, and no assertion was made about behaviour that was
not directly observed.

Where a probe touched the database directly it did so as a separate process
connecting to the same data directory, deliberately bypassing the application,
to establish whether an invariant is enforced by the database or only by
application code. That distinction matters: an invariant enforced only in the
application is defeated by any future code path that forgets to check it.

---

## 3. Authentication

Seven probes against `/api/v1/organizations`, which requires a valid token.

| Probe | Expected | Observed |
|---|---|---|
| No `Authorization` header | 401 | 401 |
| Garbage token | 401 | 401 |
| Valid access token | 200 | 200 |
| Wrong scheme (`Basic`) | 401 | 401 |
| **Refresh token used as an access token** | 401 | 401 |
| **Signature tampered, payload intact** | 401 | 401 — *"Invalid token signature"* |
| **`alg: none` forgery** | 401 | 401 — *"Unsupported token algorithm: none"* |

The last three are the ones that matter. `alg: none` is the classic JWT
vulnerability — a forged token whose header declares no algorithm, which naive
verifiers accept because they trust the header. It is rejected explicitly.
Reusing a refresh token as an access token is rejected because token type is
part of the signed payload and is checked, not merely assumed from context.

---

## 4. Authorization

The `AUDITOR` role is intended to read everything and write nothing. Probes as
that user:

| Request | Result |
|---|---|
| `GET /organizations` | 200 |
| `GET /audit` | 200 |
| `POST /organizations` | 403 |
| `PATCH /organizations/:id` | 403 |
| `POST /organizations/:id/move` | 403 |

Each denial carried a precise reason rather than a bare status, for example:

```
No permission grants "create" on "organization" for roles [AUDITOR]
```

After the denied writes the holding company's name was re-read and confirmed
unchanged — the denial is real, not cosmetic.

The authorization layer fails closed: a route with no `@RequirePermission`
annotation returns 403 rather than being silently public. Access must be
granted explicitly, and a forgotten annotation becomes a visible failure
instead of an open door.

---

## 5. Input handling

### Injection

A SQL injection payload was sent both as a query parameter and inside a JSON
body:

- `?q=';DROP TABLE organization.org_nodes;--` returned 200 and the table was
  still present afterwards.
- The same string submitted as an organization name was stored and returned as
  inert literal text. It was never interpreted.

All queries are parameterized. The payload is data, and it stays data.

### Malformed input

Eight classes of bad request, all rejected at the boundary with 400 and an
actionable message:

| Input | Response |
|---|---|
| Non-UUID id | 400 |
| Unknown field (`isAdmin`) | 400 — `property isAdmin should not exist` |
| Invalid enum value | 400 |
| Empty name | 400 |
| Malformed JSON | 400 |
| Integer where a string belongs | 400 |
| Well-formed but nonexistent parent UUID | 400 |
| Unknown but valid UUID on `GET` | 404 |

The rejection of unknown fields is worth calling out: it is what stops a client
from smuggling an unexpected property into a create or update call and having
it silently persisted.

---

## 6. Audit chain

The audit log is append-only and hash-chained: each record's hash covers its
own contents plus the previous record's hash, so altering any record breaks
every hash after it.

| Property | Result |
|---|---|
| Entries recorded during the session | 78 |
| Denials recorded (non-SUCCESS) | 31, each with its reason |
| `UPDATE` on `audit.audit_log` | Rejected by trigger, **even as superuser** |
| `DELETE` on `audit.audit_log` | Rejected by trigger, **even as superuser** |
| Chain verification | `{ valid: true, checkedCount: 78 }` |

Denials being recorded matters as much as successes: an audit log that only
shows what worked cannot show you an attack that failed.

Every successful organization move or update was confirmed to have stored its
mandatory `reason`, along with both the old and the new materialized path. Zero
successful rows had a null reason.

### The tamper test, and the defect it uncovered

To prove that verification actually detects tampering rather than merely
claiming to, the triggers were disabled in a throwaway database, the
`new_state` of record 3 was edited, and the triggers were re-enabled.
Verification correctly flagged it:

```
{ valid: false, checkedCount: 2, brokenAtSequence: 3,
  reason: "Record 3 has been altered: stored hash does not match
           recomputed hash of its contents." }
```

**But the untampered control chain also reported invalid.** That is a false
accusation of tampering, and for an audit system it is a serious defect: an
audit log that cries wolf is worse than none, because the one time it matters
nobody will believe it.

The cause was that `computeAuditHash()` hashed an *omitted* nullable field
differently from an explicit `null`. Canonical JSON drops `undefined` keys but
keeps `null` ones, so `{a:1, b:undefined}` serializes to `{"a":1}` while
`{a:1, b:null}` serializes to `{"a":1,"b":null}` — different strings, different
hashes. Every one of those fields is written to a nullable column as SQL NULL
and read back as `null`. So a record appended with an omitted optional field
was hashed one way on write and a different way on read, and verification
declared an untouched record altered.

This was reachable in production: the API's own `AppendAuditInput` marks
`previousState`, `newState` and `requestId` as optional.

The fix collapses `undefined` to `null` for all eight nullable hashed fields
inside `computeAuditHash` itself — the single point every caller passes
through — so no future caller can reintroduce the divergence by forgetting to
normalize. Two regression tests were added: one asserting that an omitted field
and an explicit null produce the same hash, one asserting that a real value
still produces a different hash from null. That second test is the one that
stops a careless "fix" from collapsing *everything* to null and making the hash
blind to real changes.

After the fix, the control chain verifies clean and the tampered chain is still
caught at exactly sequence 3.

An existing test had asserted that `null` and absent differ in canonical JSON —
correct in isolation, which is why it passed. What was never tested was the
round trip through the database, where that distinction disappears. The gap was
between two components that were each individually correct.

---

## 7. Concurrency and structural integrity

| Scenario | Result |
|---|---|
| 10 parallel attempts to create a second root | All 400; roots still 1 |
| 12 parallel moves of one node between two parents | All 200; ancestor chain coherent |
| 5 rounds of simultaneous "move A under B" + "move B under A" | All 400 |

After each storm the tree was checked with a recursive CTE for path/depth
drift, orphans, unreachable nodes, cycles and self-parents. **All four
categories: zero.**

Two findings about *where* these invariants live:

- **Single root is enforced by the database**, not just by the application. A
  direct-database probe bypassing the API was rejected by unique index
  `org_nodes_single_trust`, and a parentless non-Trust node was rejected by
  CHECK `org_nodes_root_is_trust`. A race condition cannot defeat it, and
  neither can a future code path that forgets the check.
- **Cycles are structurally impossible**, not merely detected. Each governed
  node type has exactly one legal parent type, so a cycle cannot be expressed
  in the first place. The move attempts fail on type rules before any cycle
  check is reached.

---

## 8. Waterfall engine

The engine is a pure function: no I/O, no clock, no randomness. All amounts are
integer minor units, all ratios basis points — no floating-point money anywhere
(the lint configuration bans `Math.round` and `parseFloat` in the waterfall,
capital and ownership code).

Tested with three tiers configured to force rounding conflicts (two at 33.33%
plus a residual):

| Property | Result |
|---|---|
| Value conservation across inflows 1, 2, 3, 7, 9 999, 1 000 003, 999 999 999, 12 345 678 901 | **Exact in every case** — allocated + unallocated = inflow |
| Determinism (same input twice) | Identical hash, identical allocations |
| Two greedy 60% tiers on 1 000 | 840 allocated, 160 unallocated — **no over-allocation** |
| Negative inflow | Rejected — *"Inflow cannot be negative."* |
| Float amount (`10.5`) | Rejected — must be an integer in minor units |
| `NaN` | Rejected |
| Beyond `MAX_SAFE_INTEGER` | Rejected — *"exceeds the safe integer range"* |
| Zero inflow | Accepted, allocates nothing |

Conservation holding at an inflow of 1 minor unit across three tiers is the
meaningful case: that is where naive rounding leaks or invents money. It does
neither.

---

## 9. What this testing does not establish

Stated plainly, because a test report that only lists passes is not useful.

- **The local database is PostgreSQL compiled to WASM.** Schema, constraints
  and triggers are real and exercised, but timing-sensitive behaviour is not
  representative — the WASM clock is millisecond-resolution, so nothing here
  proves timestamp-precision behaviour. CI runs the migrations against a real
  PostgreSQL 16 server to cover the schema; it does not run the full suite
  there.
- **No load or performance testing was done.** Concurrency probes used ten to
  twelve parallel requests to surface race conditions, not to characterize
  throughput. Nothing here says how the system behaves under sustained load.
- **Redis, Kafka and S3 are in-process or mock adapters in local development.**
  The event bus has a working in-memory implementation; the Kafka bus is
  STUBBED and labelled as such. No test here exercises a real broker.
- **Only implemented domains were tested.** Most domain REST endpoints, the web
  application, the mobile application and the Noelia/HIVE services are
  DEFERRED. Testing cannot say anything about code that does not exist. See
  [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md).
- **RLS was verified through the application's session handling**, which sets
  the tenant per transaction. A dedicated test connecting as `beyu_app` with a
  deliberately wrong tenant, outside the application, would be stronger
  evidence and has not been done.

---

## 10. Lessons carried forward

Most failures during development were faulty assumptions in the tests, not
defects in the product. But four were genuine, and the pattern in all four is
the same: they lived in the seam between two components that were each
individually correct and individually tested. The audit hash was correct. The
canonical JSON serializer was correct. The database column was correct. The
defect was in the round trip.

The practical consequence is that invariants are worth testing end to end —
write it, read it back, verify it — rather than only at the unit boundary where
both sides can be right and the system still wrong.
