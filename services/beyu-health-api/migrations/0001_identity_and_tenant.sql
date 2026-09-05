-- BEYU HEALTH OS Migration 0001: Identity and Tenant Management
-- Spec §6, §7, §65

CREATE SCHEMA IF NOT EXISTS health_identity;
CREATE SCHEMA IF NOT EXISTS health_tenant;

-- Identity: health users linked to BEYU OS global identity
CREATE TABLE health_identity.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID,
  email TEXT NOT NULL,
  phone TEXT,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','INVITED','DISABLED')),
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret TEXT,
  last_login_at TIMESTAMPTZ,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  is_service_account BOOLEAN NOT NULL DEFAULT FALSE,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX health_users_email_key ON health_identity.users (lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX health_users_identity_idx ON health_identity.users (identity_id);

CREATE TABLE health_identity.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_clinical BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO health_identity.roles (code, name, description, is_system, is_clinical) VALUES
('SUPER_ADMIN','Super Admin','Full system access', true, false),
('TENANT_ADMIN','Tenant Admin','Tenant administration', false, false),
('FACILITY_ADMIN','Facility Admin','Facility administration', false, false),
('DOCTOR','Doctor','Medical doctor', false, true),
('CLINICAL_OFFICER','Clinical Officer','Clinical officer', false, true),
('NURSE','Nurse','Nursing staff', false, true),
('OPTOMETRIST','Optometrist','Eye care - optometry', false, true),
('OPHTHALMOLOGIST','Ophthalmologist','Eye surgeon and specialist', false, true),
('PHARMACIST','Pharmacist','Pharmacy operations', false, true),
('LABORATORY_SCIENTIST','Lab Scientist','Laboratory', false, true),
('RADIOLOGIST','Radiologist','Radiology interpretation', false, true),
('RADIOGRAPHER','Radiographer','Imaging acquisition', false, true),
('RECEPTIONIST','Receptionist','Front desk', false, false),
('CASHIER','Cashier','Billing and payments', false, false),
('ACCOUNTANT','Accountant','Financial', false, false),
('PROCUREMENT_OFFICER','Procurement Officer','Procurement', false, false),
('STOREKEEPER','Storekeeper','Inventory', false, false),
('AMBULANCE_CREW','Ambulance Crew','Emergency transport', false, true),
('EXECUTIVE','Executive','Executive dashboard', false, false),
('PATIENT','Patient','Patient portal access', false, false),
('AUDITOR','Auditor','Audit and compliance', true, false)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE health_identity.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  UNIQUE (resource_type, action)
);

-- Seed permissions covering all domains
INSERT INTO health_identity.permissions (resource_type, action) VALUES
('patient','CREATE'),('patient','READ'),('patient','UPDATE'),('patient','DELETE'),('patient','SEARCH'),
('encounter','CREATE'),('encounter','READ'),('encounter','UPDATE'),('encounter','DELETE'),
('clinical_note','CREATE'),('clinical_note','READ'),('clinical_note','UPDATE'),
('appointment','CREATE'),('appointment','READ'),('appointment','UPDATE'),('appointment','DELETE'),
('pharmacy','CREATE'),('pharmacy','READ'),('pharmacy','DISPENSE'),('pharmacy','MANAGE'),
('laboratory','CREATE'),('laboratory','READ'),('laboratory','VERIFY'),('laboratory','MANAGE'),
('radiology','CREATE'),('radiology','READ'),('radiology','REPORT'),('radiology','MANAGE'),
('ophthalmology','CREATE'),('ophthalmology','READ'),('ophthalmology','UPDATE'),('ophthalmology','MANAGE'),
('billing','CREATE'),('billing','READ'),('billing','UPDATE'),('billing','REFUND'),
('insurance','CREATE'),('insurance','READ'),('insurance','SUBMIT'),
('inventory','CREATE'),('inventory','READ'),('inventory','TRANSFER'),('inventory','ADJUST'),
('ambulance','CREATE'),('ambulance','READ'),('ambulance','DISPATCH'),
('telemedicine','CREATE'),('telemedicine','READ'),('telemedicine','JOIN'),
('workforce','CREATE'),('workforce','READ'),('workforce','MANAGE'),
('documents','CREATE'),('documents','READ'),('documents','DELETE'),
('reports','READ'),('reports','EXPORT'),
('compliance','READ'),('compliance','MANAGE'),
('tenant','READ'),('tenant','MANAGE'),
('audit','READ'),
('ai','QUERY'),('ai','RECOMMEND')
ON CONFLICT (resource_type, action) DO NOTHING;

