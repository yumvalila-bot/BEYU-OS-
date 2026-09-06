-- 0008 — ROW LEVEL SECURITY, TRIGGERS AND DOMAIN FUNCTIONS
--
-- Tenant isolation is enforced in the DATABASE, not only in application
-- filters: every tenant-scoped table gets a `tenant_isolation` policy keyed
-- on the app.tenant / app.cross_tenant GUCs set per-transaction by the
-- driver. An application bug that forgets a WHERE clause still cannot leak
-- another tenant's rows.

-- ── Context helpers ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION agri_tenant.current_tenant_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.tenant', true), '')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION agri_tenant.current_user_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION agri_tenant.is_cross_tenant() RETURNS BOOLEAN AS $$
  SELECT COALESCE(NULLIF(current_setting('app.cross_tenant', true), ''), 'off') = 'on'
$$ LANGUAGE sql STABLE;

-- ── updated_at trigger ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION agri_tenant.update_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_farms_updated_at ON agri_farm.farms;
CREATE TRIGGER trg_farms_updated_at BEFORE UPDATE ON agri_farm.farms FOR EACH ROW EXECUTE FUNCTION agri_tenant.update_updated_at();
DROP TRIGGER IF EXISTS trg_fields_updated_at ON agri_farm.fields;
CREATE TRIGGER trg_fields_updated_at BEFORE UPDATE ON agri_farm.fields FOR EACH ROW EXECUTE FUNCTION agri_tenant.update_updated_at();
DROP TRIGGER IF EXISTS trg_tenants_updated_at ON agri_tenant.tenants;
CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON agri_tenant.tenants FOR EACH ROW EXECUTE FUNCTION agri_tenant.update_updated_at();
DROP TRIGGER IF EXISTS trg_cycles_updated_at ON agri_crop.crop_cycles;
CREATE TRIGGER trg_cycles_updated_at BEFORE UPDATE ON agri_crop.crop_cycles FOR EACH ROW EXECUTE FUNCTION agri_tenant.update_updated_at();
DROP TRIGGER IF EXISTS trg_activities_updated_at ON agri_crop.field_activities;
CREATE TRIGGER trg_activities_updated_at BEFORE UPDATE ON agri_crop.field_activities FOR EACH ROW EXECUTE FUNCTION agri_tenant.update_updated_at();
DROP TRIGGER IF EXISTS trg_lots_updated_at ON agri_crop.storage_lots;
CREATE TRIGGER trg_lots_updated_at BEFORE UPDATE ON agri_crop.storage_lots FOR EACH ROW EXECUTE FUNCTION agri_tenant.update_updated_at();
DROP TRIGGER IF EXISTS trg_animals_updated_at ON agri_livestock.animals;
CREATE TRIGGER trg_animals_updated_at BEFORE UPDATE ON agri_livestock.animals FOR EACH ROW EXECUTE FUNCTION agri_tenant.update_updated_at();
DROP TRIGGER IF EXISTS trg_equipment_updated_at ON agri_equipment.equipment;
CREATE TRIGGER trg_equipment_updated_at BEFORE UPDATE ON agri_equipment.equipment FOR EACH ROW EXECUTE FUNCTION agri_tenant.update_updated_at();
DROP TRIGGER IF EXISTS trg_po_updated_at ON agri_procurement.purchase_orders;
CREATE TRIGGER trg_po_updated_at BEFORE UPDATE ON agri_procurement.purchase_orders FOR EACH ROW EXECUTE FUNCTION agri_tenant.update_updated_at();
DROP TRIGGER IF EXISTS trg_so_updated_at ON agri_procurement.sales_orders;
CREATE TRIGGER trg_so_updated_at BEFORE UPDATE ON agri_procurement.sales_orders FOR EACH ROW EXECUTE FUNCTION agri_tenant.update_updated_at();
DROP TRIGGER IF EXISTS trg_contracts_updated_at ON agri_procurement.trade_contracts;
CREATE TRIGGER trg_contracts_updated_at BEFORE UPDATE ON agri_procurement.trade_contracts FOR EACH ROW EXECUTE FUNCTION agri_tenant.update_updated_at();
DROP TRIGGER IF EXISTS trg_workers_updated_at ON agri_workforce.workers;
CREATE TRIGGER trg_workers_updated_at BEFORE UPDATE ON agri_workforce.workers FOR EACH ROW EXECUTE FUNCTION agri_tenant.update_updated_at();
DROP TRIGGER IF EXISTS trg_wo_updated_at ON agri_workforce.work_orders;
CREATE TRIGGER trg_wo_updated_at BEFORE UPDATE ON agri_workforce.work_orders FOR EACH ROW EXECUTE FUNCTION agri_tenant.update_updated_at();
DROP TRIGGER IF EXISTS trg_certs_updated_at ON agri_compliance.certifications;
CREATE TRIGGER trg_certs_updated_at BEFORE UPDATE ON agri_compliance.certifications FOR EACH ROW EXECUTE FUNCTION agri_tenant.update_updated_at();

