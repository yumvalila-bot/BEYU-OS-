-- 0006 — EQUIPMENT AND WORKFORCE

CREATE SCHEMA IF NOT EXISTS agri_equipment;
CREATE SCHEMA IF NOT EXISTS agri_workforce;

CREATE TABLE agri_equipment.equipment (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  farm_id        UUID REFERENCES agri_farm.farms(id),
  code           TEXT NOT NULL,
  name           TEXT NOT NULL,
  equipment_type TEXT NOT NULL CHECK (equipment_type IN ('TRACTOR','HARVESTER','PLANTER','SPRAYER','IRRIGATION_PUMP','TRAILER','PROCESSING_MACHINE','VEHICLE','GENERATOR','HAND_TOOL','OTHER')),
  status         TEXT NOT NULL DEFAULT 'OPERATIONAL' CHECK (status IN ('OPERATIONAL','UNDER_MAINTENANCE','BROKEN_DOWN','DISPOSED')),
  purchase_date  DATE,
  -- Acquisition cost FACT; depreciation lives in Finance OS.
  purchase_cost  NUMERIC(18,2) CHECK (purchase_cost IS NULL OR purchase_cost >= 0),
  currency       TEXT,
  operating_hours NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (operating_hours >= 0),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT equipment_tenant_code_unique UNIQUE (tenant_id, code)
);
CREATE INDEX agri_equipment_tenant_idx ON agri_equipment.equipment (tenant_id);

CREATE TABLE agri_equipment.maintenance_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  equipment_id     UUID NOT NULL REFERENCES agri_equipment.equipment(id),
  maintenance_type TEXT NOT NULL CHECK (maintenance_type IN ('SERVICE','REPAIR','INSPECTION','PARTS_REPLACEMENT','CALIBRATION')),
  performed_on     DATE NOT NULL,
  performed_by     TEXT,
  cost_amount      NUMERIC(16,2) CHECK (cost_amount IS NULL OR cost_amount >= 0),
  cost_currency    TEXT,
  hours_at_service NUMERIC(12,2),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agri_maintenance_equipment_idx ON agri_equipment.maintenance_logs (equipment_id);

CREATE TABLE agri_equipment.fuel_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  equipment_id     UUID NOT NULL REFERENCES agri_equipment.equipment(id),
  fueled_on        DATE NOT NULL,
  fuel_litres      NUMERIC(12,3) NOT NULL CHECK (fuel_litres > 0),
  hours_at_fueling NUMERIC(12,2),
  cost_amount      NUMERIC(16,2) CHECK (cost_amount IS NULL OR cost_amount >= 0),
  cost_currency    TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agri_fuel_equipment_idx ON agri_equipment.fuel_logs (equipment_id);

-- ── Workforce ──────────────────────────────────────────────────────────
-- NOTE: farm workers here are OPERATIONAL records (who worked where).
-- Payroll, contracts of employment and compensation belong to the HR and
-- Finance domains, never here.

CREATE TABLE agri_workforce.workers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  farm_id     UUID REFERENCES agri_farm.farms(id),
  worker_code TEXT NOT NULL,
  full_name   TEXT NOT NULL,
  phone       TEXT,
  role        TEXT,
  status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','TERMINATED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  CONSTRAINT workers_tenant_code_unique UNIQUE (tenant_id, worker_code)
);
CREATE INDEX agri_workers_tenant_idx ON agri_workforce.workers (tenant_id);

CREATE TABLE agri_workforce.work_orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  farm_id              UUID REFERENCES agri_farm.farms(id),
  field_id             UUID REFERENCES agri_farm.fields(id),
  work_order_number    TEXT NOT NULL,
  title                TEXT NOT NULL,
  description          TEXT,
  priority             TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  status               TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  assigned_to_worker_id UUID REFERENCES agri_workforce.workers(id),
  scheduled_for        DATE,
  completed_on         TIMESTAMPTZ,
  created_by           UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ,
  CONSTRAINT wo_tenant_number_unique UNIQUE (tenant_id, work_order_number)
);
CREATE INDEX agri_wo_tenant_idx ON agri_workforce.work_orders (tenant_id);
CREATE INDEX agri_wo_worker_idx ON agri_workforce.work_orders (assigned_to_worker_id);
