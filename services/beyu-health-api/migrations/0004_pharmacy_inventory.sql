-- Migration 0004: Pharmacy and Inventory
CREATE SCHEMA IF NOT EXISTS health_pharmacy;
CREATE SCHEMA IF NOT EXISTS health_inventory;

CREATE TABLE health_pharmacy.drugs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  generic_name TEXT,
  form TEXT NOT NULL,
  strength TEXT NOT NULL,
  manufacturer TEXT,
  category TEXT,
  atc_code TEXT,
  is_controlled BOOLEAN NOT NULL DEFAULT FALSE,
  requires_prescription BOOLEAN NOT NULL DEFAULT TRUE,
  storage_condition TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','DISCONTINUED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX health_drugs_name_idx ON health_pharmacy.drugs (name);
CREATE INDEX health_drugs_generic_idx ON health_pharmacy.drugs (generic_name);

CREATE TABLE health_pharmacy.formulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  drug_id UUID NOT NULL REFERENCES health_pharmacy.drugs(id),
  facility_id UUID REFERENCES health_tenant.facilities(id),
  is_essential BOOLEAN NOT NULL DEFAULT FALSE,
  is_in_stock BOOLEAN NOT NULL DEFAULT TRUE,
  tier INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, drug_id, facility_id)
);

CREATE TABLE health_pharmacy.drug_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  drug_a_id UUID NOT NULL REFERENCES health_pharmacy.drugs(id),
  drug_b_id UUID NOT NULL REFERENCES health_pharmacy.drugs(id),
  severity TEXT NOT NULL CHECK (severity IN ('MINOR','MODERATE','MAJOR','CONTRAINDICATED')),
  description TEXT NOT NULL,
  recommendation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (drug_a_id, drug_b_id)
);

CREATE TABLE health_pharmacy.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  prescriber_id UUID NOT NULL REFERENCES health_identity.users(id),
  drug_id UUID NOT NULL REFERENCES health_pharmacy.drugs(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ON_HOLD','CANCELLED','COMPLETED','ENTERED_IN_ERROR','STOPPED','DRAFT','UNKNOWN')),
  intent TEXT NOT NULL DEFAULT 'ORDER' CHECK (intent IN ('PROPOSAL','PLAN','ORDER','ORIGINAL_ORDER','REFLEX_ORDER','FILLER_ORDER','INSTANCE_ORDER','OPTION')),
  priority TEXT NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('ROUTINE','URGENT','ASAP','STAT')),
  dosage_instruction TEXT NOT NULL,
  frequency TEXT,
  route TEXT,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  duration_days INTEGER,
  dispense_quantity NUMERIC,
  refills INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  safety_check JSONB,
  authored_on TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX health_prescriptions_patient_idx ON health_pharmacy.prescriptions (patient_id, authored_on DESC);
CREATE INDEX health_prescriptions_status_idx ON health_pharmacy.prescriptions (status);

CREATE TABLE health_pharmacy.dispenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  prescription_id UUID NOT NULL REFERENCES health_pharmacy.prescriptions(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  drug_id UUID NOT NULL REFERENCES health_pharmacy.drugs(id),
  dispenser_id UUID NOT NULL REFERENCES health_identity.users(id),
  facility_id UUID REFERENCES health_tenant.facilities(id),
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  batch_number TEXT,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PREPARATION','IN_PROGRESS','CANCELLED','ON_HOLD','COMPLETED','ENTERED_IN_ERROR','STOPPED','DECLINED')),
  dispensed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  counseling_given BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_pharmacy.medication_administrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  prescription_id UUID NOT NULL REFERENCES health_pharmacy.prescriptions(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  performer_id UUID NOT NULL REFERENCES health_identity.users(id),
  drug_id UUID NOT NULL REFERENCES health_pharmacy.drugs(id),
  dosage TEXT NOT NULL,
  route TEXT,
  administered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('IN_PROGRESS','NOT_DONE','ON_HOLD','COMPLETED','ENTERED_IN_ERROR','STOPPED','UNKNOWN')),
  note TEXT
);

