# BEYU HEALTH OS — Compliance: ISQua, ISO, NABH, JCI

**Version 1.0.0 · 12 August 2026**
**International Accreditation Framework**

## Overview

BEYU HEALTH OS implements a **configurable compliance pack framework** per spec §22 — not hard-coded laws. Tanzania packs (MOH, MTUHA, NHIF, TMDA, TRA, Data Protection) existed; now extended with international accreditation:

- **ISQua** — International Society for Quality in Health Care, EEA Principles 8th Edition
- **ISO** — 9001:2015 QMS, 15189:2022 Medical Labs, 15190:2020 Lab Safety, 7101:2023 Healthcare Org Management, 27001:2022 ISMS (update), 27799:2016 Health Informatics Security, 45001:2018 OH&S, 14001:2015 Environmental, 15224:2016 EN Healthcare Quality
- **NABH** — National Accreditation Board for Hospitals (India) Hospital 5th Edition (10 chapters, 100 standards, 651 objective elements), Eye Care 3rd Edition specialized for ophthalmology, Clinic 2nd, Lab 3rd, Emergency 1st
- **JCI** — Joint Commission International Hospital 8th Edition 2024 (16 chapters, 6 IPSG mandatory, climate + health equity new), Ambulatory 4th, Clinical Lab 4th, Primary Care 1st, IPSG 6 goals core

Total: **31 packs, 74 requirements** (was 8 packs, 4 requirements). All in `health_compliance.compliance_packs` and `compliance_requirements` tables, configurable, not hard-coded.

## ISQua — External Evaluation Association

ISQua accredits accreditation bodies (NABH, JCI, ACHC, COHSASA are ISQua EEA accredited). BEYU Health OS implements ISQua principles for external evaluation readiness.

### Packs

- **ISQUA-EEA-8TH** — Principles: Governance (legal entity, governance structure), Standards Development (consensus, evidence-based, stakeholder consultation), Surveyor Workforce (competence, training, evaluation, continuous development), Evaluation Process, Improvement
- **ISQUA-GUIDELINES-ACCRED** — Guidelines for organizational and surveyor competencies, decision making

Requirements seeded: Governance and Legal Status, Standards Development Process, Surveyor Competence and Training.

Mapping to BEYU:
- Governance → `health_governance.policies` + approval workflows + audit trail
- Standards Development → configurable compliance packs framework itself (data, not hard-coded)
- Surveyor Competence → `health_workforce.credentials` verification, training records, performance

## ISO Family

### ISO 9001:2015 — Quality Management Systems

7 clauses: Context (4.1 Understanding org/context), Leadership (5.1 Commitment), Planning (6.1 Risk/Opportunities), Support (7.2 Competence), Operation (8.1 Planning/Control), Performance (9.1 Monitoring/Measurement), Improvement (10.2 Nonconformity/Corrective Action). Certifiable.

Requirements seeded 7. Mapping:
- 4.1 Context → tenant/facility organizational context, SWOT in governance
- 5.1 Leadership → `health_governance.policies` + executive dashboard
- 6.1 Risk → `risk` schema? Actually compliance incidents + audit
- 7.2 Competence → workforce credentials expiry
- 8.1 Operation → clinical workflows, care plans, procedures
- 9.1 Performance → `health_reporting.executive_kpis`, quality indicators
- 10.2 Corrective Action → incident reports corrective/preventive actions

### ISO 15189:2022 — Medical Laboratories

8 requirements seeded: Impartiality (5.1), Personnel Competence (6.2), Facilities (6.3), Equipment Management (6.4 calibration/maintenance), Pre-examination (7.2 patient ID, sample collection), Examination (7.3 procedures validated, reference intervals, QC), Post-examination (7.4 result review, critical values, retention), Nonconformities (8.7).

Mapping:
- Personnel → `health_workforce.practitioners` license expiry
- Equipment → `health_tenant.equipment` calibration next_calibration_at
- Pre-exam → `health_lab.specimens` collected_by, accession_number, condition
- Exam → `health_lab.test_catalog` reference_ranges, `lab_results` value_quantity/unit, interpretation NORMAL/ABNORMAL/CRITICAL, `quality_controls` lot expected/observed PASS/FAIL
- Post-exam → critical results flag is_critical + critical_acknowledged_by/at

### ISO 7101:2023 — Healthcare Organization Management

