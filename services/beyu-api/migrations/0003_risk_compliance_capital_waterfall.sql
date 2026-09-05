-- =====================================================================
-- BEYU OS — Migration 0003
-- Logical domains: risk, compliance, capital, waterfall
-- Spec: §25, §26, §27, §28-§33, §48
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS risk;
CREATE SCHEMA IF NOT EXISTS compliance;
CREATE SCHEMA IF NOT EXISTS capital;
CREATE SCHEMA IF NOT EXISTS waterfall;

-- ---------------------------------------------------------------------
-- RISK (spec §25)
-- ---------------------------------------------------------------------

CREATE TABLE risk.risks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference      TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  category       TEXT NOT NULL CHECK (category IN
                   ('ENTERPRISE','STRATEGIC','FINANCIAL','OPERATIONAL',
                    'CYBER','COMPLIANCE','COUNTRY','SECTOR')),
  status         TEXT NOT NULL DEFAULT 'IDENTIFIED'
                   CHECK (status IN ('IDENTIFIED','ASSESSED','ASSIGNED',
                     'MITIGATION','MONITORING','RESOLVED','ACCEPTED','TRANSFERRED')),
  org_node_id    UUID NOT NULL REFERENCES organization.org_nodes(id),
  country_code   TEXT,
  owner_user_id  UUID REFERENCES identity.users(id),
  likelihood     INTEGER NOT NULL DEFAULT 1 CHECK (likelihood BETWEEN 1 AND 5),
  impact         INTEGER NOT NULL DEFAULT 1 CHECK (impact BETWEEN 1 AND 5),
  -- Always computed server-side as likelihood * impact; never client-supplied.
  inherent_score INTEGER NOT NULL DEFAULT 1 CHECK (inherent_score BETWEEN 1 AND 25),
  residual_score INTEGER CHECK (residual_score BETWEEN 1 AND 25),
  identified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES identity.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX risks_org_idx ON risk.risks (org_node_id);
CREATE INDEX risks_status_idx ON risk.risks (status);
CREATE INDEX risks_score_idx ON risk.risks (inherent_score DESC);

