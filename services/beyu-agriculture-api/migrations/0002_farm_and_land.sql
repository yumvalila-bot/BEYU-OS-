-- 0002 — FARM AND LAND (fields, soil, weather)

CREATE SCHEMA IF NOT EXISTS agri_farm;

CREATE TABLE agri_farm.farms (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  code           TEXT NOT NULL,
  name           TEXT NOT NULL,
  farm_type      TEXT NOT NULL CHECK (farm_type IN ('CROP_FARM','LIVESTOCK_FARM','MIXED_FARM','ORCHARD','NURSERY','AQUACULTURE','RESEARCH_STATION')),
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  country_code   TEXT NOT NULL,
  region         TEXT,
  district       TEXT,
  village        TEXT,
  gps_latitude   NUMERIC(9,6),
  gps_longitude  NUMERIC(9,6),
  total_area_ha  NUMERIC(14,4) CHECK (total_area_ha IS NULL OR total_area_ha > 0),
  tenure         TEXT CHECK (tenure IS NULL OR tenure IN ('FREEHOLD','LEASEHOLD','COMMUNAL','CONTRACT_FARMING','RENTED')),
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT farms_tenant_code_unique UNIQUE (tenant_id, code)
);
CREATE INDEX agri_farms_tenant_idx ON agri_farm.farms (tenant_id);
CREATE INDEX agri_farms_country_idx ON agri_farm.farms (country_code);

-- Fields: managed parcels within a farm. boundary is advisory GeoJSON,
-- not a cadastral record.
CREATE TABLE agri_farm.fields (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  farm_id         UUID NOT NULL REFERENCES agri_farm.farms(id),
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  field_use       TEXT NOT NULL CHECK (field_use IN ('CROPLAND','PASTURE','FALLOW','FORESTRY','INFRASTRUCTURE','BUFFER')),
  area_ha         NUMERIC(14,4) NOT NULL CHECK (area_ha > 0),
  boundary        JSONB,
  soil_texture    TEXT,
  irrigation_type TEXT,
  status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RETIRED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT fields_farm_code_unique UNIQUE (farm_id, code)
  -- tenant_id integrity vs parent farm is enforced by the application layer
  -- (tenant_id is always derived server-side from the farm row, never client input).
);
CREATE INDEX agri_fields_farm_idx ON agri_farm.fields (farm_id);
CREATE INDEX agri_fields_tenant_idx ON agri_farm.fields (tenant_id);

CREATE TABLE agri_farm.soil_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  field_id          UUID NOT NULL REFERENCES agri_farm.fields(id),
  sampled_on        DATE NOT NULL,
  ph                NUMERIC(4,2) CHECK (ph IS NULL OR (ph >= 0 AND ph <= 14)),
  organic_matter_pct NUMERIC(5,2) CHECK (organic_matter_pct IS NULL OR organic_matter_pct BETWEEN 0 AND 100),
  nitrogen_ppm      NUMERIC(10,2),
  phosphorus_ppm    NUMERIC(10,2),
  potassium_ppm     NUMERIC(10,2),
  notes             TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX agri_soil_field_idx ON agri_farm.soil_records (field_id);
CREATE INDEX agri_soil_tenant_idx ON agri_farm.soil_records (tenant_id);

CREATE TABLE agri_farm.weather_observations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  farm_id       UUID NOT NULL REFERENCES agri_farm.farms(id),
  observed_on   DATE NOT NULL,
  temperature_c NUMERIC(6,2),
  rainfall_mm   NUMERIC(8,2) CHECK (rainfall_mm IS NULL OR rainfall_mm >= 0),
  humidity_pct  NUMERIC(5,2) CHECK (humidity_pct IS NULL OR humidity_pct BETWEEN 0 AND 100),
  wind_kph      NUMERIC(7,2) CHECK (wind_kph IS NULL OR wind_kph >= 0),
  notes         TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  CONSTRAINT weather_farm_day_unique UNIQUE (farm_id, observed_on)
);
CREATE INDEX agri_weather_tenant_idx ON agri_farm.weather_observations (tenant_id);
