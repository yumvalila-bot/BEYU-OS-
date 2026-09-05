-- =====================================================================
-- BEYU OS — Migration 0007
-- Tighten the forbidden-organization-name constraints (spec §86.2).
--
-- The original CHECKs compared upper(btrim(name)) to the literal
-- 'BEYU GROUP'. That catches the exact string and surrounding whitespace,
-- but not internal whitespace: 'BeYu  group' (two spaces) slipped through
-- and was accepted by the database.
--
-- The rule the owner stated is that the name must never be used at all, so
-- the constraint is rewritten to normalize runs of whitespace to a single
-- space before comparing, and to reject the phrase wherever it appears as a
-- whole word — 'BEYU GROUP HOLDINGS' is refused too.
--
-- This mirrors assertOrganizationNameAllowed() in @beyu/types. The two are
-- deliberately redundant: application code can be bypassed, the database
-- cannot.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A shared, immutable predicate so both tables (and any future one) apply
-- exactly the same rule. IMMUTABLE is required for use in a CHECK.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION organization.is_forbidden_org_name(candidate TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT candidate IS NOT NULL
     AND upper(btrim(regexp_replace(candidate, '\s+', ' ', 'g')))
           ~ '(^|\s)BEYU GROUP(\s|$)';
$$;

COMMENT ON FUNCTION organization.is_forbidden_org_name(TEXT) IS
  'True when a name uses the forbidden "BEYU GROUP" phrasing. The canonical parent organization is BEYU FAMILY TRUST and is never renamed.';

-- ---------------------------------------------------------------------
-- organization.org_nodes — cover the legal name as well as the name. A
-- forbidden legal name is exactly as damaging as a forbidden display name.
-- ---------------------------------------------------------------------
ALTER TABLE organization.org_nodes
  DROP CONSTRAINT IF EXISTS org_nodes_forbidden_name;

ALTER TABLE organization.org_nodes
  ADD CONSTRAINT org_nodes_forbidden_name
  CHECK (
    NOT organization.is_forbidden_org_name(name)
    AND NOT organization.is_forbidden_org_name(legal_name)
  );

-- ---------------------------------------------------------------------
-- ownership.legal_entities
-- ---------------------------------------------------------------------
ALTER TABLE ownership.legal_entities
  DROP CONSTRAINT IF EXISTS legal_entities_forbidden_name;

ALTER TABLE ownership.legal_entities
  ADD CONSTRAINT legal_entities_forbidden_name
  CHECK (NOT organization.is_forbidden_org_name(name));

-- =====================================================================
-- Materialized path normalization.
--
-- Two conventions for organization.org_nodes.path existed: the seed wrote
-- the ANCESTOR chain ('<trust>/<holding>', no leading slash, excluding the
-- node itself), while the repository writes the SELF-INCLUSIVE path
-- ('/<trust>/<holding>/<self>'). Subtree queries (`path LIKE path || '/%'`)
-- and ancestor queries (split the path) only work with the second form.
--
-- The self-inclusive form is canonical: it makes a subtree an indexed prefix
-- scan and makes the node its own trivial ancestor-chain terminator. This
-- recomputes every row from the parent links, which is authoritative
-- regardless of which convention wrote the row.
-- =====================================================================
WITH RECURSIVE tree AS (
  SELECT id, parent_id, '/' || id::text AS path, 0 AS depth
  FROM organization.org_nodes
  WHERE parent_id IS NULL

  UNION ALL

  SELECT child.id,
         child.parent_id,
         parent.path || '/' || child.id::text,
         parent.depth + 1
  FROM organization.org_nodes child
  JOIN tree parent ON child.parent_id = parent.id
)
UPDATE organization.org_nodes AS n
   SET path = tree.path,
       depth = tree.depth
  FROM tree
 WHERE n.id = tree.id
   AND (n.path IS DISTINCT FROM tree.path OR n.depth IS DISTINCT FROM tree.depth);

-- A path must always start at the root and end with the node's own id.
-- Anything else means a write bypassed the repository.
ALTER TABLE organization.org_nodes
  DROP CONSTRAINT IF EXISTS org_nodes_path_self_inclusive;

ALTER TABLE organization.org_nodes
  ADD CONSTRAINT org_nodes_path_self_inclusive
  CHECK (path = '' OR path LIKE '/%' AND path LIKE '%/' || id::text);

COMMENT ON COLUMN organization.org_nodes.path IS
  'Self-inclusive materialized path, e.g. /<trust>/<holding>/<self>. Subtrees are path LIKE path || ''/%''; ancestors are the path split on ''/''.';