CREATE TABLE health_identity.role_permissions (
  role_id UUID NOT NULL REFERENCES health_identity.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES health_identity.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Super admin gets all permissions
INSERT INTO health_identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM health_identity.roles r CROSS JOIN health_identity.permissions p WHERE r.code='SUPER_ADMIN'
ON CONFLICT DO NOTHING;

-- Doctor role permissions
INSERT INTO health_identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM health_identity.roles r JOIN health_identity.permissions p ON (
  (p.resource_type='patient' AND p.action IN ('CREATE','READ','UPDATE','SEARCH')) OR
  (p.resource_type='encounter' AND p.action IN ('CREATE','READ','UPDATE')) OR
  (p.resource_type='clinical_note' AND p.action IN ('CREATE','READ','UPDATE')) OR
  (p.resource_type='appointment' AND p.action IN ('CREATE','READ','UPDATE')) OR
  (p.resource_type='pharmacy' AND p.action IN ('CREATE','READ')) OR
  (p.resource_type='laboratory' AND p.action IN ('CREATE','READ')) OR
  (p.resource_type='radiology' AND p.action IN ('CREATE','READ')) OR
  (p.resource_type='ophthalmology' AND p.action IN ('CREATE','READ','UPDATE')) OR
  (p.resource_type='billing' AND p.action='READ') OR
  (p.resource_type='documents' AND p.action IN ('CREATE','READ')) OR
  (p.resource_type='ai' AND p.action IN ('QUERY','RECOMMEND'))
) WHERE r.code IN ('DOCTOR','CLINICAL_OFFICER','OPHTHALMOLOGIST')
ON CONFLICT DO NOTHING;

-- Ophthalmologist extra
INSERT INTO health_identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM health_identity.roles r JOIN health_identity.permissions p ON (
  p.resource_type='ophthalmology' AND p.action='MANAGE'
) WHERE r.code='OPHTHALMOLOGIST'
ON CONFLICT DO NOTHING;

-- Patient read own
INSERT INTO health_identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM health_identity.roles r JOIN health_identity.permissions p ON (
  (p.resource_type='patient' AND p.action='READ') OR
  (p.resource_type='appointment' AND p.action IN ('CREATE','READ')) OR
  (p.resource_type='documents' AND p.action='READ') OR
  (p.resource_type='billing' AND p.action='READ') OR
  (p.resource_type='telemedicine' AND p.action IN ('READ','JOIN'))
) WHERE r.code='PATIENT'
ON CONFLICT DO NOTHING;

CREATE TABLE health_identity.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES health_identity.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES health_identity.roles(id) ON DELETE CASCADE,
  tenant_id UUID,
  facility_id UUID,
  department_id UUID,
  granted_by UUID REFERENCES health_identity.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE (user_id, role_id, tenant_id, facility_id)
);
CREATE INDEX health_user_roles_user_idx ON health_identity.user_roles (user_id);

CREATE TABLE health_identity.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES health_identity.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  facility_id UUID,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INVITED','REVOKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, facility_id)
);

CREATE TABLE health_identity.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES health_identity.users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  mfa_satisfied BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address TEXT,
  user_agent TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX health_sessions_user_idx ON health_identity.sessions (user_id);

-- TENANT MANAGEMENT
CREATE TABLE health_tenant.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('HOSPITAL_GROUP','HOSPITAL','CLINIC','MEDICAL_CENTER','EYE_CENTER','PHARMACY','LABORATORY','IMAGING_CENTER','AMBULANCE_SERVICE','TELEMEDICINE_ORG','HEALTH_INSURER','CORPORATE_HEALTH','NGO_HEALTH','PUBLIC_HEALTH','INDIVIDUAL_PRACTICE')),
  status TEXT NOT NULL DEFAULT 'PROVISIONING' CHECK (status IN ('PROVISIONING','ACTIVE','SUSPENDED','CLOSED')),
  parent_tenant_id UUID REFERENCES health_tenant.tenants(id),
  country_code TEXT NOT NULL DEFAULT 'TZ',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_residency JSONB NOT NULL DEFAULT '{"storageRegion":"tz","backupRegion":"tz","processingRegion":"tz"}'::jsonb,
  country_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX health_tenants_parent_idx ON health_tenant.tenants (parent_tenant_id);

CREATE TABLE health_tenant.facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('HOSPITAL','CLINIC','EYE_CLINIC','PHARMACY','LABORATORY','IMAGING_CENTER','AMBULANCE_BASE','WAREHOUSE','CORPORATE_OFFICE')),
  code TEXT NOT NULL,
  parent_facility_id UUID REFERENCES health_tenant.facilities(id),
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  contact_phone TEXT,
  contact_email TEXT,
  operating_hours JSONB,
  licenses JSONB NOT NULL DEFAULT '[]'::jsonb,
  accreditation JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, code)
);
CREATE INDEX health_facilities_tenant_idx ON health_tenant.facilities (tenant_id);

CREATE TABLE health_tenant.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES health_tenant.facilities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  specialty TEXT,
  parent_department_id UUID REFERENCES health_tenant.departments(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX health_departments_facility_idx ON health_tenant.departments (facility_id);

CREATE TABLE health_tenant.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES health_tenant.facilities(id) ON DELETE CASCADE,
  department_id UUID REFERENCES health_tenant.departments(id),
  name TEXT NOT NULL,
  room_type TEXT NOT NULL CHECK (room_type IN ('CONSULTATION','WARD','OPERATING_THEATRE','LABORATORY','IMAGING','PHARMACY','STORAGE','OTHER')),
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','OCCUPIED','OUT_OF_SERVICE','RESERVED')),
  capacity INTEGER NOT NULL DEFAULT 1,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_tenant.beds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES health_tenant.facilities(id) ON DELETE CASCADE,
  room_id UUID REFERENCES health_tenant.rooms(id),
  ward_id UUID,
  bed_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','OCCUPIED','RESERVED','OUT_OF_SERVICE','CLEANING')),
  patient_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (facility_id, bed_number)
);

CREATE TABLE health_tenant.equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES health_tenant.facilities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model TEXT,
  manufacturer TEXT,
  serial_number TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','MAINTENANCE','OUT_OF_SERVICE','RETIRED')),
  location TEXT,
  last_calibration_at TIMESTAMPTZ,
  next_calibration_at TIMESTAMPTZ,
  maintenance_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
