<div align="center">

# BEYU OS ECOSYSTEM

**BEYU OS — Organizational control plane + BEYU HEALTH OS — Complete Healthcare Operating System**

`v1.0.0` · Proprietary and confidential · BEYU FAMILY TRUST

BEYU HEALTH OS branch: `Feature/health-os` | `arena/019ff409-beyu-os`

</div>

---

## Ecosystem Overview

This repository contains the **BEYU OS Ecosystem** with two major operating systems:

### BEYU OS (Control Plane)
The system of record for how BEYU FAMILY TRUST is structured, owned, governed and directed. Holds organizational hierarchy, ownership, governance decisions, strategic objectives, risk/compliance posture, capital allocation, waterfall — with tamper-evident audit trail.

### BEYU HEALTH OS (Health Sector OS) — NEW
Complete healthcare operating system unifying:

**Clinical:** Patient longitudinal record, EHR, encounters, conditions (ICD-10/11/SNOMED), observations (LOINC), vitals, notes, care plans, procedures, referrals, care teams.

**Operations:** Appointments (universal scheduling engine), triage & emergency, inpatient/bed management, pharmacy (safety checks allergy/duplicate/interaction/dose), lab (specimen tracking, critical results), radiology (PACS/DICOM/DICOMweb), inventory & supply chain, workforce, ambulance & dispatch (GPS), telemedicine (video/audio/messaging).

**Ophthalmology — First-Class Differentiator:** ocular/systemic/family/medication/trauma history, visual acuity distance/pinhole/near/BCVA/color/contrast/visual fields, refraction sphere/cylinder/axis/prism/add, external/pupil/motility/binocular, slit-lamp, IOP Goldmann/NCT/Tonopen/iCare with pachymetry, gonioscopy openness/Shaffer/Spaeth, fundus retina/macula/optic nerve/vitreous/vessels, disease templates glaucoma/cataract/DR/HTN/vascular/uveitis/corneal/neuro/peds/low vision, imaging fundus/OCT/OCTA/visual field/topography/pachymetry/biometry/keratometry/slit-lamp/external/FA/ICG, optical prescriptions, surgery, tele-ophthalmology.

**Financial:** Billing & revenue cycle (service catalog, pricing, invoices, payments, reconciliation), Insurance (NHIF/private/corporate/government, beneficiaries, eligibility, authorizations, claims adjudication, remittance, Tanzania NHIF successor architecture).

**Governance:** Compliance (TZ packs MOH/MTUHA/NHIF/TMDA/TRA/Data Protection + ISO-27001/HIPAA), policies, approval workflows, quality indicators, incident reporting, MTUHA reporting, audit hash chain tamper-evident, access logs, break-glass.

**AI:** Noelia (canonical AI identity) → HIVE runtime → Specialized Engines (Clinical, Ophthalmology, Pharmacy, Lab, Radiology, Operational, Financial, Executive, Compliance, Supply Chain) with pipeline Identity → Authorization → Tenant → Data Permission → RAG Knowledge Retrieval (source/version/owner/jurisdiction/trust level) → Reasoning → Safety → Human Approval → Action → Audit. Governed with RBAC/ABAC/tenant isolation/purpose-of-use/human-in-loop.

**Interoperability:** FHIR R4/R5, HL7 v2, DICOM/DICOMweb, LOINC/SNOMED/ICD-10/11/RxNorm/UCUM/openEHR, DHIS2, NHIF/TMDA/TRA, PACS, lab analyzers, payment gateways.

## Architecture Boundaries

```
                    BEYU FAMILY TRUST
                            │
            ┌───────────────┴───────────────┐
            │                               │
   BEYU HOLDING COMPANY            BEYU FOUNDATION
            │                      (sister, independent FOUNDATION OS)
   Country Holding Companies
            │
      Sector LLCs
════════════╪══════════════════════════════════  BEYU OS boundary
            │
   Health OS · Finance OS · Agriculture OS
   (sector operations — governed independently)

BEYU HEALTH OS Digital:
BEYU OS CONTROL PLANE (Governance/Capital/Corporate/Identity/Risk/Strategy)
  ↓ APIs / beyu.* events
BEYU HEALTH OS (Operational: patients, clinical, pharmacy, lab, radiology, ophthalmology, etc.)
  ↓
Tenants → Facilities → Departments → Users/Providers/Patients
```

