-- Migration 0011: Automatic Report Generation including MTUHA
-- Implements automatic generation, scheduling, and audit for MTUHA and operational reports

-- Report schedules for automatic generation
CREATE TABLE health_reporting.report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  facility_id UUID REFERENCES health_tenant.facilities(id),
  report_type TEXT NOT NULL CHECK (report_type IN ('BOOK6','BOOK8','BOOK9','BOOK10','BOOK11','BOOK12','MTUHA2','MTUHA3','DAILY_PATIENT_VOLUME','WEEKLY_SUMMARY','MONTHLY_SUMMARY','OPHTHALMOLOGY_MONTHLY','PHARMACY_MONTHLY','LAB_MONTHLY','REVENUE_DAILY','COMPLIANCE_WEEKLY')),
  cron_expression TEXT NOT NULL DEFAULT '0 2 * * *',
  timezone TEXT NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, facility_id, report_type)
);

-- Auto-generated reports log
CREATE TABLE health_reporting.auto_generated_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  facility_id UUID REFERENCES health_tenant.facilities(id),
  schedule_id UUID REFERENCES health_reporting.report_schedules(id),
  report_type TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'GENERATING' CHECK (status IN ('GENERATING','COMPLETED','FAILED','CANCELLED')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB,
  file_url TEXT,
  generated_by TEXT NOT NULL DEFAULT 'SYSTEM',
  generated_by_user_id UUID REFERENCES health_identity.users(id),
  error_message TEXT,
  generation_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX auto_reports_tenant_period_idx ON health_reporting.auto_generated_reports (tenant_id, facility_id, report_type, period_start DESC);
CREATE INDEX auto_reports_status_idx ON health_reporting.auto_generated_reports (status, created_at DESC);

-- MTUHA specific detailed tables for automatic generation
CREATE TABLE health_reporting.mtuha_book6_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES health_reporting.mtuha_reports(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  age_group TEXT NOT NULL CHECK (age_group IN ('0-28D','1-11M','1-4Y','5-14Y','15-24Y','25-59Y','60+Y')),
  gender TEXT NOT NULL CHECK (gender IN ('MALE','FEMALE')),
  diagnosis_code TEXT,
  diagnosis_name TEXT,
  new_attendance BOOLEAN NOT NULL DEFAULT TRUE,
  count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mtuha_book6_report_idx ON health_reporting.mtuha_book6_data (report_id, date);

CREATE TABLE health_reporting.mtuha_book8_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES health_reporting.mtuha_reports(id) ON DELETE CASCADE,
  admission_date DATE NOT NULL,
  discharge_date DATE,
  age_group TEXT NOT NULL,
  gender TEXT NOT NULL,
  diagnosis_code TEXT,
  diagnosis_name TEXT,
  outcome TEXT CHECK (outcome IN ('DISCHARGED','REFERRED','ABSCONDED','DIED','TRANSFERRED')),
  days_stayed INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Monthly summary aggregation for MTUHA 2
CREATE TABLE health_reporting.mtuha_monthly_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  facility_id UUID NOT NULL REFERENCES health_tenant.facilities(id),
  report_type TEXT NOT NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  opd_total INTEGER NOT NULL DEFAULT 0,
  opd_under5 INTEGER NOT NULL DEFAULT 0,
  opd_over5 INTEGER NOT NULL DEFAULT 0,
  ipd_total INTEGER NOT NULL DEFAULT 0,
  ipd_under5 INTEGER NOT NULL DEFAULT 0,
  ipd_over5 INTEGER NOT NULL DEFAULT 0,
  deliveries_total INTEGER NOT NULL DEFAULT 0,
  live_births INTEGER NOT NULL DEFAULT 0,
  still_births INTEGER NOT NULL DEFAULT 0,
  malaria_cases INTEGER NOT NULL DEFAULT 0,
  pneumonia_cases INTEGER NOT NULL DEFAULT 0,
  diarrhea_cases INTEGER NOT NULL DEFAULT 0,
  ophthalmology_total INTEGER NOT NULL DEFAULT 0,
  cataract_cases INTEGER NOT NULL DEFAULT 0,
  glaucoma_cases INTEGER NOT NULL DEFAULT 0,
  diabetic_retinopathy_cases INTEGER NOT NULL DEFAULT 0,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, facility_id, report_type, period_year, period_month)
);

-- Report generation audit for compliance
CREATE TABLE health_reporting.report_generation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  report_id UUID REFERENCES health_reporting.auto_generated_reports(id),
  action TEXT NOT NULL CHECK (action IN ('SCHEDULED','STARTED','COMPLETED','FAILED','EXPORTED','SUBMITTED','APPROVED','REJECTED')),
  performed_by TEXT NOT NULL DEFAULT 'SYSTEM',
  user_id UUID REFERENCES health_identity.users(id),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default schedules for Tanzania facilities
