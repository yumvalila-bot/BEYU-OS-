-- 0005 — INVENTORY AND PROCUREMENT
--
-- FINANCE OS BOUNDARY: purchase orders, sales orders and contracts are
-- operational facts. finance_status records reconciliation state with
-- BEYU FINANCE OS, which owns the ledger. No accounting lives here.

CREATE SCHEMA IF NOT EXISTS agri_inventory;
CREATE SCHEMA IF NOT EXISTS agri_procurement;

CREATE TABLE agri_inventory.warehouses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  farm_id        UUID REFERENCES agri_farm.farms(id),
  code           TEXT NOT NULL,
  name           TEXT NOT NULL,
  warehouse_type TEXT NOT NULL CHECK (warehouse_type IN ('GENERAL','INPUT_STORE','PRODUCE_STORE','COLD_STORE','WORKSHOP')),
  is_cold_store  BOOLEAN NOT NULL DEFAULT false,
  capacity_kg    NUMERIC(14,3) CHECK (capacity_kg IS NULL OR capacity_kg >= 0),
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT warehouses_tenant_code_unique UNIQUE (tenant_id, code)
);
CREATE INDEX agri_warehouses_tenant_idx ON agri_inventory.warehouses (tenant_id);

CREATE TABLE agri_inventory.input_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  code         TEXT NOT NULL,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('SEED','FERTILIZER','PESTICIDE','HERBICIDE','FUNGICIDE','FUEL','LUBRICANT','ANIMAL_FEED','VETERINARY','PACKAGING','TOOLS','OTHER')),
  unit         TEXT NOT NULL,
  manufacturer TEXT,
  is_restricted BOOLEAN NOT NULL DEFAULT false,
  status       TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RETIRED')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  CONSTRAINT input_items_tenant_code_unique UNIQUE (tenant_id, code)
);
CREATE INDEX agri_input_items_tenant_idx ON agri_inventory.input_items (tenant_id);

CREATE TABLE agri_inventory.stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  warehouse_id    UUID NOT NULL REFERENCES agri_inventory.warehouses(id),
  input_item_id   UUID REFERENCES agri_inventory.input_items(id),
  storage_lot_id  UUID REFERENCES agri_crop.storage_lots(id),
  movement_type   TEXT NOT NULL CHECK (movement_type IN ('PURCHASE','INTERNAL_TRANSFER','ISSUANCE_TO_ACTIVITY','ADJUSTMENT','LOSS_WRITE_OFF','SALE','RETURN')),
  quantity        NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit            TEXT NOT NULL,
  reference_type  TEXT,
  reference_id    UUID,
  occurred_on     DATE NOT NULL,
  notes           TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT movement_target CHECK (input_item_id IS NOT NULL OR storage_lot_id IS NOT NULL)
);
CREATE INDEX agri_stock_tenant_idx ON agri_inventory.stock_movements (tenant_id);
CREATE INDEX agri_stock_warehouse_item_idx ON agri_inventory.stock_movements (warehouse_id, input_item_id);

-- ── Counterparties ─────────────────────────────────────────────────────

CREATE TABLE agri_procurement.suppliers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  code           TEXT NOT NULL,
  name           TEXT NOT NULL,
  contact_person TEXT,
  phone          TEXT,
  email          TEXT,
  country        TEXT,
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','BLACKLISTED')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT suppliers_tenant_code_unique UNIQUE (tenant_id, code)
);

CREATE TABLE agri_procurement.buyers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  code           TEXT NOT NULL,
  name           TEXT NOT NULL,
  contact_person TEXT,
  phone          TEXT,
  email          TEXT,
  country        TEXT,
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','BLACKLISTED')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT buyers_tenant_code_unique UNIQUE (tenant_id, code)
);

-- ── Purchase orders ────────────────────────────────────────────────────

