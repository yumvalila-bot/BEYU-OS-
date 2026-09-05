-- =====================================================================
-- BEYU OS — Migration 0004
-- Logical domains: documents, workflow, notifications, reporting
-- Spec: §35, §36, §37, §38
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS documents;
CREATE SCHEMA IF NOT EXISTS workflow;
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE SCHEMA IF NOT EXISTS reporting;

-- ---------------------------------------------------------------------
-- DOCUMENTS (spec §35)
-- Binary content lives in S3-compatible object storage. Postgres stores
-- metadata, versions and the storage key only.
-- ---------------------------------------------------------------------

CREATE TABLE documents.documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  document_type  TEXT NOT NULL CHECK (document_type IN
                   ('TRUST_DEED','CHARTER','ARTICLES','SHAREHOLDER_AGREEMENT',
                    'BOARD_MINUTES','RESOLUTION','POLICY','CONTRACT','LICENCE',
                    'COMPLIANCE_EVIDENCE','FINANCIAL_STATEMENT','REPORT','OTHER')),
  classification TEXT NOT NULL DEFAULT 'Internal' CHECK (classification IN
                   ('Public','Internal','Confidential','Restricted','SectorSensitive')),
  org_node_id    UUID REFERENCES organization.org_nodes(id),
  entity_id      UUID REFERENCES ownership.legal_entities(id),
  tenant_id      UUID REFERENCES organization.tenants(id),
  country_code   TEXT,
  status         TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN
                   ('DRAFT','IN_REVIEW','APPROVED','EXECUTED','SUPERSEDED','ARCHIVED')),
  current_version INTEGER NOT NULL DEFAULT 1,
  effective_from DATE,
  expires_at     DATE,
  tags           TEXT[] NOT NULL DEFAULT '{}',
  owner_user_id  UUID REFERENCES identity.users(id),
  created_by     UUID REFERENCES identity.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX documents_org_idx ON documents.documents (org_node_id);
CREATE INDEX documents_type_idx ON documents.documents (document_type);
CREATE INDEX documents_expiry_idx ON documents.documents (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE documents.document_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID NOT NULL
                   REFERENCES documents.documents(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL,
  -- Object storage key. Never a filesystem path in production.
  storage_key    TEXT NOT NULL,
  storage_bucket TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     BIGINT NOT NULL CHECK (size_bytes >= 0),
  -- SHA-256 of the file contents, for integrity verification.
  content_hash   TEXT NOT NULL,
  uploaded_by    UUID REFERENCES identity.users(id),
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_note    TEXT,
  UNIQUE (document_id, version)
);

CREATE TABLE documents.document_access (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL
                  REFERENCES documents.documents(id) ON DELETE CASCADE,
  principal_type TEXT NOT NULL CHECK (principal_type IN ('USER','ROLE','ORG_NODE')),
  principal_id  UUID NOT NULL,
  access_level  TEXT NOT NULL CHECK (access_level IN ('READ','WRITE','OWNER')),
  granted_by    UUID REFERENCES identity.users(id),
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ,
  UNIQUE (document_id, principal_type, principal_id)
);

-- Every view/download is recorded; document access is auditable (spec §35).
CREATE TABLE documents.document_access_log (
  id          BIGSERIAL PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents.documents(id) ON DELETE CASCADE,
  version     INTEGER,
  user_id     UUID REFERENCES identity.users(id),
  action      TEXT NOT NULL CHECK (action IN ('VIEW','DOWNLOAD','PRINT','SHARE')),
  ip_address  INET,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX document_access_log_doc_idx
  ON documents.document_access_log (document_id, occurred_at DESC);

CREATE TABLE documents.signatures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES documents.documents(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  signer_id     UUID REFERENCES identity.users(id),
  signer_name   TEXT NOT NULL,
  signer_role   TEXT,
  -- Provider-agnostic: 'INTERNAL' or an e-signature vendor identifier.
  provider      TEXT NOT NULL DEFAULT 'INTERNAL',
  provider_ref  TEXT,
  status        TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','SIGNED','DECLINED','EXPIRED')),
  signature_hash TEXT,
  signed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE documents.retention_policies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  document_type  TEXT,
  country_code   TEXT,
  retain_years   INTEGER NOT NULL CHECK (retain_years >= 0),
  action_on_expiry TEXT NOT NULL DEFAULT 'REVIEW'
                     CHECK (action_on_expiry IN ('REVIEW','ARCHIVE','DELETE')),
  legal_basis    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- WORKFLOW (spec §36)
-- Definitions are DATA (JSONB step graphs), not code.
-- ---------------------------------------------------------------------

CREATE TABLE workflow.definitions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  description   TEXT,
  -- Resource this workflow governs, e.g. 'WaterfallCalculation'.
  resource_type TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT','ACTIVE','DEPRECATED')),
  -- Declarative step graph. Interpreted by the workflow engine; never eval'd.
  steps         JSONB NOT NULL,
  sla_hours     INTEGER,
  created_by    UUID REFERENCES identity.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);

CREATE TABLE workflow.instances (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id  UUID NOT NULL REFERENCES workflow.definitions(id),
  resource_type  TEXT NOT NULL,
  resource_id    UUID NOT NULL,
  org_node_id    UUID REFERENCES organization.org_nodes(id),
  tenant_id      UUID REFERENCES organization.tenants(id),
  status         TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN
                   ('RUNNING','WAITING_APPROVAL','APPROVED','REJECTED',
                    'ESCALATED','CANCELLED','COMPLETED')),
  current_step   TEXT,
  context        JSONB NOT NULL DEFAULT '{}'::jsonb,
  initiated_by   UUID REFERENCES identity.users(id),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at         TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ
);
CREATE INDEX workflow_instances_resource_idx
  ON workflow.instances (resource_type, resource_id);
CREATE INDEX workflow_instances_status_idx ON workflow.instances (status);

CREATE TABLE workflow.steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id  UUID NOT NULL REFERENCES workflow.instances(id) ON DELETE CASCADE,
  step_key     TEXT NOT NULL,
  step_order   INTEGER NOT NULL,
  step_type    TEXT NOT NULL CHECK (step_type IN
                 ('APPROVAL','REVIEW','NOTIFICATION','AUTOMATED_CHECK')),
  status       TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN
                 ('PENDING','ACTIVE','COMPLETED','SKIPPED','REJECTED','ESCALATED')),
  assignee_id  UUID REFERENCES identity.users(id),
  assignee_role TEXT,
  due_at       TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (instance_id, step_key)
);