First international consensus standard for healthcare org management. Requirements: Leadership Commitment to Quality and Safety (5.1), Person-Centered Care (6.2 shared decision making), Staff Well-being (7.1 burnout prevention), Risk Management in Clinical Care (8.3).

New 2023 standard, BEYU implements via governance + workforce well-being + clinical risk.

### ISO 27001:2022 + 27799:2016 — Information Security

ISO 27001:2022 — 93 controls, 4 domains Organizational/People/Physical/Technological, certifiable. 27799 applies 27002 to health. BEYU mapping:
- RLS tenant isolation → confidentiality
- Audit hash chain → integrity, tamper-evident
- Encryption in transit (TLS via gateway) + at rest (Postgres + S3 encryption) → protection
- Secrets management apiKeyRef reference not secret, JWT secret 32+ chars enforced prod → 93 controls

Already existed as `ISO-27001` pack, now updated with 2022 version `ISO-27001-2022`.

### Other ISO

- ISO 15190:2020 Lab Safety — biological materials handling
- ISO 45001:2018 OH&S — hazard identification for healthcare workers
- ISO 14001:2015 Environmental — waste management segregation (medical waste), energy, water, sustainable healthcare
- ISO 15224:2016 EN 15224 — European healthcare quality, clinical processes, risk management

## NABH — India

NABH is ISQua EEA accredited, gold standard India. BEYU Eye & General Hospital benefits especially from Eye Care 3rd Edition.

### NABH Hospital 5th Edition — 10 Chapters

Chapters and 18 requirements seeded:

- **AAC** Access Assessment Continuity: Registration and Admission Process (AAC-001), Initial Assessment standardized time-bound (AAC-002)
- **COP** Care of Patients: Vulnerable patients (COP-001), Assessment/Reassessment care plan multi-disciplinary (COP-002), **Ophthalmology Care - Eye Examination Protocol** (COP-003) — VA unaided/aided/pinhole/near/BCVA, refraction, slit-lamp, IOP, fundus, documentation — BEYU Eye Hospital differentiator
- **MOM** Management of Medications: Prescription and Dispensing (MOM-001), Safety Allergy and Interaction Checks (MOM-002) — allergy documented, interaction, duplicate, dose warnings — BEYU `pharmacy.safetyCheck` enforces
- **PRE** Patient Rights and Education: Rights informed, consent, education, grievance
- **HIC** Hospital Infection Control: Program, HIC committee, surveillance, hand hygiene, BMW (HIC-001), Ophthalmology Infection Control OT and Equipment (HIC-002) — Eye OT sterilization, intravitreal injection protocol
- **CQI** Continuous Quality Improvement: Quality indicators, clinical audits, data collection, analysis
- **ROM** Responsibilities of Management: Leadership commitment, org structure, vision/mission, strategic planning
- **FMS** Facility Management and Safety: Safety, security, fire, disaster, equipment (FMS-001), Medical Equipment Management inventory/calibration/maintenance/breakdown (FMS-002) — `health_tenant.equipment`
- **HRM** Human Resource Management: Staff verification, credentialing, privileging, training, appraisal (HRM-001), Ophthalmology Competence (HRM-002) — ophthalmologist qualification, optometrist competence, OT training, CME — `health_workforce.credentials`
- **IMS** Information Management System: Medical records, data collection, analysis, retention, privacy, information security (IMS-001), **EHR One Patient One Record** (IMS-002) — unified longitudinal timeline, interoperability, audit trail — BEYU core differentiator

### NABH Eye Care 3rd Edition — Specialized

5 requirements seeded:

- COP-001 Comprehensive Eye Examination: VA unaided/aided/pinhole/near/BCVA, refraction, IOP Goldmann/NCT, slit-lamp, gonioscopy, fundus
- COP-002 OCT and Imaging Quality and Reporting: OCT, OCTA, fundus photo, visual field, corneal topography quality, interpretation, PACS
- COP-003 Cataract Surgery Protocol: Pre-op assessment, biometry, IOL calculation, OT checklist, post-op care, outcomes
- COP-004 Glaucoma Management Protocol: Screening, IOP, optic disc, VF, treatment, follow-up
- COP-005 Diabetic Retinopathy Screening: DR screening, fundus photo, referral, laser, anti-VEGF

