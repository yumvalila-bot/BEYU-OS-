-- Migration 0007: Ambulance, Telemedicine, Workforce
CREATE SCHEMA IF NOT EXISTS health_ambulance;
CREATE SCHEMA IF NOT EXISTS health_telemedicine;
CREATE SCHEMA IF NOT EXISTS health_workforce;

CREATE TABLE health_ambulance.ambulances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  vehicle_number TEXT NOT NULL,
  registration_plate TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  type TEXT NOT NULL CHECK (type IN ('BASIC','ALS','NEONATAL','AIR','MICU')),
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','DISPATCHED','ON_SCENE','TRANSPORTING','AT_DESTINATION','OUT_OF_SERVICE','MAINTENANCE')),
  base_facility_id UUID REFERENCES health_tenant.facilities(id),
  base_station TEXT,
  capacity INTEGER NOT NULL DEFAULT 1,
  equipment JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_latitude DOUBLE PRECISION,
  last_longitude DOUBLE PRECISION,
  last_location_at TIMESTAMPTZ,
  last_maintenance_at TIMESTAMPTZ,
  next_maintenance_at TIMESTAMPTZ,
  mileage INTEGER,
  fuel_level INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, vehicle_number)
);

CREATE TABLE health_ambulance.ambulance_crew (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambulance_id UUID NOT NULL REFERENCES health_ambulance.ambulances(id) ON DELETE CASCADE,
  practitioner_id UUID NOT NULL REFERENCES health_identity.users(id),
  role TEXT NOT NULL CHECK (role IN ('DRIVER','PARAMEDIC','EMT','DOCTOR','NURSE','OTHER')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at TIMESTAMPTZ
);

CREATE TABLE health_ambulance.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  request_number TEXT NOT NULL,
  patient_id UUID REFERENCES health_patient.patients(id),
  caller_name TEXT NOT NULL,
  caller_phone TEXT NOT NULL,
  caller_relation TEXT,
  incident_type TEXT NOT NULL,
  chief_complaint TEXT,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ASSIGNED','DISPATCHED','ON_SCENE','TRANSPORTING','COMPLETED','CANCELLED','DUPLICATE')),
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  pickup_address TEXT,
  pickup_facility_id UUID REFERENCES health_tenant.facilities(id),
  destination_lat DOUBLE PRECISION,
  destination_lng DOUBLE PRECISION,
  destination_address TEXT,
  destination_facility_id UUID REFERENCES health_tenant.facilities(id),
  estimated_distance_km NUMERIC,
  estimated_duration_minutes INTEGER,
  special_instructions TEXT,
  created_by UUID REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_number)
);

CREATE TABLE health_ambulance.dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  ambulance_id UUID NOT NULL REFERENCES health_ambulance.ambulances(id),
  request_id UUID NOT NULL REFERENCES health_ambulance.emergency_requests(id),
  dispatch_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED','EN_ROUTE','ON_SCENE','TRANSPORTING','COMPLETED','CANCELLED','FAILED')),
  dispatched_by UUID REFERENCES health_identity.users(id),
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  en_route_at TIMESTAMPTZ,
  arrived_scene_at TIMESTAMPTZ,
  departed_scene_at TIMESTAMPTZ,
  arrived_destination_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  crew JSONB NOT NULL DEFAULT '[]'::jsonb,
  patient_condition TEXT,
  handover_notes TEXT,
  mileage_start INTEGER,
  mileage_end INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, dispatch_number)
);

CREATE TABLE health_ambulance.maintenance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambulance_id UUID NOT NULL REFERENCES health_ambulance.ambulances(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('ROUTINE','REPAIR','INSPECTION','FUEL','CLEANING','OTHER')),
  description TEXT NOT NULL,
  cost_minor BIGINT,
  performed_by TEXT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Telemedicine