CREATE TABLE risk.risk_assessments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id      UUID NOT NULL REFERENCES risk.risks(id) ON DELETE CASCADE,
  assessed_by  UUID REFERENCES identity.users(id),
  likelihood   INTEGER NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  impact       INTEGER NOT NULL CHECK (impact BETWEEN 1 AND 5),
  score        INTEGER NOT NULL,
  methodology  TEXT,
  notes        TEXT,
  assessed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE risk.risk_mitigations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id       UUID NOT NULL REFERENCES risk.risks(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,
  owner_user_id UUID REFERENCES identity.users(id),
  due_date      DATE,
  status        TEXT NOT NULL DEFAULT 'PLANNED'
                  CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED','OVERDUE')),
  effectiveness TEXT CHECK (effectiveness IN ('HIGH','MEDIUM','LOW','UNKNOWN')),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE risk.risk_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id     UUID NOT NULL REFERENCES risk.risks(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  description TEXT,
  from_status TEXT,
  to_status   TEXT,
  actor_id    UUID REFERENCES identity.users(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- COMPLIANCE (spec §26, §65)
-- Frameworks are DATA. No country's regulations are hard-coded.
-- ---------------------------------------------------------------------

CREATE TABLE compliance.frameworks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  -- NULL country = globally applicable framework (e.g. ISO 27001).
  country_code TEXT,
  sector_code  TEXT,
  version      TEXT NOT NULL DEFAULT '1.0',
  authority    TEXT,
  status       TEXT NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE','SUPERSEDED','DRAFT')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE compliance.requirements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id UUID NOT NULL
                 REFERENCES compliance.frameworks(id) ON DELETE CASCADE,
  reference    TEXT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  mandatory    BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (framework_id, reference)
);

CREATE TABLE compliance.controls (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL
                   REFERENCES compliance.requirements(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  control_type   TEXT NOT NULL DEFAULT 'PREVENTIVE'
                   CHECK (control_type IN ('PREVENTIVE','DETECTIVE','CORRECTIVE')),
  owner_user_id  UUID REFERENCES identity.users(id),
  frequency      TEXT,
  status         TEXT NOT NULL DEFAULT 'NOT_ASSESSED'
                   CHECK (status IN ('EFFECTIVE','PARTIAL','INEFFECTIVE','NOT_ASSESSED')),
  last_tested_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE compliance.evidence (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  control_id   UUID NOT NULL REFERENCES compliance.controls(id) ON DELETE CASCADE,
  document_id  UUID,
  title        TEXT NOT NULL,
  collected_by UUID REFERENCES identity.users(id),
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until  DATE
);

CREATE TABLE compliance.assessments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id UUID NOT NULL REFERENCES compliance.frameworks(id),
  org_node_id  UUID NOT NULL REFERENCES organization.org_nodes(id),
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  -- Compliance score in basis points.
  score_bps    INTEGER CHECK (score_bps BETWEEN 0 AND 10000),
  status       TEXT NOT NULL DEFAULT 'IN_PROGRESS'
                 CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED','SIGNED_OFF')),
  assessor_id  UUID REFERENCES identity.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE compliance.issues (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference     TEXT NOT NULL UNIQUE,
  framework_id  UUID REFERENCES compliance.frameworks(id),
  control_id    UUID REFERENCES compliance.controls(id),
  org_node_id   UUID REFERENCES organization.org_nodes(id),
  title         TEXT NOT NULL,
  description   TEXT,
  severity      TEXT NOT NULL DEFAULT 'MEDIUM'
                  CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status        TEXT NOT NULL DEFAULT 'OPEN'
                  CHECK (status IN ('OPEN','IN_REMEDIATION','RESOLVED','ACCEPTED')),
  owner_user_id UUID REFERENCES identity.users(id),
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);

CREATE TABLE compliance.remediation_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id      UUID NOT NULL REFERENCES compliance.issues(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,
  owner_user_id UUID REFERENCES identity.users(id),
  due_date      DATE,
  status        TEXT NOT NULL DEFAULT 'PLANNED'
                  CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED','OVERDUE')),
  completed_at  TIMESTAMPTZ
);

CREATE TABLE compliance.attestations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id UUID REFERENCES compliance.frameworks(id),
  org_node_id  UUID REFERENCES organization.org_nodes(id),
  attested_by  UUID REFERENCES identity.users(id),
  statement    TEXT NOT NULL,
  period_end   DATE NOT NULL,
  attested_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Country/sector compliance profiles bound to a registered OS (spec §65, §71).
CREATE TABLE compliance.profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  country_code  TEXT,
  sector_code   TEXT,
  framework_ids UUID[] NOT NULL DEFAULT '{}',
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- CAPITAL (spec §27)
-- BEYU OS owns strategic capital orchestration. Finance OS executes.
-- ---------------------------------------------------------------------

CREATE TABLE capital.capital_pools (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  pool_type     TEXT NOT NULL CHECK (pool_type IN
                  ('RESERVE','GROWTH','STRATEGIC','ACQUISITION','EMERGENCY',
                   'FOUNDATION_ALLOCATION','WORKING_CAPITAL')),
  entity_id     UUID NOT NULL REFERENCES ownership.legal_entities(id),
  currency      TEXT NOT NULL,
  -- Minor units (integer). Never floating point.
  balance_minor BIGINT NOT NULL DEFAULT 0,
  target_minor  BIGINT,
  status        TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE','CLOSED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pool_balance_non_negative CHECK (balance_minor >= 0)
);

CREATE TABLE capital.capital_allocations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_pool_id         UUID REFERENCES capital.capital_pools(id),
  destination_entity_id  UUID NOT NULL REFERENCES ownership.legal_entities(id),
  destination_pool_id    UUID REFERENCES capital.capital_pools(id),
  amount_minor           BIGINT NOT NULL CHECK (amount_minor > 0),
  currency               TEXT NOT NULL,
  purpose                TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'PROPOSED'
                           CHECK (status IN ('PROPOSED','APPROVED','REJECTED',
                                             'RELEASED','CANCELLED')),
  waterfall_calculation_id UUID,
  requested_by           UUID REFERENCES identity.users(id),
  approved_by            UUID REFERENCES identity.users(id),
  approved_at            TIMESTAMPTZ,
  released_at            TIMESTAMPTZ,
  -- Reference returned by Finance OS after actual execution.
  execution_reference    TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- An approval must name a human approver (spec §56).
  CONSTRAINT allocation_approval_requires_approver
    CHECK (status <> 'APPROVED' OR approved_by IS NOT NULL)
);
CREATE INDEX capital_allocations_status_idx ON capital.capital_allocations (status);

CREATE TABLE capital.reserves (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id        UUID NOT NULL REFERENCES capital.capital_pools(id),
  name           TEXT NOT NULL,
  target_minor   BIGINT NOT NULL,
  current_minor  BIGINT NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL,
  policy         TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE capital.investments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  entity_id       UUID REFERENCES ownership.legal_entities(id),
  investment_type TEXT NOT NULL,
  amount_minor    BIGINT NOT NULL,
  currency        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PROPOSED'
                    CHECK (status IN ('PROPOSED','APPROVED','ACTIVE','EXITED','REJECTED')),
  expected_return_bps INTEGER,
  start_date      DATE,
  exit_date       DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE capital.investment_decisions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id UUID NOT NULL REFERENCES capital.investments(id) ON DELETE CASCADE,
  decision      TEXT NOT NULL CHECK (decision IN ('APPROVE','REJECT','DEFER')),
  decided_by    UUID REFERENCES identity.users(id),
  resolution_id UUID REFERENCES governance.resolutions(id),
  rationale     TEXT,
  decided_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Foundation funding: Trust -> Foundation, always explicitly approved (spec §34).
CREATE TABLE capital.foundation_allocations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_id       UUID NOT NULL REFERENCES ownership.legal_entities(id),
  foundation_entity_id   UUID NOT NULL REFERENCES ownership.legal_entities(id),
  amount_minor           BIGINT NOT NULL CHECK (amount_minor > 0),
  currency               TEXT NOT NULL,
  purpose                TEXT NOT NULL,
  restrictions           TEXT,
  reporting_requirements TEXT,
  status                 TEXT NOT NULL DEFAULT 'PROPOSED'
                           CHECK (status IN ('PROPOSED','APPROVED','REJECTED','DISBURSED')),
  approved_by            UUID REFERENCES identity.users(id),
  resolution_id          UUID REFERENCES governance.resolutions(id),
  approved_at            TIMESTAMPTZ,
  disbursed_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT foundation_allocation_approver
    CHECK (status <> 'APPROVED' OR approved_by IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- WATERFALL (spec §28-§33, §80)
-- Versioned rules; historical calculations are immutable.
-- ---------------------------------------------------------------------

CREATE TABLE waterfall.rule_sets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  version        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'DRAFT'
                   CHECK (status IN ('DRAFT','REVIEW','APPROVAL','ACTIVE',
                                     'SUSPENDED','ARCHIVED')),
  entity_id      UUID REFERENCES ownership.legal_entities(id),
  country_code   TEXT,
  sector_code    TEXT,
  currency       TEXT NOT NULL,
  effective_from DATE,
  effective_to   DATE,
  description    TEXT,
  created_by     UUID REFERENCES identity.users(id),
  approved_by    UUID REFERENCES identity.users(id),
  approved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, version),
  CONSTRAINT ruleset_active_requires_approver
    CHECK (status <> 'ACTIVE' OR approved_by IS NOT NULL)
);

CREATE TABLE waterfall.tiers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id           UUID NOT NULL
                          REFERENCES waterfall.rule_sets(id) ON DELETE CASCADE,
  priority              INTEGER NOT NULL,
  name                  TEXT NOT NULL,
  category              TEXT NOT NULL CHECK (category IN
                          ('OPERATING_OBLIGATIONS','STATUTORY_TAX','DEBT_SERVICE',
                           'WORKING_CAPITAL','EMERGENCY_RESERVE','MAINTENANCE_CAPEX',
                           'GROWTH_CAPEX','STRATEGIC_INVESTMENT','APPROVED_DISTRIBUTIONS',
                           'TRUST_CAPITAL','FOUNDATION_ALLOCATION')),
  computation_type      TEXT NOT NULL CHECK (computation_type IN
                          ('FIXED_AMOUNT','PERCENTAGE','RESERVE_TARGET','RESIDUAL')),
  -- All monetary values in minor units; percentages in basis points.
  fixed_amount_minor    BIGINT CHECK (fixed_amount_minor IS NULL OR fixed_amount_minor >= 0),
  percentage_bps        INTEGER CHECK (percentage_bps IS NULL OR
                                       percentage_bps BETWEEN 0 AND 10000),
  reserve_target_minor  BIGINT,
  reserve_current_minor BIGINT,
  minimum_minor         BIGINT,
  maximum_minor         BIGINT,
  threshold_minor       BIGINT,
  destination_entity_id UUID REFERENCES ownership.legal_entities(id),
  country_code          TEXT,
  sector_code           TEXT,
  requires_approval     BOOLEAN NOT NULL DEFAULT FALSE,
  condition             JSONB,
  notes                 TEXT,
  UNIQUE (rule_set_id, priority),
  -- Each computation type must carry its required parameter.
  CONSTRAINT tier_params_present CHECK (
    (computation_type = 'FIXED_AMOUNT'   AND fixed_amount_minor IS NOT NULL) OR
    (computation_type = 'PERCENTAGE'     AND percentage_bps IS NOT NULL) OR
    (computation_type = 'RESERVE_TARGET' AND reserve_target_minor IS NOT NULL) OR
    (computation_type = 'RESIDUAL')
  ),
  CONSTRAINT tier_min_lte_max CHECK (
    minimum_minor IS NULL OR maximum_minor IS NULL OR minimum_minor <= maximum_minor
  )
);

CREATE TABLE waterfall.periods (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'OPEN'
                 CHECK (status IN ('OPEN','LOCKED','CLOSED')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT period_valid CHECK (period_end >= period_start)
);

-- A calculation is an IMMUTABLE historical record (spec §32, §86.37).
-- It pins the exact rule set version and stores a reproducibility hash.
CREATE TABLE waterfall.calculations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id          UUID NOT NULL REFERENCES waterfall.rule_sets(id),
  rule_set_version     TEXT NOT NULL,
  period_id            UUID NOT NULL REFERENCES waterfall.periods(id),
  currency             TEXT NOT NULL,
  inflow_minor         BIGINT NOT NULL CHECK (inflow_minor >= 0),
  total_allocated_minor BIGINT NOT NULL CHECK (total_allocated_minor >= 0),
  unallocated_minor    BIGINT NOT NULL CHECK (unallocated_minor >= 0),
  status               TEXT NOT NULL DEFAULT 'CALCULATED'
                         CHECK (status IN ('DRAFT','CALCULATED','PENDING_APPROVAL',
                           'APPROVED','REJECTED','RELEASED_FOR_EXECUTION')),
  -- SHA-256 over the exact rules + inputs used, proving reproducibility.
  input_hash           TEXT NOT NULL,
  -- Frozen copy of the tier definitions used, so history survives rule edits.
  rules_snapshot       JSONB NOT NULL,
  calculated_by        UUID REFERENCES identity.users(id),
  calculated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by          UUID REFERENCES identity.users(id),
  approved_at          TIMESTAMPTZ,
  released_at          TIMESTAMPTZ,
  -- Conservation invariant enforced by the database itself.
  CONSTRAINT calculation_conservation
    CHECK (total_allocated_minor + unallocated_minor = inflow_minor),
  CONSTRAINT calculation_approval_requires_approver
    CHECK (status NOT IN ('APPROVED','RELEASED_FOR_EXECUTION') OR approved_by IS NOT NULL)
);
CREATE INDEX calculations_period_idx ON waterfall.calculations (period_id);
CREATE INDEX calculations_ruleset_idx ON waterfall.calculations (rule_set_id);

CREATE TABLE waterfall.allocations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id         UUID NOT NULL
                           REFERENCES waterfall.calculations(id) ON DELETE CASCADE,
  tier_id                UUID NOT NULL,
  tier_name              TEXT NOT NULL,
  priority               INTEGER NOT NULL,
  category               TEXT NOT NULL,
  computation_type       TEXT NOT NULL,
  available_before_minor BIGINT NOT NULL,
  allocated_minor        BIGINT NOT NULL CHECK (allocated_minor >= 0),
  remaining_after_minor  BIGINT NOT NULL,
  skipped                BOOLEAN NOT NULL DEFAULT FALSE,
  skip_reason            TEXT,
  adjustments            TEXT[] NOT NULL DEFAULT '{}',
  destination_entity_id  UUID,
  requires_approval      BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (calculation_id, tier_id)
);

CREATE TABLE waterfall.approvals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id UUID NOT NULL
                   REFERENCES waterfall.calculations(id) ON DELETE CASCADE,
  approver_id    UUID NOT NULL REFERENCES identity.users(id),
  decision       TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
  comments       TEXT,
  decided_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (calculation_id, approver_id)
);

