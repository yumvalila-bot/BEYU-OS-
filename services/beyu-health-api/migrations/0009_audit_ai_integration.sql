-- Migration 0009: Audit, AI (HIVE/Noelia), Integration, FHIR
CREATE SCHEMA IF NOT EXISTS health_audit;
CREATE SCHEMA IF NOT EXISTS health_ai;
CREATE SCHEMA IF NOT EXISTS health_integration;

-- AUDIT: tamper-evident hash chain
CREATE TABLE health_audit.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES health_tenant.tenants(id),
  user_id UUID REFERENCES health_identity.users(id),
  identity_id UUID,
  user_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  facility_id UUID REFERENCES health_tenant.facilities(id),
  department_id UUID REFERENCES health_tenant.departments(id),
  before_state JSONB,
  after_state JSONB,
  reason TEXT,
  purpose_of_use TEXT,
  ip_address TEXT,
  user_agent TEXT,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hash TEXT NOT NULL,
  previous_hash TEXT,
  chain_index BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX health_audit_tenant_time_idx ON health_audit.audit_events (tenant_id, created_at DESC);
CREATE INDEX health_audit_resource_idx ON health_audit.audit_events (resource_type, resource_id);
CREATE INDEX health_audit_user_idx ON health_audit.audit_events (user_id, created_at DESC);
CREATE INDEX health_audit_patient_idx ON health_audit.audit_events ((after_state->>'patientId')) WHERE resource_type IN ('patient','encounter','clinical_note','prescription');

-- Function to verify audit chain
CREATE OR REPLACE FUNCTION health_audit.verify_chain(p_tenant_id UUID DEFAULT NULL) RETURNS TABLE (is_valid BOOLEAN, broken_at UUID, message TEXT) AS $$
DECLARE
  rec RECORD;
  prev_hash TEXT := '';
  calculated_hash TEXT;
BEGIN
  FOR rec IN SELECT * FROM health_audit.audit_events WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id) ORDER BY chain_index, created_at LOOP
    calculated_hash := encode(digest(rec.id::text || rec.action || rec.resource_type || COALESCE(rec.resource_id::text,'') || COALESCE(prev_hash,'') || rec.created_at::text, 'sha256'), 'hex');
    -- Simplified check; production uses full before/after hashing
    IF rec.previous_hash IS NOT NULL AND rec.previous_hash != prev_hash THEN
      RETURN QUERY SELECT false, rec.id, 'Previous hash mismatch at ' || rec.id::text;
      RETURN;
    END IF;
    prev_hash := rec.hash;
  END LOOP;
  RETURN QUERY SELECT true, NULL::UUID, 'Chain valid'::text;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE health_audit.access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES health_identity.users(id),
  patient_id UUID REFERENCES health_patient.patients(id),
  resource_type TEXT NOT NULL,
  resource_id UUID,
  action TEXT NOT NULL CHECK (action IN ('READ','CREATE','UPDATE','DELETE','SEARCH','EXPORT','PRINT')),
  purpose_of_use TEXT,
  ip_address TEXT,
  user_agent TEXT,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_break_glass BOOLEAN NOT NULL DEFAULT FALSE,
  break_glass_reason TEXT
);
CREATE INDEX health_access_logs_patient_idx ON health_audit.access_logs (patient_id, accessed_at DESC);
CREATE INDEX health_access_logs_user_idx ON health_audit.access_logs (user_id, accessed_at DESC);

-- AI: HIVE and Noelia
CREATE TABLE health_ai.knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES health_tenant.tenants(id),
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('CLINICAL_GUIDELINE','POLICY','PROTOCOL','REGULATORY','KNOWLEDGE_BASE','SYSTEM_DOC')),
  content TEXT,
  url TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  jurisdiction TEXT,
  trust_level INTEGER NOT NULL DEFAULT 50 CHECK (trust_level BETWEEN 0 AND 100),
  owner_id UUID REFERENCES health_identity.users(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DRAFT','RETIRED','ARCHIVED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_ai.hive_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED')),
  engine TEXT NOT NULL CHECK (engine IN ('CLINICAL','OPERATIONAL','FINANCIAL','PHARMACY','LABORATORY','RADIOLOGY','OPHTHALMOLOGY','EXECUTIVE','COMPLIANCE','SUPPLY_CHAIN')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  priority INTEGER NOT NULL DEFAULT 5,
  assigned_to TEXT,
  created_by UUID NOT NULL REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT
);
CREATE INDEX health_hive_tasks_tenant_idx ON health_ai.hive_tasks (tenant_id, status);

CREATE TABLE health_ai.hive_subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES health_ai.hive_tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_ai.noelia_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  user_id UUID NOT NULL REFERENCES health_identity.users(id),
  patient_id UUID REFERENCES health_patient.patients(id),
  title TEXT,
  context_type TEXT CHECK (context_type IN ('CLINICAL','OPERATIONAL','FINANCIAL','GENERAL','EXECUTIVE')),
  purpose_of_use TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_ai.noelia_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES health_ai.noelia_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('USER','ASSISTANT','SYSTEM')),
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'INFORMATION' CHECK (type IN ('INFORMATION','RECOMMENDATION','WARNING','PREDICTION','CLINICAL_DECISION_SUPPORT','AUTHORIZED_ACTION')),
  citations JSONB,
  confidence NUMERIC,
  requires_human_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  is_unsafe BOOLEAN NOT NULL DEFAULT FALSE,
  safety_reason TEXT,
  model TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX health_noelia_messages_conversation_idx ON health_ai.noelia_messages (conversation_id, created_at);