-- ── Audit immutability ──────────────────────────────────────────────────
-- The audit trail is append-only. UPDATE and DELETE are rejected at the
-- database level so a compromised application cannot rewrite history.

CREATE OR REPLACE FUNCTION agri_audit.reject_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'agri_audit.audit_events is append-only (attempted %)', TG_OP;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_no_update ON agri_audit.audit_events;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE OR DELETE ON agri_audit.audit_events
  FOR EACH ROW EXECUTE FUNCTION agri_audit.reject_mutation();

-- ── RLS enablement helper ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION agri_tenant.enable_rls_for_tenant(schema_name TEXT, table_name TEXT) RETURNS VOID AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);
  EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', schema_name, table_name);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I.%I USING (tenant_id = agri_tenant.current_tenant_id() OR agri_tenant.is_cross_tenant() OR agri_tenant.current_tenant_id() IS NULL)', schema_name, table_name);
  EXECUTE format('CREATE POLICY tenant_insert ON %I.%I FOR INSERT WITH CHECK (tenant_id = agri_tenant.current_tenant_id() OR agri_tenant.is_cross_tenant() OR agri_tenant.current_tenant_id() IS NULL)', schema_name, table_name);
END
$$ LANGUAGE plpgsql;

-- Apply RLS to every tenant-scoped table.
SELECT agri_tenant.enable_rls_for_tenant('agri_farm','farms');
SELECT agri_tenant.enable_rls_for_tenant('agri_farm','fields');
SELECT agri_tenant.enable_rls_for_tenant('agri_farm','soil_records');
SELECT agri_tenant.enable_rls_for_tenant('agri_farm','weather_observations');
SELECT agri_tenant.enable_rls_for_tenant('agri_crop','crops');
SELECT agri_tenant.enable_rls_for_tenant('agri_crop','crop_cycles');
SELECT agri_tenant.enable_rls_for_tenant('agri_crop','field_activities');
SELECT agri_tenant.enable_rls_for_tenant('agri_crop','harvests');
SELECT agri_tenant.enable_rls_for_tenant('agri_crop','storage_lots');
SELECT agri_tenant.enable_rls_for_tenant('agri_livestock','herds');
SELECT agri_tenant.enable_rls_for_tenant('agri_livestock','animals');
SELECT agri_tenant.enable_rls_for_tenant('agri_livestock','animal_health_events');
SELECT agri_tenant.enable_rls_for_tenant('agri_livestock','production_records');
SELECT agri_tenant.enable_rls_for_tenant('agri_inventory','warehouses');
SELECT agri_tenant.enable_rls_for_tenant('agri_inventory','input_items');
SELECT agri_tenant.enable_rls_for_tenant('agri_inventory','stock_movements');
SELECT agri_tenant.enable_rls_for_tenant('agri_procurement','suppliers');
SELECT agri_tenant.enable_rls_for_tenant('agri_procurement','buyers');
SELECT agri_tenant.enable_rls_for_tenant('agri_procurement','purchase_orders');
SELECT agri_tenant.enable_rls_for_tenant('agri_procurement','sales_orders');
SELECT agri_tenant.enable_rls_for_tenant('agri_procurement','trade_contracts');
SELECT agri_tenant.enable_rls_for_tenant('agri_equipment','equipment');
SELECT agri_tenant.enable_rls_for_tenant('agri_equipment','maintenance_logs');
SELECT agri_tenant.enable_rls_for_tenant('agri_equipment','fuel_logs');
SELECT agri_tenant.enable_rls_for_tenant('agri_workforce','workers');
SELECT agri_tenant.enable_rls_for_tenant('agri_workforce','work_orders');
SELECT agri_tenant.enable_rls_for_tenant('agri_compliance','certifications');
SELECT agri_tenant.enable_rls_for_tenant('agri_compliance','inspections');