INSERT INTO health_reporting.report_schedules (tenant_id, facility_id, report_type, cron_expression, timezone, is_active, config)
SELECT 
  '00000000-0000-0000-0000-000000000001'::uuid,
  f.id,
  rt,
  CASE 
    WHEN rt LIKE 'BOOK%' THEN '0 2 * * *'
    WHEN rt = 'MTUHA2' THEN '0 3 1 * *'
    WHEN rt = 'DAILY_PATIENT_VOLUME' THEN '0 1 * * *'
    WHEN rt = 'REVENUE_DAILY' THEN '0 2 * * *'
    WHEN rt = 'OPHTHALMOLOGY_MONTHLY' THEN '0 4 1 * *'
    ELSE '0 3 * * *'
  END,
  'Africa/Dar_es_Salaam',
  true,
  '{}'::jsonb
FROM health_tenant.facilities f
CROSS JOIN (VALUES ('BOOK6'),('BOOK8'),('MTUHA2'),('DAILY_PATIENT_VOLUME'),('REVENUE_DAILY'),('OPHTHALMOLOGY_MONTHLY')) AS r(rt)
WHERE f.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
ON CONFLICT (tenant_id, facility_id, report_type) DO NOTHING;

-- Function to calculate age group for MTUHA
CREATE OR REPLACE FUNCTION health_reporting.calculate_age_group(dob DATE, reference_date DATE DEFAULT CURRENT_DATE) RETURNS TEXT AS $$
DECLARE
  age_days INTEGER;
  age_months INTEGER;
  age_years INTEGER;
BEGIN
  age_days := reference_date - dob;
  age_months := EXTRACT(YEAR FROM age(dob, reference_date)) * 12 + EXTRACT(MONTH FROM age(dob, reference_date));
  age_years := EXTRACT(YEAR FROM age(reference_date, dob));
  
  IF age_days <= 28 THEN RETURN '0-28D';
  ELSIF age_months < 12 THEN RETURN '1-11M';
  ELSIF age_years < 5 THEN RETURN '1-4Y';
  ELSIF age_years < 15 THEN RETURN '5-14Y';
  ELSIF age_years < 25 THEN RETURN '15-24Y';
  ELSIF age_years < 60 THEN RETURN '25-59Y';
  ELSE RETURN '60+Y';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to auto-generate MTUHA Book 6 data
CREATE OR REPLACE FUNCTION health_reporting.generate_book6_data(p_tenant_id UUID, p_facility_id UUID, p_start DATE, p_end DATE) RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'period_start', p_start,
    'period_end', p_end,
    'total_encounters', COUNT(*),
    'by_gender', jsonb_object_agg(gender, gender_count),
    'by_age_group', jsonb_object_agg(age_group, age_count)
  ) INTO result
  FROM (
    SELECT 
      p.gender,
      health_reporting.calculate_age_group(p.date_of_birth, e.period_start::date) as age_group,
      COUNT(*) as gender_count,
      COUNT(*) as age_count
    FROM health_clinical.encounters e
    JOIN health_patient.patients p ON p.id = e.patient_id
    WHERE e.tenant_id = p_tenant_id 
      AND e.facility_id = p_facility_id
      AND e.class IN ('OUTPATIENT','AMBULATORY')
      AND e.period_start::date BETWEEN p_start AND p_end
    GROUP BY p.gender, health_reporting.calculate_age_group(p.date_of_birth, e.period_start::date)
  ) sub;
  
  RETURN COALESCE(result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- View for automatic reporting dashboard
CREATE OR REPLACE VIEW health_reporting.automatic_reporting_status AS
SELECT 
  rs.tenant_id,
  rs.facility_id,
  f.name as facility_name,
  rs.report_type,
  rs.is_active,
  rs.cron_expression,
  rs.last_run_at,
  rs.next_run_at,
  COUNT(agr.id) as total_generated,
  MAX(agr.completed_at) as last_generated_at,
  COUNT(CASE WHEN agr.status = 'FAILED' THEN 1 END) as failed_count
FROM health_reporting.report_schedules rs
JOIN health_tenant.facilities f ON f.id = rs.facility_id
LEFT JOIN health_reporting.auto_generated_reports agr ON agr.schedule_id = rs.id
GROUP BY rs.tenant_id, rs.facility_id, f.name, rs.report_type, rs.is_active, rs.cron_expression, rs.last_run_at, rs.next_run_at;