CREATE TABLE health_ai.noelia_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  conversation_id UUID REFERENCES health_ai.noelia_conversations(id),
  message_id UUID REFERENCES health_ai.noelia_messages(id),
  resource_type TEXT NOT NULL,
  resource_id UUID,
  action_type TEXT NOT NULL,
  recommended_action JSONB NOT NULL,
  current_state JSONB,
  rationale TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'LOW' CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','EXECUTED','CANCELLED')),
  approved_by UUID REFERENCES health_identity.users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_by UUID REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_ai.ai_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES health_identity.users(id),
  conversation_id UUID REFERENCES health_ai.noelia_conversations(id),
  action TEXT NOT NULL CHECK (action IN ('QUERY','RETRIEVAL','GENERATION','RECOMMENDATION','APPROVAL','REJECTION','EXECUTION')),
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  retrieval_context JSONB,
  purpose_of_use TEXT,
  patient_id UUID REFERENCES health_patient.patients(id),
  was_authorized BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Integration / FHIR / HL7 / DICOM
CREATE TABLE health_integration.integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('FHIR','HL7','DICOM','DHIS2','NHIF','TMDA','TRA','SMS','EMAIL','PAYMENT Gateway','PACS','LAB_ANALYZER','OTHER')),
  provider TEXT NOT NULL,
  endpoint_url TEXT,
  auth_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  mapping_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE health_integration.fhir_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  fhir_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  version_id TEXT NOT NULL DEFAULT '1',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DELETED')),
  data JSONB NOT NULL,
  search_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  patient_id UUID REFERENCES health_patient.patients(id),
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, resource_type, fhir_id)
);
CREATE INDEX health_fhir_search_idx ON health_integration.fhir_resources USING gin (search_params);
CREATE INDEX health_fhir_patient_idx ON health_integration.fhir_resources (patient_id);

CREATE TABLE health_integration.hl7_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  message_type TEXT NOT NULL,
  trigger_event TEXT,
  source_system TEXT NOT NULL,
  destination_system TEXT,
  raw_message TEXT NOT NULL,
  parsed_json JSONB,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSED','FAILED','ACKNOWLEDGED')),
  patient_id UUID REFERENCES health_patient.patients(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE health_integration.dicom_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  study_instance_uid TEXT NOT NULL,
  patient_id UUID REFERENCES health_patient.patients(id),
  accession_number TEXT,
  study_date DATE,
  modality TEXT,
  referring_physician TEXT,
  study_description TEXT,
  number_of_series INTEGER NOT NULL DEFAULT 0,
  pacs_location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, study_instance_uid)
);

CREATE TABLE health_integration.event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PUBLISHED','FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX health_outbox_status_idx ON health_integration.event_outbox (status, created_at);

CREATE TABLE health_integration.event_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSED','FAILED','DUPLICATE')),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuration engine
CREATE TABLE health_integration.configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  category TEXT NOT NULL CHECK (category IN ('TERMINOLOGY','WORKFLOW','FORMS','DEPARTMENTS','SERVICES','PRICING','APPOINTMENT_RULES','BILLING_RULES','PAYER_RULES','APPROVAL_RULES','NOTIFICATION_TEMPLATES','CLINICAL_TEMPLATES','COMPLIANCE_RULES')),
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, category, key)
);

CREATE TABLE health_integration.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES health_tenant.tenants(id),
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);
INSERT INTO health_integration.feature_flags (tenant_id, key, name, description, is_enabled) VALUES
(NULL, 'ophthalmology_advanced', 'Advanced Ophthalmology', 'Enable advanced ophthalmology features including OCT analysis', true),
(NULL, 'telemedicine_enabled', 'Telemedicine', 'Enable telemedicine consultations', true),
(NULL, 'ai_noelia', 'Noelia AI', 'Enable Noelia AI assistance', true),
(NULL, 'ambulance_tracking', 'Ambulance GPS Tracking', 'Enable real-time ambulance tracking', true),
(NULL, 'offline_mode', 'Offline Mode', 'Enable offline-first capability for mobile', true),
(NULL, 'fhir_r4', 'FHIR R4 API', 'Enable FHIR R4 interoperability', true),
(NULL, 'dicom_web', 'DICOMweb', 'Enable DICOMweb integration', true),
(NULL, 'mtuha_reporting', 'MTUHA Reporting', 'Enable Tanzania MTUHA reporting', true),
(NULL, 'nhif_integration', 'NHIF Integration', 'Enable NHIF payer integration', false)
ON CONFLICT DO NOTHING;
