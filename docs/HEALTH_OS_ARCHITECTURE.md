# BEYU HEALTH OS — Architecture

**Version 1.0.0 · 12 August 2026**
**Canonical Healthcare Operating System for BEYU Ecosystem**

## 1. Legal and Digital Hierarchy

```
LEGAL:
BEYU FAMILY TRUST
  ↓
BEYU HOLDING COMPANY
  ↓
COUNTRY HOLDING COMPANY (e.g., Tanzania)
  ↓
SECTOR OPERATING COMPANY (Health LLC)
  ↓
BEYU HEALTH OS (digital operating platform)

DIGITAL:
BEYU OS CONTROL PLANE
  ↓ Governed APIs + beyu.* events
BEYU HEALTH OS — Health Sector Operating System
  ↓
Tenants (Hospital Groups, Hospitals, Clinics, Eye Centers, Pharmacies, Labs, Imaging, Ambulance, Telemedicine orgs, Insurers, Corporate, NGO, Public)
  ↓
Facilities / Organizations
  ↓
Departments / Wards / Units
  ↓
Users / Providers / Patients / Partners
```

BEYU HEALTH OS MUST NOT be modeled as legal parent of sector operating company. Legal and digital hierarchies are distinct but interconnected.

BEYU OS is group-level CONTROL PLANE: Governance, Capital, Corporate, Identity, Risk, Strategy.
BEYU HEALTH OS is operational: patients, clinical, pharmacy, lab, radiology, ophthalmology, billing, inventory, workforce, telemedicine, ambulance, compliance, analytics, AI.

## 2. Core Design Principles

ONE DOMAIN MODEL
ONE BACKEND (modular monolith, NestJS)
ONE SECURITY MODEL (RBAC + ABAC + Purpose-of-Use + Tenant RLS)
ONE GOVERNANCE MODEL (Policy, Workflow, Approval, Audit)
ONE IDENTITY MODEL (GlobalUser → TenantMembership via BEYU OS identity seam)
ONE EVENT MODEL (beyu.* inbound, os.* outbound, outbox/inbox)
ONE AUDIT MODEL (append-only hash chain, tamper-evident)
ONE AI IDENTITY (Noelia)
MULTIPLE OPTIMIZED EXPERIENCES (Web Next.js, Mobile/Tablet/Desktop Flutter, PWA, partner portals, executive dashboards)

Properties: cloud-native, API-first, multi-tenant, modular, scalable, secure, auditable, interoperable (FHIR R4/HL7/DICOM/ICD-10/11/SNOMED/LOINC), mobile-first, offline-capable (encrypted sync queue), AI-native, configuration-driven, localization-ready (en, sw, fr), standards-based, production-ready.

## 3. Application Experiences

- Phone / Tablet / Web / Desktop
- Clinical workstations (ophthalmology optimized with dual-monitor imaging)
- Reception, Pharmacy, Lab, Radiology workstations
- Mobile field operations (ambulance with GPS, offline)
- Patient portal (book, view records, pay, consent)
- Provider app (timeline, orders, AI assistance)
- Partner / Supplier portals
- Executive dashboards (revenue, utilization, disease patterns, compliance)

Tech: WEB Next.js + React + TS, MOBILE Flutter, BACKEND NestJS + TS, DB PostgreSQL + Prisma (SQL migrations authoritative for RLS and hash chain), Cache Redis, Object Storage S3-compatible, Events Kafka-compatible, Real-time WebSockets/event-driven, Search OpenSearch/ES, Observability Prometheus/Grafana/Otel, Infra Docker/K8s/Terraform, CI/CD GitHub Actions.

## 4. System Architecture