-- Distributions handed to Finance/Treasury. BEYU OS records the DECISION;
-- it never performs the transfer (spec §28, §70).
CREATE TABLE waterfall.distributions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id      UUID NOT NULL REFERENCES waterfall.calculations(id),
  allocation_id       UUID REFERENCES waterfall.allocations(id),
  destination_entity_id UUID NOT NULL REFERENCES ownership.legal_entities(id),
  amount_minor        BIGINT NOT NULL CHECK (amount_minor > 0),
  currency            TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'PENDING_EXECUTION'
                        CHECK (status IN ('PENDING_EXECUTION','SENT_TO_FINANCE',
                                          'EXECUTED','FAILED','CANCELLED')),
  -- Populated by Finance OS via the integration layer.
  finance_reference   TEXT,
  sent_at             TIMESTAMPTZ,
  executed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scenario modelling (spec §33). Scenarios never affect actual allocations.
CREATE TABLE waterfall.scenarios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  rule_set_id   UUID NOT NULL REFERENCES waterfall.rule_sets(id),
  scenario_type TEXT NOT NULL,
  assumptions   JSONB NOT NULL DEFAULT '{}'::jsonb,
  inflow_minor  BIGINT NOT NULL,
  currency      TEXT NOT NULL,
  result        JSONB,
  -- TRUE when Noelia proposed the scenario; still requires human action.
  ai_generated  BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    UUID REFERENCES identity.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- IMMUTABILITY GUARD (spec §86.37)
