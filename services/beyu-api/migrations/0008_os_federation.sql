-- ---------------------------------------------------------------------
-- 0008 — OS FEDERATION (spec §4, §69, §70, §71)
--
-- Attachment points for independent OSs: Health OS, Agriculture OS,
-- Finance OS and FOUNDATION OS. Each is a SEPARATE SYSTEM with its own
-- database, deployment and team. This migration does not create them. It
-- creates the seam they attach to.
--
-- Three properties are enforced here rather than in application code,
-- because the cost of getting them wrong is an external system reading data
-- it should never see:
--
--   1. An OS attaches only at a legal point in the hierarchy — a sector OS
--      beneath a SECTOR_LLC, FOUNDATION OS beneath the FOUNDATION.
--   2. Forbidden capabilities can never be stored, whatever the API does.
--   3. Credentials are references to a secret manager, never secrets.
--
-- Idempotent: safe to apply twice.
-- ---------------------------------------------------------------------

-- --- Registry columns for federation --------------------------------------
-- The registry already existed for the Future OS Registry. These columns add
-- the attachment and isolation semantics.

ALTER TABLE organization.os_registry
  ADD COLUMN IF NOT EXISTS attachment_kind TEXT NOT NULL DEFAULT 'SECTOR_OS';

ALTER TABLE organization.os_registry
  ADD COLUMN IF NOT EXISTS attached_node_id UUID REFERENCES organization.org_nodes(id);

ALTER TABLE organization.os_registry
  DROP CONSTRAINT IF EXISTS os_registry_attachment_kind_valid;
ALTER TABLE organization.os_registry
  ADD CONSTRAINT os_registry_attachment_kind_valid
  CHECK (attachment_kind IN ('SECTOR_OS', 'FOUNDATION_OS', 'CORE'));

-- A sector OS is meaningless without a sector; the core OS must not claim one.
ALTER TABLE organization.os_registry
  DROP CONSTRAINT IF EXISTS os_registry_sector_matches_kind;
ALTER TABLE organization.os_registry
  ADD CONSTRAINT os_registry_sector_matches_kind
  CHECK (
    (attachment_kind = 'SECTOR_OS'     AND sector_code IS NOT NULL) OR
    (attachment_kind = 'FOUNDATION_OS' AND sector_code IS NULL)     OR
    (attachment_kind = 'CORE'          AND sector_code IS NULL)
  );

-- Exactly one core OS. BEYU OS is the control plane; there is no second one.
DROP INDEX IF EXISTS organization.os_registry_single_core;
CREATE UNIQUE INDEX os_registry_single_core
  ON organization.os_registry ((TRUE))
  WHERE is_core;

-- Two OSs cannot occupy the same attachment point. Without this, a second
-- Health OS could attach to the same Sector LLC and silently receive the
-- same events.
DROP INDEX IF EXISTS organization.os_registry_one_per_node;
CREATE UNIQUE INDEX os_registry_one_per_node
  ON organization.os_registry (attached_node_id)
  WHERE attached_node_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- Attachment legality
--
-- A trigger rather than a CHECK, because the rule spans two tables: it
-- depends on the node_type of the referenced org node. Enforced in the
-- database so that a future service, script or migration cannot attach an OS
-- to the wrong part of the hierarchy.
--
-- The FOUNDATION_OS rule carries real weight: BEYU FOUNDATION is a SISTER
-- organization to BEYU HOLDING COMPANY. Allowing FOUNDATION OS to attach
-- anywhere under the holding company would re-parent the Foundation by
-- implication and quietly contradict the trust structure.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION organization.assert_os_attachment_legal()
RETURNS TRIGGER AS $$
DECLARE
  target_type TEXT;
  expected    TEXT;
