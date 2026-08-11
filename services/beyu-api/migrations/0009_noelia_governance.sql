-- ---------------------------------------------------------------------
-- 0009 — NOELIA AI GOVERNANCE (spec §41, §42, §54, §55, §56, §57)
--
-- Migration 0005 created the `ai` schema. This migration makes the
-- separation between AI RECOMMENDATION and AI EXECUTION a property the
-- database enforces, rather than a convention application code observes.
--
-- Four invariants are added here because application code is the wrong
-- place for any of them — a bug, a future refactor or a direct psql
-- session would each be enough to lose the guarantee:
--
--   1. Noelia may only ever be recorded as having DONE something that is a
--      read. Every other verdict must be REQUIRES_HUMAN_APPROVAL or DENIED.
--   2. A recommendation is accepted only by a named human, at a recorded
--      time, and acceptance can never be walked back into "pending".
--   3. An agent's classification ceiling can never reach sector-sensitive
--      data, which belongs to the sector OS and never leaves it.
--   4. Conversations and recommendations are visible to their owner or
--      their tenant, never trust-wide by default.
--
-- Idempotent: safe to apply twice.
-- ---------------------------------------------------------------------

-- --- 1. Classification vocabulary -----------------------------------------
-- 0005 spelled these 'Public'/'Internal'/'Confidential'/'Restricted' while
-- identity.users (0001) and the DataClassification enum in @beyu/types both
-- use UPPERCASE. The two never met, so the drift went unnoticed; an agent row
-- written from application code would have failed the check at runtime.
--
-- Order matters here, and got this wrong once: the 0005 constraint permits
-- only the mixed-case spellings, so normalising the data while it is still in
-- force fails on any pre-existing row. Drop first, normalise, then re-add.
-- A database already carrying agent rows is exactly the case that has to work.

ALTER TABLE ai.agents
  DROP CONSTRAINT IF EXISTS agents_max_classification_check;
ALTER TABLE ai.agents
  DROP CONSTRAINT IF EXISTS ai_agents_classification_valid;

UPDATE ai.agents SET max_classification = upper(max_classification);

ALTER TABLE ai.agents
  ALTER COLUMN max_classification SET DEFAULT 'INTERNAL';

ALTER TABLE ai.agents
  ADD CONSTRAINT ai_agents_classification_valid
  CHECK (max_classification IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'));

-- The original CHECK (max_classification <> 'SectorSensitive') could never
-- fire: that value was not in the allowed list to begin with. The real rule is
-- that sector-sensitive data never crosses the Sector LLC boundary into the
-- control plane's AI layer, so the ceiling is capped below it. Keeping the
-- named constraint makes the intent greppable.
ALTER TABLE ai.agents
  DROP CONSTRAINT IF EXISTS ai_never_sector_sensitive;
ALTER TABLE ai.agents
  ADD CONSTRAINT ai_never_sector_sensitive
  CHECK (max_classification <> 'SECTOR_SENSITIVE');

-- --- 2. AI may only ever have *performed* a read --------------------------
-- Mirrors AI_SAFE_ACTIONS in @beyu/auth. If governAiAction were ever changed
-- to permit a mutation directly, the write of that decision fails here.
-- The same defence-in-depth pattern as the forbidden OS capability list.

ALTER TABLE ai.action_log
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES ai.conversations(id) ON DELETE SET NULL;

ALTER TABLE ai.action_log
  ADD COLUMN IF NOT EXISTS recommendation_id UUID REFERENCES ai.recommendations(id) ON DELETE SET NULL;

ALTER TABLE ai.action_log
  DROP CONSTRAINT IF EXISTS ai_permitted_actions_are_reads_only;
ALTER TABLE ai.action_log
  ADD CONSTRAINT ai_permitted_actions_are_reads_only
  CHECK (decision <> 'PERMITTED' OR action IN ('read', 'export'));

-- AI never acts unattributed. Every entry names the human it acted for.
ALTER TABLE ai.action_log
  DROP CONSTRAINT IF EXISTS ai_action_has_principal;
ALTER TABLE ai.action_log
  ADD CONSTRAINT ai_action_has_principal
  CHECK (on_behalf_of IS NOT NULL);

CREATE INDEX IF NOT EXISTS ai_action_log_principal_idx
  ON ai.action_log (on_behalf_of, occurred_at DESC);

-- --- 3. Recommendation review is a human act, and it is final -------------

ALTER TABLE ai.recommendations
  ADD COLUMN IF NOT EXISTS governance_verdict TEXT;

ALTER TABLE ai.recommendations
  DROP CONSTRAINT IF EXISTS ai_recommendation_verdict_valid;
ALTER TABLE ai.recommendations
  ADD CONSTRAINT ai_recommendation_verdict_valid
  CHECK (governance_verdict IS NULL
         OR governance_verdict IN ('PERMITTED', 'REQUIRES_HUMAN_APPROVAL', 'DENIED'));

-- Which roles the policy engine said could sign this off, frozen at the time
-- the recommendation was produced. Role definitions change; what a reviewer
-- was told at the moment of review must not.
ALTER TABLE ai.recommendations
  ADD COLUMN IF NOT EXISTS approver_roles TEXT[] NOT NULL DEFAULT '{}';

-- A review has a reviewer AND a timestamp, or neither.
ALTER TABLE ai.recommendations
  DROP CONSTRAINT IF EXISTS ai_review_is_complete;
ALTER TABLE ai.recommendations
  ADD CONSTRAINT ai_review_is_complete
  CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL));