-- Approved/released calculations and their lines can never be mutated.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION waterfall.prevent_historical_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    RAISE EXCEPTION
      'Waterfall calculations are immutable historical records and cannot be deleted.';
  END IF;
  IF (OLD.status IN ('APPROVED','RELEASED_FOR_EXECUTION')) THEN
    -- Only the execution-tracking fields may advance after approval.
    IF (NEW.inflow_minor           IS DISTINCT FROM OLD.inflow_minor OR
        NEW.total_allocated_minor  IS DISTINCT FROM OLD.total_allocated_minor OR
        NEW.unallocated_minor      IS DISTINCT FROM OLD.unallocated_minor OR
        NEW.rule_set_id            IS DISTINCT FROM OLD.rule_set_id OR
        NEW.rule_set_version       IS DISTINCT FROM OLD.rule_set_version OR
        NEW.input_hash             IS DISTINCT FROM OLD.input_hash OR
        NEW.rules_snapshot::text   IS DISTINCT FROM OLD.rules_snapshot::text) THEN
      RAISE EXCEPTION
        'Cannot modify an approved waterfall calculation. Historical financial '
        'calculations must never be silently changed. Create a new calculation instead.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculations_immutable
  BEFORE UPDATE OR DELETE ON waterfall.calculations
  FOR EACH ROW EXECUTE FUNCTION waterfall.prevent_historical_mutation();

CREATE OR REPLACE FUNCTION waterfall.prevent_allocation_mutation()
RETURNS TRIGGER AS $$
DECLARE
  parent_status TEXT;
BEGIN
  SELECT status INTO parent_status
    FROM waterfall.calculations
   WHERE id = COALESCE(NEW.calculation_id, OLD.calculation_id);

  IF parent_status IN ('APPROVED','RELEASED_FOR_EXECUTION') THEN
    RAISE EXCEPTION
      'Allocation lines of an approved calculation are immutable.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER allocations_immutable
  BEFORE UPDATE OR DELETE ON waterfall.allocations
  FOR EACH ROW EXECUTE FUNCTION waterfall.prevent_allocation_mutation();
