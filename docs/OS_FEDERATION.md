# Attaching an OS to BEYU OS

**Version 1.0.0 · 11 August 2026**

This document is for the teams building **BEYU HEALTH OS**, **BEYU AGRICULTURE
OS**, **BEYU FINANCE OS** and **BEYU FOUNDATION OS**. It describes how those
systems attach to BEYU OS, what they get from the shared core, and what they
are permanently prevented from doing.

None of those systems are built in this repository, and none of them should be.
Each is an independent product with its own database, its own deployment and
its own release schedule. What this repository provides is the seam.

---

## 1. The shape of the arrangement

BEYU OS is the control plane. It owns the organizational hierarchy, ownership,
governance, strategy, risk, compliance, capital allocation, waterfall
*decisioning*, documents, workflow and the group audit trail. It stops at the
**Sector LLC boundary**.

Below that boundary, each sector runs its own OS. Those OSs run the actual
business: patients, farms, loans, grants. BEYU OS does not model any of it.

```
                     BEYU FAMILY TRUST
                            │
              ┌─────────────┴──────────────┐
              │                            │
   BEYU HOLDING COMPANY            BEYU FOUNDATION        ← sister, not subsidiary
              │                            │
   Country Holding Companies         FOUNDATION OS   ← attaches here
              │
        Sector LLCs                                  ← BEYU OS ends here
        ├── HEALTH LLC      ← HEALTH OS attaches here
        ├── AGRICULTURE LLC ← AGRICULTURE OS attaches here
        └── FINANCE LLC     ← FINANCE OS attaches here
```

Two attachment kinds exist, and they are not interchangeable:

| Kind | Attaches to | Used by |
| --- | --- | --- |
| `SECTOR_OS` | a `SECTOR_LLC` node | Health OS, Agriculture OS, Finance OS |
| `FOUNDATION_OS` | the `FOUNDATION` node | FOUNDATION OS |
| `CORE` | nothing | BEYU OS itself; cannot be registered via the API |

`FOUNDATION_OS` is a separate kind precisely because BEYU FOUNDATION is a
**sister organization to BEYU HOLDING COMPANY**, not one of its sectors. If the
Foundation's OS were registered as a sector OS it would have to name a sector
code and attach beneath a country holding company, which would quietly encode
the wrong legal relationship. The API refuses it, and so does a database
trigger.

---

## 2. What "sharing the core" actually means

An attached OS shares BEYU OS's core through exactly two channels:

1. **Versioned REST APIs** under `/api/v1/*`, called with credentials scoped to
   that one OS.
2. **`beyu.*` domain events**, delivered only on topics that OS has been
   explicitly granted.

That is the whole list. In particular:

- **No shared database access.** Not a replica, not a read-only user, not a
  "temporary" reporting connection. `DATABASE_ACCESS`, `DATABASE_READ` and
  `DATABASE_WRITE` are on a permanent deny list enforced in the type contract,
  in the API and by a database trigger.
- **No shared code packages.** BEYU OS does not publish `@beyu/*` packages for
  sector OSs to depend on. A shared library becomes a shared release schedule,
  and a shared release schedule is the thing that stops these systems being
  independent. The contract is the wire format, not a compiled artifact.
- **No OS reads another OS.** `CROSS_OS_READ` is denied permanently. Health OS
  cannot see Agriculture OS's data through the control plane, in either
  direction, under any grant.

---

## 3. Onboarding a new OS

Five deliberate steps. Each one is separately audited, and none of them can be
skipped or combined.

### Step 1 — Register

```http
POST /api/v1/os-registry
{
  "osId": "health-os",
  "name": "BEYU HEALTH OS",
  "attachmentKind": "SECTOR_OS",
  "sectorCode": "HEALTH",
  "apiEndpoint": "https://health-os.beyu.example",
  "reason": "Health sector onboarding, approved by the board on 2026-07-14"
}
```

The OS is created with status `REGISTERED`, **zero capabilities**, no
attachment and no event subscriptions. Registration is an introduction, not a
grant. `osId` is permanent: it appears in every audit record the OS ever
touches, and reusing a retired identifier would make that history ambiguous.

