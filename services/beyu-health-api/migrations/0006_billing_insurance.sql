-- Migration 0006: Billing, Insurance, Revenue Cycle
CREATE SCHEMA IF NOT EXISTS health_billing;
CREATE SCHEMA IF NOT EXISTS health_insurance;

CREATE TABLE health_billing.service_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  department TEXT,
  unit_price_minor BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TZS',
  tax_rate_bps INTEGER NOT NULL DEFAULT 0,
  is_taxable BOOLEAN NOT NULL DEFAULT FALSE,
  is_discountable BOOLEAN NOT NULL DEFAULT TRUE,
  requires_authorization BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','DISCONTINUED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE health_billing.price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  payer_id UUID,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE health_billing.price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID NOT NULL REFERENCES health_billing.price_lists(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES health_billing.service_catalog(id),
  price_minor BIGINT NOT NULL,
  UNIQUE (price_list_id, service_id)
);

CREATE TABLE health_billing.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  facility_id UUID REFERENCES health_tenant.facilities(id),
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','PAID','PARTIALLY_PAID','VOIDED','OVERDUE','CANCELLED')),
  currency TEXT NOT NULL DEFAULT 'TZS',
  subtotal_minor BIGINT NOT NULL DEFAULT 0,
  tax_minor BIGINT NOT NULL DEFAULT 0,
  discount_minor BIGINT NOT NULL DEFAULT 0,
  total_minor BIGINT NOT NULL DEFAULT 0,
  paid_minor BIGINT NOT NULL DEFAULT 0,
  balance_minor BIGINT NOT NULL DEFAULT 0,
  discount_reason TEXT,
  notes TEXT,
  issued_at TIMESTAMPTZ,
  due_date DATE,
  facility_id_billing UUID REFERENCES health_tenant.facilities(id),
  created_by UUID NOT NULL REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_number)
);
CREATE INDEX health_invoices_patient_idx ON health_billing.invoices (patient_id, created_at DESC);
CREATE INDEX health_invoices_status_idx ON health_billing.invoices (status);

CREATE TABLE health_billing.invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES health_billing.invoices(id) ON DELETE CASCADE,
  service_id UUID REFERENCES health_billing.service_catalog(id),
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price_minor BIGINT NOT NULL,
  discount_minor BIGINT NOT NULL DEFAULT 0,
  tax_minor BIGINT NOT NULL DEFAULT 0,
  total_minor BIGINT NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_billing.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  invoice_id UUID NOT NULL REFERENCES health_billing.invoices(id),
  payment_number TEXT NOT NULL,
  amount_minor BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TZS',
  method TEXT NOT NULL CHECK (method IN ('CASH','CARD','MOBILE_MONEY','BANK_TRANSFER','INSURANCE','CHEQUE','OTHER')),
  mobile_provider TEXT,
  card_last4 TEXT,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING','COMPLETED','FAILED','REFUNDED','CANCELLED')),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by UUID NOT NULL REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, payment_number)
);

CREATE TABLE health_billing.credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  invoice_id UUID NOT NULL REFERENCES health_billing.invoices(id),
  amount_minor BIGINT NOT NULL,
  reason TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insurance & Payer
CREATE TABLE health_insurance.payers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('NHIF','PRIVATE','CORPORATE','GOVERNMENT','OTHER')),
  short_name TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  integration_config JSONB,
  contract_config JSONB,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE health_insurance.beneficiaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  payer_id UUID NOT NULL REFERENCES health_insurance.payers(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  member_number TEXT NOT NULL,
  card_number TEXT,
  relationship TEXT NOT NULL DEFAULT 'SELF',
  scheme TEXT,
  group_number TEXT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED','EXPIRED')),
  eligibility JSONB,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payer_id, member_number)
);
CREATE INDEX health_beneficiaries_patient_idx ON health_insurance.beneficiaries (patient_id);

CREATE TABLE health_insurance.authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  payer_id UUID NOT NULL REFERENCES health_insurance.payers(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  beneficiary_id UUID REFERENCES health_insurance.beneficiaries(id),
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  authorization_number TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'GENERAL' CHECK (type IN ('GENERAL','SURGERY','INVESTIGATION','ADMISSION','PHARMACY','CHRONIC')),
  requested_amount_minor BIGINT,
  approved_amount_minor BIGINT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','PARTIALLY_APPROVED','REJECTED','EXPIRED','CANCELLED')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, authorization_number)
);

CREATE TABLE health_insurance.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  invoice_id UUID REFERENCES health_billing.invoices(id),
  payer_id UUID NOT NULL REFERENCES health_insurance.payers(id),
  beneficiary_id UUID REFERENCES health_insurance.beneficiaries(id),
  authorization_id UUID REFERENCES health_insurance.authorizations(id),
  claim_number TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'PROFESSIONAL' CHECK (type IN ('PROFESSIONAL','INSTITUTIONAL','PHARMACY','DENTAL','VISION')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','ADJUDICATING','APPROVED','PARTIALLY_APPROVED','REJECTED','PAID','CANCELLED')),
  total_minor BIGINT NOT NULL DEFAULT 0,
  claimed_minor BIGINT NOT NULL DEFAULT 0,
  approved_minor BIGINT,
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ,
  adjudicated_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  nhif_reference TEXT,
  mtufa_reference TEXT,
  created_by UUID REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, claim_number)
);
CREATE INDEX health_claims_payer_idx ON health_insurance.claims (payer_id, status);
CREATE INDEX health_claims_patient_idx ON health_insurance.claims (patient_id);

CREATE TABLE health_insurance.claim_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES health_insurance.claims(id) ON DELETE CASCADE,
  service_id UUID REFERENCES health_billing.service_catalog(id),
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price_minor BIGINT NOT NULL,
  claimed_minor BIGINT NOT NULL,
  approved_minor BIGINT,
  rejection_reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','PARTIALLY_APPROVED'))
);

CREATE TABLE health_insurance.remittances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  payer_id UUID NOT NULL REFERENCES health_insurance.payers(id),
  remittance_number TEXT NOT NULL,
  total_paid_minor BIGINT NOT NULL,
  payment_date DATE NOT NULL,
  payment_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, remittance_number)
);

CREATE TABLE health_insurance.remittance_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id UUID NOT NULL REFERENCES health_insurance.remittances(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES health_insurance.claims(id),
  paid_minor BIGINT NOT NULL,
  adjustment_minor BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL
);
