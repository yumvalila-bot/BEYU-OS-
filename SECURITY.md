# Security Policy

BEYU OS is the control plane for BEYU FAMILY TRUST. It holds ownership records,
governance decisions, capital allocations and audit history. Security defects
are treated as the highest-severity class of bug.

## Reporting a vulnerability

Report privately to the BEYU FAMILY TRUST technology office. Do not open a
public issue, and do not include live credentials or production data in the
report.

Please include: what you found, how to reproduce it, what an attacker could
reach, and any suggested remediation.

You will receive acknowledgement of the report, an initial assessment, and
notification when a fix ships.

## Scope

In scope: authentication and session handling, the authorization policy engine,
tenant isolation and row-level security, the audit chain, document access
control, the AI governance boundary, cross-OS contracts, and secret handling.

Out of scope: findings that require a compromised administrator account,
denial of service through sheer volume, and issues in the sector operating
systems (Health OS, Finance OS, Agriculture OS, Foundation OS), which are
governed separately.

## Security model

The controls below are load-bearing. A change that weakens one is a security
change and must be reviewed as such.

**Authorization is deny-by-default.** Every request is evaluated by the policy
engine. A permission that is not explicitly granted is denied. An API handler
that does not declare a required permission is rejected rather than served, so
a forgotten annotation fails closed.

**Frontends never touch the database.** Web and mobile clients reach data only
through the authorized API. There is no direct database access from any client,
and no shared database access between operating systems — cross-OS integration
happens through versioned APIs, events and contracts.

**Tenant isolation is enforced twice.** PostgreSQL row-level security applies
tenant and record-ownership rules at the database, independent of application
logic. The policy engine applies organizational, geographic and classification
scoping above it. A bug in one layer does not by itself expose data.

**The audit trail is append-only and tamper-evident.** Records are chained with
SHA-256; each entry commits to its predecessor. Mutation is blocked in three
places: the database revokes UPDATE and DELETE, the permission model treats
those actions as never-grantable so a broad role grant cannot pick them up, and
the policy engine rejects them at request time. Any tampering breaks the chain
and is detected by verification.

**AI recommends; humans execute.** Noelia and HIVE hold no unrestricted
database access and cannot exceed the authorization of the human they act for.
Read and export may proceed within scope; every mutation is downgraded to a
recommendation requiring human approval. Impersonating another user is
rejected outright.

**Sector-sensitive data never crosses into BEYU OS.** The classification
ceiling is enforced regardless of role, and cannot be lifted by granting a
broader role.

**Secrets live in the environment, never in source.** Integration credentials
are stored as references to a secret manager, not as values. `.env` files, keys
and certificates are excluded from version control.

## Deployment requirements

- `JWT_SECRET` must be at least 32 characters; the API refuses to start in
  production otherwise.
- Run the application as a role that is not the schema owner, so migrations and
  runtime have distinct privileges.
- Terminate TLS in front of the API; it expects to run behind a trusted proxy.
- Restrict `CORS_ORIGINS` to known frontends.
- Ship audit verification as a scheduled job and alert on `AUDIT_WRITE_FAILED`
  and on any chain break.
