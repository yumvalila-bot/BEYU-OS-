-- =====================================================================
-- BEYU OS — Migration 0005
-- Logical domains: audit (hash-chained), integrations, ai (noelia + hive),
--                  future OS registry extensions, organization builder
-- Spec: §39, §40, §41, §42, §43, §44, §57, §71
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS integrations;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS builder;

-- ---------------------------------------------------------------------
-- AUDIT (spec §39)
-- Append-only, tamper-evident hash chain. Matches @beyu/security's
-- verifyAuditChain(): entry_hash = SHA-256(canonicalJson(entry+previous_hash)).
-- ---------------------------------------------------------------------

-- Column names and types mirror @beyu/security's computeAuditHash() input
-- exactly. Any divergence would make stored hashes unverifiable.
CREATE TABLE audit.audit_log (
  -- Monotonic chain position. Gaps or reordering break verification.
  sequence       BIGSERIAL PRIMARY KEY,
  id             UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  -- Millisecond precision ON PURPOSE, matching JavaScript's Date resolution.
  -- The chain hash is computed over an ISO-8601 string with exactly 3
  -- fractional digits. AuditRepository.append() always supplies occurred_at
  -- explicitly, so the hashed value and the stored value are identical.
  -- The (3) is defence in depth for any path that falls back to the DEFAULT:
  -- real PostgreSQL's now() has MICROsecond resolution, and a stored value of
  -- ...123456 would re-serialise as ...123 on read, producing a hash mismatch
  -- that looks like tampering. Truncating at write time keeps the two equal.
  occurred_at    TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  actor_user_id  UUID,
  actor_identity_id UUID,
  actor_type     TEXT NOT NULL DEFAULT 'USER'
                   CHECK (actor_type IN ('USER','SERVICE','AI_AGENT','SYSTEM')),
  actor_label    TEXT,
  action         TEXT NOT NULL,
  resource_type  TEXT NOT NULL,
  resource_id    TEXT,
  organization_id UUID,
  tenant_id      UUID,
  os_id          TEXT,
  outcome        TEXT NOT NULL DEFAULT 'SUCCESS'
                   CHECK (outcome IN ('SUCCESS','DENIED','FAILURE','ERROR')),
  reason         TEXT,
  -- Before/after snapshots for mutations, already data-minimised.
  previous_state JSONB,
  new_state      JSONB,
  -- The authorization decision that permitted or denied the action.
  authorization_context JSONB,
  ip_address     INET,
  user_agent     TEXT,
  request_id     TEXT,
  application_context TEXT,
  -- Hash chain. Genesis previous_hash is 64 zero characters.
  previous_hash  TEXT NOT NULL,
  entry_hash     TEXT NOT NULL UNIQUE,
  CONSTRAINT audit_hash_length CHECK (
    char_length(entry_hash) = 64 AND char_length(previous_hash) = 64
  )
);
CREATE INDEX audit_log_occurred_idx ON audit.audit_log (occurred_at DESC);
CREATE INDEX audit_log_actor_idx ON audit.audit_log (actor_user_id, occurred_at DESC);
CREATE INDEX audit_log_resource_idx ON audit.audit_log (resource_type, resource_id);
CREATE INDEX audit_log_outcome_idx ON audit.audit_log (outcome)
  WHERE outcome <> 'SUCCESS';

-- Hard append-only guarantee at the storage layer, not just in application code.
CREATE OR REPLACE FUNCTION audit.reject_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'audit.audit_log is append-only: % is not permitted on audit records.', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit.audit_log
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

-- Periodic verification runs, so tampering is detected rather than assumed absent.
CREATE TABLE audit.chain_verifications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verified_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  from_sequence      BIGINT NOT NULL,
  to_sequence        BIGINT NOT NULL,
  checked_count      BIGINT NOT NULL,
  valid              BOOLEAN NOT NULL,
  broken_at_sequence BIGINT,
  reason             TEXT,
  verified_by        UUID
);