Maps directly to `health_ophthalmology` first-class module.

### Other NABH

- Clinic 2nd Edition — for small healthcare orgs, medical centers, individual practices (applies_to CLINIC, MEDICAL_CENTER)
- Lab 3rd — M(EL)T Labs extension
- Emergency 1st — triage, resuscitation, emergency care workflows → maps to `health_scheduling.triage` category Immediate/VeryUrgent/Urgent

## JCI — Joint Commission International 8th Edition 2024

JCI 8th Edition 2024 gold standard 70+ countries, ISQua EEA accredited, new focus climate + health equity.

### Packs

- **JCI-HOSPITAL-8TH** — 16 chapters: IPSG (6 goals), ACC (Access to Care Continuity), PFR (Patient Family Rights), AOP (Assessment of Patients), COP (Care of Patients), ASC (Anesthesia Surgical Care), MMU (Medication Management Use), PFE (Patient Family Education), QPS (Quality Patient Safety), PCI (Prevention Control Infections), GLD (Governance Leadership Direction), FMS (Facility Management Safety), SQE (Staff Qualifications Education), MOI (Management of Information), Global Health, Climate
- **JCI-AMBULATORY-4TH** — Clinics, medical centers, eye clinics
- **JCI-CLINICAL-LAB-4TH** — Clinical laboratories quality/safety
- **JCI-PRIMARY-CARE-1ST** — Primary care centers
- **JCI-IPSG** — International Patient Safety Goals core 6 goals mandatory

19 requirements seeded for Hospital 8th:

- **IPSG-01** Identify Patients Correctly: Two identifiers, correct ID before care/procedures/medication — MRN auto `BEYU-YYYY-######` + secondary
- **IPSG-02** Improve Effective Communication: SBAR handover, test result reporting
- **IPSG-03** Improve Medication Safety: High-alert meds, LASA, reconciliation, safety checks — BEYU pharmacy `safetyCheck`
- **IPSG-04** Ensure Safe Surgery: Universal protocol, time-out, site marking, surgical safety checklist — ophthalmology laterality OD/OS/OU confirmed
- **IPSG-05** Reduce Risk of HAI: Hand hygiene, IPC, sterilization, surveillance
- **IPSG-06** Reduce Patient Harm from Falls: Fall risk Morse, interventions, monitoring
- **ACC-01** Access to Care Continuity: Screening, admission, transfer, discharge, referral, follow-up
- **PFR-01** Patient and Family Rights: Informed consent, privacy, confidentiality, ethics
- **AOP-01** Assessment of Patients: Initial/ongoing, pain, emergency, lab, radiology, ophthalmology assessment
- **COP-01** Care of Patients General and Ophthalmology: Care planning, high-risk, resuscitation, food, pain, end-of-life, ophthalmology care plans
- **ASC-01** Anesthesia and Surgical Care: Anesthesia assessment, monitoring, surgical care, sedation
- **MMU-01** Medication Management and Use: Selection, storage, ordering, preparation, dispensing, administration, monitoring, reconciliation
- **QPS-01** Quality Improvement and Patient Safety: Quality program, data collection, indicator measurement, analysis, improvement
- **PCI-01** Prevention and Control of Infections: IPC, hand hygiene, PPE, sterilization, device-associated infections
- **GLD-01** Governance Leadership and Direction: Governance structure, leadership accountability, strategic planning, ethics
- **FMS-01** Facility Management and Safety: Safety, security, hazardous materials, disaster, fire, medical equipment, utilities
- **SQE-01** Staff Qualifications and Education: Credentialing, privileging, staff education, competence assessment
- **MOI-01** Management of Information: Health records, data management, information security, privacy — BEYU audit trail + RLS
- **GH-01** Global Health Impact Climate and Health Equity: Climate change impact on health, health equity, sustainability — NEW in 8th edition 2024

IPSG core 6 goals also seeded separately under JCI-IPSG pack.

## Implementation in BEYU HEALTH OS

### Database

`health_compliance.compliance_packs` now 31 rows, `compliance_requirements` 74 rows. All packs have `config JSONB` with type, scope, chapters, certifiable flag, country, relevant_for_Tanzania.

Requirements linked via `pack_id`, reference, title, description, category, mandatory boolean.

### Compliance Dashboard

