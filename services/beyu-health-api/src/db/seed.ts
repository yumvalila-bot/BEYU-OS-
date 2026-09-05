import type { Database } from './driver';
import { hashPassword } from '@beyu/security';

export async function seed(db: Database): Promise<void> {
  await db.transaction(async (session) => {
    // Tenants
    await session.query(`
      INSERT INTO health_tenant.tenants (id, name, slug, type, status, country_code, settings, branding, data_residency)
      VALUES 
        ('00000000-0000-0000-0000-000000000001', 'BEYU Health Tanzania HQ', 'beyu-health-tz-hq', 'HOSPITAL_GROUP', 'ACTIVE', 'TZ', '{}', '{}', '{"storageRegion":"tz","backupRegion":"tz","processingRegion":"tz"}')
      ON CONFLICT (id) DO NOTHING;
    `);
    await session.query(`
      INSERT INTO health_tenant.facilities (id, tenant_id, name, type, code, status, address, contact_phone)
      VALUES
        ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'BEYU Eye & General Hospital - Dar es Salaam', 'HOSPITAL', 'BEYU-DAR-01', 'ACTIVE', 'Plot 123, Masaki, Dar es Salaam, Tanzania', '+255 22 123 4567'),
        ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'BEYU Medical Center - Arusha', 'CLINIC', 'BEYU-ARU-01', 'ACTIVE', 'Njiro Road, Arusha, Tanzania', '+255 27 234 5678')
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
        ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000010', 'Emergency', 'ER', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0000-000000000011', 'Outpatient', 'OPD', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000011', 'Eye Clinic', 'EYE', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);
    // Rooms and Beds
    await session.query(`
      INSERT INTO health_tenant.rooms (id, facility_id, department_id, name, room_type, status, capacity)
      VALUES
        ('00000000-0000-0000-0000-000000000200', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000100', 'Eye Exam Room 1', 'CONSULTATION', 'AVAILABLE', 1),
        ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000100', 'Eye Theatre', 'OPERATING_THEATRE', 'AVAILABLE', 1),
        ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000105', 'Emergency Bay 1', 'WARD', 'AVAILABLE', 2),
        ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000010', null, 'Pharmacy Dispensary', 'PHARMACY', 'AVAILABLE', 1),
        ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000010', null, 'Main Lab', 'LABORATORY', 'AVAILABLE', 3)
      ON CONFLICT (id) DO NOTHING;
    `);
    await session.query(`
      INSERT INTO health_tenant.beds (id, facility_id, room_id, bed_number, status)
      VALUES
        ('00000000-0000-0000-0000-000000000300', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000202', 'ER-01', 'AVAILABLE'),
        ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000202', 'ER-02', 'AVAILABLE'),
        ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000010', NULL, 'OPHTH-WARD-01', 'AVAILABLE'),
        ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000010', NULL, 'GEN-WARD-01', 'AVAILABLE')
      ON CONFLICT (id) DO NOTHING;
    `);
    // Warehouses
    await session.query(`
      INSERT INTO health_inventory.warehouses (id, tenant_id, facility_id, name, code, type, status)
      VALUES
        ('00000000-0000-0000-0000-000000000400', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Main Pharmacy Store', 'PHARM-MAIN', 'PHARMACY', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'General Store', 'GEN-MAIN', 'GENERAL', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Lab Store', 'LAB-STORE', 'LAB', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);
    // Suppliers
    await session.query(`
      INSERT INTO health_inventory.suppliers (id, tenant_id, name, code, contact_person, phone, status)
      VALUES
        ('00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000001', 'Tanzania Medical Stores - MSD', 'MSD', 'Procurement MSD', '+255 22 212 2472', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000001', 'BEYU Pharma Ltd', 'BEYU-PHARMA', 'John Supplier', '+255 714 000 001', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);
    // Drugs
    await session.query(`
      INSERT INTO health_pharmacy.drugs (id, tenant_id, code, name, generic_name, form, strength, manufacturer, category, is_controlled, requires_prescription, status)
      VALUES
        ('00000000-0000-0000-0000-000000000500', '00000000-0000-0000-0000-000000000001', 'DRG-AMOX-500', 'Amoxicillin', 'Amoxicillin', 'Capsule', '500mg', 'Shelys', 'Antibiotic', false, true, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000001', 'DRG-PARA-500', 'Paracetamol', 'Paracetamol', 'Tablet', '500mg', 'TPI', 'Analgesic', false, false, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000001', 'DRG-LAT-0.005', 'Latanoprost', 'Latanoprost', 'Eye Drops', '0.005%', 'Pfizer', 'Ophthalmology-Glaucoma', false, true, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000001', 'DRG-TIM-0.5', 'Timolol', 'Timolol Maleate', 'Eye Drops', '0.5%', 'GSK', 'Ophthalmology-Glaucoma', false, true, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000001', 'DRG-ATROP-1', 'Atropine', 'Atropine Sulphate', 'Eye Drops', '1%', 'Alcon', 'Ophthalmology-Mydriatic', false, true, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000001', 'DRG-CIPRO-0.3', 'Ciprofloxacin Eye Drops', 'Ciprofloxacin', 'Eye Drops', '0.3%', 'Alcon', 'Ophthalmology-Antibiotic', false, true, 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);
    // Inventory items linked to drugs
    await session.query(`
      INSERT INTO health_inventory.items (id, tenant_id, sku, name, category, uom, is_drug, drug_id, is_consumable, reorder_level, reorder_quantity, status)
      VALUES
        ('00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000001', 'SKU-AMOX-500', 'Amoxicillin 500mg Caps', 'Pharmacy', 'Capsule', true, '00000000-0000-0000-0000-000000000500', true, 100, 500, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000511', '00000000-0000-0000-0000-000000000001', 'SKU-LAT-0.005', 'Latanoprost 0.005% Drops', 'Ophthalmology', 'Bottle', true, '00000000-0000-0000-0000-000000000502', true, 20, 100, 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);
    await session.query(`
      INSERT INTO health_inventory.stock_batches (id, tenant_id, item_id, warehouse_id, batch_number, quantity, expiry_date, supplier_id)
      VALUES
        ('00000000-0000-0000-0000-000000000520', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000400', 'BATCH-AMOX-2026-01', 1000, '2026-12-31', '00000000-0000-0000-0000-000000000410'),
        ('00000000-0000-0000-0000-000000000521', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000511', '00000000-0000-0000-0000-000000000400', 'BATCH-LAT-2026-02', 100, '2026-06-30', '00000000-0000-0000-0000-000000000411')
      ON CONFLICT (id) DO NOTHING;
    `);
    // Lab catalog
    await session.query(`
      INSERT INTO health_lab.test_catalog (id, tenant_id, code, loinc_code, name, category, specimen_type, turnaround_hours, price_minor, status)
      VALUES
        ('00000000-0000-0000-0000-000000000600', '00000000-0000-0000-0000-000000000001', 'CBC', '58410-2', 'Complete Blood Count', 'Hematology', 'Whole Blood', 2, 15000, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000001', 'RBS', '15074-8', 'Random Blood Sugar', 'Chemistry', 'Serum', 1, 10000, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000001', 'HBA1C', '4548-4', 'HbA1c', 'Chemistry', 'Whole Blood', 4, 35000, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000001', 'URINALYSIS', '24356-8', 'Urinalysis', 'Urinalysis', 'Urine', 1, 12000, 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);
    // Radiology modality
    await session.query(`
      INSERT INTO health_radiology.modality_catalog (id, tenant_id, code, name, modality, duration_minutes, price_minor, status)
      VALUES
        ('00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000001', 'XRAY-CHEST', 'Chest X-Ray PA', 'XRAY', 15, 40000, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000001', 'US-ABDOMEN', 'Abdominal Ultrasound', 'US', 30, 60000, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000612', '00000000-0000-0000-0000-000000000001', 'OCT-MACULA', 'OCT Macula', 'OCT', 20, 80000, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000613', '00000000-0000-0000-0000-000000000001', 'FUNDUS-PHOTO', 'Fundus Photography', 'FUNDUS_PHOTOGRAPHY', 15, 50000, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000614', '00000000-0000-0000-0000-000000000001', 'VF-24-2', 'Visual Field 24-2', 'VISUAL_FIELD', 30, 45000, 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);
    // Service catalog
    await session.query(`
      INSERT INTO health_billing.service_catalog (id, tenant_id, code, name, category, department, unit_price_minor, currency, status)
      VALUES
        ('00000000-0000-0000-0000-000000000700', '00000000-0000-0000-0000-000000000001', 'CONS-GEN', 'General Consultation', 'Consultation', 'GENMED', 30000, 'TZS', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000001', 'CONS-EYE', 'Eye Consultation', 'Consultation', 'OPHTH', 50000, 'TZS', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000001', 'CATARACT-SURG', 'Cataract Surgery with IOL', 'Surgery', 'OPHTH', 1200000, 'TZS', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-000000000001', 'OCT-SCAN', 'OCT Scan', 'Imaging', 'OPHTH', 80000, 'TZS', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000704', '00000000-0000-0000-0000-000000000001', 'LAB-CBC', 'CBC Lab', 'Laboratory', 'LAB', 15000, 'TZS', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);
    // Payers
    await session.query(`
      INSERT INTO health_insurance.payers (id, tenant_id, name, code, type, status)
      VALUES
        ('00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000001', 'National Health Insurance Fund', 'NHIF', 'NHIF', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000001', 'Strategies Insurance Tanzania', 'STRATEGIS', 'PRIVATE', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000712', '00000000-0000-0000-0000-000000000001', 'Jubilee Insurance', 'JUBILEE', 'PRIVATE', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);
    // Ambulances
    await session.query(`
      INSERT INTO health_ambulance.ambulances (id, tenant_id, vehicle_number, registration_plate, type, status, base_facility_id)
      VALUES
        ('00000000-0000-0000-0000-000000000720', '00000000-0000-0000-0000-000000000001', 'AMB-001', 'T123 ABC', 'ALS', 'AVAILABLE', '00000000-0000-0000-0000-000000000010'),
        ('00000000-0000-0000-0000-000000000721', '00000000-0000-0000-0000-000000000001', 'AMB-002', 'T456 DEF', 'BASIC', 'AVAILABLE', '00000000-0000-0000-0000-000000000010')
      ON CONFLICT (id) DO NOTHING;
    `);
    // Notification templates
    await session.query(`
      INSERT INTO health_notifications.templates (tenant_id, code, name, channel, subject_template, body_template, is_active)
      VALUES
        ('00000000-0000-0000-0000-000000000001', 'APPT_REMINDER', 'Appointment Reminder', 'SMS', 'Appointment Reminder - BEYU Health', 'Dear {{patientName}}, your appointment at {{facilityName}} on {{appointmentDate}} at {{appointmentTime}} is confirmed. Reply CANCEL to reschedule.', true),
        ('00000000-0000-0000-0000-000000000001', 'LAB_RESULT_READY', 'Lab Result Ready', 'SMS', 'Lab Results - BEYU Health', 'Dear {{patientName}}, your lab results for {{testName}} are ready. Please collect at {{facilityName}} or view in patient portal.', true),
        ('00000000-0000-0000-0000-000000000001', 'APPT_REMINDER_EMAIL', 'Appointment Reminder Email', 'EMAIL', 'Your appointment at BEYU Health - {{appointmentDate}}', '<p>Dear {{patientName}},</p><p>Your appointment at {{facilityName}} on {{appointmentDate}} at {{appointmentTime}} is confirmed.</p><p>BEYU Health OS</p>', true)
      ON CONFLICT (tenant_id, code, channel) DO NOTHING;
    `);
    // Report definitions
    await session.query(`
      INSERT INTO health_reporting.report_definitions (id, tenant_id, code, name, category, query_template, is_system, status)
      VALUES
        ('00000000-0000-0000-0000-000000000800', '00000000-0000-0000-0000-000000000001', 'DAILY_PATIENT_VOLUME', 'Daily Patient Volume', 'OPERATIONAL', 'SELECT date_trunc(''day'', created_at) as day, COUNT(*) FROM health_patient.patients WHERE tenant_id = $1 GROUP BY day ORDER BY day DESC', true, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000801', NULL, 'MTUHA_BOOK6', 'MTUHA Book 6 - Outpatient', 'MTUHA', 'SELECT * FROM health_reporting.mtuha_reports WHERE report_type=''BOOK6''', true, 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000802', NULL, 'OPHTHALMOLOGY_DISEASE_PATTERN', 'Ophthalmology Disease Pattern', 'OPHTHALMOLOGY', 'SELECT category, COUNT(*) FROM health_ophthalmology.ophthalmic_diagnoses GROUP BY category', true, 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `);
    // Compliance requirements seed for TZ MOH
    const packRes = await session.query<{ id: string }>(`SELECT id FROM health_compliance.compliance_packs WHERE code='TZ-MOH-GENERAL' LIMIT 1`);
    if (packRes.rows[0]) {
      const packId = packRes.rows[0].id;
      await session.query(`
        INSERT INTO health_compliance.compliance_requirements (id, pack_id, reference, title, description, category, mandatory)
        VALUES
          ('00000000-0000-0000-0000-000000000810', $1, 'MOH-001', 'Facility License Valid', 'Health facility license must be valid and displayed', 'Licensing', true),
          ('00000000-0000-0000-0000-000000000811', $1, 'MOH-002', 'Infection Prevention Guidelines', 'Facility must have IPC guidelines and training records', 'Quality', true),
          ('00000000-0000-0000-0000-000000000812', $1, 'MOH-003', 'Medical Waste Management', 'Proper medical waste segregation and disposal', 'Safety', true),
          ('00000000-0000-0000-0000-000000000813', $1, 'MOH-004', 'Emergency Equipment', 'Emergency trolley and equipment must be functional', 'Safety', true)
        ON CONFLICT (id) DO NOTHING;
      `, [packId]);
    }
    // Governance workflows
    await session.query(`
      INSERT INTO health_governance.approval_workflows (id, tenant_id, code, name, resource_type, steps, is_active)
      VALUES
        ('00000000-0000-0000-0000-000000000820', '00000000-0000-0000-0000-000000000001', 'PURCHASE_ORDER_APPROVAL', 'Purchase Order Approval', 'purchase_order', '[{"order":1,"name":"Storekeeper Review","approverRoles":["STOREKEEPER"],"mode":"SEQUENTIAL","requiredApprovals":1},{"order":2,"name":"Procurement Officer Approval","approverRoles":["PROCUREMENT_OFFICER"],"mode":"SEQUENTIAL","requiredApprovals":1},{"order":3,"name":"Facility Admin Final Approval","approverRoles":["FACILITY_ADMIN"],"mode":"SEQUENTIAL","requiredApprovals":1}]', true),
        ('00000000-0000-0000-0000-000000000821', '00000000-0000-0000-0000-000000000001', 'INVOICE_REFUND_APPROVAL', 'Invoice Refund Approval', 'refund', '[{"order":1,"name":"Cashier Initiates","approverRoles":["CASHIER"],"mode":"SEQUENTIAL","requiredApprovals":1},{"order":2,"name":"Accountant Approval","approverRoles":["ACCOUNTANT"],"mode":"SEQUENTIAL","requiredApprovals":1}]', true)
      ON CONFLICT (id) DO NOTHING;
    `);
    // Integration configs
    await session.query(`
      INSERT INTO health_integration.integration_configs (id, tenant_id, name, type, provider, endpoint_url, is_active)
      VALUES
        ('00000000-0000-0000-0000-000000000830', '00000000-0000-0000-0000-000000000001', 'NHIF Production', 'NHIF', 'NHIF Tanzania', 'https://verification.nhif.or.tz/api', false),
        ('00000000-0000-0000-0000-000000000831', '00000000-0000-0000-0000-000000000001', 'Tanzania DHIS2', 'DHIS2', 'MOH Tanzania', 'https://dhis2.moh.go.tz/api', false),
        ('00000000-0000-0000-0000-000000000832', '00000000-0000-0000-0000-000000000001', 'PACS - Main', 'PACS', 'Orthanc', 'http://pacs:8042/dicom-web', false)
      ON CONFLICT (id) DO NOTHING;
    `);
    // Admin user creation
    const existingAdmin = await session.query(`SELECT id FROM health_identity.users WHERE email='admin@beyu.health' AND deleted_at IS NULL LIMIT 1`);
    if (!existingAdmin.rows[0]) {
      const passwordHash = hashPassword('BeyuHealth2026!');
      const userRes = await session.query<{ id: string }>(`INSERT INTO health_identity.users (email, display_name, password_hash, status, preferred_language) VALUES ('admin@beyu.health', 'BEYU Health Super Admin', $1, 'ACTIVE', 'en') RETURNING id`, [passwordHash]);
      const userId = userRes.rows[0].id;
      // Assign SUPER_ADMIN role
      await session.query(`INSERT INTO health_identity.user_roles (user_id, role_id, tenant_id) SELECT $1, id, '00000000-0000-0000-0000-000000000001' FROM health_identity.roles WHERE code='SUPER_ADMIN' ON CONFLICT DO NOTHING`, [userId]);
      await session.query(`INSERT INTO health_identity.memberships (user_id, tenant_id, facility_id, status) VALUES ($1, '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'ACTIVE') ON CONFLICT DO NOTHING`, [userId]);
      // Additional roles
      await session.query(`INSERT INTO health_identity.user_roles (user_id, role_id, tenant_id) SELECT $1, id, '00000000-0000-0000-0000-000000000001' FROM health_identity.roles WHERE code IN ('TENANT_ADMIN','FACILITY_ADMIN','DOCTOR','OPHTHALMOLOGIST') ON CONFLICT DO NOTHING`, [userId]);
    } else {
      // Ensure password is updated to known
      const passwordHash = hashPassword('BeyuHealth2026!');
      await session.query(`UPDATE health_identity.users SET password_hash=$1, status='ACTIVE', updated_at=now() WHERE email='admin@beyu.health'`, [passwordHash]);
    }

    // Sample patient for demo timeline
    const patientExists = await session.query(`SELECT id FROM health_patient.patients WHERE mrn LIKE 'BEYU-DEMO-%' LIMIT 1`);
    if (!patientExists.rows[0]) {
      const tenantId = '00000000-0000-0000-0000-000000000001';
      const mrn = `BEYU-DEMO-000001`;
      const patRes = await session.query<{ id: string }>(`INSERT INTO health_patient.patients (tenant_id, mrn, first_name, last_name, gender, date_of_birth, phone, blood_group, status, created_by) VALUES ($1,$2,'John','Doe','MALE','1985-06-15','+255 714 000 010','O+','ACTIVE', (SELECT id FROM health_identity.users WHERE email='admin@beyu.health' LIMIT 1)) RETURNING id`, [tenantId, mrn]);
      const patId = patRes.rows[0].id;
      await session.query(`INSERT INTO health_patient.emergency_contacts (patient_id, name, relationship, phone, is_primary) VALUES ($1,'Jane Doe','Spouse','+255 714 000 011', true)`, [patId]);
      await session.query(`INSERT INTO health_patient.allergies (tenant_id, patient_id, display, criticality, status, recorder_id) VALUES ($1,$2,'Penicillin','HIGH','ACTIVE', (SELECT id FROM health_identity.users WHERE email='admin@beyu.health' LIMIT 1))`, [tenantId, patId]);
    }
  });
}