-- Security-relevant events kept separately for SIEM export (spec §55).
CREATE TABLE audit.security_events (
  id          BIGSERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL CHECK (event_type IN
                ('LOGIN_SUCCESS','LOGIN_FAILURE','MFA_CHALLENGE','MFA_FAILURE',
                 'LOCKOUT','PERMISSION_DENIED','PRIVILEGE_ESCALATION_ATTEMPT',
                 'TOKEN_REJECTED','SUSPICIOUS_EXPORT','AI_ACTION_BLOCKED')),
  severity    TEXT NOT NULL DEFAULT 'INFO'
                CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  user_id     UUID,
  ip_address  INET,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX security_events_type_idx
  ON audit.security_events (event_type, occurred_at DESC);

-- ---------------------------------------------------------------------
-- INTEGRATIONS (spec §40, §69, §70)
-- Cross-OS communication is ALWAYS via versioned contracts. No other OS
-- ever reaches into this database, and BEYU OS never reaches into theirs.
-- ---------------------------------------------------------------------

CREATE TABLE integrations.connections (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  -- Target OS identifier from organization.os_registry, e.g. 'finance-os'.
  target_os_id   TEXT,
  direction      TEXT NOT NULL DEFAULT 'BIDIRECTIONAL'
                   CHECK (direction IN ('INBOUND','OUTBOUND','BIDIRECTIONAL')),
  transport      TEXT NOT NULL CHECK (transport IN ('REST','EVENT','WEBHOOK','FILE')),
  base_url       TEXT,
  -- Reference to a secret in the secret manager. NEVER the secret itself.
  credential_ref TEXT,
  status         TEXT NOT NULL DEFAULT 'INACTIVE'
                   CHECK (status IN ('ACTIVE','INACTIVE','DEGRADED','ERROR')),
  last_health_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_inline_secrets CHECK (
    credential_ref IS NULL OR credential_ref NOT ILIKE '%BEGIN % PRIVATE KEY%'
  )
);

CREATE TABLE integrations.contracts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES integrations.connections(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  version       TEXT NOT NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')),
  -- JSON Schema for the payload. Contract changes require a new version.
  schema        JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('DRAFT','ACTIVE','DEPRECATED','RETIRED')),
  deprecated_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

CREATE TABLE integrations.data_exchanges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id  UUID REFERENCES integrations.connections(id),
  contract_id    UUID REFERENCES integrations.contracts(id),
  direction      TEXT NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')),
  resource_type  TEXT,
  resource_id    TEXT,
  correlation_id TEXT,
  status         TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING','SENT','ACKNOWLEDGED','FAILED','REJECTED')),
  payload_hash   TEXT,
  error          TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX data_exchanges_correlation_idx
  ON integrations.data_exchanges (correlation_id);

CREATE TABLE integrations.webhooks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES integrations.connections(id) ON DELETE CASCADE,
  event_topic   TEXT NOT NULL,
  target_url    TEXT NOT NULL,
  secret_ref    TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Durable outbox: events are written in the same transaction as the state
-- change, then published. Guarantees no lost domain events.
CREATE TABLE integrations.event_outbox (
  id            BIGSERIAL PRIMARY KEY,
  event_id      UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  topic         TEXT NOT NULL,
  payload       JSONB NOT NULL,
  headers       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','PUBLISHED','FAILED','DEAD_LETTER')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);
CREATE INDEX event_outbox_pending_idx ON integrations.event_outbox (created_at)
  WHERE status = 'PENDING';

CREATE TABLE integrations.event_inbox (
  id            BIGSERIAL PRIMARY KEY,
  event_id      UUID NOT NULL,
  topic         TEXT NOT NULL,
  source_os_id  TEXT,
  payload       JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'RECEIVED'
                  CHECK (status IN ('RECEIVED','PROCESSED','REJECTED','DEAD_LETTER')),
  error         TEXT,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ,
  -- Idempotency: the same event is never processed twice.
  UNIQUE (event_id)
);

CREATE TABLE integrations.sync_state (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id  UUID NOT NULL REFERENCES integrations.connections(id) ON DELETE CASCADE,
  resource_type  TEXT NOT NULL,
  cursor         TEXT,
  last_synced_at TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'IDLE'
                   CHECK (status IN ('IDLE','SYNCING','ERROR')),
  UNIQUE (connection_id, resource_type)
);

-- ---------------------------------------------------------------------
-- AI: NOELIA (executive intelligence) + HIVE (multi-agent) — spec §41-§43
-- Recommendation and execution are strictly separated. AI output is
-- ALWAYS a recommendation until a human approves it (spec §57).
-- ---------------------------------------------------------------------

CREATE TABLE ai.agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  system        TEXT NOT NULL CHECK (system IN ('NOELIA','HIVE')),
  role          TEXT NOT NULL,
  description   TEXT,
  -- Read-scopes only. AI is never granted write scopes here (spec §58).
  allowed_scopes TEXT[] NOT NULL DEFAULT '{}',
  max_classification TEXT NOT NULL DEFAULT 'Internal'
                       CHECK (max_classification IN
                         ('Public','Internal','Confidential','Restricted')),
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Defence in depth: an agent can never be marked SectorSensitive-capable.
  CONSTRAINT ai_never_sector_sensitive
    CHECK (max_classification <> 'SectorSensitive')
);

CREATE TABLE ai.conversations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     UUID REFERENCES ai.agents(id),
  user_id      UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  tenant_id    UUID REFERENCES organization.tenants(id),
  title        TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ
);

