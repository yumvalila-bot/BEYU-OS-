-- Migration 0005: Laboratory, Radiology, Ophthalmology (first-class)
CREATE SCHEMA IF NOT EXISTS health_lab;
CREATE SCHEMA IF NOT EXISTS health_radiology;
CREATE SCHEMA IF NOT EXISTS health_ophthalmology;

-- LABORATORY
CREATE TABLE health_lab.test_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  code TEXT NOT NULL,
  loinc_code TEXT,
  name TEXT NOT NULL,
  short_name TEXT,
  category TEXT NOT NULL,
  specimen_type TEXT,
  container_type TEXT,
  turnaround_hours INTEGER,
  price_minor INTEGER,
  is_panel BOOLEAN NOT NULL DEFAULT FALSE,
  panel_tests JSONB,
  reference_ranges JSONB,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE health_lab.lab_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  orderer_id UUID NOT NULL REFERENCES health_identity.users(id),
  facility_id UUID REFERENCES health_tenant.facilities(id),
  order_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','REVOKED','COMPLETED','CANCELLED')),
  priority TEXT NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('ROUTINE','URGENT','STAT')),
  clinical_info TEXT,
  fasting_required BOOLEAN NOT NULL DEFAULT FALSE,
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_number)
);

CREATE TABLE health_lab.lab_order_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES health_lab.lab_orders(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES health_lab.test_catalog(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED'))
);

CREATE TABLE health_lab.specimens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  order_id UUID NOT NULL REFERENCES health_lab.lab_orders(id),
  specimen_number TEXT NOT NULL,
  type TEXT NOT NULL,
  site TEXT,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_by UUID NOT NULL REFERENCES health_identity.users(id),
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES health_identity.users(id),
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','UNAVAILABLE','UNSATISFACTORY','ENTERED_IN_ERROR','PROCESSING')),
  container_id TEXT,
  accession_number TEXT,
  condition TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, specimen_number)
);

CREATE TABLE health_lab.lab_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES health_lab.lab_orders(id),
  order_test_id UUID REFERENCES health_lab.lab_order_tests(id),
  specimen_id UUID REFERENCES health_lab.specimens(id),
  test_id UUID NOT NULL REFERENCES health_lab.test_catalog(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  status TEXT NOT NULL DEFAULT 'PRELIMINARY' CHECK (status IN ('REGISTERED','PRELIMINARY','FINAL','AMENDED','CANCELLED','ENTERED_IN_ERROR')),
  value_quantity NUMERIC,
  value_unit TEXT,
  value_string TEXT,
  value_json JSONB,
  interpretation TEXT CHECK (interpretation IN ('NORMAL','ABNORMAL','CRITICAL','HIGH','LOW','NEGATIVE','POSITIVE') OR interpretation IS NULL),
  reference_range_low NUMERIC,
  reference_range_high NUMERIC,
  reference_range_text TEXT,
  is_critical BOOLEAN NOT NULL DEFAULT FALSE,
  critical_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  critical_acknowledged_by UUID REFERENCES health_identity.users(id),
  critical_acknowledged_at TIMESTAMPTZ,
  performed_by UUID REFERENCES health_identity.users(id),
  verified_by UUID REFERENCES health_identity.users(id),
  verified_at TIMESTAMPTZ,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX health_lab_results_patient_idx ON health_lab.lab_results (patient_id, performed_at DESC);
CREATE INDEX health_lab_results_order_idx ON health_lab.lab_results (order_id);

CREATE TABLE health_lab.quality_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  test_id UUID NOT NULL REFERENCES health_lab.test_catalog(id),
  control_name TEXT NOT NULL,
  lot_number TEXT,
  expected_value NUMERIC,
  observed_value NUMERIC,
  status TEXT NOT NULL DEFAULT 'PASS' CHECK (status IN ('PASS','FAIL','REPEAT')),
  performed_by UUID REFERENCES health_identity.users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RADIOLOGY
CREATE TABLE health_radiology.modality_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  modality TEXT NOT NULL CHECK (modality IN ('XRAY','CT','MRI','US','MAMMOGRAPHY','FUNDUS_PHOTOGRAPHY','OCT','OCTA','VISUAL_FIELD','CORNEAL_TOPOGRAPHY','PACHYMETRY','BIOMETRY','KERATOMETRY','SLIT_LAMP_IMAGING','EXTERNAL_PHOTOGRAPHY','OTHER')),
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  price_minor INTEGER,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  UNIQUE (tenant_id, code)
);