BEGIN
  IF NEW.attached_node_id IS NULL THEN
    -- Unattached is legal: an OS is registered before it is attached.
    RETURN NEW;
  END IF;

  SELECT node_type INTO target_type
    FROM organization.org_nodes
   WHERE id = NEW.attached_node_id;

  IF target_type IS NULL THEN
    RAISE EXCEPTION 'Cannot attach OS %: node % does not exist.',
      NEW.os_id, NEW.attached_node_id;
  END IF;

  expected := CASE NEW.attachment_kind
                WHEN 'SECTOR_OS'     THEN 'SECTOR_LLC'
                WHEN 'FOUNDATION_OS' THEN 'FOUNDATION'
                ELSE NULL
              END;

  IF NEW.attachment_kind = 'CORE' THEN
    RAISE EXCEPTION
      'The core OS attaches to no organizational node. BEYU OS is the control plane, not a participant in the hierarchy.';
  END IF;

  IF target_type <> expected THEN
    IF NEW.attachment_kind = 'FOUNDATION_OS' THEN
      RAISE EXCEPTION
        'FOUNDATION OS must attach to the FOUNDATION node, not to a % node. BEYU FOUNDATION is a sister organization to BEYU HOLDING COMPANY, and attaching its OS elsewhere would misrepresent that relationship.',
        target_type;
    END IF;
    RAISE EXCEPTION
      'A % must attach to a % node, not to a % node. BEYU OS ends at the Sector LLC boundary.',
      NEW.attachment_kind, expected, target_type;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS os_registry_attachment_legal ON organization.os_registry;
CREATE TRIGGER os_registry_attachment_legal
  BEFORE INSERT OR UPDATE ON organization.os_registry
  FOR EACH ROW EXECUTE FUNCTION organization.assert_os_attachment_legal();

-- ---------------------------------------------------------------------
-- Capability deny list, enforced by the database
--
-- Mirrors NEVER_GRANTABLE_CAPABILITIES in @beyu/types. Duplicated
-- deliberately, exactly as the forbidden-name rule is: the application check
-- gives a good error message, and this one guarantees that a bug, a manual
-- UPDATE or a compromised admin session still cannot grant an external
-- system the right to bypass authorization or mutate the audit trail.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION organization.is_forbidden_os_capability(cap TEXT)
RETURNS BOOLEAN AS $$
  SELECT upper(btrim(cap)) IN (
    'WATERFALL_EXECUTE',
    'CAPITAL_APPROVE',
    'GOVERNANCE_APPROVE',
    'AUDIT_UPDATE',
    'AUDIT_DELETE',
    'DATABASE_ACCESS',
    'DATABASE_READ',
    'DATABASE_WRITE',
    'AUTHORIZATION_BYPASS',
    'POLICY_OVERRIDE',
    'CROSS_OS_READ'
  );
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION organization.assert_capabilities_grantable()
RETURNS TRIGGER AS $$
DECLARE
  cap TEXT;
BEGIN
  FOREACH cap IN ARRAY COALESCE(NEW.capabilities, '{}')
  LOOP
    IF organization.is_forbidden_os_capability(cap) THEN
      RAISE EXCEPTION
        'Capability "%" can never be granted to an attached OS. It would allow an external system to bypass BEYU OS authorization, mutate the audit trail, execute financial transactions, or read another OS''s data.',
        cap;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS os_registry_capabilities_grantable ON organization.os_registry;
CREATE TRIGGER os_registry_capabilities_grantable
  BEFORE INSERT OR UPDATE ON organization.os_registry
  FOR EACH ROW EXECUTE FUNCTION organization.assert_capabilities_grantable();

-- ---------------------------------------------------------------------
-- Per-OS credentials
--
-- One row per OS per environment. The secret itself lives in the secret
-- manager; this table stores only a reference and a hash prefix for
-- identification. Revocation is a status change, never a delete, so that
-- audit records referencing the credential remain interpretable.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS integrations.os_credentials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id          TEXT NOT NULL REFERENCES organization.os_registry(os_id),
  environment    TEXT NOT NULL DEFAULT 'production'
                   CHECK (environment IN ('development','staging','production')),
  -- Reference into the secret manager. NEVER the credential itself.
  credential_ref TEXT NOT NULL,
  -- First 8 chars of the hash, for support to identify a key without seeing it.
  key_prefix     TEXT,
  status         TEXT NOT NULL DEFAULT 'ACTIVE'
                   CHECK (status IN ('ACTIVE','ROTATING','REVOKED')),
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT os_credentials_no_inline_secrets CHECK (
    credential_ref NOT ILIKE '%BEGIN % PRIVATE KEY%'
    AND credential_ref NOT ILIKE 'sk-%'
    AND length(credential_ref) < 200
  ),
  CONSTRAINT os_credentials_revoked_has_timestamp CHECK (
    status <> 'REVOKED' OR revoked_at IS NOT NULL
  )
);

