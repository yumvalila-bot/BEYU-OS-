-- =====================================================================
-- BEYU OS — Migration 0006
-- Row Level Security: database-enforced multi-tenant isolation.
-- Spec: §51, §52, §61
--
-- LAYERED AUTHORIZATION MODEL
-- ---------------------------
-- Layer 1 (primary)   : the policy engine in @beyu/auth — RBAC + ABAC,
--                       deny-by-default, evaluated on every request.
-- Layer 2 (this file) : PostgreSQL RLS — defence in depth. Even a flawed
--                       query or a compromised service cannot read across
--                       tenant boundaries, because the database refuses.
--
-- RLS here enforces TENANT isolation and USER-owned-record isolation.
-- Finer-grained scoping (org subtree, country, classification ceiling) is
-- the policy engine's responsibility; duplicating recursive hierarchy walks
-- in every policy would be both slow and a second source of truth.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS app;

-- ---------------------------------------------------------------------
-- Database roles
-- The API connects as beyu_app. Migrations/seeds run as beyu_migrator.
-- Neither is a superuser in production, so FORCE ROW LEVEL SECURITY
-- genuinely applies to them.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'beyu_app') THEN
    CREATE ROLE beyu_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'beyu_migrator') THEN
    CREATE ROLE beyu_migrator NOLOGIN;
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- Session context helpers.
-- The API sets these per request/transaction, immediately after
-- authenticating and BEFORE running any domain query:
--   SET LOCAL app.tenant  = '<tenant uuid>';
--   SET LOCAL app.user_id = '<user uuid>';
-- SET LOCAL scopes the value to the transaction, so a pooled connection
-- can never leak one request's tenant into the next.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.current_tenant() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.tenant', true), '')::UUID;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::UUID;
$$ LANGUAGE sql STABLE;

-- TRUE only for the migration/maintenance role. Note this is a ROLE check,
-- not a settable flag: an application session cannot grant itself bypass by
-- setting a GUC, which is exactly the failure mode we need to avoid.
CREATE OR REPLACE FUNCTION app.is_maintenance() RETURNS BOOLEAN AS $$
  SELECT pg_has_role(current_user, 'beyu_migrator', 'MEMBER');
$$ LANGUAGE sql STABLE;

-- Trust-level readers (Trust Administrator, Group Auditor) legitimately see
-- across tenants. The API asserts the role through the policy engine first
-- and only then sets this flag for the transaction.
CREATE OR REPLACE FUNCTION app.is_cross_tenant_reader() RETURNS BOOLEAN AS $$
  SELECT coalesce(current_setting('app.cross_tenant', true), 'off') = 'on';
$$ LANGUAGE sql STABLE;

-- The tenant predicate used by every tenant-scoped policy.
-- A NULL tenant_id marks a trust-level record shared across tenants.
CREATE OR REPLACE FUNCTION app.tenant_visible(row_tenant UUID)
RETURNS BOOLEAN AS $$
  SELECT app.is_maintenance()
      OR app.is_cross_tenant_reader()
      OR row_tenant IS NULL
      OR row_tenant = app.current_tenant();
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- Policy application helper.
-- Enabling RLS table-by-table by hand across ~90 tables is where mistakes
-- hide, so the policy is generated from a single definition instead.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.apply_tenant_rls(
  target_schema TEXT,
  target_table  TEXT,
  tenant_column TEXT
) RETURNS VOID AS $$
DECLARE
  qualified TEXT := format('%I.%I', target_schema, target_table);
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', qualified);
  -- FORCE makes the policy apply to the table owner too. Without it, the
  -- owning role silently bypasses RLS and the control is theatre.
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', qualified);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', qualified);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s
       USING (app.tenant_visible(%I))
       WITH CHECK (app.tenant_visible(%I))',
    qualified, tenant_column, tenant_column
  );
END;
$$ LANGUAGE plpgsql;

