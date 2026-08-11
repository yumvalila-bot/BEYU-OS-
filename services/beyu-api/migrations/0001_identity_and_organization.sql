-- =====================================================================
-- BEYU OS — Migration 0001
-- Logical domains: identity, organization
-- Spec: §47, §48, §49
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS organization;

-- ---------------------------------------------------------------------
-- IDENTITY INTEGRATION (spec §17, §48)
-- BEYU OS integrates with the shared BEYU identity layer. One canonical
-- identity per person; each OS independently authorizes data access.
-- ---------------------------------------------------------------------

CREATE TABLE identity.users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Canonical BEYU identity shared across the ecosystem.
  identity_id       UUID NOT NULL,
  email             TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  password_hash     TEXT,
  status            TEXT NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE','SUSPENDED','INVITED','DISABLED')),
  mfa_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret        TEXT,
  last_login_at     TIMESTAMPTZ,
  failed_logins     INTEGER NOT NULL DEFAULT 0,
  locked_until      TIMESTAMPTZ,
  is_service_account BOOLEAN NOT NULL DEFAULT FALSE,
  max_classification TEXT NOT NULL DEFAULT 'INTERNAL'
                      CHECK (max_classification IN
                        ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','SECTOR_SENSITIVE')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON identity.users (lower(email));
CREATE INDEX users_identity_idx ON identity.users (identity_id);

-- Links a BEYU identity to its representation in an external OS or IdP.
-- Presence of a link does NOT imply data access (spec §17, §41).
CREATE TABLE identity.external_identities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id   UUID NOT NULL,
  provider      TEXT NOT NULL,          -- e.g. 'HEALTH_OS', 'OIDC:azure-ad'
  external_id   TEXT NOT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  linked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

CREATE TABLE identity.identity_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id       UUID NOT NULL,
  os_id             TEXT NOT NULL,
  relationship_type TEXT NOT NULL,      -- e.g. 'PATIENT','INVESTOR','FARMER'
  -- Explicit, revocable consent for cross-OS data exchange.
  data_sharing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (identity_id, os_id, relationship_type)
);

CREATE TABLE identity.roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE identity.permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type TEXT NOT NULL,
  action        TEXT NOT NULL,
  description   TEXT,
  UNIQUE (resource_type, action)
);

CREATE TABLE identity.role_permissions (
  role_id       UUID NOT NULL REFERENCES identity.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES identity.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- A user's role within a scope. Scope narrows the grant (ABAC).
CREATE TABLE identity.user_roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  role_id         UUID NOT NULL REFERENCES identity.roles(id) ON DELETE CASCADE,
  -- NULL scope = global within BEYU OS.
  org_node_id     UUID,
  tenant_id       UUID,
  country_code    TEXT,
  os_id           TEXT,
  granted_by      UUID REFERENCES identity.users(id),
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ,
  UNIQUE (user_id, role_id, org_node_id, tenant_id, country_code, os_id)
);
CREATE INDEX user_roles_user_idx ON identity.user_roles (user_id);

CREATE TABLE identity.memberships (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  tenant_id    UUID,
  org_node_id  UUID,
  status       TEXT NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE','INVITED','REVOKED')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, org_node_id)
);

CREATE TABLE identity.sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  mfa_satisfied BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address    TEXT,
  user_agent    TEXT,
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX sessions_user_idx ON identity.sessions (user_id);

-- ---------------------------------------------------------------------
-- ORGANIZATION (spec §1, §18, §48)
--
-- The canonical hierarchy is enforced by a CHECK constraint on node_type
-- plus an application-level validator (packages/types/organization.ts).
--
--   TRUST
--    ├── HOLDING_COMPANY -> COUNTRY_HOLDING -> SECTOR_LLC -> SECTOR_OS
--    └── FOUNDATION      -> FOUNDATION_OS        (SISTER, not subsidiary)
-- ---------------------------------------------------------------------

