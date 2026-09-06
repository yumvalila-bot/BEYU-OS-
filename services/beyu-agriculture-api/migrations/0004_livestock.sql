-- 0004 — LIVESTOCK (herds, animals, health events, production)

CREATE SCHEMA IF NOT EXISTS agri_livestock;

CREATE TABLE agri_livestock.herds (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  farm_id    UUID NOT NULL REFERENCES agri_farm.farms(id),
  code       TEXT NOT NULL,
  name       TEXT NOT NULL,
  species    TEXT NOT NULL CHECK (species IN ('CATTLE','GOAT','SHEEP','PIG','POULTRY','RABBIT','DONKEY','BEE','FISH')),
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT herds_tenant_code_unique UNIQUE (tenant_id, code)
);
CREATE INDEX agri_herds_farm_idx ON agri_livestock.herds (farm_id);
CREATE INDEX agri_herds_tenant_idx ON agri_livestock.herds (tenant_id);

CREATE TABLE agri_livestock.animals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  herd_id         UUID REFERENCES agri_livestock.herds(id),
  tag_number      TEXT NOT NULL,
  species         TEXT NOT NULL CHECK (species IN ('CATTLE','GOAT','SHEEP','PIG','POULTRY','RABBIT','DONKEY','BEE','FISH')),
  breed           TEXT,
  sex             TEXT NOT NULL CHECK (sex IN ('MALE','FEMALE')),
  date_of_birth   DATE,
  status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SOLD','DECEASED','SLAUGHTERED','TRANSFERRED_OUT')),
  acquisition_date DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT animals_tenant_tag_unique UNIQUE (tenant_id, tag_number)
);
CREATE INDEX agri_animals_herd_idx ON agri_livestock.animals (herd_id);
CREATE INDEX agri_animals_tenant_idx ON agri_livestock.animals (tenant_id);

CREATE TABLE agri_livestock.animal_health_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  animal_id       UUID NOT NULL REFERENCES agri_livestock.animals(id),
  event_type      TEXT NOT NULL CHECK (event_type IN ('VACCINATION','TREATMENT','ILLNESS','INJURY','CHECKUP','DEWORMING','QUARANTINE')),
  event_date      DATE NOT NULL,
  veterinarian    TEXT,
  treatment       TEXT,
  withdrawal_days INTEGER CHECK (withdrawal_days IS NULL OR withdrawal_days >= 0),
  -- Operational cost FACT; ledger belongs to Finance OS.
  cost_amount     NUMERIC(16,2) CHECK (cost_amount IS NULL OR cost_amount >= 0),
  cost_currency   TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agri_animal_health_animal_idx ON agri_livestock.animal_health_events (animal_id);
CREATE INDEX agri_animal_health_tenant_idx ON agri_livestock.animal_health_events (tenant_id);

CREATE TABLE agri_livestock.production_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  herd_id          UUID REFERENCES agri_livestock.herds(id),
  animal_id        UUID REFERENCES agri_livestock.animals(id),
  production_type  TEXT NOT NULL CHECK (production_type IN ('MILK','EGGS','WOOL','HONEY','MEAT','OFFSPRING','FISH_HARVEST')),
  recorded_on      DATE NOT NULL,
  quantity         NUMERIC(14,3) NOT NULL CHECK (quantity >= 0),
  unit             TEXT NOT NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT production_target CHECK (herd_id IS NOT NULL OR animal_id IS NOT NULL)
);
CREATE INDEX agri_production_tenant_idx ON agri_livestock.production_records (tenant_id);
CREATE INDEX agri_production_herd_idx ON agri_livestock.production_records (herd_id);
