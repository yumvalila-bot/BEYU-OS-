# BEYU OS — Test Report

Date: 2026-08-11 · Branch: `arena/019ff05a-beyu-os`

This report covers four kinds of testing. The first is the automated suite
that runs in CI. The second is adversarial black-box testing against the API
running as a real HTTP server — forged tokens, injection payloads, malformed
bodies, concurrent writes and deliberate database tampering; it found the
defect in section 6. The third is exercising the web application against the
live API, which found two further defects (section 9) that the automated suite
could not have caught. The fourth is the Noelia governance layer and the static
operator console (sections 12 and 13), which together found four more.

---

## 1. Summary

| | Result |
|---|---|
| Automated tests | **292 pass / 0 fail** |
| Typecheck (12 projects) | **0 errors** |
| Lint (`eslint .`) | **0 errors**, 21 warnings |
| Defects found this pass | **7** (all fixed) |
| Adversarial probes run | 40+ against a live server |
| Web routes exercised | 21/21 against the live API |
| Console routes exercised | 22/22 against the live API |

Per-project test counts:

| Project | Tests |
|---|---|
| `packages/types` | 30 |
| `packages/config` | 18 |
| `packages/events` | 18 |
| `packages/auth` | 43 |
| `packages/security` | 34 |
| `services/beyu-api` | 149 |
| `apps/beyu-web` | **0 — see §9** |
| `apps/beyu-console` | **0 — see §13** |
| **Total** | **292** |

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

## 9. Web application, and the defects it exposed

The web app was started against the live API and every route was requested with
a real signed-in session — obtained by posting the login form, not by forging a
cookie. All 21 routes returned 200. Anonymous access to an app route redirects
to `/auth/login`; a signed-in user hitting `/auth/login` is redirected to
`/dashboard`; session cookies are `HttpOnly` and `SameSite=Strict`.

Two defects surfaced that the automated suite was structurally incapable of
finding.

### 9.1 A contract that was fiction

`/organization` returned HTTP 500: `Cannot read properties of undefined
(reading 'split')`. The client's `OrganizationNode` interface declared the
discriminator as `nodeType`; the API returns `type`.

The important detail is that **`tsc` passed cleanly both before and after the
fix**. The interface was hand-written, so TypeScript was checking the code
against an assertion that was itself wrong. A hand-written wire contract is a
comment that the compiler happens to read.

Every client contract has since been re-derived from a recorded response of the
endpoint it describes. The durable fix is a generated client — the API already
publishes OpenAPI at `/api/docs` — which is recorded as follow-up work rather
than claimed as done.

### 9.2 "Most recent activity" was showing the oldest

The dashboard and audit screens both label their table as the most recent
entries. `GET /audit` returns the *oldest* N, because `AuditRepository.list()`
orders ascending so chain verification can walk it forwards. The audit page
compensated with a client-side descending sort — over a page that was already
the wrong slice, which made the bug invisible on a short log and wrong on a
long one.

`AuditRepository.listLatest()` and an `order=desc` query parameter were added,
and both screens now request it. `test/audit-read.e2e.test.ts` pins both
orderings, including that `order=desc` really returns the tail of the chain
rather than a sorted arbitrary page.

Note the shape of this one: no component was broken. The repository was
correct, the sort was correct, the label was correct in isolation. The system
lied anyway.

### 9.3 Framing

Security headers were set in `next.config.mjs`, which Next evaluates at build
time and bakes into the route manifest — so `X-Frame-Options` could not be
changed for a deployment without a rebuild. Framing policy moved to
`src/middleware.ts`, which reads the environment per request. It denies framing
by default and is opt-in through `BEYU_ALLOW_EMBEDDING`; both states were
verified against a running server.

---

## 10. What this testing does not establish

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
- **Neither front end has automated tests.** Every claim about the web app
  (§9) and the console (§13) comes from driving a running instance. There is no
  regression protection: the next change to a page could reintroduce any of
  those defects and nothing would fail.
