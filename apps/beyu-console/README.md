# BEYU OS Console

A dependency-free operator front end: one HTML file and one Node script. No
build step, no `node_modules`, nothing to install.

It exists alongside `apps/beyu-web` (Next.js), not instead of it. Use this one
when you need a control-plane UI on a machine that cannot run a build, or when
you want to read the entire front end in a single sitting.

## Running

```bash
# The API must be reachable from wherever this server runs.
BEYU_API_ORIGIN=http://127.0.0.1:4000 PORT=8080 node apps/beyu-console/server.mjs
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | Port to serve on. |
| `HOST` | `0.0.0.0` | Interface to bind. |
| `BEYU_API_ORIGIN` | `http://127.0.0.1:4000` | Where the BEYU API lives. Server-side only — never sent to the browser. |
| `BEYU_ALLOW_EMBEDDING` | unset | `true` permits framing. Leave unset in production. |

## Why the server proxies instead of the browser calling the API directly

The browser is told to call `/api/v1/...` on the origin it loaded from, and
`server.mjs` forwards that to `BEYU_API_ORIGIN`.

The alternative — baking the API's address into the page — breaks as soon as
the console is behind a proxy, a tunnel or a port forward, because an address
the *server* can reach is not necessarily one the *user's browser* can reach.
It also spreads the access token across two origins and requires CORS
exceptions to match. One origin, one cookie scope, one place to configure.

## What this front end deliberately does not do

- **No authorization.** It forwards your token and renders whatever the API
  returns. Controls it hides are hidden as a courtesy; the same request from
  `curl` gets the same answer. Access decisions live in the API (spec §7, §54).
- **No database access.** Ever. It speaks only to `/api/v1`.
- **No mock data.** A screen without a backend says *Not implemented* and shows
  nothing. An empty table on a governance console reads as "we looked and found
  none", which would be a lie.

## Status

| Screen | Status |
| --- | --- |
| `/auth`, `/dashboard`, `/organization`, `/integrations`, `/audit`, `/settings` | **IMPLEMENTED** — live API data |
| `/noelia` | **IMPLEMENTED** (ask, recommendations, review, AI action log) against a **STUBBED** model provider |
| Ownership, governance, countries, sectors, strategy, risks, compliance, capital, waterfall, documents, workflows, reports, notifications | **DEFERRED** — render *Not implemented* |

### On the Noelia screen specifically

The governance around Noelia is real: real endpoints, real persistence, real
RLS, real audit, a real recommendation-versus-execution split enforced by
database constraints.

The **model is stubbed**. `stub-deterministic` matches your question against
records by term overlap and reports what it found. It is retrieval, not
analysis, and the screen says so on every single answer rather than only in
this README. Configure `AI_DRIVER=openai-compatible` to point at a real
provider; `OpenAiCompatibleProvider.complete()` is not yet implemented and will
throw.