`GET /api/v1/compliance/dashboard/:tenantId` now aggregates across all packs: complianceScore compliant/non/partial/total, incidents by type/severity/status, auditViolations break_glass/suspicious_access, overdue evidence.

Frontend compliance page groups by authority: ISQua (EEA Principles), ISO (9 packs), NABH (5 packs), JCI (5 packs), Tanzania (MOH/MTUHA/NHIF/TMDA/TRA/Data Protection), plus Africa COHSASA.

### Mapping BEYU to Standards

| BEYU Feature | Maps To |
|---|---|
| One patient one record, longitudinal timeline | NABH IMS-002, JCI MOI-01, ISO 27799, ISO 27001 |
| Audit hash chain SHA256, tamper-evident | JCI QPS-01, NABH CQI-001, ISO 9001 9.1, ISQua Governance |
| Pharmacy safetyCheck allergy/duplicate/interaction/dose | JCI IPSG-03 MMU-01, NABH MOM-002 |
| Ophthalmology first-class VA/refraction/IOP/slit-lamp/fundus/OCT | NABH Eye Care 3rd COP-001..005, NABH-HOSPITAL COP-003 |
| RLS tenant isolation, app.tenant GUC | ISO 27001, ISO 27799, JCI MOI-01 privacy |
| MTUHA auto generation | Tanzania MOH compliance |
| Bed management, equipment calibration | NABH FMS-002, JCI FMS-01, ISO 15189 6.4 |
| Workforce credentials expiry | NABH HRM-001/002, JCI SQE-01, ISO 15189 6.2 |

### API

- `GET /compliance/packs` — list 31 packs with requirement_count, config
- `GET /compliance/packs/:id/requirements` — requirements per pack
- `GET /compliance/evidence/:tenantId` + `POST /compliance/evidence` — evidence tracking with status COMPLIANT/NON/PARTIALLY/NOT_APPLICABLE/EXPIRED
- `GET /compliance/incidents/:tenantId` + `POST /compliance/incidents` — incident reports type Clinical/Medication/DataBreach/Safety/Security/Operational
- `GET /compliance/dashboard/:tenantId` — complianceScore, incidents, auditViolations, overdue

### Frontend

`apps/beyu-health-web/src/app/(app)/compliance/page.tsx` now shows:

- Summary cards: Total Packs 31, ISQua 2, ISO 9, NABH 5, JCI 5
- Dashboard scores: compliant/total progress bar, incidents, audit violations break-glass, overdue
- ISQua section: EEA Principles, governance, standards development, surveyor competence
- ISO section: 9 packs with type certifiable flag, 9001 QMS clauses, 15189 lab requirements
- NABH section: Hospital 5th 10 chapters, Eye Care 3rd specialized differentiator, requirements list AAC/COP/MOM/PRE/HIC/CQI/ROM/FMS/HRM/IMS + Eye Care COP OCT/Cataract/Glaucoma/DR
- JCI section: Hospital 8th 16 chapters, 6 IPSG mandatory list with BEYU mapping (MRN two identifiers, SBAR handover, medication safety, time-out OD/OS/OU laterality, hand hygiene, fall Morse)
- Tanzania + Africa: TZ packs + COHSASA 7th Africa-focused ISQua accredited relevant for Tanzania expansion

### Why Configurable Packs, Not Hard-Coded

Spec §22: Design a compliance framework rather than hard-code one country's laws. Tanzania pack supports MOH/MTUHA/NHIF/TMDA/TRA/data protection, but also international interoperability. BEYU does not hard-code Tanzania, NABH, JCI, ISQua, ISO laws in source — they are data in `compliance_packs` table with `config JSONB`. Country-specific logic never hard-coded in source per CONTRIBUTING.md.

This allows small clinic to start with minimal config while multi-country group operates thousands facilities without changing fundamental domain model per §86.

## Testing

- Migration 0012 applied: 31 packs, 74 requirements
- Typecheck 17 successful, build 11 successful, tests 14 successful 149 passing
- Compliance packs queryable via API, frontend displays grouped by authority

## Success Criteria

Per §87: compliance dashboard for access violations, suspicious access, consent, missing documentation, overdue reviews, clinical incidents, medication incidents, data incidents, audit findings, regulatory submissions — implemented via `compliance_evidence`, `incident_reports`, `access_logs`, `audit_events`, `report_generation_audit`, dashboard aggregation.
