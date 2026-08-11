# CI workflow

`ci.yml` in this directory is the canonical GitHub Actions workflow for BEYU OS.

It lives here rather than in `.github/workflows/` because the automation account
that created it does not hold the `workflows` permission scope, and GitHub
rejects pushes that add or modify workflow files without it.

**To activate it**, a maintainer with write access to workflows should copy it
into place and commit:

```bash
mkdir -p .github/workflows
cp docs/ci/ci.yml .github/workflows/ci.yml
git add .github/workflows/ci.yml && git commit -m "ci: enable CI workflow"
```

Once `.github/workflows/ci.yml` exists, this copy can be deleted.

## What it runs

| Job | Purpose |
| --- | --- |
| `verify` | Typecheck, lint, test and build the whole workspace. |
| `migrations` | Applies migrations twice against a real PostgreSQL 16 server to prove idempotency, then seeds and verifies the audit hash chain. |
| `guardrails` | Enforces specification rules that review should not have to catch. |

The guardrails fail the build if the parent organization is renamed away from
BEYU FAMILY TRUST, if a secret-bearing file becomes tracked, if `nx.json` is
introduced, or if a migration grants UPDATE or DELETE on the audit log.