```
Clients: Web, Flutter Mobile/Tablet/Desktop, External Integrations
  ↓
API Gateway / Edge (CORS, Rate Limit, JWT, Tenant GUC)
  ↓
NESTJS PLATFORM (services/beyu-health-api)
  ├── Identity (users, roles, permissions, sessions, MFA, SSO/OIDC)
  ├── Tenant (tenants, facilities, departments, rooms, beds, equipment)
  ├── Patient (mrn auto, demographics, identifiers, contacts, consents, allergies, longitudinal)
  ├── Clinical (encounters, conditions ICD-10/SNOMED, observations LOINC, vitals, notes, care plans, procedures, referrals, care teams)
  ├── Appointment (universal scheduling engine: appointments, walk-ins, recurring, provider/room/equipment schedules, queue, reminders, waitlist, telemedicine)
  ├── Triage & Emergency (triage protocols, acuity, escalations)
  ├── Inpatient (admission, bed management, ward, nursing, med admin, transfers, discharge)
  ├── Pharmacy (drug catalog, formulary, prescriptions, dispensing, safety checks allergy/duplicate/interaction/dose, stock, batches, controlled, pricing, insurance billing)
  ├── Inventory & Supply Chain (warehouses, stock, batches, expiry, reorder, requisitions, POs, suppliers, transfers, counts, wastage, recalls)
  ├── Laboratory (catalog LOINC, orders, specimen tracking, accessioning, results, critical, verification, QC, equipment integration)
  ├── Radiology (orders, scheduling, modality, workflow, structured reporting, PACS/DICOM/DICOMweb, X-ray/CT/MRI/US/Mammo/Ophthalmic imaging)
  ├── Ophthalmology (FIRST-CLASS: ocular/systemic/family/medication/trauma history, VA distance/pinhole/near/BCVA/color/contrast, refraction sphere/cyl/axis/prism/add, external, pupil, motility, binocular, slit-lamp, IOP Goldmann/NCT/Tonopen/iCare, gonioscopy, fundus retina/macula/optic nerve/vitreous, glaucoma/cataract/DR/HTN/vascular/uveitis/corneal/neuro/peds/low vision/contact lens/optical Rx/surgery/tele-ophthalmology, imaging fundus/OCT/OCTA/VF/topography/pachymetry/biometry/keratometry/slit-lamp/external, disease templates)
  ├── Telemedicine (virtual appointments, video/audio, secure messaging, file sharing, consent, scheduling, prescriptions where permitted, referrals)
  ├── Ambulance (registry, status, crew, dispatch, GPS/location consented, route, pickup, handover, destination, incident, maintenance)
  ├── Billing & Revenue Cycle (service catalog, pricing, invoices, quotations, payments, refunds, credit notes, discounts, deposits, cash reconciliation, revenue reporting — clinical/financial/insurance separated but related)
  ├── Insurance (payers NHIF/schemes, beneficiaries, eligibility, authorizations, claims, adjudication, rejection, remittance, reconciliation, configurable integrations, Tanzania NHIF successor architecture)
  ├── Workforce (profiles, credentials, licenses, departments, roles, schedules, shifts, attendance, performance, training, expiry)
  ├── Documents (clinical docs, scanned, consent, invoices, prescriptions, referrals, reports, certificates, identity, contracts, images, PDFs — owner/tenant/type/metadata/policy/version/audit/retention, S3)
  ├── Notifications (push/SMS/email/WhatsApp/business messaging, templates, appointment/medication/lab/billing/clinical/operational alerts)
  ├── Reporting & Analytics (Executive: revenue, expenses, patient volume, utilization, profitability, facility performance; Clinical: diagnoses, outcomes, readmissions, quality; Operations: queues, waiting times, staff utilization, bed occupancy, inventory; Pharmacy: consumption/expiry/stock-outs; Lab: TAT/workload/critical; Radiology: modality utilization/TAT; Ophthalmology: volumes/disease patterns/procedures/outcomes; Compliance: incidents/audits/regulatory + MTUHA-compatible)
  ├── Compliance (framework packs TZ MOH/MTUHA/NHIF/TMDA/TRA/Data Protection + ISO-27001/HIPAA equivalent, requirements, evidence, incidents)
  ├── Governance (Policy/Rule/Workflow/Approval/Delegation/Escalation/Exception/AuditEvent — approval chains, segregation of duties, financial/clinical authorization, procurement, access, emergency override)
  ├── Audit (who/what/when/where/tenant/device/action/before/after/reason/authorization context — immutable hash chain, access logs, clinical/financial/security/AI/admin audit)
  ├── HIVE + Noelia (Clinical/Operational/Financial/Pharmacy/Lab/Radiology/Ophthalmology/Executive/Compliance/Supply Chain engines, pipeline: Identity → Authorization → Context → Tenant → Data Permission → RAG Knowledge Retrieval → Reasoning → Safety Validation → Human Approval if required → Action/Recommendation → Audit)
  └── Integration (FHIR R4/R5, HL7 v2, DICOM/DICOMweb, LOINC/SNOMED/ICD-10/11/RxNorm/UCUM/openEHR, DHIS2, NHIF payer, TMDA/TRA, SMS/email/payment gateways, banking/accounting, PACS, analyzers, devices, IdPs — adapter-based, never tightly coupled)
  ├── PostgreSQL (normalized, UUID, createdAt/updatedAt/createdBy/updatedBy/tenantId, soft delete, RLS, indexes, FK, transactions, optimistic concurrency, retention policy, never delete legal clinical/audit records)
  ├── Redis (cache, sessions, queues)
  ├── Object Storage
  ├── Event Bus (outbox/inbox, PatientCreated/EncounterCreated/AppointmentBooked/LabOrderCreated/LabResultFinalized/PrescriptionCreated/MedicationDispensed/InvoiceCreated/PaymentReceived/ClaimSubmitted/StockReceived/StockAdjusted/PatientAdmitted/PatientDischarged/ReferralCreated/DocumentUploaded/AIRecommendationGenerated/AuditEventCreated — tenant boundaries respected)
  └── Search (OpenSearch)
```