Two boundaries are load-bearing and enforced in code:
- **BEYU OS governs down to Sector LLC and no further.** Sector ops belong to sector OSs.
- **BEYU FOUNDATION is sister of HOLDING, not subsidiary.** Attaches directly to Trust.
- Parent is **BEYU FAMILY TRUST**. Never "BEYU GROUP" — rejected by domain, DB CHECK, lint, CI.

## Implementation Status

### BEYU OS Control Plane (original)
- **Solid:** Schema, authorization engine, audit chain, waterfall engine, AI governance, API runtime, auth, organization, OS registry, Noelia governance — 292 tests passing
- **Partial:** Two front ends 6-7 live routes
- **See:** `docs/IMPLEMENTATION_STATUS.md`

### BEYU HEALTH OS (new, this branch)
- **Implemented:** Full domain model (10 migrations), patient/clinical/scheduling/triage/inpatient/pharmacy/inventory/lab/radiology/ophthalmology (first-class)/billing/insurance/ambulance/telemedicine/workforce/documents/notifications/reporting/compliance/governance/audit/ai/integration — 27 NestJS modules, modular monolith
- **Implemented:** Security model RBAC/ABAC/tenant RLS, audit hash chain SHA256 app-layer + trigger, Noelia governed with purpose-of-use and human-in-loop
- **Implemented:** API surface 40+ endpoints versioned REST /api/v1 with OpenAPI Swagger, PGlite + Postgres, seed Tanzania HQ
- **Implemented:** Web app @beyu/health-web Next.js 14 Tailwind, BEYU branding navy/gold/white, AppShell, executive dashboard, ophthalmology dedicated, patient search, workspaces for all domains, auth login
- **Partial:** Mobile Flutter offline-first scaffolded (backend ready: encrypted local storage + sync queue via event outbox), e2e tests for tenant isolation/ophthalmology/pharmacy safety/lab critical/Noelia refusal, Redis/S3/Kafka drivers STUBBED (config exists, fails loudly), K8s/Terraform empty
- **See:** `docs/HEALTH_OS_ARCHITECTURE.md` and `docs/HEALTH_OS_IMPLEMENTATION_STATUS.md`

## Getting Started

Requires Node 20+ and pnpm 9.12.3.

```bash
corepack enable && corepack prepare pnpm@9.12.3 --activate
pnpm install
cp .env.example .env
# Control plane (BEYU OS)
pnpm --filter @beyu/api db:migrate && pnpm --filter @beyu/api db:seed
pnpm --filter @beyu/api dev
# Health OS
pnpm --filter @beyu/health-api db:migrate && pnpm --filter @beyu/health-api db:seed
pnpm --filter @beyu/health-api dev
# Web apps
pnpm --filter @beyu/web dev        # BEYU OS control plane web :3000
pnpm --filter @beyu/health-web dev # BEYU HEALTH OS web :3001
# Docker (optional)
docker compose up -d
docker compose -f docker-compose.yml -f docker-compose.health.yml up -d
```

- Control plane API: http://localhost:4000/api/docs
- Health OS API: http://localhost:4001/api/docs
- Health OS Web: http://localhost:3001
- Control plane Web: http://localhost:3000

Health endpoint:

```bash
curl http://localhost:4001/api/v1/health
```

## Repository Layout

| Path | Contents |
|---|---|
| `services/beyu-api` | NestJS control-plane API |
| `services/beyu-health-api` | NestJS Health OS API — full healthcare OS |
| `apps/beyu-web` | Next.js control-plane web (6 live routes) |
| `apps/beyu-console` | Dependency-free operator console |
| `apps/beyu-health-web` | Next.js Health OS clinical/admin/executive web |
| `packages/types` | BEYU OS shared contracts |
| `packages/health-types` | Health OS canonical domain contracts |
| `packages/auth` | Authorization policy + AI governance |
| `packages/security` | Audit chain, crypto, tokens |
| `packages/events` | Versioned event bus |
| `packages/config` | Env config fail-fast |
| `docs/` | Implementation status, architecture, OS federation, health OS docs |
| `infra/` | Docker/K8s/Terraform (deferred) |

## Design Principles (enforced by code/tests/CI)