-- Rejection, like acceptance, is a named human decision.
ALTER TABLE ai.recommendations
  DROP CONSTRAINT IF EXISTS ai_rejection_requires_human;
ALTER TABLE ai.recommendations
  ADD CONSTRAINT ai_rejection_requires_human
  CHECK (status <> 'REJECTED' OR reviewed_by IS NOT NULL);

-- Once a human has decided, the decision stands. Re-opening a reviewed
-- recommendation would let an unfavourable answer be quietly retried until it
-- came out the other way, and the audit trail would show only the last state.
CREATE OR REPLACE FUNCTION ai.reject_review_reversal()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('ACCEPTED', 'REJECTED') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION
      'Recommendation % was already %; a reviewed recommendation cannot be reopened. Supersede it with a new recommendation instead.',
      OLD.id, OLD.status;
  END IF;
  IF OLD.reviewed_by IS NOT NULL AND NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
    RAISE EXCEPTION
      'The reviewer of recommendation % cannot be reassigned after the fact.', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_recommendation_review_is_final ON ai.recommendations;
CREATE TRIGGER ai_recommendation_review_is_final
  BEFORE UPDATE ON ai.recommendations
  FOR EACH ROW EXECUTE FUNCTION ai.reject_review_reversal();

CREATE INDEX IF NOT EXISTS ai_recommendations_pending_idx
  ON ai.recommendations (created_at DESC)
  WHERE status = 'PENDING_REVIEW';

-- --- 4. Row level security for the AI schema ------------------------------
-- 0006 covered ai.messages but not the tables around it, because those tables
-- had no writer yet. They have one now.

ALTER TABLE ai.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.conversations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_owner_or_tenant ON ai.conversations;
CREATE POLICY conversation_owner_or_tenant ON ai.conversations
  USING (
    app.is_maintenance()
    OR user_id = app.current_user_id()
    OR app.tenant_visible(tenant_id)
  )
  WITH CHECK (
    app.is_maintenance()
    -- A conversation is always opened in the opener's own name. Nobody
    -- creates a Noelia session attributed to somebody else.
    OR user_id = app.current_user_id()
  );

-- Recommendations are reviewed by people who did not necessarily start the
-- conversation, so they are readable to any authenticated principal the
-- policy engine has already cleared, and writable only by the application.
SELECT app.apply_authenticated_rls('ai', 'recommendations');
SELECT app.apply_authenticated_rls('ai', 'action_log');
SELECT app.apply_authenticated_rls('ai', 'agents');
SELECT app.apply_authenticated_rls('ai', 'hive_tasks');
SELECT app.apply_authenticated_rls('ai', 'hive_subtasks');
SELECT app.apply_authenticated_rls('ai', 'model_registry');

-- --- 5. The Noelia agents -------------------------------------------------
-- Registered as configuration, not code. Scopes are read scopes; there is no
-- write scope to grant, because a write is not something Noelia can do.

INSERT INTO ai.agents (code, name, system, role, description, allowed_scopes, max_classification, enabled)
VALUES
  ('noelia-executive',
   'Noelia — Executive Intelligence',
   'NOELIA',
   'EXECUTIVE_ADVISOR',
   'Answers questions about the state of the control plane and proposes changes for human review. Produces recommendations; never executes them.',
   ARRAY['organization:read', 'os:read', 'audit:read', 'strategy:read', 'risk:read'],
   'CONFIDENTIAL',
   TRUE),
  ('noelia-governance',
   'Noelia — Governance & Compliance',
   'NOELIA',
   'GOVERNANCE_ADVISOR',
   'Reviews governance posture, OS federation hygiene and audit chain integrity. Produces recommendations; never executes them.',
   ARRAY['organization:read', 'os:read', 'audit:read', 'compliance:read', 'governance:read'],
   'CONFIDENTIAL',
   TRUE)
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE ai.recommendations IS
  'Every Noelia and HIVE output that proposes a change. Acceptance records that a named human agreed with the proposal — it does not perform it. Execution happens through the owning domain endpoint, by that human, and is audited separately under their name.';

COMMENT ON TABLE ai.action_log IS
  'Every AI action attempt and the governance verdict it received, including the ones that were refused. A PERMITTED row can only ever describe a read.';

COMMENT ON COLUMN ai.recommendations.approver_roles IS
  'The roles the policy engine named as competent to approve this, frozen at production time.';