CREATE TABLE organization.org_nodes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type     TEXT NOT NULL CHECK (node_type IN (
                  'TRUST','HOLDING_COMPANY','COUNTRY_HOLDING','SECTOR_LLC',
                  'SECTOR_OS','FOUNDATION','FOUNDATION_OS','TENANT',
                  'ORGANIZATION','DIVISION','DEPARTMENT','BRANCH','TEAM')),
  name          TEXT NOT NULL,
  legal_name    TEXT,
  parent_id     UUID REFERENCES organization.org_nodes(id) ON DELETE RESTRICT,
  country_code  TEXT,
  sector_code   TEXT,
  status        TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE','INACTIVE','DISSOLVED','PENDING')),
  -- Materialized path enabling fast subtree authorization checks.
  path          TEXT NOT NULL DEFAULT '',
  depth         INTEGER NOT NULL DEFAULT 0,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- "BEYU GROUP" is never a valid organization name (spec §86.2).
  CONSTRAINT org_nodes_forbidden_name CHECK (upper(btrim(name)) <> 'BEYU GROUP')
);
CREATE INDEX org_nodes_parent_idx ON organization.org_nodes (parent_id);
CREATE INDEX org_nodes_type_idx ON organization.org_nodes (node_type);
CREATE INDEX org_nodes_path_idx ON organization.org_nodes (path);

-- Exactly one TRUST may exist, and it is always the root.
CREATE UNIQUE INDEX org_nodes_single_trust
  ON organization.org_nodes ((node_type)) WHERE node_type = 'TRUST';

-- The TRUST is the only node permitted to have no parent.
ALTER TABLE organization.org_nodes
  ADD CONSTRAINT org_nodes_root_is_trust
  CHECK ((parent_id IS NULL AND node_type = 'TRUST')
      OR (parent_id IS NOT NULL AND node_type <> 'TRUST'));

CREATE TABLE organization.countries (
  code            TEXT PRIMARY KEY,          -- ISO-3166 alpha-2
  name            TEXT NOT NULL,
  currency_code   TEXT NOT NULL,
  timezone        TEXT,
  -- Country configuration is data, never hard-coded logic (spec §64).
  regulatory_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','PLANNED','EXITED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organization.sectors (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE','PLANNED','RETIRED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Future OS Registry (spec §4, §71). Adding an OS is data, not a redesign.
CREATE TABLE organization.os_registry (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id                TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  sector_code          TEXT REFERENCES organization.sectors(code),
  version              TEXT NOT NULL DEFAULT '1.0.0',
  status               TEXT NOT NULL DEFAULT 'REGISTERED'
                         CHECK (status IN ('REGISTERED','CONFIGURING',
                           'SECURITY_VALIDATION','ACTIVE','SUSPENDED','RETIRED')),
  country_availability TEXT[] NOT NULL DEFAULT '{}',
  owner_entity_id      UUID,
  api_endpoint         TEXT,
  event_subscriptions  TEXT[] NOT NULL DEFAULT '{}',
  capabilities         TEXT[] NOT NULL DEFAULT '{}',
  compliance_profile_id UUID,
  integration_status   TEXT NOT NULL DEFAULT 'NOT_CONFIGURED'
                         CHECK (integration_status IN
                           ('NOT_CONFIGURED','CONFIGURED','VERIFIED','FAILED')),
  health_status        TEXT NOT NULL DEFAULT 'UNKNOWN'
                         CHECK (health_status IN
                           ('HEALTHY','DEGRADED','UNREACHABLE','UNKNOWN')),
  last_health_check_at TIMESTAMPTZ,
  data_sharing_policy_id UUID,
  is_core              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tenants live BELOW a Sector OS / Foundation OS boundary.
CREATE TABLE organization.tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  os_id         TEXT NOT NULL REFERENCES organization.os_registry(os_id),
  org_node_id   UUID REFERENCES organization.org_nodes(id),
  status        TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE','SUSPENDED','PROVISIONING','CLOSED')),
  -- Tenant branding may customize presentation only; it can never alter
  -- authorization, isolation or audit (spec §21).
  branding      JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tenants_os_idx ON organization.tenants (os_id);

-- Tenant-defined internal structure. BEYU's corporate hierarchy is NOT
-- imposed on external tenants (spec §20).
CREATE TABLE organization.tenant_org_units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES organization.tenants(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES organization.tenant_org_units(id) ON DELETE CASCADE,
  unit_type   TEXT NOT NULL CHECK (unit_type IN
                ('ORGANIZATION','DIVISION','BRANCH','DEPARTMENT','TEAM')),
  name        TEXT NOT NULL,
  path        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tenant_org_units_tenant_idx ON organization.tenant_org_units (tenant_id);