## 5. Multi-Tenancy

Tenant hierarchy: BEYU → Country → Sector Operating → Tenant → Facility → Departments → Users/Providers/Patients

Supports hospital groups, hospitals, clinics, medical centers, eye centers, pharmacies, laboratories, imaging centers, ambulance services, telemedicine orgs, health insurers, corporate health, NGO health, public health, individual practices.

Tenant isolation enforced at: DB access (RLS GUC app.tenant + is_cross_tenant), API authorization, files (path tenantId), clinical records, financial records, AI retrieval (tenant-filtered RAG), analytics, events, audit logs, integrations. No cross-tenant unless explicitly authorized via controlled relationships.

## 6. Identity & Access

Entities: GlobalUser (via BEYU OS identity seam), UserIdentity, TenantMembership, OrganizationMembership, Role, Permission, Policy, Session, Device, APIKey, ServiceAccount

Auth: email/phone/password, MFA, passkeys, SSO/OAuth/OIDC/enterprise IdPs, session/device management, account recovery.

Authorization: RBAC + ABAC + tenant policies + organization/department policies + clinical context + purpose-of-use + least privilege + break-glass + delegated access.

Roles: SUPER_ADMIN, TENANT_ADMIN, FACILITY_ADMIN, DOCTOR, CLINICAL_OFFICER, NURSE, OPTOMETRIST, OPHTHALMOLOGIST (first-class), PHARMACIST, LAB SCIENTIST, RADIOLOGIST, RADIOGRAPHER, RECEPTIONIST, CASHIER, ACCOUNTANT, PROCUREMENT, STOREKEEPER, AMBULANCE CREW, EXECUTIVE, PATIENT, AUDITOR.

## 7. EHR & Ophthalmology First-Class

Patient timeline unified chronological: outpatient, inpatient, emergency, pharmacy, lab, radiology, ophthalmology, telemedicine, ambulance, surgery, chronic disease.

Ophthalmology examination template includes: ocular/systemic/family/medication/previous surgeries/trauma histories, VA unaided/aided/pinhole/near/color/contrast/visual fields, refraction sphere/cyl/axis/prism/add/BCVA subjective/objective, external, pupil, motility, binocular, slit-lamp, IOP Goldmann/NCT/Tonopen/iCare with pachymetry adjustment, gonioscopy openness/Shaffer/Spaeth/pigment, fundus optic disc/cup ratio/macula/vessels/periphery/vitreous/retina, diagnoses category glaucoma/cataract/DR/HTN/vascular/uveitis/corneal/neuro/peds/low vision/other, imaging fundus/OCT/OCTA/VF/topography/pachymetry/biometry/keratometry/slit-lamp/external/FA/ICG/B/A-scan, optical prescription single/bifocal/progressive/contact/low vision, surgery with IOL, tele-ophthalmology.

## 8. AI — Noelia & HIVE

Noelia is canonical AI identity of BEYU ecosystem, operates through HIVE runtime, NOT unrestricted autonomous agent.

Must obey RBAC/ABAC/tenant isolation/purpose-of-use/data permissions/clinical safety/governance/audit/human accountability.