- **Deny-by-default authorization** — every request via policy engine, missing permission fails closed, UI never decides.
- **Frontends never touch DB** — API only, no shared DB across OSs.
- **Append-only audit** — SHA256 hash chain, immutable, 3 layers enforcement, tampering detection.
- **Nothing hard-coded** — ownership %, waterfall rules, country regulations are config/data, no country special-case in source.
- **History never rewritten** — waterfall rules versioned, calculations pin version + input hash.
- **Money never float** — integer minor units, basis points, explicit rounding.
- **AI recommends; humans execute** — Noelia/HIVE no unrestricted DB, cannot bypass authZ, cannot exceed user, mutations downgraded to recommendation awaiting approval, auditable retrieval with purpose-of-use.
- **Honest status** — stub fails loudly, never mock data in governance console.

## BEYU HEALTH OS — Tenant Model

```
BEYU → Country → Sector Operating (Health LLC) → Tenant (Hospital Group, Hospital, Clinic, Eye Center, Pharmacy, Lab, Imaging, Ambulance, Telemedicine, Insurer, Corporate, NGO, Public, Individual)
  → Facility (Hospital, Clinic, Eye Clinic, Pharmacy, Lab, Imaging, Ambulance Base, Warehouse)
    → Departments → Rooms → Beds → Equipment
      → Users / Providers / Patients
```

Tenant isolation enforced at: DB (RLS GUC app.tenant), API authorization, files (tenant path), clinical/financial records, AI retrieval (tenant-filtered RAG), analytics, events, audit logs, integrations.

## Ophthalmology Differentiator

BEYU HEALTH OS contains first-class ophthalmology — not an add-on:

History: ocular, systemic, family, medication, previous surgeries, trauma
Visual: VA unaided/aided/pinhole/near/BCVA/color/contrast/visual fields
Refraction: sphere/cylinder/axis/prism/add/BCVA subjective/objective
External, Pupil, Motility, Binocular
Slit-Lamp, IOP (Goldmann/NCT/Tonopen/iCare), Gonioscopy (openness/Shaffer/Spaeth), Fundus (retina/macula/optic nerve/vitreous/vessels)
Diagnoses: glaucoma, cataract, DR, hypertensive, vascular, uveitis, corneal, neuro, peds, low vision, refractive
Imaging: fundus photo, OCT, OCTA, VF, topography, pachymetry, biometry, keratometry, slit-lamp/external/FA/ICG/B/A-scan
Optical Rx: single/bifocal/progressive/contact/low vision, surgery with IOL, tele-ophthalmology
Analytics: patient volumes, disease patterns, procedures, outcomes — plus executive/ophthalmology dashboards.

## AI Governance — Noelia & HIVE

- **Identity:** Noelia canonical AI of BEYU ecosystem, via HIVE runtime, NOT unrestricted autonomous agent.
- **Obey:** RBAC, ABAC, tenant isolation, purpose-of-use, data permissions, clinical safety, governance, audit, human accountability.
- **Pipeline:** Request → Identity verification → Authorization → Context resolution → Tenant resolution → Data permission check → Knowledge retrieval (tenant-filtered, no uncontrolled authoritative) → Reasoning → Safety validation → Human approval if required → Action/Recommendation → Audit.
- **Safety:** Must not silently diagnose, prescribe, alter records, execute high-risk without human auth. Distinguishes information/recommendation/warning/prediction/CDS/authorized action. High-risk needs explicit confirmation.
- **Kill switch:** AI_ENABLED, driver stub vs openai-compatible, apiKeyRef is reference not secret, refusal to start prod with stub when explicitly enabled.
- **Knowledge:** RAG with source/version/owner/effective/expiry/jurisdiction/trust level, tenant-specific, no uncontrolled docs authoritative.

## Security

Policy, threat model, reporting: `SECURITY.md`. Never commit `.env`, keys, credentials. JWT secret 32+ chars enforced in prod. MFA, RBAC/ABAC, tenant isolation, secure sessions rotation, rate limiting, CSRF/XSS/SQL injection via ValidationPipe whitelist/forbidNonWhitelisted, secure headers, input validation, file scanning hook, audit logging, anomaly detection, backup, DR — zero-trust.

## Contributing

See `CONTRIBUTING.md`.

## Licence

Proprietary and confidential. Copyright © 2026 BEYU FAMILY TRUST. All rights reserved. See `LICENSE`.
