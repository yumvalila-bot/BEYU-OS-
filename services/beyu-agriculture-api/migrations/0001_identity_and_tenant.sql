-- 0001 — IDENTITY AND TENANT (BEYU AGRICULTURE OS)
--
-- Sector OS identity layer. Users authenticate against THIS database with
-- sector-scoped credentials (JWT audience `beyu-agriculture-os`). The BEYU
-- control plane remains the system of record for corporate identity; the
-- optional identity_id column links a user back to a control-plane
-- GlobalUserId when federation provisioning links them.

-- gen_random_uuid() is core PostgreSQL (13+). pgcrypto is only needed on
-- very old servers; tolerate its absence (PGLite has no extensions).
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgcrypto not available; core gen_random_uuid() is used';
END $$;

CREATE SCHEMA IF NOT EXISTS agri_identity;
CREATE SCHEMA IF NOT EXISTS agri_tenant;

-- ── Users ────────────────────────────────────────────────────────────────

CREATE TABLE agri_identity.users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id    UUID,                          -- link to BEYU control-plane identity when provisioned
  email          TEXT NOT NULL,
  display_name   TEXT NOT NULL,
  password_hash  TEXT,                          -- NULL => cannot log in (federation-only user)
  status         TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('ACTIVE','SUSPENDED','PENDING','LOCKED')),
  mfa_enabled    BOOLEAN NOT NULL DEFAULT false,
  failed_logins  INTEGER NOT NULL DEFAULT 0,
  locked_until   TIMESTAMPTZ,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT users_email_unique UNIQUE (email)
);
CREATE INDEX agri_users_identity_idx ON agri_identity.users (identity_id);

-- ── RBAC: roles, permissions, mapping ────────────────────────────────────

CREATE TABLE agri_identity.roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE agri_identity.permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type TEXT NOT NULL,
  action        TEXT NOT NULL CHECK (action IN ('CREATE','READ','UPDATE','DELETE','SEARCH','APPROVE')),
  CONSTRAINT permissions_unique UNIQUE (resource_type, action)
);