DROP INDEX IF EXISTS integrations.os_credentials_one_active;
CREATE UNIQUE INDEX os_credentials_one_active
  ON integrations.os_credentials (os_id, environment)
  WHERE status = 'ACTIVE';

-- ---------------------------------------------------------------------
-- Event subscription grants
--
-- Which `beyu.*` topics an OS may receive. A row here is an explicit grant.
-- No row means no delivery: the event fan-out reads this table, so an OS
-- that was never granted a topic simply never appears in the recipient list.
-- That is what stops Health OS from receiving an Agriculture OS event.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS integrations.os_event_grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id       TEXT NOT NULL REFERENCES organization.os_registry(os_id),
  topic       TEXT NOT NULL,
  granted_by  UUID REFERENCES identity.users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason      TEXT NOT NULL,
  UNIQUE (os_id, topic),
  -- Only control plane events can be subscribed to. `os.*` events flow the
  -- other way, and a subscription to one would let an OS observe another's
  -- submissions.
  CONSTRAINT os_event_grants_beyu_topics_only CHECK (topic LIKE 'beyu.%')
);

CREATE INDEX IF NOT EXISTS os_event_grants_topic_idx
  ON integrations.os_event_grants (topic);

-- ---------------------------------------------------------------------
-- Inbound submissions from attached OSs
--
-- An attached OS never writes into a BEYU OS domain table. It submits, and
-- the submission sits here until the control plane accepts it. This is the
-- structural expression of "recommendation is not execution": a capital
-- request from Health OS is a row in this table, not an allocation.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS integrations.os_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id         TEXT NOT NULL REFERENCES organization.os_registry(os_id),
  kind          TEXT NOT NULL CHECK (kind IN
                  ('RISK','COMPLIANCE_EVIDENCE','CAPITAL_REQUEST','FINANCIAL_REPORT')),
  payload       JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
  -- Set when a human in BEYU OS accepts the submission.
  reviewed_by   UUID REFERENCES identity.users(id),
  reviewed_at   TIMESTAMPTZ,
  review_notes  TEXT,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- An accepted or rejected submission must record who decided. An external
  -- system's request can never be self-approving.
  CONSTRAINT os_submissions_decision_has_reviewer CHECK (
    status = 'PENDING' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS os_submissions_pending_idx
  ON integrations.os_submissions (os_id, status, submitted_at DESC);

-- ---------------------------------------------------------------------
-- Backfill the OSs the seed already knows about.
-- Attachment stays NULL: attaching is a deliberate operator act, performed
-- once the Sector LLC actually exists.
-- ---------------------------------------------------------------------

UPDATE organization.os_registry
   SET attachment_kind = CASE
         WHEN is_core THEN 'CORE'
         WHEN os_id = 'foundation-os' THEN 'FOUNDATION_OS'
         ELSE 'SECTOR_OS'
       END
 WHERE attachment_kind IS NULL OR attachment_kind = 'SECTOR_OS';

-- foundation-os was seeded against a PHILANTHROPY sector code, which the
-- kind/sector constraint above disallows: the Foundation is not a sector of
-- the holding company.
UPDATE organization.os_registry
   SET sector_code = NULL
 WHERE os_id = 'foundation-os';

COMMENT ON TABLE integrations.os_submissions IS
  'Inbound requests from attached OSs. A submission is never self-executing; a human in BEYU OS accepts or rejects it.';

COMMENT ON TABLE integrations.os_event_grants IS
  'Explicit per-OS topic grants. No row means no delivery, which is what isolates one attached OS from another.';