- **Noelia's model is a deterministic stub, so nothing here tests a model.**
  Section 12 tests the *governance* around the model — the permission checks,
  the recommendation/execution split, the audit of refusals. It says nothing
  about answer quality, prompt injection through a real LLM, or the behaviour
  of any hosted provider, because no model is called. The stub was chosen
  precisely so the governance could be tested deterministically; the day a real
  provider is wired in, section 12 stops being sufficient.
- **Only implemented domains were tested.** Most domain REST endpoints, the
  mobile application and the HIVE service are DEFERRED. Testing cannot say
  anything about code that does not exist. See
  [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md).
- **RLS was verified through the application's session handling**, which sets
  the tenant per transaction. A dedicated test connecting as `beyu_app` with a
  deliberately wrong tenant, outside the application, would be stronger
  evidence and has not been done.

---

## 11. Lessons carried forward

Most failures during development were faulty assumptions in the tests, not
defects in the product. But several were genuine, and the pattern is
the same: they lived in the seam between two components that were each
individually correct and individually tested. The audit hash was correct. The
canonical JSON serializer was correct. The database column was correct. The
defect was in the round trip.

The practical consequence is that invariants are worth testing end to end —
write it, read it back, verify it — rather than only at the unit boundary where
both sides can be right and the system still wrong.

The web defects extend the same lesson across a process boundary. A type
annotation describing another service's response is not verification, and a
correct query plus a correct sort plus a correct label can still add up to a
screen that misinforms an auditor. Both were found by running the thing and
reading the output, which remains the cheapest test that exists.

---

## 12. Noelia AI — governance testing

19 e2e tests in `services/beyu-api/test/noelia.e2e.test.ts`, all against the
real schema with the real constraints and triggers attached.

The thing under test is not the model. It is the claim that an AI agent inside
this system cannot act, cannot see what its principal cannot see, and cannot
have its refusals quietly disappear.

### 12.1 What was proven

| Claim | How it was proven |
|---|---|
| An AI proposal that would change capital cannot execute | `POST /noelia/recommendations` with a mutating CAPITAL action returns `REQUIRES_HUMAN_APPROVAL`, `downgradedToRecommendation=true`, and persists with `status='PENDING_REVIEW'` |
| Accepting a recommendation still does not execute it | `review()` with `ACCEPTED` returns `proposedAction` for a human to enact; the audit record carries `newState.executed === false` |
| Some actions are refused outright | `execute`, and anything touching WATERFALL, return `DENIED` with `recommendation=null` and **no row inserted** |
| Refusals are not silently dropped | The denial is written to `ai.action_log` and appears in `GET /noelia/action-log` alongside permitted actions |
| A decision cannot be reopened | Re-reviewing returns 400; a database trigger refuses the update even when the API is bypassed |
| Approver roles cannot be edited after the fact | `approver_roles` is frozen at proposal time and asserted unchanged after review |
| Noelia cannot read what you cannot read | Another user's conversation returns **404, not 403** — the distinction matters, because 403 confirms the record exists |
| Sensitive fields never reach the model | `registration_number` and `legal_name` are excluded by allowlist (`ORG_FIELDS`, `OS_FIELDS`) and asserted absent from every citation |
| An unsupported question is not answered anyway | Returns `ungrounded=true`, empty citations, and is asserted to contain no `\d%` — no invented figures |

Three database CHECK constraints back the application logic rather than merely
duplicating it: `ai_permitted_actions_are_reads_only`,
`ai_acceptance_requires_human`, `ai_never_sector_sensitive`. Each was tested by
attempting the violating write directly against the database, outside the API.

### 12.2 Defect found: a migration that worked only on empty databases

Migration `0009` normalises `ai.agents.max_classification` to uppercase. It ran
the `UPDATE` **before** dropping the mixed-case CHECK constraint that `0005`
had attached. On a fresh database this is invisible, because there are no rows
to update. On any database with an existing agent row it fails and rolls back
the migration.

Every migration test in the suite installed from empty, so every one of them
passed.

The fix reorders the section to drop the old constraint first. The lesson is
recorded here because it generalises: **a fresh-install migration test does not
test a migration.** Verification now uses a two-stage upgrade — migrate to
N‑1, insert representative legacy rows, then apply N.