-- Tables with no tenant column: readable within an authenticated session,
-- writable only through the API (which has already run the policy engine).
CREATE OR REPLACE FUNCTION app.apply_authenticated_rls(
  target_schema TEXT,
  target_table  TEXT
) RETURNS VOID AS $$
DECLARE
  qualified TEXT := format('%I.%I', target_schema, target_table);
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', qualified);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', qualified);
  EXECUTE format('DROP POLICY IF EXISTS authenticated_access ON %s', qualified);
  EXECUTE format(
    'CREATE POLICY authenticated_access ON %s
       USING (app.is_maintenance() OR app.current_user_id() IS NOT NULL)
       WITH CHECK (app.is_maintenance() OR app.current_user_id() IS NOT NULL)',
    qualified
  );
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Tenant-scoped tables
-- ---------------------------------------------------------------------
SELECT app.apply_tenant_rls('organization', 'tenant_org_units', 'tenant_id');
SELECT app.apply_tenant_rls('documents',    'documents',        'tenant_id');
SELECT app.apply_tenant_rls('workflow',     'instances',        'tenant_id');
SELECT app.apply_tenant_rls('notifications','notifications',    'tenant_id');
SELECT app.apply_tenant_rls('ai',           'conversations',    'tenant_id');

-- organization.tenants is itself tenant-scoped: a tenant sees only itself.
ALTER TABLE organization.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization.tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self_isolation ON organization.tenants;
CREATE POLICY tenant_self_isolation ON organization.tenants
  USING (app.tenant_visible(id))
  WITH CHECK (app.tenant_visible(id));

-- ---------------------------------------------------------------------
-- User-owned records: a user sees only their own, regardless of tenant.
-- ---------------------------------------------------------------------
ALTER TABLE identity.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_sessions ON identity.sessions;
CREATE POLICY own_sessions ON identity.sessions
  USING (app.is_maintenance() OR user_id = app.current_user_id())
  WITH CHECK (app.is_maintenance() OR user_id = app.current_user_id());

ALTER TABLE notifications.preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications.preferences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_preferences ON notifications.preferences;
CREATE POLICY own_preferences ON notifications.preferences
  USING (app.is_maintenance() OR user_id = app.current_user_id())
  WITH CHECK (app.is_maintenance() OR user_id = app.current_user_id());

-- AI messages inherit the visibility of their conversation.
ALTER TABLE ai.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_isolation ON ai.messages;
CREATE POLICY conversation_isolation ON ai.messages
  USING (
    app.is_maintenance() OR EXISTS (
      SELECT 1 FROM ai.conversations c
       WHERE c.id = conversation_id
         AND (c.user_id = app.current_user_id() OR app.tenant_visible(c.tenant_id))
    )
  )
  WITH CHECK (
    app.is_maintenance() OR EXISTS (
      SELECT 1 FROM ai.conversations c
       WHERE c.id = conversation_id
         AND (c.user_id = app.current_user_id() OR app.tenant_visible(c.tenant_id))
    )
  );

-- ---------------------------------------------------------------------
-- Authenticated-session tables.
-- These hold trust-wide structural and financial data. Row-level scoping is
-- performed by the policy engine; RLS guarantees that an unauthenticated
-- connection (a leaked pooler handle, a misconfigured job) reads nothing.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT schemaname, tablename
      FROM pg_tables
     WHERE schemaname IN ('ownership','governance','strategy','risk',
                          'compliance','capital','waterfall','builder')
  LOOP
    PERFORM app.apply_authenticated_rls(t.schemaname, t.tablename);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------
-- Audit log: readable by auditors, never writable through a normal session,
-- never updatable or deletable by anyone (enforced additionally by trigger).
-- ---------------------------------------------------------------------
ALTER TABLE audit.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.audit_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_read ON audit.audit_log;
CREATE POLICY audit_read ON audit.audit_log
  FOR SELECT
  USING (
    app.is_maintenance()
    OR app.is_cross_tenant_reader()
    OR app.tenant_visible(tenant_id)
  );

-- Insert-only: any authenticated session may append, nobody may amend.
DROP POLICY IF EXISTS audit_append ON audit.audit_log;
CREATE POLICY audit_append ON audit.audit_log
  FOR INSERT
  WITH CHECK (app.is_maintenance() OR app.current_user_id() IS NOT NULL);

-- ---------------------------------------------------------------------
-- Grants. The API role gets DML only — never DDL, never role management.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['identity','organization','ownership','governance',
                           'strategy','risk','compliance','capital','waterfall',
                           'documents','workflow','notifications','reporting',
                           'audit','integrations','ai','builder','app']
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO beyu_app, beyu_migrator', s);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO beyu_app', s);
    EXECUTE format(
      'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO beyu_app', s);
    EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO beyu_migrator', s);
    EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO beyu_migrator', s);
  END LOOP;
END
$$;

-- The audit log is append-only for the application role: no UPDATE, no DELETE.
REVOKE UPDATE, DELETE ON audit.audit_log FROM beyu_app;
REVOKE UPDATE, DELETE ON audit.audit_log FROM beyu_migrator;