CREATE TABLE agri_identity.role_permissions (
  role_id       UUID NOT NULL REFERENCES agri_identity.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES agri_identity.permissions(id) ON DELETE CASCADE,
  CONSTRAINT role_permissions_pk PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE agri_identity.user_roles (
  user_id UUID NOT NULL REFERENCES agri_identity.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES agri_identity.roles(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID,
  CONSTRAINT user_roles_pk PRIMARY KEY (user_id, role_id)
);
CREATE INDEX agri_user_roles_user_idx ON agri_identity.user_roles (user_id);

-- ── Tenancy ──────────────────────────────────────────────────────────────

CREATE TABLE agri_identity.memberships (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES agri_identity.users(id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL,
  farm_id        UUID,
  role_in_tenant TEXT NOT NULL DEFAULT 'MEMBER',
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT memberships_user_tenant_unique UNIQUE (user_id, tenant_id)
);
CREATE INDEX agri_memberships_tenant_idx ON agri_identity.memberships (tenant_id);

CREATE TABLE agri_identity.sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES agri_identity.users(id) ON DELETE CASCADE,
  refresh_token_hash  TEXT NOT NULL,
  mfa_satisfied       BOOLEAN NOT NULL DEFAULT false,
  ip_address          TEXT,
  user_agent          TEXT,
  expires_at          TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sessions_refresh_hash_unique UNIQUE (refresh_token_hash)
);
CREATE INDEX agri_sessions_user_idx ON agri_identity.sessions (user_id);

-- ── Tenants (agriculture enterprises) ────────────────────────────────────

CREATE TABLE agri_tenant.tenants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  type              TEXT NOT NULL CHECK (type IN ('AGRIBUSINESS_GROUP','COMMERCIAL_FARM','COOPERATIVE','SMALLHOLDER_ASSOCIATION','CONTRACT_FARMING_SCHEME','PROCESSING_COMPANY','EXPORTER','RESEARCH_INSTITUTE')),
  status            TEXT NOT NULL DEFAULT 'PROVISIONING' CHECK (status IN ('PROVISIONING','ACTIVE','SUSPENDED','CLOSED')),
  country_code      TEXT NOT NULL,
  parent_tenant_id  UUID REFERENCES agri_tenant.tenants(id),
  settings          JSONB NOT NULL DEFAULT '{}',
  data_residency    JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX agri_tenants_parent_idx ON agri_tenant.tenants (parent_tenant_id);
CREATE INDEX agri_tenants_country_idx ON agri_tenant.tenants (country_code);

-- ── RBAC seed data ───────────────────────────────────────────────────────

INSERT INTO agri_identity.roles (code, name, description) VALUES
  ('SUPER_ADMIN', 'Super Administrator', 'Full cross-tenant administration of Agriculture OS. Bypasses permission checks.'),
  ('FARM_MANAGER', 'Farm Manager', 'Runs farms: fields, crop cycles, activities, harvests, work orders.'),
  ('AGRONOMIST', 'Agronomist', 'Crop advisory: reads and plans fields, cycles, soil and activities.'),
  ('LIVESTOCK_MANAGER', 'Livestock Manager', 'Herds, animals, health events and production records.'),
  ('INVENTORY_MANAGER', 'Inventory Manager', 'Warehouses, input items and stock movements.'),
  ('PROCUREMENT_OFFICER', 'Procurement Officer', 'Suppliers, buyers, purchase orders, sales orders, contracts.'),
  ('EQUIPMENT_MANAGER', 'Equipment Manager', 'Machinery, maintenance and fuel logs.'),
  ('COMPLIANCE_OFFICER', 'Compliance Officer', 'Certifications, inspections and traceability.'),
  ('FARM_WORKER', 'Farm Worker', 'Executes assigned activities; limited read of own farm data.'),
  ('AUDITOR', 'Auditor', 'Read-only cross-tenant access including audit trail.');

-- Permission universe: every managed resource × action.
INSERT INTO agri_identity.permissions (resource_type, action)
SELECT r.resource, a.action
FROM (VALUES
  ('tenant'),('user'),('farm'),('field'),('soil_record'),('weather_observation'),
  ('crop'),('crop_cycle'),('field_activity'),('harvest'),('storage_lot'),
  ('herd'),('animal'),('animal_health_event'),('production_record'),
  ('warehouse'),('input_item'),('stock_movement'),
  ('supplier'),('buyer'),('purchase_order'),('sales_order'),('contract'),
  ('equipment'),('maintenance_log'),('fuel_log'),('worker'),('work_order'),
  ('certification'),('inspection'),('report'),('audit')
) AS r(resource)
CROSS JOIN (VALUES ('CREATE'),('READ'),('UPDATE'),('DELETE'),('SEARCH'),('APPROVE')) AS a(action);

-- FARM_MANAGER: everything operational, no users/audit, no tenant admin.
INSERT INTO agri_identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM agri_identity.roles r, agri_identity.permissions p
WHERE r.code='FARM_MANAGER' AND p.resource_type IN ('farm','field','soil_record','weather_observation','crop','crop_cycle','field_activity','harvest','storage_lot','work_order','worker','report');

-- AGRONOMIST: read/search + plan cycles + record activities and soil data.
INSERT INTO agri_identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM agri_identity.roles r, agri_identity.permissions p
WHERE r.code='AGRONOMIST' AND p.resource_type IN ('farm','field','soil_record','weather_observation','crop','crop_cycle','field_activity','report')
  AND p.action IN ('CREATE','READ','UPDATE','SEARCH');

-- LIVESTOCK_MANAGER.
INSERT INTO agri_identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM agri_identity.roles r, agri_identity.permissions p
WHERE r.code='LIVESTOCK_MANAGER' AND p.resource_type IN ('herd','animal','animal_health_event','production_record','farm','report')
  AND p.action IN ('CREATE','READ','UPDATE','DELETE','SEARCH');

-- INVENTORY_MANAGER.
INSERT INTO agri_identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM agri_identity.roles r, agri_identity.permissions p
WHERE r.code='INVENTORY_MANAGER' AND p.resource_type IN ('warehouse','input_item','stock_movement','storage_lot','report')
  AND p.action IN ('CREATE','READ','UPDATE','DELETE','SEARCH');

-- PROCUREMENT_OFFICER.
INSERT INTO agri_identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM agri_identity.roles r, agri_identity.permissions p
WHERE r.code='PROCUREMENT_OFFICER' AND p.resource_type IN ('supplier','buyer','purchase_order','sales_order','contract','report')
  AND p.action IN ('CREATE','READ','UPDATE','SEARCH','APPROVE');

-- EQUIPMENT_MANAGER.
INSERT INTO agri_identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM agri_identity.roles r, agri_identity.permissions p
WHERE r.code='EQUIPMENT_MANAGER' AND p.resource_type IN ('equipment','maintenance_log','fuel_log','report')
  AND p.action IN ('CREATE','READ','UPDATE','DELETE','SEARCH');

-- COMPLIANCE_OFFICER.
INSERT INTO agri_identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM agri_identity.roles r, agri_identity.permissions p
WHERE r.code='COMPLIANCE_OFFICER' AND p.resource_type IN ('certification','inspection','storage_lot','farm','report')
  AND p.action IN ('CREATE','READ','UPDATE','SEARCH');

-- FARM_WORKER: read farm/field/cycle, update+read activities, read work orders.
INSERT INTO agri_identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM agri_identity.roles r, agri_identity.permissions p
WHERE r.code='FARM_WORKER' AND (
  (p.resource_type IN ('farm','field','crop','crop_cycle','work_order') AND p.action IN ('READ','SEARCH')) OR
  (p.resource_type='field_activity' AND p.action IN ('READ','UPDATE','CREATE'))
);

-- AUDITOR: read/search everything including audit. No writes ever.
INSERT INTO agri_identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM agri_identity.roles r, agri_identity.permissions p
WHERE r.code='AUDITOR' AND p.action IN ('READ','SEARCH');

-- user + tenant administration is SUPER_ADMIN only (guard bypasses for it);
-- no other role receives 'user' or 'tenant' permissions at all.