### Step 2 — Attach

```http
POST /api/v1/os-registry/health-os/attach
{ "nodeId": "<uuid of the HEALTH Sector LLC>" }
```

Rejected if the target node is the wrong type for the attachment kind, or if
another OS is already attached there. One attachment point serves exactly one
OS.

### Step 3 — Grant capabilities

```http
PATCH /api/v1/os-registry/health-os/capabilities
{
  "capabilities": ["ORGANIZATION_READ", "CAPITAL_READ", "COMPLIANCE_SUBMIT"],
  "reason": "Minimum set for the Q3 integration"
}
```

The body replaces the full set, so a revocation is the same operation as a
grant and both are visible in the audit trail as a before/after pair.

### Step 4 — Grant event topics

```http
POST /api/v1/os-registry/health-os/event-grants
{ "topic": "beyu.capital.allocated", "reason": "Health OS plans against allocations" }
```

Only `beyu.*` topics can be subscribed to. `os.*` topics travel the other way —
they are what attached systems send inward — and subscribing to one would turn
the control plane into a message bus between sector OSs.

### Step 5 — Security validation, then activation

```http
PATCH /api/v1/os-registry/health-os/status   { "status": "CONFIGURING" }
PATCH /api/v1/os-registry/health-os/status   { "status": "SECURITY_VALIDATION" }
PATCH /api/v1/os-registry/health-os/status   { "status": "ACTIVE" }
```

`REGISTERED → ACTIVE` is not a legal transition. An OS reaches `ACTIVE` only
through `SECURITY_VALIDATION`, and only once it is attached and has an
endpoint. `RETIRED` is terminal.

```
REGISTERED → CONFIGURING → SECURITY_VALIDATION → ACTIVE ⇄ SUSPENDED
     └──────────────┴─────────────┴────────────────┴─────────┴──→ RETIRED
```

---

## 4. Capabilities

Grantable capabilities are deliberately narrow, and read-heavy:

| Capability | What it permits |
| --- | --- |
| `ORGANIZATION_READ` | Read the hierarchy down to the Sector LLC boundary |
| `OWNERSHIP_READ` | Read entities, jurisdictions, ownership structure |
| `GOVERNANCE_READ` | Read approved governance decisions in the OS's scope |
| `STRATEGY_READ` | Read strategic objectives cascaded to the OS's sector |
| `RISK_SUBMIT` | Raise a risk into the group register |
| `COMPLIANCE_READ` / `COMPLIANCE_SUBMIT` | Read obligations; submit evidence |
| `CAPITAL_READ` / `CAPITAL_REQUEST` | Read allocations; request capital |
| `WATERFALL_DECISION_READ` | Read waterfall **decisions** — never execute |
| `FINANCIAL_REPORT_SUBMIT` | Report actual inflows upward |
| `DOCUMENT_READ` | Read documents explicitly shared with the OS |
| `AUDIT_WRITE` | Append to the group audit trail |
| `EVENT_SUBSCRIBE` / `EVENT_PUBLISH` | Receive `beyu.*`; publish `os.*` |
| `IDENTITY_VERIFY` | Verify identity assertions for SSO |

### Permanently ungrantable

These are **not enum members**. They are literals on a deny list, checked
before anything else so that an attempt produces a specific explanation rather
than a vague validation error — and so the attempt is legible in the audit
trail.

| Denied | Why |
| --- | --- |
| `WATERFALL_EXECUTE` | BEYU OS decides; Finance OS executes. The control plane performs no financial execution and delegates none. |
| `CAPITAL_APPROVE`, `GOVERNANCE_APPROVE` | Approval is a human act inside BEYU OS governance. |
| `AUDIT_UPDATE`, `AUDIT_DELETE` | The audit chain is append-only for everyone, BEYU OS included. |
| `DATABASE_ACCESS`, `DATABASE_READ`, `DATABASE_WRITE` | No OS reaches into the control plane database. Not once, not read-only. |
| `AUTHORIZATION_BYPASS`, `POLICY_OVERRIDE` | Authorization decisions are never delegated outward. |
| `CROSS_OS_READ` | One OS may never read another's data through the control plane. |