CREATE TABLE health_radiology.imaging_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  orderer_id UUID NOT NULL REFERENCES health_identity.users(id),
  facility_id UUID REFERENCES health_tenant.facilities(id),
  order_number TEXT NOT NULL,
  modality TEXT NOT NULL CHECK (modality IN ('XRAY','CT','MRI','US','MAMMOGRAPHY','FUNDUS_PHOTOGRAPHY','OCT','OCTA','VISUAL_FIELD','CORNEAL_TOPOGRAPHY','PACHYMETRY','BIOMETRY','KERATOMETRY','SLIT_LAMP_IMAGING','EXTERNAL_PHOTOGRAPHY','OTHER')),
  body_site TEXT,
  view_name TEXT,
  laterality TEXT CHECK (laterality IN ('LEFT','RIGHT','BILATERAL','UNILATERAL') OR laterality IS NULL),
  indication TEXT,
  clinical_history TEXT,
  priority TEXT NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('ROUTINE','URGENT','STAT')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','REVOKED','COMPLETED','CANCELLED')),
  scheduled_at TIMESTAMPTZ,
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_number)
);

CREATE TABLE health_radiology.imaging_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES health_radiology.imaging_orders(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  study_instance_uid TEXT,
  modality TEXT NOT NULL,
  body_site TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  performer_id UUID REFERENCES health_identity.users(id),
  operator_id UUID REFERENCES health_identity.users(id),
  status TEXT NOT NULL DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED','AVAILABLE','CANCELLED','ENTERED_IN_ERROR','UNKNOWN')),
  number_of_series INTEGER NOT NULL DEFAULT 0,
  number_of_instances INTEGER NOT NULL DEFAULT 0,
  pacs_study_url TEXT,
  dose_info JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_radiology.imaging_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES health_radiology.imaging_studies(id) ON DELETE CASCADE,
  series_instance_uid TEXT,
  series_number INTEGER,
  modality TEXT NOT NULL,
  body_part TEXT,
  description TEXT,
  number_of_instances INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE health_radiology.imaging_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES health_radiology.imaging_series(id) ON DELETE CASCADE,
  sop_instance_uid TEXT,
  instance_number INTEGER,
  storage_url TEXT,
  thumbnail_url TEXT,
  metadata JSONB
);

