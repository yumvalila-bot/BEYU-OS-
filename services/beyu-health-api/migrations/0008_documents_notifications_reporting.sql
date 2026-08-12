-- Migration 0008: Documents, Notifications, Reporting, Compliance, Governance
CREATE SCHEMA IF NOT EXISTS health_documents;
CREATE SCHEMA IF NOT EXISTS health_notifications;
CREATE SCHEMA IF NOT EXISTS health_reporting;
CREATE SCHEMA IF NOT EXISTS health_compliance;
CREATE SCHEMA IF NOT EXISTS health_governance;

CREATE TABLE health_documents.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  owner_id UUID REFERENCES health_identity.users(id),
  patient_id UUID REFERENCES health_patient.patients(id),
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  document_type TEXT NOT NULL CHECK (document_type IN ('CLINICAL_NOTE','CONSENT_FORM','PRESCRIPTION','LAB_REPORT','IMAGING_REPORT','REFERRAL','INVOICE','INSURANCE_CLAIM','IDENTITY_DOCUMENT','DISCHARGE_SUMMARY','CERTIFICATE','PRESCRIPTION_OPTICAL','OPHTHALMOLOGY_IMAGES','OTHER')),
  title TEXT NOT NULL,
  description TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  storage_key TEXT,
  storage_url TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  parent_document_id UUID REFERENCES health_documents.documents(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED','DELETED')),
  confidentiality TEXT NOT NULL DEFAULT 'NORMAL' CHECK (confidentiality IN ('LOW','NORMAL','RESTRICTED','VERY_RESTRICTED')),
  retention_policy TEXT,
  expiry_date DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX health_documents_tenant_idx ON health_documents.documents (tenant_id);
CREATE INDEX health_documents_patient_idx ON health_documents.documents (patient_id, created_at DESC);
CREATE INDEX health_documents_type_idx ON health_documents.documents (document_type);

CREATE TABLE health_documents.document_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES health_documents.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES health_identity.users(id),
  action TEXT NOT NULL CHECK (action IN ('VIEW','DOWNLOAD','SHARE','PRINT','UPDATE','DELETE')),
  ip_address TEXT,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_notifications.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('SMS','EMAIL','PUSH','WHATSAPP','IN_APP')),
  subject_template TEXT,
  body_template TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code, channel)
);

CREATE TABLE health_notifications.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  recipient_id UUID REFERENCES health_identity.users(id),
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('USER','PATIENT','PRACTITIONER','GROUP')),
  recipient_contact TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('SMS','EMAIL','PUSH','WHATSAPP','IN_APP')),
  template_id UUID REFERENCES health_notifications.templates(id),
  subject TEXT,
  body TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','DELIVERED','FAILED','CANCELLED','READ')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failure_reason TEXT,
  related_resource_type TEXT,
  related_resource_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX health_notifications_recipient_idx ON health_notifications.notifications (recipient_id, created_at DESC);
CREATE INDEX health_notifications_status_idx ON health_notifications.notifications (status, scheduled_at);