CREATE TABLE workflow.approvals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES workflow.instances(id) ON DELETE CASCADE,
  step_id     UUID REFERENCES workflow.steps(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES identity.users(id),
  decision    TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED','DELEGATED')),
  comments    TEXT,
  -- TRUE when the approval satisfies an AI-recommendation gate (spec §57).
  approves_ai_recommendation BOOLEAN NOT NULL DEFAULT FALSE,
  decided_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflow.delegations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id  UUID NOT NULL REFERENCES identity.users(id),
  to_user_id    UUID NOT NULL REFERENCES identity.users(id),
  resource_type TEXT,
  valid_from    TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to      TIMESTAMPTZ,
  reason        TEXT,
  CONSTRAINT workflow_delegation_not_self CHECK (from_user_id <> to_user_id)
);

CREATE TABLE workflow.escalations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id  UUID NOT NULL REFERENCES workflow.instances(id) ON DELETE CASCADE,
  step_id      UUID REFERENCES workflow.steps(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,
  escalated_to UUID REFERENCES identity.users(id),
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- NOTIFICATIONS (spec §37)
-- ---------------------------------------------------------------------

CREATE TABLE notifications.templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  channel       TEXT NOT NULL CHECK (channel IN ('IN_APP','EMAIL','SMS','PUSH','WEBHOOK')),
  subject       TEXT,
  body_template TEXT NOT NULL,
  locale        TEXT NOT NULL DEFAULT 'en',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications.notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  tenant_id     UUID REFERENCES organization.tenants(id),
  category      TEXT NOT NULL CHECK (category IN
                  ('GOVERNANCE','RISK','COMPLIANCE','CAPITAL','WATERFALL',
                   'WORKFLOW','DOCUMENT','SECURITY','SYSTEM','AI_RECOMMENDATION')),
  severity      TEXT NOT NULL DEFAULT 'INFO'
                  CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  resource_type TEXT,
  resource_id   UUID,
  action_url    TEXT,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_unread_idx
  ON notifications.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE TABLE notifications.preferences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,
  channel       TEXT NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  digest        TEXT NOT NULL DEFAULT 'IMMEDIATE'
                  CHECK (digest IN ('IMMEDIATE','HOURLY','DAILY','WEEKLY')),
  UNIQUE (user_id, category, channel)
);

CREATE TABLE notifications.deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL
                    REFERENCES notifications.notifications(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'QUEUED'
                    CHECK (status IN ('QUEUED','SENT','DELIVERED','FAILED','SUPPRESSED')),
  provider        TEXT,
  provider_ref    TEXT,
  error           TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications.alert_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  event_topic   TEXT NOT NULL,
  -- Declarative match expression against the event payload.
  match         JSONB NOT NULL DEFAULT '{}'::jsonb,
  template_code TEXT REFERENCES notifications.templates(code),
  target_roles  TEXT[] NOT NULL DEFAULT '{}',
  severity      TEXT NOT NULL DEFAULT 'INFO',
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- REPORTING (spec §38)
-- ---------------------------------------------------------------------

CREATE TABLE reporting.report_definitions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN
                  ('EXECUTIVE','GOVERNANCE','OWNERSHIP','STRATEGY','RISK',
                   'COMPLIANCE','CAPITAL','WATERFALL','AUDIT','CUSTOM')),
  description   TEXT,
  -- Declarative query specification resolved by the reporting service.
  -- Never raw SQL supplied by a client.
  query_spec    JSONB NOT NULL,
  parameters    JSONB NOT NULL DEFAULT '{}'::jsonb,
  min_classification TEXT NOT NULL DEFAULT 'Internal',
  created_by    UUID REFERENCES identity.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reporting.report_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID NOT NULL REFERENCES reporting.report_definitions(id),
  parameters    JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'QUEUED'
                  CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED')),
  format        TEXT NOT NULL DEFAULT 'JSON'
                  CHECK (format IN ('JSON','CSV','PDF','XLSX')),
  storage_key   TEXT,
  row_count     INTEGER,
  error         TEXT,
  requested_by  UUID REFERENCES identity.users(id),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE TABLE reporting.schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID NOT NULL REFERENCES reporting.report_definitions(id),
  cron          TEXT NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  recipients    UUID[] NOT NULL DEFAULT '{}',
  format        TEXT NOT NULL DEFAULT 'PDF',
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at   TIMESTAMPTZ,
  next_run_at   TIMESTAMPTZ
);

CREATE TABLE reporting.dashboards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  audience    TEXT NOT NULL,
  layout      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reporting.dashboard_widgets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id  UUID NOT NULL
                  REFERENCES reporting.dashboards(id) ON DELETE CASCADE,
  widget_key    TEXT NOT NULL,
  widget_type   TEXT NOT NULL,
  title         TEXT NOT NULL,
  definition_id UUID REFERENCES reporting.report_definitions(id),
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  position      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (dashboard_id, widget_key)
);
