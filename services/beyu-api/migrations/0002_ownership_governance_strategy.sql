-- =====================================================================
-- BEYU OS — Migration 0002
-- Logical domains: ownership, governance, strategy
-- Spec: §22, §23, §24, §48
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS ownership;
CREATE SCHEMA IF NOT EXISTS governance;
CREATE SCHEMA IF NOT EXISTS strategy;

-- ---------------------------------------------------------------------
-- OWNERSHIP (spec §22)
-- Percentages are stored in BASIS POINTS as integers. Never hard-coded.
-- Every change preserves history via effective dating.
-- ---------------------------------------------------------------------

CREATE TABLE ownership.legal_entities (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  entity_type          TEXT NOT NULL CHECK (entity_type IN
                         ('TRUST','CORPORATION','LLC','FOUNDATION',
                          'PARTNERSHIP','NATURAL_PERSON')),
  registration_number  TEXT,
  jurisdiction_country TEXT NOT NULL,
  incorporation_date   DATE,
  org_node_id          UUID REFERENCES organization.org_nodes(id),
  status               TEXT NOT NULL DEFAULT 'ACTIVE'
                         CHECK (status IN ('ACTIVE','DORMANT','DISSOLVED')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT legal_entities_forbidden_name
    CHECK (upper(btrim(name)) <> 'BEYU GROUP')
);

CREATE TABLE ownership.share_classes (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id              UUID NOT NULL
                           REFERENCES ownership.legal_entities(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  voting_rights_per_share INTEGER NOT NULL DEFAULT 1,
  economic_rights_bps    INTEGER CHECK (economic_rights_bps BETWEEN 0 AND 10000),
  authorized_shares      BIGINT,
  issued_shares          BIGINT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, name)
);

CREATE TABLE ownership.ownership_interests (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owned_entity_id           UUID NOT NULL
                              REFERENCES ownership.legal_entities(id) ON DELETE RESTRICT,
  owner_entity_id           UUID NOT NULL
                              REFERENCES ownership.legal_entities(id) ON DELETE RESTRICT,
  share_class_id            UUID REFERENCES ownership.share_classes(id),
  -- 10000 bps = 100%. Integer arithmetic only.
  percentage_bps            INTEGER NOT NULL
                              CHECK (percentage_bps BETWEEN 0 AND 10000),
  shares                    BIGINT,
  capital_contribution_minor BIGINT,
  currency                  TEXT,
  is_beneficial_owner       BOOLEAN NOT NULL DEFAULT FALSE,
  effective_from            DATE NOT NULL,
  -- NULL while current. Closing a row supersedes it; rows are never deleted.
  effective_to              DATE,
  created_by                UUID REFERENCES identity.users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_by_change_id   UUID,
  CONSTRAINT ownership_no_self_ownership
    CHECK (owned_entity_id <> owner_entity_id),
  CONSTRAINT ownership_valid_period
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ownership_owned_idx ON ownership.ownership_interests (owned_entity_id);
CREATE INDEX ownership_owner_idx ON ownership.ownership_interests (owner_entity_id);
-- Only one current interest per (owned, owner, share class).
CREATE UNIQUE INDEX ownership_current_unique
  ON ownership.ownership_interests
     (owned_entity_id, owner_entity_id, COALESCE(share_class_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE effective_to IS NULL;

-- Immutable append-only history of ownership changes.
CREATE TABLE ownership.ownership_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interest_id    UUID NOT NULL,
  owned_entity_id UUID NOT NULL,
  owner_entity_id UUID NOT NULL,
  change_type    TEXT NOT NULL CHECK (change_type IN
                   ('CREATED','INCREASED','DECREASED','TRANSFERRED','TERMINATED')),
  previous_percentage_bps INTEGER,
  new_percentage_bps      INTEGER,
  effective_date TIMESTAMPTZ NOT NULL,
  reason         TEXT,
  approved_by    UUID REFERENCES identity.users(id),
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ownership_history_interest_idx
  ON ownership.ownership_history (interest_id);

CREATE TABLE ownership.beneficial_owners (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id      UUID NOT NULL
                   REFERENCES ownership.legal_entities(id) ON DELETE CASCADE,
  identity_id    UUID,
  person_name    TEXT NOT NULL,
  -- Effective look-through ownership, computed and stored for KYC/AML.
  effective_bps  INTEGER NOT NULL CHECK (effective_bps BETWEEN 0 AND 10000),
  nature_of_control TEXT,
  verified_at    TIMESTAMPTZ,
  effective_from DATE NOT NULL,
  effective_to   DATE
);

-- ---------------------------------------------------------------------
-- GOVERNANCE (spec §23)
-- ---------------------------------------------------------------------

CREATE TABLE governance.bodies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  body_type           TEXT NOT NULL CHECK (body_type IN
                        ('BOARD','COMMITTEE','TRUSTEE_COUNCIL')),
  org_node_id         UUID NOT NULL REFERENCES organization.org_nodes(id),
  parent_body_id      UUID REFERENCES governance.bodies(id),
  charter_document_id UUID,
  quorum              INTEGER NOT NULL DEFAULT 1 CHECK (quorum >= 1),
  status              TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE','DISSOLVED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE governance.body_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body_id      UUID NOT NULL REFERENCES governance.bodies(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES identity.users(id),
  member_name  TEXT NOT NULL,
  role         TEXT NOT NULL,        -- CHAIR, MEMBER, SECRETARY, OBSERVER
  voting_rights BOOLEAN NOT NULL DEFAULT TRUE,
  appointed_at DATE NOT NULL,
  resigned_at  DATE,
  UNIQUE (body_id, user_id, appointed_at)
);

CREATE TABLE governance.meetings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body_id      UUID NOT NULL REFERENCES governance.bodies(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  location     TEXT,
  status       TEXT NOT NULL DEFAULT 'SCHEDULED'
                 CHECK (status IN ('SCHEDULED','IN_PROGRESS','HELD','CANCELLED')),
  quorum_met   BOOLEAN,
  minutes_document_id UUID,
  created_by   UUID REFERENCES identity.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX meetings_body_idx ON governance.meetings (body_id, scheduled_at DESC);

CREATE TABLE governance.agenda_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  UUID NOT NULL REFERENCES governance.meetings(id) ON DELETE CASCADE,
  item_order  INTEGER NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  presenter   TEXT,
  UNIQUE (meeting_id, item_order)
);

CREATE TABLE governance.resolutions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body_id        UUID NOT NULL REFERENCES governance.bodies(id),
  meeting_id     UUID REFERENCES governance.meetings(id),
  reference      TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'DRAFT'
                   CHECK (status IN ('DRAFT','PROPOSED','VOTING','CARRIED',
                                     'DEFEATED','WITHDRAWN')),
  proposed_by    UUID REFERENCES identity.users(id),
  votes_for      INTEGER NOT NULL DEFAULT 0,
  votes_against  INTEGER NOT NULL DEFAULT 0,
  votes_abstain  INTEGER NOT NULL DEFAULT 0,
  decided_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE governance.votes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resolution_id UUID NOT NULL
                  REFERENCES governance.resolutions(id) ON DELETE CASCADE,
  member_id     UUID NOT NULL REFERENCES governance.body_members(id),
  choice        TEXT NOT NULL CHECK (choice IN ('FOR','AGAINST','ABSTAIN','RECUSED')),
  rationale     TEXT,
  cast_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One vote per member per resolution.
  UNIQUE (resolution_id, member_id)
);

CREATE TABLE governance.policies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  category      TEXT,
  org_node_id   UUID REFERENCES organization.org_nodes(id),
  document_id   UUID,
  version       TEXT NOT NULL DEFAULT '1.0',
  status        TEXT NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT','ACTIVE','SUPERSEDED','RETIRED')),
  effective_from DATE,
  review_due    DATE,
  owner_user_id UUID REFERENCES identity.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Delegation of authority (spec §23, §36).
CREATE TABLE governance.delegations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id   UUID NOT NULL REFERENCES identity.users(id),
  delegate_id    UUID NOT NULL REFERENCES identity.users(id),
  scope_resource TEXT NOT NULL,
  scope_action   TEXT NOT NULL,
  -- Monetary ceiling on the delegated authority, in minor units.
  limit_minor    BIGINT,
  currency       TEXT,
  valid_from     TIMESTAMPTZ NOT NULL,
  valid_to       TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL DEFAULT 'ACTIVE'
                   CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT delegation_valid_period CHECK (valid_to > valid_from),
  CONSTRAINT delegation_not_self CHECK (delegator_id <> delegate_id)
);

-- ---------------------------------------------------------------------
-- STRATEGY (spec §24)
-- ---------------------------------------------------------------------

CREATE TABLE strategy.strategic_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  org_node_id   UUID NOT NULL REFERENCES organization.org_nodes(id),
  horizon_start DATE NOT NULL,
  horizon_end   DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT','ACTIVE','COMPLETED','ARCHIVED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_valid_horizon CHECK (horizon_end > horizon_start)
);

CREATE TABLE strategy.objectives (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       UUID NOT NULL
                  REFERENCES strategy.strategic_plans(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  owner_user_id UUID REFERENCES identity.users(id),
  progress_bps  INTEGER NOT NULL DEFAULT 0
                  CHECK (progress_bps BETWEEN 0 AND 10000),
  status        TEXT NOT NULL DEFAULT 'NOT_STARTED'
                  CHECK (status IN ('NOT_STARTED','ON_TRACK','AT_RISK',
                                    'OFF_TRACK','ACHIEVED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE strategy.key_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id  UUID NOT NULL REFERENCES strategy.objectives(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  -- NUMERIC avoids float drift on aggregation.
  target_value  NUMERIC(20,4) NOT NULL,
  current_value NUMERIC(20,4) NOT NULL DEFAULT 0,
  unit          TEXT NOT NULL,
  due_date      DATE
);

CREATE TABLE strategy.kpis (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  org_node_id   UUID NOT NULL REFERENCES organization.org_nodes(id),
  unit          TEXT NOT NULL,
  target_value  NUMERIC(20,4),
  current_value NUMERIC(20,4),
  direction     TEXT NOT NULL DEFAULT 'HIGHER_IS_BETTER'
                  CHECK (direction IN ('HIGHER_IS_BETTER','LOWER_IS_BETTER')),
  -- Set when the value was supplied by a Sector OS under a data contract.
  source_os_id  TEXT,
  period_end    DATE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX kpis_org_idx ON strategy.kpis (org_node_id);

CREATE TABLE strategy.initiatives (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       UUID REFERENCES strategy.strategic_plans(id) ON DELETE SET NULL,
  objective_id  UUID REFERENCES strategy.objectives(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  owner_user_id UUID REFERENCES identity.users(id),
  budget_minor  BIGINT,
  currency      TEXT,
  start_date    DATE,
  end_date      DATE,
  status        TEXT NOT NULL DEFAULT 'PLANNED'
                  CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED',
                                    'ON_HOLD','CANCELLED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE strategy.milestones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id UUID NOT NULL
                  REFERENCES strategy.initiatives(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  due_date      DATE NOT NULL,
  completed_at  TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','COMPLETED','MISSED'))
);

CREATE TABLE strategy.performance_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_node_id  UUID NOT NULL REFERENCES organization.org_nodes(id),
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  metrics      JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_os_id TEXT,
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