A grant containing a forbidden capability is rejected **in full**. Partial
application would leave an operator believing either that the escalation
succeeded or that the legitimate part failed.

The deny list is enforced in three places, and all three must be kept in sync:

1. `NEVER_GRANTABLE_CAPABILITIES` in `packages/types/src/os-registry.ts`
2. the API layer, via `assertCapabilitiesGrantable()`
3. `organization.is_forbidden_os_capability(TEXT)` and its trigger, in
   `migrations/0008_os_federation.sql`

The third exists because the first two protect only callers who come through
the API. A migration, a maintenance script or an operator with a psql session
bypasses both — and those are exactly the circumstances in which a shortcut
gets taken.

---

## 5. Recommendation is not execution

An attached OS never performs a privileged action. It **submits**, and a human
inside BEYU OS decides.

`integrations.os_submissions` holds those requests as `PENDING`, and a database
constraint requires a reviewer before the row can move to `ACCEPTED` or
`REJECTED`. There is no code path — and no SQL path — by which a submission
approves itself.

This is the same boundary Noelia and HIVE operate under. A capital request from
Health OS and a capital recommendation from an AI advisor are both proposals,
and both wait for the same human approval.

---

## 6. Credentials

Each OS gets its own credentials, scoped to that OS alone.

`integrations.os_credentials` stores a **reference** to a secret held in a
secret manager, never the secret itself. A CHECK constraint rejects anything
that looks like inline key material, and a partial unique index permits only
one active credential per OS per environment, so rotation is a deliberate act
with a visible before and after.

Revoking an OS's access does not require redeploying anything: suspend the OS
and event delivery stops immediately, because fan-out resolves recipients from
live grants filtered to `ACTIVE` status on every publish.

---

## 7. Isolation, concretely

Everything above adds up to a specific set of guarantees, each verified by a
test in `services/beyu-api/test/os-registry.e2e.test.ts` and probed directly
against the database:

- A newly registered OS can do **nothing**. Zero capabilities, no attachment,
  no events.
- Health OS and Agriculture OS hold independent capability sets. Granting one
  something grants the other nothing.
- Neither can read the other's event grants, data or submissions.
- Neither can execute a waterfall, approve capital, alter audit history or
  reach the database.
- FOUNDATION OS cannot be attached under the holding company, and no sector OS
  can be attached above the Sector LLC boundary.
- Suspending an OS stops event delivery immediately.

---

## 8. Implementation status

| Component | Status |
| --- | --- |
| Federation contract (`packages/types/src/os-registry.ts`) | **IMPLEMENTED** |
| Schema, constraints, triggers (`migrations/0008_os_federation.sql`) | **IMPLEMENTED** |
| Registry REST endpoints (`/api/v1/os-registry`) | **IMPLEMENTED** |
| Capability deny list (contract + API + database) | **IMPLEMENTED** |
| Attachment legality enforcement | **IMPLEMENTED** |
| Lifecycle state machine | **IMPLEMENTED** |
| Event grant model and recipient resolution | **IMPLEMENTED** |
| Credential *references* and rotation constraints | **IMPLEMENTED** |
| Submission queue schema and reviewer constraint | **IMPLEMENTED** |
| Submission REST endpoints and review workflow | **DEFERRED** |
| Actual event broker delivery (Kafka) | **STUBBED** — `InMemoryEventBus` works; `KafkaEventBus` throws |
| Outbound API calls from BEYU OS into an attached OS | **DEFERRED** |
| Secret manager integration | **DEFERRED** — the schema stores references; nothing resolves them yet |
| mTLS / request signing between OSs | **DEFERRED** |

The seam is real and enforced. The transport that would carry live traffic
across it — a running broker, a resolved secret manager, mutual TLS — is not
built, and no attached OS should be pointed at this in production until it is.