CREATE TABLE health_reporting.report_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES health_tenant.tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('CLINICAL','OPERATIONAL','FINANCIAL','PHARMACY','LAB','RADIOLOGY','OPHTHALMOLOGY','COMPLIANCE','EXECUTIVE','MTUHA','CUSTOM')),
  description TEXT,
  query_template TEXT NOT NULL,
  parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','DRAFT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE health_reporting.report_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  report_id UUID NOT NULL REFERENCES health_reporting.report_definitions(id),
  executed_by UUID NOT NULL REFERENCES health_identity.users(id),
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','COMPLETED','FAILED','CANCELLED')),
  result_url TEXT,
  result_summary JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE TABLE health_reporting.mtuha_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  facility_id UUID NOT NULL REFERENCES health_tenant.facilities(id),
  report_type TEXT NOT NULL CHECK (report_type IN ('BOOK6','BOOK8','BOOK9','BOOK10','BOOK11','BOOK12','MTUHA2','MTUHA3','CUSTOM')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_by UUID REFERENCES health_identity.users(id),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_compliance.compliance_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  country_code TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  authority TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DRAFT','SUPERSEDED','RETIRED')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO health_compliance.compliance_packs (code, name, description, country_code, authority) VALUES
('TZ-MOH-GENERAL','Tanzania MOH General','Ministry of Health Tanzania - General Facility Requirements','TZ','MOH'),
('TZ-MTUHA','Tanzania MTUHA','MTUHA Reporting Compliance','TZ','MOH'),
('TZ-NHIF','Tanzania NHIF/Insurance','NHIF and Health Insurance Compliance','TZ','NHIF'),
('TZ-TMDA','Tanzania TMDA','Tanzania Medicines and Medical Devices Authority','TZ','TMDA'),
('TZ-TRA','Tanzania TRA','Tanzania Revenue Authority - Tax Compliance','TZ','TRA'),
('TZ-DATA-PROTECTION','Tanzania Data Protection','Personal Data Protection Act Compliance','TZ','DATA_COMMISSION'),
('ISO-27001','ISO 27001','Information Security Management','GLOBAL','ISO'),
('HIPAA','HIPAA Equivalent','Health Data Privacy and Security','GLOBAL','HEALTH_AUTHORITY')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE health_compliance.compliance_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES health_compliance.compliance_packs(id),
  reference TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  frequency TEXT,
  due_date_rule TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_compliance.compliance_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  facility_id UUID REFERENCES health_tenant.facilities(id),
  requirement_id UUID NOT NULL REFERENCES health_compliance.compliance_requirements(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLIANT','NON_COMPLIANT','PARTIALLY_COMPLIANT','NOT_APPLICABLE','EXPIRED')),
  evidence_url TEXT,
  evidence_text TEXT,
  assessed_by UUID REFERENCES health_identity.users(id),
  assessed_at TIMESTAMPTZ,
  expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_compliance.incident_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  facility_id UUID REFERENCES health_tenant.facilities(id),
  incident_number TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('CLINICAL','MEDICATION','DATA_BREACH','SAFETY','SECURITY','OPERATIONAL','OTHER')),
  severity TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  patient_id UUID REFERENCES health_patient.patients(id),
  location TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reported_by UUID NOT NULL REFERENCES health_identity.users(id),
  status TEXT NOT NULL DEFAULT 'REPORTED' CHECK (status IN ('REPORTED','INVESTIGATING','RESOLVED','CLOSED','ESCALATED')),
  corrective_action TEXT,
  preventive_action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, incident_number)
);

CREATE TABLE health_governance.policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES health_tenant.tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('CLINICAL','OPERATIONAL','FINANCIAL','SECURITY','PRIVACY','HR','QUALITY','COMPLIANCE')),
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','ACTIVE','SUPERSEDED','RETIRED')),
  approved_by UUID REFERENCES health_identity.users(id),
  approved_at TIMESTAMPTZ,
  effective_from DATE,
  effective_to DATE,
  review_date DATE,
  created_by UUID REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code, version)
);

CREATE TABLE health_governance.approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE health_governance.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  workflow_id UUID NOT NULL REFERENCES health_governance.approval_workflows(id),
  resource_type TEXT NOT NULL,
  resource_id UUID NOT NULL,
  requested_by UUID NOT NULL REFERENCES health_identity.users(id),
  current_step INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED','ESCALATED')),
  reason TEXT NOT NULL,
  decision_notes TEXT,
  decided_by UUID REFERENCES health_identity.users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_governance.quality_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  facility_id UUID REFERENCES health_tenant.facilities(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'CLINICAL' CHECK (category IN ('CLINICAL','SAFETY','EFFICIENCY','PATIENT_EXPERIENCE','OPERATIONAL')),
  numerator_query TEXT,
  denominator_query TEXT,
  target_value NUMERIC,
  current_value NUMERIC,
  unit TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  last_calculated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