CREATE TABLE health_radiology.imaging_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  study_id UUID NOT NULL REFERENCES health_radiology.imaging_studies(id),
  order_id UUID NOT NULL REFERENCES health_radiology.imaging_orders(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  author_id UUID NOT NULL REFERENCES health_identity.users(id),
  verifier_id UUID REFERENCES health_identity.users(id),
  status TEXT NOT NULL DEFAULT 'PRELIMINARY' CHECK (status IN ('PRELIMINARY','FINAL','AMENDED','CANCELLED','ENTERED_IN_ERROR')),
  findings TEXT NOT NULL,
  impression TEXT NOT NULL,
  conclusion TEXT,
  recommendations TEXT,
  structured_report JSONB,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- OPHTHALMOLOGY - First-class comprehensive module
CREATE TABLE health_ophthalmology.ophthalmology_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  ocular_history TEXT,
  systemic_history TEXT,
  family_history TEXT,
  medication_history TEXT,
  previous_surgeries TEXT,
  trauma_history TEXT,
  allergies TEXT,
  social_history TEXT,
  chief_complaint TEXT,
  history_of_present_illness TEXT,
  review_of_systems TEXT,
  recorded_by UUID REFERENCES health_identity.users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_ophthalmology.visual_acuity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID NOT NULL REFERENCES health_clinical.encounters(id),
  eye TEXT NOT NULL CHECK (eye IN ('OD','OS','OU')),
  testing_distance TEXT NOT NULL DEFAULT '6M',
  unaided_distance TEXT,
  aided_distance TEXT,
  pinhole TEXT,
  near_vision TEXT,
  bcva TEXT,
  color_vision TEXT,
  contrast_sensitivity TEXT,
  method TEXT NOT NULL DEFAULT 'SNELLEN' CHECK (method IN ('SNELLEN','LOGMAR','ETDRS','OTHER')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID REFERENCES health_identity.users(id)
);

CREATE TABLE health_ophthalmology.refraction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID NOT NULL REFERENCES health_clinical.encounters(id),
  eye TEXT NOT NULL CHECK (eye IN ('OD','OS')),
  sphere NUMERIC,
  cylinder NUMERIC,
  axis INTEGER CHECK (axis IS NULL OR (axis >=0 AND axis <=180)),
  prism TEXT,
  add_power NUMERIC,
  bcva TEXT,
  subjective_sphere NUMERIC,
  subjective_cylinder NUMERIC,
  subjective_axis INTEGER,
  objective_sphere NUMERIC,
  objective_cylinder NUMERIC,
  objective_axis INTEGER,
  cycloplegic_sphere NUMERIC,
  cycloplegic_cylinder NUMERIC,
  cycloplegic_axis INTEGER,
  type TEXT NOT NULL CHECK (type IN ('AUTO','MANUAL','CYCLOPLEGIC','SUBJECTIVE','OBJECTIVE')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_ophthalmology.external_exam (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID NOT NULL REFERENCES health_clinical.encounters(id),
  eye TEXT NOT NULL CHECK (eye IN ('OD','OS','OU')),
  lids TEXT,
  lacrimal TEXT,
  orbit TEXT,
  face TEXT,
  conjunctiva TEXT,
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID REFERENCES health_identity.users(id)
);

CREATE TABLE health_ophthalmology.pupil_exam (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID NOT NULL REFERENCES health_clinical.encounters(id),
  eye TEXT NOT NULL CHECK (eye IN ('OD','OS')),
  size_mm NUMERIC,
  shape TEXT,
  reaction_direct TEXT CHECK (reaction_direct IN ('NORMAL','SLUGGISH','NON_REACTIVE')),
  reaction_consensual TEXT CHECK (reaction_consensual IN ('NORMAL','SLUGGISH','NON_REACTIVE')),
  apd BOOLEAN,
  anisocoria BOOLEAN,
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_ophthalmology.ocular_motility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID NOT NULL REFERENCES health_clinical.encounters(id),
  ductions JSONB,
  versions JSONB,
  strabismus TEXT,
  nystagmus TEXT,
  cover_test TEXT,
  prism_cover_test TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_ophthalmology.slit_lamp_exam (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID NOT NULL REFERENCES health_clinical.encounters(id),
  eye TEXT NOT NULL CHECK (eye IN ('OD','OS')),
  lids TEXT,
  conjunctiva TEXT,
  sclera TEXT,
  cornea TEXT,
  anterior_chamber TEXT,
  anterior_chamber_depth TEXT,
  iris TEXT,
  angle_van_herick TEXT,
  lens TEXT,
  lens_opacity_type TEXT,
  vitreous_anterior TEXT,
  notes TEXT,
  van_herick_grade INTEGER,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID REFERENCES health_identity.users(id)
);

CREATE TABLE health_ophthalmology.intraocular_pressure (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID NOT NULL REFERENCES health_clinical.encounters(id),
  eye TEXT NOT NULL CHECK (eye IN ('OD','OS','OU')),
  method TEXT NOT NULL CHECK (method IN ('GOLDMANN','NON_CONTACT','TONOPEN','ICARE','OTHER')),
  value_mmhg NUMERIC NOT NULL,
  time_measured TIMESTAMPTZ NOT NULL DEFAULT now(),
  target_mmhg NUMERIC,
  pachymetry_adjusted BOOLEAN NOT NULL DEFAULT FALSE,
  central_corneal_thickness_um INTEGER,
  recorded_by UUID NOT NULL REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX health_iop_patient_idx ON health_ophthalmology.intraocular_pressure (patient_id, time_measured DESC);

CREATE TABLE health_ophthalmology.gonioscopy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID NOT NULL REFERENCES health_clinical.encounters(id),
  eye TEXT NOT NULL CHECK (eye IN ('OD','OS')),
  angle_openness TEXT NOT NULL CHECK (angle_openness IN ('OPEN','NARROW','CLOSED','OCCLUDABLE')),
  shaffer_grade INTEGER CHECK (shaffer_grade BETWEEN 0 AND 4),
  spaeth_grade TEXT,
  pigment TEXT,
  peripheral_anterior_synechiae TEXT,
  blood_in_schlemm BOOLEAN,
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_ophthalmology.fundus_exam (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID NOT NULL REFERENCES health_clinical.encounters(id),
  eye TEXT NOT NULL CHECK (eye IN ('OD','OS')),
  optic_disc TEXT,
  cup_disc_ratio TEXT,
  disc_hemorrhage BOOLEAN,
  macula TEXT,
  vessels TEXT,
  periphery TEXT,
  vitreous TEXT,
  retina TEXT,
  diabetic_retinopathy_grade TEXT,
  hypertensive_retinopathy_grade TEXT,
  amd_grade TEXT,
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID REFERENCES health_identity.users(id)
);

CREATE TABLE health_ophthalmology.ophthalmic_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID NOT NULL REFERENCES health_clinical.encounters(id),
  eye TEXT NOT NULL CHECK (eye IN ('OD','OS','OU')),
  code TEXT NOT NULL,
  display TEXT NOT NULL,
  system TEXT NOT NULL DEFAULT 'ICD-10' CHECK (system IN ('ICD-10','SNOMED-CT','CUSTOM')),
  category TEXT NOT NULL CHECK (category IN ('GLAUCOMA','CATARACT','DIABETIC_RETINOPATHY','HYPERTENSIVE_RETINOPATHY','RETINAL_VASCULAR','UVEITIS','CORNEAL_DISEASE','NEURO_OPHTHALMOLOGY','PEDS','LOW_VISION','REFRACTIVE','OTHER')),
  severity TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RESOLVED','INACTIVE','ENTERED_IN_ERROR')),
  laterality_confirmed BOOLEAN NOT NULL DEFAULT TRUE,
  onset_date DATE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID REFERENCES health_identity.users(id)
);
CREATE INDEX health_ophth_diag_patient_idx ON health_ophthalmology.ophthalmic_diagnoses (patient_id, recorded_at DESC);

CREATE TABLE health_ophthalmology.ophthalmic_imaging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID NOT NULL REFERENCES health_clinical.encounters(id),
  eye TEXT NOT NULL CHECK (eye IN ('OD','OS','OU')),
  modality TEXT NOT NULL CHECK (modality IN ('FUNDUS_PHOTOGRAPHY','OCT','OCTA','VISUAL_FIELD','CORNEAL_TOPOGRAPHY','PACHYMETRY','BIOMETRY','KERATOMETRY','SLIT_LAMP_IMAGING','EXTERNAL_PHOTOGRAPHY','FLUORESCEIN_ANGIOGRAPHY','ICG','B_SCAN','A_SCAN')),
  device_id UUID,
  image_url TEXT,
  dicom_uid TEXT,
  dicom_study_uid TEXT,
  findings TEXT,
  interpretation TEXT,
  quality TEXT CHECK (quality IN ('EXCELLENT','GOOD','FAIR','POOR','UNGRADABLE')),
  laterality_confirmed BOOLEAN NOT NULL DEFAULT TRUE,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  performed_by UUID REFERENCES health_identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_ophthalmology.optical_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID NOT NULL REFERENCES health_clinical.encounters(id),
  prescriber_id UUID NOT NULL REFERENCES health_identity.users(id),
  prescription_number TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('SINGLE_VISION','BIFOCAL','PROGRESSIVE','CONTACT_LENS','LOW_VISION')),
  od_sphere NUMERIC,
  od_cylinder NUMERIC,
  od_axis INTEGER,
  od_prism TEXT,
  od_add NUMERIC,
  od_pd NUMERIC,
  od_va TEXT,
  os_sphere NUMERIC,
  os_cylinder NUMERIC,
  os_axis INTEGER,
  os_prism TEXT,
  os_add NUMERIC,
  os_pd NUMERIC,
  os_va TEXT,
  ou_pd NUMERIC,
  notes TEXT,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISPENSED','EXPIRED','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, prescription_number)
);

