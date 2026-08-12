-- BEYU HEALTH OS Migration 0002: Patient and Clinical Domain
-- Spec §8, §9, §36

CREATE SCHEMA IF NOT EXISTS health_patient;
CREATE SCHEMA IF NOT EXISTS health_clinical;

-- Patients with unified longitudinal record
CREATE TABLE health_patient.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  mrn TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  middle_name TEXT,
  gender TEXT NOT NULL CHECK (gender IN ('MALE','FEMALE','OTHER','UNKNOWN')),
  date_of_birth DATE NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  district TEXT,
  region TEXT,
  country_code TEXT NOT NULL DEFAULT 'TZ',
  nationality TEXT,
  national_id TEXT,
  passport_number TEXT,
  blood_group TEXT CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-') OR blood_group IS NULL),
  preferred_language TEXT NOT NULL DEFAULT 'en',
  marital_status TEXT,
  occupation TEXT,
  photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','DECEASED','MERGED')),
  deceased_date DATE,
  deceased_reason TEXT,
  merged_into_patient_id UUID REFERENCES health_patient.patients(id),
  created_by UUID REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, mrn)
);
CREATE INDEX health_patients_tenant_idx ON health_patient.patients (tenant_id);
CREATE INDEX health_patients_mrn_idx ON health_patient.patients (mrn);
CREATE INDEX health_patients_name_idx ON health_patient.patients (last_name, first_name);
CREATE INDEX health_patients_search_idx ON health_patient.patients USING gin (
  to_tsvector('english', first_name || ' ' || last_name || ' ' || COALESCE(phone,'') || ' ' || mrn)
);

CREATE TABLE health_patient.patient_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id) ON DELETE CASCADE,
  system TEXT NOT NULL,
  value TEXT NOT NULL,
  type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (system, value)
);
CREATE INDEX health_patient_identifiers_patient_idx ON health_patient.patient_identifiers (patient_id);

CREATE TABLE health_patient.emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_patient.patient_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id) ON DELETE CASCADE,
  related_patient_id UUID REFERENCES health_patient.patients(id),
  related_person_name TEXT,
  relationship_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_patient.consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('GENERAL','TREATMENT','DATA_SHARING','RESEARCH','MARKETING','TELEMEDICINE','OPHTHALMOLOGY_IMAGING')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED','EXPIRED','DRAFT')),
  purpose TEXT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  granted_by UUID REFERENCES health_identity.users(id),
  document_id UUID,
  policy_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX health_consents_patient_idx ON health_patient.consents (patient_id);

CREATE TABLE health_patient.allergies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id) ON DELETE CASCADE,
  code TEXT,
  display TEXT NOT NULL,
  system TEXT,
  criticality TEXT NOT NULL CHECK (criticality IN ('LOW','HIGH','UNABLE_TO_ASSESS')),
  type TEXT NOT NULL DEFAULT 'ALLERGY' CHECK (type IN ('ALLERGY','INTOLERANCE')),
  category TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','RESOLVED')),
  recorded_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorder_id UUID REFERENCES health_identity.users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_patient.medical_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('MEDICAL','SURGICAL','FAMILY','SOCIAL','OCULAR','SYSTEMIC','MEDICATION','TRAUMA')),
  description TEXT NOT NULL,
  code TEXT,
  recorded_date DATE,
  recorder_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CLINICAL DOMAIN
CREATE TABLE health_clinical.encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  facility_id UUID NOT NULL REFERENCES health_tenant.facilities(id),
  department_id UUID REFERENCES health_tenant.departments(id),
  practitioner_id UUID REFERENCES health_identity.users(id),
  class TEXT NOT NULL CHECK (class IN ('AMBULATORY','EMERGENCY','INPATIENT','OUTPATIENT','HOME','VIRTUAL','FIELD')),
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','ARRIVED','TRIAGED','IN_PROGRESS','ON_LEAVE','FINISHED','CANCELLED','DISCHARGED')),
  type TEXT,
  priority TEXT CHECK (priority IN ('ROUTINE','URGENT','ASAP','STAT')),
  reason TEXT,
  reason_code TEXT,
  period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_end TIMESTAMPTZ,
  bed_id UUID REFERENCES health_tenant.beds(id),
  parent_encounter_id UUID REFERENCES health_clinical.encounters(id),
  created_by UUID REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX health_encounters_patient_idx ON health_clinical.encounters (patient_id, period_start DESC);