-- Inventory
CREATE TABLE health_inventory.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  facility_id UUID NOT NULL REFERENCES health_tenant.facilities(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('MAIN','PHARMACY','LAB','THEATRE','GENERAL','TRANSIT')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE health_inventory.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_id TEXT,
  payment_terms TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','BLACKLISTED')),
  rating INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE health_inventory.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  generic_name TEXT,
  category TEXT NOT NULL,
  uom TEXT NOT NULL,
  is_drug BOOLEAN NOT NULL DEFAULT FALSE,
  drug_id UUID REFERENCES health_pharmacy.drugs(id),
  is_consumable BOOLEAN NOT NULL DEFAULT TRUE,
  is_equipment BOOLEAN NOT NULL DEFAULT FALSE,
  reorder_level INTEGER NOT NULL DEFAULT 10,
  reorder_quantity INTEGER NOT NULL DEFAULT 50,
  unit_cost_minor INTEGER,
  is_hazardous BOOLEAN NOT NULL DEFAULT FALSE,
  storage_condition TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','DISCONTINUED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku)
);

CREATE TABLE health_inventory.stock_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  item_id UUID NOT NULL REFERENCES health_inventory.items(id),
  warehouse_id UUID NOT NULL REFERENCES health_inventory.warehouses(id),
  batch_number TEXT NOT NULL,
  serial_number TEXT,
  quantity NUMERIC NOT NULL DEFAULT 0,
  reserved_quantity NUMERIC NOT NULL DEFAULT 0,
  expiry_date DATE,
  manufactured_date DATE,
  unit_cost_minor INTEGER,
  supplier_id UUID REFERENCES health_inventory.suppliers(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX health_batches_item_idx ON health_inventory.stock_batches (item_id);
CREATE INDEX health_batches_warehouse_idx ON health_inventory.stock_batches (warehouse_id);
CREATE INDEX health_batches_expiry_idx ON health_inventory.stock_batches (expiry_date) WHERE expiry_date IS NOT NULL;

CREATE TABLE health_inventory.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  item_id UUID NOT NULL REFERENCES health_inventory.items(id),
  batch_id UUID REFERENCES health_inventory.stock_batches(id),
  from_warehouse_id UUID REFERENCES health_inventory.warehouses(id),
  to_warehouse_id UUID REFERENCES health_inventory.warehouses(id),
  type TEXT NOT NULL CHECK (type IN ('RECEIPT','ISSUE','TRANSFER','ADJUSTMENT','RETURN','WASTAGE','RECALL')),
  quantity NUMERIC NOT NULL,
  reference TEXT,
  reason TEXT,
  performed_by UUID NOT NULL REFERENCES health_identity.users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX health_movements_item_idx ON health_inventory.stock_movements (item_id, performed_at DESC);

CREATE TABLE health_inventory.purchase_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  request_number TEXT NOT NULL,
  facility_id UUID REFERENCES health_tenant.facilities(id),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','CANCELLED','CONVERTED')),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  justification TEXT,
  requested_by UUID NOT NULL REFERENCES health_identity.users(id),
  approved_by UUID REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_number)
);

CREATE TABLE health_inventory.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  po_number TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES health_inventory.suppliers(id),
  requisition_id UUID REFERENCES health_inventory.purchase_requisitions(id),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','SENT','PARTIALLY_RECEIVED','RECEIVED','CANCELLED','CLOSED')),
  total_minor BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TZS',
  ordered_at TIMESTAMPTZ,
  expected_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES health_identity.users(id),
  approved_by UUID REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, po_number)
);

CREATE TABLE health_inventory.purchase_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES health_inventory.purchase_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES health_inventory.items(id),
  quantity NUMERIC NOT NULL,
  unit_cost_minor INTEGER NOT NULL,
  received_quantity NUMERIC NOT NULL DEFAULT 0,
  total_minor BIGINT NOT NULL,
  notes TEXT
);
