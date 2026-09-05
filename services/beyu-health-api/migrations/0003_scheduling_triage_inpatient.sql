-- Migration 0003: Scheduling, Triage, Inpatient, Queue
CREATE SCHEMA IF NOT EXISTS health_scheduling;

CREATE TABLE health_scheduling.provider_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  practitioner_id UUID NOT NULL REFERENCES health_identity.users(id),
  facility_id UUID NOT NULL REFERENCES health_tenant.facilities(id),
  department_id UUID REFERENCES health_tenant.departments(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_duration_minutes INTEGER NOT NULL DEFAULT 15,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (practitioner_id, facility_id, day_of_week, start_time)
);

CREATE TABLE health_scheduling.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  facility_id UUID NOT NULL REFERENCES health_tenant.facilities(id),
  department_id UUID REFERENCES health_tenant.departments(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  practitioner_id UUID REFERENCES health_identity.users(id),
  service_type TEXT,
  specialty TEXT,
  status TEXT NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('PROPOSED','PENDING','BOOKED','ARRIVED','FULFILLED','CANCELLED','NOSHOW','ENTERED_IN_ERROR','CHECKED_IN','WAITLIST')),
  priority INTEGER NOT NULL DEFAULT 5,
  start TIMESTAMPTZ NOT NULL,
  "end" TIMESTAMPTZ NOT NULL,
  reason TEXT,
  description TEXT,
  is_telemedicine BOOLEAN NOT NULL DEFAULT FALSE,
  is_walk_in BOOLEAN NOT NULL DEFAULT FALSE,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_rule TEXT,
  parent_appointment_id UUID REFERENCES health_scheduling.appointments(id),
  queue_number INTEGER,
  cancellation_reason TEXT,
  created_by UUID REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ("end" > start)
);
CREATE INDEX health_appointments_patient_idx ON health_scheduling.appointments (patient_id, start DESC);
CREATE INDEX health_appointments_practitioner_idx ON health_scheduling.appointments (practitioner_id, start);
CREATE INDEX health_appointments_facility_idx ON health_scheduling.appointments (facility_id, start);
CREATE INDEX health_appointments_status_idx ON health_scheduling.appointments (status);

CREATE TABLE health_scheduling.queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  facility_id UUID NOT NULL REFERENCES health_tenant.facilities(id),
  department_id UUID REFERENCES health_tenant.departments(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'GENERAL' CHECK (type IN ('GENERAL','EMERGENCY','PHARMACY','LAB','RADIOLOGY','OPHTHALMOLOGY','BILLING')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (facility_id, code)
);

CREATE TABLE health_scheduling.queue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  facility_id UUID NOT NULL REFERENCES health_tenant.facilities(id),
  department_id UUID REFERENCES health_tenant.departments(id),
  queue_id UUID NOT NULL REFERENCES health_scheduling.queues(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  appointment_id UUID REFERENCES health_scheduling.appointments(id),
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING','CALLED','IN_SERVICE','COMPLETED','NO_SHOW','CANCELLED','DEFERRED')),
  priority INTEGER NOT NULL DEFAULT 5,
  number INTEGER NOT NULL,
  reason TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  called_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES health_identity.users(id)
);
CREATE INDEX health_queue_entries_queue_idx ON health_scheduling.queue_entries (queue_id, number);
CREATE INDEX health_queue_entries_patient_idx ON health_scheduling.queue_entries (patient_id);

CREATE TABLE health_scheduling.triage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID NOT NULL REFERENCES health_clinical.encounters(id),
  facility_id UUID NOT NULL REFERENCES health_tenant.facilities(id),
  category TEXT NOT NULL CHECK (category IN ('IMMEDIATE','VERY_URGENT','URGENT','STANDARD','NON_URGENT')),
  chief_complaint TEXT NOT NULL,
  vital_signs JSONB,
  acuity_score INTEGER,
  glasgow_coma_scale INTEGER,
  pain_score INTEGER,
  assessed_by UUID NOT NULL REFERENCES health_identity.users(id),
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  disposition TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_scheduling.admissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID NOT NULL REFERENCES health_clinical.encounters(id),
  facility_id UUID NOT NULL REFERENCES health_tenant.facilities(id),
  department_id UUID REFERENCES health_tenant.departments(id),
  bed_id UUID REFERENCES health_tenant.beds(id),
  admission_type TEXT NOT NULL DEFAULT 'ROUTINE' CHECK (admission_type IN ('ROUTINE','EMERGENCY','ELECTIVE','TRANSFER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISCHARGED','TRANSFERRED','CANCELLED','ON_LEAVE')),
  admitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  admitted_by UUID REFERENCES health_identity.users(id),
  discharge_plan TEXT,
  discharge_at TIMESTAMPTZ,
  discharged_by UUID REFERENCES health_identity.users(id),
  discharge_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_scheduling.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID NOT NULL REFERENCES health_clinical.encounters(id),
  from_facility_id UUID REFERENCES health_tenant.facilities(id),
  to_facility_id UUID REFERENCES health_tenant.facilities(id),
  from_bed_id UUID REFERENCES health_tenant.beds(id),
  to_bed_id UUID REFERENCES health_tenant.beds(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVED','IN_PROGRESS','COMPLETED','CANCELLED','REJECTED')),
  requested_by UUID REFERENCES health_identity.users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