CREATE TABLE ai.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL
                    REFERENCES ai.conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('USER','ASSISTANT','SYSTEM','TOOL')),
  content         TEXT NOT NULL,
  -- Data the model was allowed to see, after minimisation (spec §59).
  context_refs    JSONB NOT NULL DEFAULT '[]'::jsonb,
  model           TEXT,
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_conversation_idx
  ON ai.messages (conversation_id, created_at);

-- Every AI suggestion is stored as a RECOMMENDATION requiring human action.
CREATE TABLE ai.recommendations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id       UUID REFERENCES ai.agents(id),
  conversation_id UUID REFERENCES ai.conversations(id),
  category       TEXT NOT NULL CHECK (category IN
                   ('STRATEGY','RISK','COMPLIANCE','CAPITAL','WATERFALL',
                    'GOVERNANCE','ORGANIZATION','OTHER')),
  title          TEXT NOT NULL,
  rationale      TEXT NOT NULL,
  -- Proposed change, never applied automatically.
  proposed_action JSONB NOT NULL,
  resource_type  TEXT,
  resource_id    UUID,
  confidence_bps INTEGER CHECK (confidence_bps BETWEEN 0 AND 10000),
  impact         TEXT CHECK (impact IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status         TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN
                   ('PENDING_REVIEW','ACCEPTED','REJECTED','SUPERSEDED','EXPIRED')),
  -- A recommendation can only ever be enacted through a workflow instance.
  workflow_instance_id UUID REFERENCES workflow.instances(id),
  reviewed_by    UUID REFERENCES identity.users(id),
  reviewed_at    TIMESTAMPTZ,
  review_notes   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Enforces spec §57: acceptance requires a named human reviewer.
  CONSTRAINT ai_acceptance_requires_human
    CHECK (status <> 'ACCEPTED' OR reviewed_by IS NOT NULL)
);
CREATE INDEX ai_recommendations_status_idx ON ai.recommendations (status);

