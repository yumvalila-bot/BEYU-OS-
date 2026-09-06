import type { Database } from './driver';
import { hashPassword } from '@beyu/security';

/**
 * Structural reference data for BEYU AGRICULTURE OS.
 * Idempotent: safe to run repeatedly.
 */
export async function seed(db: Database): Promise<void> {
  await db.transaction(async (session) => {
    // Tenants — two, so isolation has something real to protect.
    await session.query(`
      INSERT INTO agri_tenant.tenants (id, name, slug, type, status, country_code, data_residency)
      VALUES
        ('00000000-0000-0000-0000-000000000001', 'BEYU Agriculture Tanzania HQ', 'beyu-agri-tz-hq', 'AGRIBUSINESS_GROUP', 'ACTIVE', 'TZ', '{"storageRegion":"tz","processingRegion":"tz"}'),
        ('00000000-0000-0000-0000-000000000002', 'BEYU Agriculture Kenya Ltd', 'beyu-agri-ke', 'COMMERCIAL_FARM', 'ACTIVE', 'KE', '{"storageRegion":"ke","processingRegion":"ke"}')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Farms
    await session.query(`
      INSERT INTO agri_farm.farms (id, tenant_id, code, name, farm_type, status, country_code, region, district, village, gps_latitude, gps_longitude, total_area_ha, tenure)
      VALUES
        ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'FRM-26-0001', 'Kilombero Rice Estate', 'CROP_FARM', 'ACTIVE', 'TZ', 'Morogoro', 'Kilombero', 'Mkula', -8.391200, 36.875400, 1200.0, 'LEASEHOLD'),
        ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'FRM-26-0002', 'Njombe Dairy & Mixed Farm', 'MIXED_FARM', 'ACTIVE', 'TZ', 'Njombe', 'Njombe TC', 'Mdandu', -9.333300, 34.766700, 450.5, 'FREEHOLD'),
        ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002', 'FRM-26-0001', 'Naivasha Horticulture Farm', 'ORCHARD', 'ACTIVE', 'KE', 'Rift Valley', 'Naivasha', 'Kongoni', -0.916700, 36.433300, 220.0, 'FREEHOLD')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Fields
    await session.query(`
      INSERT INTO agri_farm.fields (id, tenant_id, farm_id, code, name, field_use, area_ha, soil_texture, irrigation_type, status)
      VALUES
        ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'FLD-001', 'North Block A', 'CROPLAND', 350.0, 'ALLUVIAL', 'GRAVITY_CANAL', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'FLD-002', 'North Block B', 'CROPLAND', 280.5, 'CLAY_LOAM', 'GRAVITY_CANAL', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'FLD-001', 'Upper Pasture', 'PASTURE', 180.0, 'VOLCANIC', 'RAINFED', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000012', 'FLD-001', 'Greenhouse Block 1', 'CROPLAND', 12.5, 'LOAM', 'DRIP', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Crop catalogue
    await session.query(`
      INSERT INTO agri_crop.crops (id, tenant_id, code, name, scientific_name, category, growing_days_min, growing_days_max, status)
      VALUES
        ('00000000-0000-0000-0000-000000000200', '00000000-0000-0000-0000-000000000001', 'CRP-RICE-SARO', 'Rice (Saro 5)', 'Oryza sativa', 'CEREAL', 120, 140, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'CRP-MAIZE-H614', 'Maize (H614)', 'Zea mays', 'CEREAL', 125, 150, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000001', 'CRP-BEAN-UYO', 'Bean (Uyole 96)', 'Phaseolus vulgaris', 'LEGUME', 75, 90, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000002', 'CRP-AVO-HASS', 'Avocado (Hass)', 'Persea americana', 'FRUIT', 1095, 1460, 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Warehouses
    await session.query(`
      INSERT INTO agri_inventory.warehouses (id, tenant_id, farm_id, code, name, warehouse_type, is_cold_store, capacity_kg, status)
      VALUES
        ('00000000-0000-0000-0000-000000000400', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'WH-KIL-MAIN', 'Kilombero Main Produce Store', 'PRODUCE_STORE', false, 500000, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'WH-NJO-COLD', 'Njombe Cold Store', 'COLD_STORE', true, 120000, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000001', NULL, 'WH-INPUT-01', 'Central Input Store', 'INPUT_STORE', false, 80000, 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Input items
    await session.query(`
      INSERT INTO agri_inventory.input_items (id, tenant_id, code, name, category, unit, manufacturer, is_restricted, status)
      VALUES
        ('00000000-0000-0000-0000-000000000500', '00000000-0000-0000-0000-000000000001', 'INP-SEED-RICE-SARO', 'Saro 5 Certified Seed', 'SEED', 'kg', 'TARI Ifakara', false, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000001', 'INP-FERT-UREA', 'Urea 46% N', 'FERTILIZER', 'kg', 'TFC', false, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000001', 'INP-FERT-DAP', 'DAP 18-46-0', 'FERTILIZER', 'kg', 'TFC', false, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000001', 'INP-PEST-ROUNDUP', 'Glyphosate 480 SL', 'HERBICIDE', 'litre', 'Monsanto/Bayer', true, 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Counterparties
    await session.query(`
      INSERT INTO agri_procurement.suppliers (id, tenant_id, code, name, contact_person, phone, email, country, status)
      VALUES
        ('00000000-0000-0000-0000-000000000600', '00000000-0000-0000-0000-000000000001', 'SUP-TFC', 'Tanzania Fertiliser Company', 'Procurement Desk', '+255 22 286 0119', 'sales@tfc.co.tz', 'TZ', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000001', 'SUP-TARI', 'TARI Ifakara Seed Unit', 'Seed Desk', '+255 23 262 4110', 'seed@tari.go.tz', 'TZ', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);
    await session.query(`
      INSERT INTO agri_procurement.buyers (id, tenant_id, code, name, contact_person, phone, email, country, status)
      VALUES
        ('00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000001', 'BUY-KARIBU', 'Karibu Foods Distributors', 'Meshack K', '+255 713 000 001', 'orders@karibufoods.co.tz', 'TZ', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000001', 'BUY-TANGRAIN', 'Tanganyika Grain Traders', 'Asha M', '+255 754 000 002', 'grain@tangrain.co.tz', 'TZ', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Admin users — one super admin (cross-tenant) and one farm manager (tenant 1 only).
    const existingAdmin = await session.query(`SELECT id FROM agri_identity.users WHERE email='admin@beyu.agriculture' AND deleted_at IS NULL LIMIT 1`);
    if (!existingAdmin.rows[0]) {
      const passwordHash = hashPassword('BeyuAgriculture2026!');
      const userRes = await session.query<{ id: string }>(
        `INSERT INTO agri_identity.users (email, display_name, password_hash, status) VALUES ('admin@beyu.agriculture', 'BEYU Agriculture Super Admin', $1, 'ACTIVE') RETURNING id`,
        [passwordHash],
      );
      const userId = userRes.rows[0].id;
      await session.query(`INSERT INTO agri_identity.user_roles (user_id, role_id) SELECT $1, id FROM agri_identity.roles WHERE code='SUPER_ADMIN' ON CONFLICT DO NOTHING`, [userId]);
    } else {
      const passwordHash = hashPassword('BeyuAgriculture2026!');
      await session.query(`UPDATE agri_identity.users SET password_hash=$1, status='ACTIVE', updated_at=now() WHERE email='admin@beyu.agriculture'`, [passwordHash]);
    }

    const existingManager = await session.query(`SELECT id FROM agri_identity.users WHERE email='manager@beyu.agriculture' AND deleted_at IS NULL LIMIT 1`);
    if (!existingManager.rows[0]) {
      const passwordHash = hashPassword('BeyuAgriculture2026!');
      const userRes = await session.query<{ id: string }>(
        `INSERT INTO agri_identity.users (email, display_name, password_hash, status) VALUES ('manager@beyu.agriculture', 'Kilombero Farm Manager', $1, 'ACTIVE') RETURNING id`,
        [passwordHash],
      );
      const userId = userRes.rows[0].id;
      await session.query(`INSERT INTO agri_identity.user_roles (user_id, role_id) SELECT $1, id FROM agri_identity.roles WHERE code='FARM_MANAGER' ON CONFLICT DO NOTHING`, [userId]);
      await session.query(
        `INSERT INTO agri_identity.memberships (user_id, tenant_id, farm_id, role_in_tenant, status) VALUES ($1, '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'FARM_MANAGER', 'ACTIVE') ON CONFLICT DO NOTHING`,
        [userId],
      );
    }
  });
}