CREATE TABLE health_telemedicine.telemedicine_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  appointment_id UUID NOT NULL REFERENCES health_scheduling.appointments(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  practitioner_id UUID NOT NULL REFERENCES health_identity.users(id),
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  session_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','WAITING_ROOM','IN_PROGRESS','COMPLETED','CANCELLED','FAILED','NO_SHOW')),
  platform TEXT NOT NULL DEFAULT 'WEBRTC' CHECK (platform IN ('WEBRTC','ZOOM','TWILIO','CUSTOM','JITSI')),
  join_url TEXT,
  practitioner_join_url TEXT,
  patient_join_url TEXT,
  room_id TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  recording_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  recording_url TEXT,
  recording_consent BOOLEAN NOT NULL DEFAULT FALSE,
  quality_score INTEGER,
  technical_issues TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, session_number)
);

CREATE TABLE health_telemedicine.telemedicine_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES health_telemedicine.telemedicine_sessions(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES health_identity.users(id),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('PATIENT','PRACTITIONER','SYSTEM')),
  message TEXT NOT NULL,
  attachment_url TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_telemedicine.telemedicine_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  session_id UUID REFERENCES health_telemedicine.telemedicine_sessions(id),
  consent_type TEXT NOT NULL CHECK (consent_type IN ('TELEMEDICINE','RECORDING','DATA_SHARING')),
  granted BOOLEAN NOT NULL DEFAULT FALSE,
  granted_at TIMESTAMPTZ,
  document_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workforce
CREATE TABLE health_workforce.practitioners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  user_id UUID REFERENCES health_identity.users(id),
  code TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  middle_name TEXT,
  gender TEXT,
  date_of_birth DATE,
  specialty TEXT,
  sub_specialty TEXT,
  qualification TEXT,
  license_number TEXT,
  license_authority TEXT,
  license_expiry DATE,
  phone TEXT,
  email TEXT,
  emergency_contact JSONB,
  employment_type TEXT CHECK (employment_type IN ('FULL_TIME','PART_TIME','CONTRACT','LOCUM','VOLUNTEER')),
  employment_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (employment_status IN ('ACTIVE','INACTIVE','SUSPENDED','TERMINATED','ON_LEAVE')),
  hire_date DATE,
  department_id UUID REFERENCES health_tenant.departments(id),
  primary_facility_id UUID REFERENCES health_tenant.facilities(id),
  photo_url TEXT,
  bio TEXT,
  languages TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE health_workforce.practitioner_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL REFERENCES health_workforce.practitioners(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES health_tenant.facilities(id),
  department_id UUID REFERENCES health_tenant.departments(id),
  role TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE
);

CREATE TABLE health_workforce.credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL REFERENCES health_workforce.practitioners(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('LICENSE','CERTIFICATION','DEGREE','TRAINING','OTHER')),
  name TEXT NOT NULL,
  issuer TEXT NOT NULL,
  issue_date DATE NOT NULL,
  expiry_date DATE,
  credential_number TEXT,
  document_url TEXT,
  verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING','VERIFIED','REJECTED','EXPIRED')),
  verified_by UUID REFERENCES health_identity.users(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_workforce.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  practitioner_id UUID NOT NULL REFERENCES health_workforce.practitioners(id),
  facility_id UUID NOT NULL REFERENCES health_tenant.facilities(id),
  department_id UUID REFERENCES health_tenant.departments(id),
  shift_number TEXT NOT NULL,
  start TIMESTAMPTZ NOT NULL,
  "end" TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('DAY','NIGHT','ON_CALL','LEAVE','TRAINING','OTHER')),
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED','NO_SHOW')),
  is_overtime BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ("end" > start),
  UNIQUE (tenant_id, shift_number)
);

CREATE TABLE health_workforce.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  practitioner_id UUID NOT NULL REFERENCES health_workforce.practitioners(id),
  shift_id UUID REFERENCES health_workforce.shifts(id),
  check_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_out TIMESTAMPTZ,
  check_in_method TEXT CHECK (check_in_method IN ('MANUAL','BIOMETRIC','GPS','QR','SYSTEM')),
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'PRESENT' CHECK (status IN ('PRESENT','ABSENT','LATE','HALF_DAY','ON_LEAVE')),
  notes TEXT
);

CREATE TABLE health_workforce.training_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL REFERENCES health_workforce.practitioners(id) ON DELETE CASCADE,
  training_name TEXT NOT NULL,
  provider TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('SCHEDULED','IN_PROGRESS','COMPLETED','FAILED','CANCELLED')),
  certificate_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
