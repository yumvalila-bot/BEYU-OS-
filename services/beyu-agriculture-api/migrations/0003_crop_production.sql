-- 0003 — CROP PRODUCTION (crops, cycles, activities, harvests, storage lots)

CREATE SCHEMA IF NOT EXISTS agri_crop;

CREATE TABLE agri_crop.crops (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  code              TEXT NOT NULL,
  name              TEXT NOT NULL,
  scientific_name   TEXT,
  category          TEXT NOT NULL CHECK (category IN ('CEREAL','LEGUME','ROOT_TUBER','VEGETABLE','FRUIT','NUT','OILSEED','FIBER','SPICE','FORAGE','FORESTRY')),
  growing_days_min  INTEGER CHECK (growing_days_min IS NULL OR growing_days_min > 0),
  growing_days_max  INTEGER CHECK (growing_days_max IS NULL OR growing_days_max > 0),
  status            TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RETIRED')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT crops_tenant_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT crops_growing_days_sane CHECK (growing_days_min IS NULL OR growing_days_max IS NULL OR growing_days_max >= growing_days_min)
);
CREATE INDEX agri_crops_tenant_idx ON agri_crop.crops (tenant_id);

CREATE TABLE agri_crop.crop_cycles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  field_id                UUID NOT NULL REFERENCES agri_farm.fields(id),
  crop_id                 UUID NOT NULL REFERENCES agri_crop.crops(id),
  season_code             TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','PLANTED','GROWING','HARVESTED','TERMINATED')),
  planted_on              DATE,
  expected_harvest_on     DATE,
  harvested_on            DATE,
  area_planted_ha         NUMERIC(14,4) CHECK (area_planted_ha IS NULL OR area_planted_ha > 0),
  seed_rate_kg_per_ha     NUMERIC(10,2),
  target_yield_tons_per_ha NUMERIC(10,3),
  actual_yield_tons_per_ha NUMERIC(10,3),
  notes                   TEXT,
  created_by              UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);
CREATE INDEX agri_cycles_field_idx ON agri_crop.crop_cycles (field_id);
CREATE INDEX agri_cycles_tenant_idx ON agri_crop.crop_cycles (tenant_id);
-- At most ONE live cycle per (field, season) — enforced by the database.
CREATE UNIQUE INDEX cycles_field_season_live_unique
  ON agri_crop.crop_cycles (field_id, season_code)
  WHERE status IN ('PLANNED','PLANTED','GROWING') AND deleted_at IS NULL;

CREATE TABLE agri_crop.field_activities (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  crop_cycle_id        UUID REFERENCES agri_crop.crop_cycles(id),
  field_id             UUID NOT NULL REFERENCES agri_farm.fields(id),
  activity_type        TEXT NOT NULL CHECK (activity_type IN ('LAND_PREPARATION','PLANTING','IRRIGATION','FERTILIZATION','PEST_CONTROL','DISEASE_CONTROL','WEEDING','PRUNING','THINNING','SCOUTING','SOIL_SAMPLING','HARVESTING','POST_HARVEST_HANDLING','MAINTENANCE','OTHER')),
  status               TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED')),
  scheduled_on         DATE,
  performed_on         DATE,
  performed_by_user_id UUID,
  -- Operational cost FACT. Ledger postings belong to Finance OS.
  cost_amount          NUMERIC(16,2) CHECK (cost_amount IS NULL OR cost_amount >= 0),
  cost_currency        TEXT,
  finance_status       TEXT NOT NULL DEFAULT 'PENDING_INTEGRATION' CHECK (finance_status IN ('NOT_APPLICABLE','PENDING_INTEGRATION','INTEGRATED','RECONCILED')),
  notes                TEXT,
  created_by           UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);
CREATE INDEX agri_activities_cycle_idx ON agri_crop.field_activities (crop_cycle_id);
CREATE INDEX agri_activities_field_idx ON agri_crop.field_activities (field_id);
CREATE INDEX agri_activities_tenant_idx ON agri_crop.field_activities (tenant_id);

CREATE TABLE agri_crop.harvests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  crop_cycle_id  UUID NOT NULL REFERENCES agri_crop.crop_cycles(id),
  field_id       UUID NOT NULL REFERENCES agri_farm.fields(id),
  status         TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED','REJECTED')),
  harvested_on   DATE NOT NULL,
  quantity_kg    NUMERIC(14,3) NOT NULL CHECK (quantity_kg > 0),
  moisture_pct   NUMERIC(5,2) CHECK (moisture_pct IS NULL OR moisture_pct BETWEEN 0 AND 100),
  quality_grade  TEXT,
  notes          TEXT,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX agri_harvests_cycle_idx ON agri_crop.harvests (crop_cycle_id);
CREATE INDEX agri_harvests_tenant_idx ON agri_crop.harvests (tenant_id);

-- Tracked produce lots in storage.
CREATE TABLE agri_crop.storage_lots (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  harvest_id           UUID REFERENCES agri_crop.harvests(id),
  warehouse_id         UUID NOT NULL,
  lot_code             TEXT NOT NULL,
  crop_id              UUID REFERENCES agri_crop.crops(id),
  quantity_kg          NUMERIC(14,3) NOT NULL CHECK (quantity_kg > 0),
  quantity_released_kg NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity_released_kg >= 0),
  status               TEXT NOT NULL DEFAULT 'IN_STORAGE' CHECK (status IN ('IN_STORAGE','RELEASED','QUARANTINED','DISPOSED')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lots_tenant_code_unique UNIQUE (tenant_id, lot_code),
  CONSTRAINT lots_release_not_over_total CHECK (quantity_released_kg <= quantity_kg)
);
CREATE INDEX agri_lots_tenant_idx ON agri_crop.storage_lots (tenant_id);
CREATE INDEX agri_lots_warehouse_idx ON agri_crop.storage_lots (warehouse_id);