Provides clinical/operational/executive/admin/documentation/analytics/forecasting/workflow/knowledge retrieval/patient communication (where authorized).

HIVE Architecture: NOELIA → HIVE AI RUNTIME → Specialized Engines (Clinical, Operational, Financial, Pharmacy, Lab, Radiology, Ophthalmology, Executive, Compliance, Supply Chain)

Pipeline: User request → Identity verification → Authorization → Context resolution → Tenant resolution → Data permission check → Knowledge retrieval (RAG with source/version/owner/effective/expiry/jurisdiction/trust level, tenant-filtered, no uncontrolled authoritative) → AI reasoning → Safety validation → Human approval if required → Action/recommendation → Audit

Clinical AI Safety: MUST NOT silently diagnose, prescribe, alter records, or execute high-risk without human authorization. Distinguish information/recommendation/warning/prediction/clinical decision support/authorized action. High-risk requires explicit human confirmation.

Governance kill switch: AI_ENABLED flag, driver stub vs openai-compatible, apiKeyRef holds reference not secret, refusal to start production with stub when explicitly enabled.

## 9. Interoperability & Compliance

Standards: FHIR R4 (R5 where appropriate), HL7 v2, DICOM/DICOMweb, LOINC, SNOMED CT, ICD-10/11, RxNorm where applicable, UCUM, openEHR where strategic.

Compliance framework: configurable compliance packs, Tanzania pack supports MOH/MTUHA/NHIF/TMDA/TRA/data protection/health facility/professional regulatory. International support.

Data residency: configurable per tenant/country — storage region, backup region, processing region, AI processing policies, cross-border transfer rules.

## 10. Monorepo Structure

apps/
  beyu-web (BEYU OS control plane Next.js)
  beyu-console (BEYU OS operator console, no deps)
  beyu-health-web (BEYU HEALTH OS Next.js clinical/admin/executive)
services/
  beyu-api (control plane NestJS)
  beyu-health-api (health OS NestJS, full domain module monolith)
packages/
  types (BEYU OS shared contracts)
  health-types (health OS canonical domain contracts)
  config, auth, events, security, etc.
infra/
  docker, kubernetes, terraform, github-actions
docs/
  IMPLEMENTATION_STATUS, TEST_REPORT, OS_FEDERATION, HEALTH_OS_ARCHITECTURE, HEALTH_OS_IMPLEMENTATION_STATUS, etc.

## 11. BEYU OS Integration

BEYU OS controls group-level: identity, ownership, corporate structure, country structure, sector registry, governance, strategy, risk, compliance oversight, capital allocation, enterprise policies.

BEYU HEALTH OS controls health-sector operations: patients, healthcare delivery, facilities, providers, clinical operations, pharmacy, laboratory, imaging, appointments, billing, healthcare inventory, healthcare workforce, operational analytics.

Finance integration: Health OS publishes InvoiceIssued/PaymentReceived/RefundIssued/PurchaseOrderApproved/SupplierInvoiceReceived/PayrollEvent/RevenueRecognized to Finance OS, which remains authoritative enterprise financial control plane where applicable.

Governance boundaries: Health OS MUST NOT bypass BEYU OS governance, country-level controls, legal entity boundaries, expose cross-tenant info, allow unauthorized AI actions, silently modify clinical/financial records, bypass audit logging.

## 12. Success Criteria

- one patient has one longitudinal health record
- one identity can securely access authorized organizations
- every tenant is isolated (RLS + API + files + AI + audit)
- every clinical action is auditable (hash chain)
- every financial event can be reconciled (invoice → payment → claim → remittance)
- every major workflow is configurable (terminology/workflows/forms/departments/services/pricing/appointment/billing/payer/approval/notification/clinical templates/compliance rules)
- healthcare standards supported (FHIR/HL7/DICOM/ICD/SNOMED/LOINC)
- mobile, tablet, desktop, web use same backend
- Noelia operates safely within authorization boundaries (purpose-of-use, tenant-filtered RAG, human-in-loop, auditable retrieval)
- HIVE provides controlled intelligence
- BEYU OS remains group-level control plane
- country and sector legal boundaries intact
- platform can scale internationally (i18n, data residency, config packs)
- system is production-ready not prototype (real DB, migrations, APIs, authZ, validation, audit, tests, error handling, logging, monitoring, deployment, backups, security)