-- Audit events: RLS too (SUPER_ADMIN sees all; tenant users see own tenant).
ALTER TABLE agri_audit.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agri_audit.audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_tenant_isolation ON agri_audit.audit_events
  USING (tenant_id = agri_tenant.current_tenant_id() OR agri_tenant.is_cross_tenant() OR agri_tenant.current_tenant_id() IS NULL);
CREATE POLICY audit_tenant_insert ON agri_audit.audit_events FOR INSERT
  WITH CHECK (tenant_id = agri_tenant.current_tenant_id() OR agri_tenant.is_cross_tenant() OR agri_tenant.current_tenant_id() IS NULL);

-- Identity tables: RLS on tenant-scoped membership/session data.
ALTER TABLE agri_identity.memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY memberships_isolation ON agri_identity.memberships
  USING (tenant_id = agri_tenant.current_tenant_id() OR agri_tenant.is_cross_tenant() OR agri_tenant.current_tenant_id() IS NULL);

-- ── Domain functions: human-readable sequential codes ──────────────────

CREATE OR REPLACE FUNCTION agri_farm.generate_farm_code(p_tenant_id UUID) RETURNS TEXT AS $$
DECLARE
  n INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO n FROM agri_farm.farms WHERE tenant_id = p_tenant_id;
  RETURN 'FRM-' || to_char(now(), 'YY') || '-' || lpad(n::text, 4, '0');
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION agri_farm.generate_field_code(p_farm_id UUID) RETURNS TEXT AS $$
DECLARE
  n INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO n FROM agri_farm.fields WHERE farm_id = p_farm_id;
  RETURN 'FLD-' || lpad(n::text, 3, '0');
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION agri_crop.generate_lot_code(p_tenant_id UUID) RETURNS TEXT AS $$
DECLARE
  n INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO n FROM agri_crop.storage_lots WHERE tenant_id = p_tenant_id;
  RETURN 'LOT-' || to_char(now(), 'YY') || '-' || lpad(n::text, 5, '0');
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION agri_procurement.generate_po_number(p_tenant_id UUID) RETURNS TEXT AS $$
DECLARE
  n INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO n FROM agri_procurement.purchase_orders WHERE tenant_id = p_tenant_id;
  RETURN 'PO-' || to_char(now(), 'YY') || '-' || lpad(n::text, 5, '0');
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION agri_procurement.generate_so_number(p_tenant_id UUID) RETURNS TEXT AS $$
DECLARE
  n INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO n FROM agri_procurement.sales_orders WHERE tenant_id = p_tenant_id;
  RETURN 'SO-' || to_char(now(), 'YY') || '-' || lpad(n::text, 5, '0');
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION agri_procurement.generate_contract_number(p_tenant_id UUID) RETURNS TEXT AS $$
DECLARE
  n INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO n FROM agri_procurement.trade_contracts WHERE tenant_id = p_tenant_id;
  RETURN 'CT-' || to_char(now(), 'YY') || '-' || lpad(n::text, 5, '0');
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION agri_workforce.generate_worker_code(p_tenant_id UUID) RETURNS TEXT AS $$
DECLARE
  n INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO n FROM agri_workforce.workers WHERE tenant_id = p_tenant_id;
  RETURN 'WRK-' || lpad(n::text, 4, '0');
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION agri_workforce.generate_wo_number(p_tenant_id UUID) RETURNS TEXT AS $$
DECLARE
  n INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO n FROM agri_workforce.work_orders WHERE tenant_id = p_tenant_id;
  RETURN 'WO-' || to_char(now(), 'YY') || '-' || lpad(n::text, 5, '0');
END
$$ LANGUAGE plpgsql;