CREATE INDEX health_encounters_tenant_idx ON health_clinical.encounters (tenant_id);
CREATE INDEX health_encounters_facility_idx ON health_clinical.encounters (facility_id);

CREATE TABLE health_clinical.conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  code TEXT NOT NULL,
  display TEXT NOT NULL,
  system TEXT NOT NULL DEFAULT 'ICD-10' CHECK (system IN ('ICD-10','ICD-11','SNOMED-CT','CUSTOM')),
  clinical_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (clinical_status IN ('ACTIVE','RECURRENCE','RELAPSE','INACTIVE','REMISSION','RESOLVED')),
  verification_status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (verification_status IN ('UNCONFIRMED','PROVISIONAL','DIFFERENTIAL','CONFIRMED','REFUTED','ENTERED_IN_ERROR')),
  category TEXT,
  severity TEXT CHECK (severity IN ('MILD','MODERATE','SEVERE')),
  onset_date DATE,
  abatement_date DATE,
  recorded_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorder_id UUID REFERENCES health_identity.users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_clinical.observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  code TEXT NOT NULL,
  loinc_code TEXT,
  display TEXT NOT NULL,
  system TEXT,
  value_quantity NUMERIC,
  value_unit TEXT,
  value_string TEXT,
  value_boolean BOOLEAN,
  value_json JSONB,
  interpretation TEXT,
  effective_datetime TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'FINAL' CHECK (status IN ('REGISTERED','PRELIMINARY','FINAL','AMENDED','CANCELLED','ENTERED_IN_ERROR')),
  performer_id UUID REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX health_observations_patient_idx ON health_clinical.observations (patient_id, effective_datetime DESC);

CREATE TABLE health_clinical.vital_signs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  type TEXT NOT NULL CHECK (type IN ('BLOOD_PRESSURE','HEART_RATE','TEMPERATURE','RESPIRATORY_RATE','SPO2','WEIGHT','HEIGHT','BMI','BLOOD_GLUCOSE','OTHER')),
  systolic INTEGER,
  diastolic INTEGER,
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID REFERENCES health_identity.users(id)
);
CREATE INDEX health_vitals_patient_idx ON health_clinical.vital_signs (patient_id, recorded_at DESC);

CREATE TABLE health_clinical.clinical_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  author_id UUID NOT NULL REFERENCES health_identity.users(id),
  type TEXT NOT NULL CHECK (type IN ('PROGRESS','ADMISSION','DISCHARGE','PROCEDURE','CONSULTATION','NURSING','TRIAGE','OPHTHALMOLOGY','OTHER')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','FINAL','AMENDED','ENTERED_IN_ERROR')),
  confidentiality TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  parent_note_id UUID REFERENCES health_clinical.clinical_notes(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_clinical.care_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','ON_HOLD','REVOKED','COMPLETED','ENTERED_IN_ERROR')),
  intent TEXT NOT NULL DEFAULT 'PLAN' CHECK (intent IN ('PROPOSAL','PLAN','ORDER','OPTION')),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  author_id UUID NOT NULL REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_clinical.procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  code TEXT NOT NULL,
  display TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PREPARATION','IN_PROGRESS','NOT_DONE','ON_HOLD','STOPPED','COMPLETED','ENTERED_IN_ERROR','UNKNOWN')),
  performed_datetime TIMESTAMPTZ,
  performer_id UUID REFERENCES health_identity.users(id),
  location TEXT,
  complication TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_clinical.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  from_facility_id UUID REFERENCES health_tenant.facilities(id),
  to_facility_id UUID REFERENCES health_tenant.facilities(id),
  to_practitioner_id UUID REFERENCES health_identity.users(id),
  specialty TEXT,
  reason TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('ROUTINE','URGENT','STAT')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','CANCELLED','COMPLETED','REVOKED')),
  author_id UUID REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiry_date DATE
);

CREATE TABLE health_clinical.care_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  name TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PROPOSED','ACTIVE','SUSPENDED','INACTIVE','ENTERED_IN_ERROR')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_clinical.care_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_team_id UUID NOT NULL REFERENCES health_clinical.care_teams(id) ON DELETE CASCADE,
  practitioner_id UUID NOT NULL REFERENCES health_identity.users(id),
  role TEXT,
  period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_end TIMESTAMPTZ
);
