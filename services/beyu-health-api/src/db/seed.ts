import type { Database } from './driver';

export async function seed(db: Database): Promise<void> {
  await db.transaction(async (session) => {
    // Seed default tenant and facility if not exists
    await session.query(`
      INSERT INTO health_tenant.tenants (id, name, slug, type, status, country_code, settings, branding, data_residency)
      VALUES 
        ('00000000-0000-0000-0000-000000000001', 'BEYU Health Tanzania HQ', 'beyu-health-tz-hq', 'HOSPITAL_GROUP', 'ACTIVE', 'TZ', '{}', '{}', '{"storageRegion":"tz","backupRegion":"tz","processingRegion":"tz"}')
      ON CONFLICT (id) DO NOTHING;
    `);
    await session.query(`
      INSERT INTO health_tenant.facilities (id, tenant_id, name, type, code, status)
      VALUES
        ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'BEYU Eye & General Hospital - Dar es Salaam', 'HOSPITAL', 'BEYU-DAR-01', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'BEYU Medical Center - Arusha', 'CLINIC', 'BEYU-ARU-01', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);
    await session.query(`
      INSERT INTO health_tenant.departments (id, facility_id, name, code, status)
      VALUES
        ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Ophthalmology', 'OPHTH', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000010', 'General Medicine', 'GENMED', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000010', 'Pharmacy', 'PHARM', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000010', 'Laboratory', 'LAB', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000010', 'Radiology', 'RAD', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000010', 'Emergency', 'ER', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);
  });
}
