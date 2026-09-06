-- 0007 — COMPLIANCE AND AUDIT TRAIL

CREATE SCHEMA IF NOT EXISTS agri_compliance;
CREATE SCHEMA IF NOT EXISTS agri_audit;

CREATE TABLE agri_compliance.certifications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  farm_id            UUID REFERENCES agri_farm.farms(id),
  certification_type TEXT NOT NULL CHECK (certification_type IN ('GLOBAL_GAP','ORGANIC','FAIRTRADE','RAINFOREST_ALLIANCE','HACCP','ISO_22000','PHYTOSANITARY','EXPORT_QUALITY','OTHER')),
  certificate_number TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'CERTIFIED' CHECK (status IN ('APPLIED','CERTIFIED','SUSPENDED','EXPIRED','REVOKED')),
  issued_on          DATE,
  expires_on         DATE,
  issued_by          TEXT,
  scope_notes        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,
  CONSTRAINT certs_tenant_number_unique UNIQUE (tenant_id, certificate_number),
  CONSTRAINT certs_dates_sane CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on)
);
CREATE INDEX agri_certs_tenant_idx ON agri_compliance.certifications (tenant_id);

CREATE TABLE agri_compliance.inspections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  farm_id           UUID REFERENCES agri_farm.farms(id),
  certification_id  UUID REFERENCES agri_compliance.certifications(id),
  inspected_on      DATE NOT NULL,
  inspected_by      TEXT,
  result            TEXT NOT NULL CHECK (result IN ('PASS','CONDITIONAL','FAIL')),
  findings          TEXT,
  follow_up_required BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX agri_inspections_tenant_idx ON agri_compliance.inspections (tenant_id);

-- ── Audit trail ────────────────────────────────────────────────────────
-- Append-only, hash-chained per tenant. UPDATE/DELETE are denied to the
-- application role via triggers (0008); corrections are new events.

CREATE TABLE agri_audit.audit_events (
  id             UUID PRIMARY KEY,
  tenant_id      UUID,
  user_id        UUID,
  action         TEXT NOT NULL,
  resource_type  TEXT NOT NULL,
  resource_id    UUID,
  farm_id        UUID,
  before_state   JSONB,
  after_state    JSONB,
  reason         TEXT,
  purpose_of_use TEXT,
  ip_address     TEXT,
  user_agent     TEXT,
  created_at     TIMESTAMPTZ NOT NULL,
  hash           TEXT NOT NULL,
  previous_hash  TEXT NOT NULL,
  chain_index    INTEGER NOT NULL
);
CREATE INDEX agri_audit_tenant_idx ON agri_audit.audit_events (tenant_id);
CREATE INDEX agri_audit_resource_idx ON agri_audit.audit_events (resource_type, resource_id);
CREATE INDEX agri_audit_chain_idx ON agri_audit.audit_events (tenant_id, chain_index);