-- Complete record of every AI action attempt, including blocked ones.
CREATE TABLE ai.action_log (
  id            BIGSERIAL PRIMARY KEY,
  agent_id      UUID REFERENCES ai.agents(id),
  -- The human on whose behalf the agent acted. AI never acts unattributed.
  on_behalf_of  UUID REFERENCES identity.users(id),
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  decision      TEXT NOT NULL CHECK (decision IN
                  ('PERMITTED','REQUIRES_HUMAN_APPROVAL','DENIED')),
  reason        TEXT NOT NULL,
  downgraded_to_recommendation BOOLEAN NOT NULL DEFAULT FALSE,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_action_log_decision_idx ON ai.action_log (decision, occurred_at DESC);

-- HIVE: multi-agent orchestration (spec §43).
CREATE TABLE ai.hive_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  objective     TEXT NOT NULL,
  requested_by  UUID REFERENCES identity.users(id),
  status        TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN
                  ('QUEUED','RUNNING','AWAITING_APPROVAL','COMPLETED','FAILED','CANCELLED')),
  result        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE TABLE ai.hive_subtasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES ai.hive_tasks(id) ON DELETE CASCADE,
  agent_id    UUID REFERENCES ai.agents(id),
  step_order  INTEGER NOT NULL,
  instruction TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED','SKIPPED')),
  output      JSONB,
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE TABLE ai.model_registry (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     TEXT NOT NULL,
  model        TEXT NOT NULL,
  purpose      TEXT NOT NULL,
  -- Secret manager reference only.
  credential_ref TEXT,
  max_tokens   INTEGER,
  enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, model, purpose)
);

-- ---------------------------------------------------------------------
-- ORGANIZATION BUILDER + FUTURE OS REGISTRY (spec §44, §71)
-- New countries, sectors and OSs are onboarded as CONFIGURATION.
-- No code changes, no hard-coded country logic.
-- ---------------------------------------------------------------------

CREATE TABLE builder.templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN
                  ('COUNTRY_HOLDING','SECTOR_LLC','SUBSIDIARY','FOUNDATION_ARM',
                   'GOVERNANCE_BODY','OS_ONBOARDING')),
  description   TEXT,
  -- Declarative blueprint: nodes, entities, bodies, default roles.
  blueprint     JSONB NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE builder.provisioning_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID REFERENCES builder.templates(id),
  request_type  TEXT NOT NULL CHECK (request_type IN
                  ('NEW_COUNTRY','NEW_SECTOR','NEW_ENTITY','NEW_OS','NEW_TENANT')),
  parameters    JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN
                  ('DRAFT','PENDING_APPROVAL','APPROVED','PROVISIONING',
                   'COMPLETED','REJECTED','FAILED')),
  workflow_instance_id UUID REFERENCES workflow.instances(id),
  requested_by  UUID REFERENCES identity.users(id),
  approved_by   UUID REFERENCES identity.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  error         TEXT,
  CONSTRAINT provisioning_approval_requires_approver
    CHECK (status NOT IN ('APPROVED','PROVISIONING','COMPLETED')
           OR approved_by IS NOT NULL)
);

CREATE TABLE builder.provisioning_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL
                REFERENCES builder.provisioning_requests(id) ON DELETE CASCADE,
  step_order  INTEGER NOT NULL,
  description TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED','ROLLED_BACK')),
  created_resource_type TEXT,
  created_resource_id   UUID,
  error       TEXT,
  executed_at TIMESTAMPTZ
);

-- Versioned data contracts a future OS must satisfy to join the ecosystem.
CREATE TABLE builder.os_onboarding (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id              TEXT NOT NULL UNIQUE,
  display_name       TEXT NOT NULL,
  owner_org_node_id  UUID REFERENCES organization.org_nodes(id),
  required_contracts UUID[] NOT NULL DEFAULT '{}',
  readiness          TEXT NOT NULL DEFAULT 'PLANNED' CHECK (readiness IN
                       ('PLANNED','IN_DEVELOPMENT','INTEGRATION_TESTING','LIVE','RETIRED')),
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