### 12.3 Defect found: a fail-fast that fired on the default configuration

The first version of the AI configuration threw at startup in production when
`AI_DRIVER=stub`. Reasonable in intent — do not run a stub in production —
but `stub` was also the default, so this made *every* production deployment
crash, including deployments that never touch AI at all. It broke three
unrelated config tests, which is how it was caught.

The correct shape, now implemented: default the feature **off** in production
(`AI_ENABLED` defaults to `isProduction ? aiDriver !== 'stub' : true`) and throw
only when an operator explicitly opts into the stub with `AI_ENABLED=true`. A
safety check that fires on the default configuration is not a safety check.

---

## 13. Operator console (`apps/beyu-console`)

A dependency-free static front end: one HTML file, one Node server that also
reverse-proxies `/api/v1`. It was exercised by loading the real `index.html`
in a DOM, pointing its `fetch` at the running console server, and reading what
rendered. All 22 routes, the login flow, both Noelia question paths and the
recommendation review flow were driven this way, with zero console errors.

The verification harness lives in `/tmp` and is deliberately **not** committed:
it needs a DOM library, and adding a dependency to a package whose entire point
is having none would be self-defeating. That is a real gap, stated plainly —
see §10.

### 13.1 Defects found

**Two invented field names.** The dashboard read `verify.checked ?? verify.count`
and the settings screen passed the boolean `mfaSatisfied` through a status-pill
helper. The API actually returns `checkedCount`, and the pill helper mapped the
boolean to nothing. The rendered result was an audit tile reading
"Intact — entries verified" with the number silently missing, and an MFA row
reading "ACTIVE" whether or not MFA was satisfied. Both were written from
memory of the response shape instead of from the response. Both now read the
live payload; a session-expiry row was added while fixing the second.

This is the same defect class as §9.1 and it recurred despite having been
written down. Hand-written assumptions about another service's wire format are
not verified by anything until something reads the real bytes.

**An expired session left the operator in a dead shell.** A 401 on any screen
was rendered as a failed request and nothing more, so the navigation stayed up
and every subsequent click failed the same way. On a governance console that is
worse than an error page: blank panels invite being read as "there is nothing
here". The API client now clears the token and returns to the sign-in screen on
any 401 — except from `/auth/login` itself, where a rejected password is an
answer rather than an expiry and is reported in place.

**The static server published its own source.** `GET /server.mjs` returned the
server, and `GET /README.md` the README, because the handler served anything
resolving inside its own directory. Not a credential leak — no secrets live
there — but free reconnaissance, and the set of files sitting beside the entry
point grows without anyone re-reading that function. Static serving is now an
explicit allowlist (`SERVABLE`), which cannot drift as files are added.

### 13.2 Adversarial probes

| Probe | Result |
|---|---|
| `GET /../../../etc/passwd` (raw, `--path-as-is`) | 404 — traversal detected before `normalize()` collapses the evidence |
| `GET /%2e%2e%2f%2e%2e%2fetc%2fpasswd` | 404 — decoded before the check, not after |
| `GET /server.mjs`, `GET /README.md` | 404 — not on the allowlist |
| `POST /` | 405 |
| API call with no token, through the proxy | 401 — the proxy adds no authority of its own |
| `?limit=9999` through the proxy | 400, with the API's error envelope intact and unrewritten |
| API payload containing `<img src=x onerror=…>` in every string field | Rendered as text; 0 injected elements; no script ran |

The XSS probe matters most. The console builds HTML with template strings, so
escaping is a discipline rather than a guarantee from the framework. Every
interpolated value goes through `esc()`, and the probe confirms it by feeding
a hostile payload through the actual render path rather than by inspection.

### 13.3 What the console deliberately does not do

It performs **no authorization**. It forwards a token and renders the answer.
Controls it hides are hidden as a courtesy; the identical request from `curl`
gets the identical response, which was verified for 403, 401 and 500 by
injecting each at the transport and confirming the screen states the refusal
rather than rendering an empty table. It holds **no mock data** — 16 of its 22
routes have no backend and say so in those words, because on a governance
console an empty table is a claim that the records were checked and none exist.