CREATE TABLE agri_procurement.purchase_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  po_number             TEXT NOT NULL,
  supplier_id           UUID NOT NULL REFERENCES agri_procurement.suppliers(id),
  status                TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','FULFILLED','CLOSED','CANCELLED')),
  order_date            DATE NOT NULL,
  expected_delivery_on  DATE,
  currency              TEXT NOT NULL,
  total_amount          NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  finance_status        TEXT NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK (finance_status IN ('NOT_APPLICABLE','PENDING_INTEGRATION','INTEGRATED','RECONCILED')),
  notes                 TEXT,
  created_by            UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ,
  CONSTRAINT po_tenant_number_unique UNIQUE (tenant_id, po_number)
);
CREATE INDEX agri_po_tenant_idx ON agri_procurement.purchase_orders (tenant_id);

CREATE TABLE agri_procurement.purchase_order_lines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id  UUID NOT NULL REFERENCES agri_procurement.purchase_orders(id) ON DELETE CASCADE,
  item_type          TEXT NOT NULL DEFAULT 'INPUT_ITEM',
  item_id            UUID,
  description        TEXT NOT NULL,
  quantity           NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit               TEXT NOT NULL,
  unit_price         NUMERIC(18,4) NOT NULL CHECK (unit_price >= 0),
  currency           TEXT NOT NULL,
  line_total         NUMERIC(18,2) NOT NULL
);
CREATE INDEX agri_po_lines_po_idx ON agri_procurement.purchase_order_lines (purchase_order_id);

-- ── Sales orders ───────────────────────────────────────────────────────

CREATE TABLE agri_procurement.sales_orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  so_number      TEXT NOT NULL,
  buyer_id       UUID NOT NULL REFERENCES agri_procurement.buyers(id),
  status         TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','FULFILLED','CLOSED','CANCELLED')),
  order_date     DATE NOT NULL,
  storage_lot_id UUID REFERENCES agri_crop.storage_lots(id),
  currency       TEXT NOT NULL,
  total_amount   NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  finance_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK (finance_status IN ('NOT_APPLICABLE','PENDING_INTEGRATION','INTEGRATED','RECONCILED')),
  notes          TEXT,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT so_tenant_number_unique UNIQUE (tenant_id, so_number)
);
CREATE INDEX agri_so_tenant_idx ON agri_procurement.sales_orders (tenant_id);

CREATE TABLE agri_procurement.sales_order_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id  UUID NOT NULL REFERENCES agri_procurement.sales_orders(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  quantity        NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit            TEXT NOT NULL,
  unit_price      NUMERIC(18,4) NOT NULL CHECK (unit_price >= 0),
  currency        TEXT NOT NULL,
  line_total      NUMERIC(18,2) NOT NULL
);
CREATE INDEX agri_so_lines_so_idx ON agri_procurement.sales_order_lines (sales_order_id);

-- ── Trade contracts ────────────────────────────────────────────────────

CREATE TABLE agri_procurement.trade_contracts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES agri_tenant.tenants(id),
  contract_number   TEXT NOT NULL,
  counterparty_type TEXT NOT NULL CHECK (counterparty_type IN ('SUPPLIER','BUYER')),
  counterparty_id   UUID NOT NULL,
  status            TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','COMPLETED','TERMINATED','DISPUTED')),
  start_date        DATE NOT NULL,
  end_date          DATE,
  currency          TEXT NOT NULL,
  contracted_value  NUMERIC(18,2) NOT NULL CHECK (contracted_value >= 0),
  finance_status    TEXT NOT NULL DEFAULT 'PENDING_INTEGRATION' CHECK (finance_status IN ('NOT_APPLICABLE','PENDING_INTEGRATION','INTEGRATED','RECONCILED')),
  terms             TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT contracts_tenant_number_unique UNIQUE (tenant_id, contract_number),
  CONSTRAINT contracts_dates_sane CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX agri_contracts_tenant_idx ON agri_procurement.trade_contracts (tenant_id);