CREATE TABLE health_ophthalmology.ophthalmic_surgeries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID REFERENCES health_clinical.encounters(id),
  eye TEXT NOT NULL CHECK (eye IN ('OD','OS','OU')),
  procedure_code TEXT NOT NULL,
  procedure_display TEXT NOT NULL,
  category TEXT,
  indication TEXT,
  surgeon_id UUID NOT NULL REFERENCES health_identity.users(id),
  assistant_id UUID REFERENCES health_identity.users(id),
  anesthesia_type TEXT,
  anesthesia_notes TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED','POSTPONED')),
  scheduled_at TIMESTAMPTZ,
  performed_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  iol_model TEXT,
  iol_power TEXT,
  complications TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE health_ophthalmology.ophthalmology_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES health_tenant.tenants(id),
  patient_id UUID NOT NULL REFERENCES health_patient.patients(id),
  encounter_id UUID NOT NULL REFERENCES health_clinical.encounters(id),
  chief_complaint TEXT,
  history_of_present_illness TEXT,
  examination_type TEXT NOT NULL DEFAULT 'COMPREHENSIVE' CHECK (examination_type IN ('COMPREHENSIVE','FOLLOW_UP','EMERGENCY','REFRACTION_ONLY','SCREENING')),
  is_dilated BOOLEAN NOT NULL DEFAULT FALSE,
  dilation_time TIMESTAMPTZ,
  plan TEXT,
  follow_up_date DATE,
  follow_up_instructions TEXT,
  examiner_id UUID NOT NULL REFERENCES health_identity.users(id),
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS','COMPLETED','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
