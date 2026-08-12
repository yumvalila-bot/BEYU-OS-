-- Migration 0012: Compliance to ISQua, ISO, NABH and JCI
-- International accreditation framework per user request
-- Extends Tanzania packs (MOH, MTUHA, NHIF, TMDA, TRA, Data Protection) + ISO-27001, HIPAA

-- ISQua - International Society for Quality in Health Care
INSERT INTO health_compliance.compliance_packs (code, name, description, country_code, authority, version, config)
VALUES
('ISQUA-EEA-8TH', 'ISQua External Evaluation Association - Principles 8th Edition', 'ISQua EEA Principles for Healthcare External Evaluation Programmes - governance, standards development, surveyor management, evaluation process', NULL, 'ISQua', '8.0.0', '{"type":"international-accreditation-principles","scope":"external-evaluation","applies_to":["accreditation-bodies","healthcare-providers"],"principles":["Governance","Standards Development","Surveyor Workforce","Evaluation Process","Improvement"]}'::jsonb),
('ISQUA-GUIDELINES-ACCRED', 'ISQua Guidelines for Accreditation', 'ISQua International Accreditation Programme Guidelines - organizational and surveyor competencies, decision making', NULL, 'ISQua', '1.0.0', '{"type":"guidelines","scope":"accreditation-program"}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- ISO Family - Healthcare relevant
INSERT INTO health_compliance.compliance_packs (code, name, description, country_code, authority, version, config)
VALUES
('ISO-9001-2015', 'ISO 9001:2015 - Quality Management Systems', 'International standard for quality management systems - customer focus, leadership, engagement, process approach, improvement, evidence-based decisions, relationship management. Applicable to healthcare organizations for QMS certification.', NULL, 'ISO', '2015', '{"type":"qms","scope":"organization-wide","clauses":["4 Context","5 Leadership","6 Planning","7 Support","8 Operation","9 Performance","10 Improvement"],"certifiable":true}'::jsonb),
('ISO-15189-2022', 'ISO 15189:2022 - Medical Laboratories - Quality and Competence', 'Requirements for quality and competence in medical laboratories - management and technical requirements for labs. Essential for laboratory accreditation.', NULL, 'ISO', '2022', '{"type":"medical-lab","scope":"laboratory","applies_to":["LAB"],"clauses":["4 General","5 Structural","6 Resource","7 Process","8 Management System"],"certifiable":true}'::jsonb),
('ISO-15190-2020', 'ISO 15190:2020 - Medical Laboratories - Safety', 'Safety requirements for medical laboratories handling biological materials', NULL, 'ISO', '2020', '{"type":"lab-safety","scope":"laboratory"}'::jsonb),
('ISO-7101-2023', 'ISO 7101:2023 - Healthcare Organization Management', 'First international consensus standard for healthcare organization management - leadership, quality, safety, resource management', NULL, 'ISO', '2023', '{"type":"healthcare-management","scope":"organization-wide","new":true,"focus":["leadership","quality","safety","resource","person-centered"]}'::jsonb),
('ISO-27001-2022', 'ISO/IEC 27001:2022 - Information Security Management', 'ISMS requirements - Confidentiality, Integrity, Availability for health data. Update from existing pack with 2022 controls.', NULL, 'ISO', '2022', '{"type":"isms","scope":"information-security","controls":93,"domains":["Organizational","People","Physical","Technological"],"certifiable":true}'::jsonb),
('ISO-27799-2016', 'ISO 27799:2016 - Health Informatics - Information Security Management in Health', 'Health informatics - Application of ISO 27002 for health information security - specific to health data', NULL, 'ISO', '2016', '{"type":"health-informatics-security","scope":"health-information","parent":"ISO-27001"}'::jsonb),
('ISO-45001-2018', 'ISO 45001:2018 - Occupational Health and Safety', 'OH&S management for healthcare workers - hazard identification, worker participation, safe working environment', NULL, 'ISO', '2018', '{"type":"ohs","scope":"workforce"}'::jsonb),
('ISO-14001-2015', 'ISO 14001:2015 - Environmental Management', 'Environmental management for healthcare - waste management, energy, water, sustainable healthcare', NULL, 'ISO', '2015', '{"type":"environmental","scope":"facility-management"}'::jsonb),
('ISO-15224-2016', 'ISO 15224:2016 - Quality Management in Healthcare - EN 15224', 'European standard for quality management in healthcare - clinical processes, risk management', 'EU', 'CEN', '2016', '{"type":"healthcare-quality-eu","scope":"clinical","region":"EU"}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- NABH - National Accreditation Board for Hospitals & Healthcare Providers (India) - 5th Edition 2020+
INSERT INTO health_compliance.compliance_packs (code, name, description, country_code, authority, version, config)
VALUES
('NABH-HOSPITAL-5TH', 'NABH Hospital Accreditation 5th Edition', 'NABH Standards for Hospitals - 10 chapters, 100 standards, 651 objective elements. India gold standard for hospital accreditation.', 'IN', 'NABH', '5.0', '{"type":"hospital-accreditation","scope":"hospital","chapters":["AAC","COP","MOM","PRE","HIC","CQI","ROM","FMS","HRM","IMS"],"standards":100,"elements":651,"country":"IN"}'::jsonb),
('NABH-EYE-CARE-3RD', 'NABH Eye Care Organization 3rd Edition', 'NABH Standards for Eye Care Organizations - specialized for eye hospitals, clinics, ophthalmology centers. First-class support for BEYU Eye & General Hospital.', 'IN', 'NABH', '3.0', '{"type":"eye-care-accreditation","scope":"eye-center","applies_to":["EYE_CENTER","EYE_CLINIC"],"chapters":["AAC","COP-OPHTH","MOM","PRE","HIC","CQI","ROM","FMS","HRM","IMS"],"specialized":true,"differentiator":"ophthalmology-first-class"}'::jsonb),
('NABH-CLINIC-2ND', 'NABH Clinic Accreditation 2nd Edition', 'NABH Standards for Clinics - for small healthcare organizations, medical centers, individual practices', 'IN', 'NABH', '2.0', '{"type":"clinic-accreditation","scope":"clinic","applies_to":["CLINIC","MEDICAL_CENTER"]}'::jsonb),
('NABH-LAB-3RD', 'NABH Laboratory Accreditation - M(EL)T Labs', 'NABH Standards for Medical Laboratory - extension for lab accreditation in hospital settings', 'IN', 'NABH', '3.0', '{"type":"lab-accreditation","scope":"laboratory","parent":"NABH-HOSPITAL-5TH"}'::jsonb),
('NABH-EMERGENCY-1ST', 'NABH Emergency Department Certification', 'NABH Certification Standards for Emergency Department - triage, resuscitation, emergency care workflows', 'IN', 'NABH', '1.0', '{"type":"emergency-certification","scope":"emergency","focus":["triage","resuscitation","emergency-care"]}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- JCI - Joint Commission International - 8th Edition 2024
INSERT INTO health_compliance.compliance_packs (code, name, description, country_code, authority, version, config)
VALUES
('JCI-HOSPITAL-8TH', 'JCI Accreditation Standards for Hospitals 8th Edition 2024', 'JCI 8th Edition - Gold standard international hospital accreditation. 16 chapters, IPSG, patient-centered, updated 2024 with climate and health equity focus. Recognized in 70+ countries.', NULL, 'JCI', '8.0', '{"type":"hospital-accreditation","scope":"hospital","edition":"8th","year":2024,"chapters":["IPSG","ACC","PFR","AOP","COP","ASC","MMU","PFE","QPS","PCI","GLD","FMS","SQE","MOI","Global Health","Climate"],"ipsg":6,"recognized_countries":70}'::jsonb),
('JCI-AMBULATORY-4TH', 'JCI Ambulatory Care 4th Edition', 'JCI Standards for Ambulatory Care Organizations - clinics, medical centers, eye clinics', NULL, 'JCI', '4.0', '{"type":"ambulatory-accreditation","scope":"clinic","applies_to":["CLINIC","MEDICAL_CENTER","EYE_CLINIC"]}'::jsonb),
('JCI-CLINICAL-LAB-4TH', 'JCI Clinical Laboratory Program 4th Edition', 'JCI Standards for Clinical Laboratories - quality and safety in lab testing', NULL, 'JCI', '4.0', '{"type":"lab-accreditation","scope":"laboratory"}'::jsonb),
('JCI-PRIMARY-CARE-1ST', 'JCI Primary Care Standards 1st Edition', 'JCI Primary Care - for primary care centers, community health', NULL, 'JCI', '1.0', '{"type":"primary-care","scope":"primary-care"}'::jsonb),
('JCI-IPSG', 'JCI International Patient Safety Goals (IPSG) 8th Edition', '6 International Patient Safety Goals - Identify patients correctly, Improve communication, Improve medication safety, Ensure safe surgery, Reduce HAI, Reduce patient harm from falls', NULL, 'JCI', '8.0', '{"type":"patient-safety-goals","scope":"safety","goals":6,"mandatory":true,"core":true}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- Additional international accreditation bodies mapped to ISQua
INSERT INTO health_compliance.compliance_packs (code, name, description, country_code, authority, version, config)
VALUES
('ACHC-HOSPITAL-4TH', 'ACHC Hospital Accreditation (US)', 'Accreditation Commission for Health Care - US hospital standards, ISQua accredited', 'US', 'ACHC', '4.0', '{"type":"hospital-accreditation","country":"US","isqua_accredited":true}'::jsonb),
('COHSASA-HOSPITAL-7TH', 'COHSASA Hospital Accreditation 7th Edition (Africa)', 'Council for Health Service Accreditation of Southern Africa - Africa-focused hospital accreditation, ISQua accredited, relevant for Tanzania expansion', 'ZA', 'COHSASA', '7.0', '{"type":"hospital-accreditation","region":"Africa","isqua_accredited":true,"relevant_for_Tanzania":true}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- Now seed requirements for each major pack

-- ISQua Requirements
INSERT INTO health_compliance.compliance_requirements (pack_id, reference, title, description, category, mandatory)
SELECT p.id, 'ISQUA-001', 'Governance and Legal Status', 'The external evaluation organisation shall be an independent legal entity with clear governance structure', 'Governance', true FROM health_compliance.compliance_packs p WHERE p.code='ISQUA-EEA-8TH'
ON CONFLICT DO NOTHING;
INSERT INTO health_compliance.compliance_requirements (pack_id, reference, title, description, category, mandatory)
SELECT p.id, 'ISQUA-002', 'Standards Development Process', 'Standards shall be developed through consensus, evidence-based, stakeholder consultation', 'Standards Development', true FROM health_compliance.compliance_packs p WHERE p.code='ISQUA-EEA-8TH'
ON CONFLICT DO NOTHING;
INSERT INTO health_compliance.compliance_requirements (pack_id, reference, title, description, category, mandatory)
SELECT p.id, 'ISQUA-003', 'Surveyor Competence and Training', 'Surveyors shall be competent, trained, evaluated, and continuously developed', 'Workforce', true FROM health_compliance.compliance_packs p WHERE p.code='ISQUA-EEA-8TH'
ON CONFLICT DO NOTHING;

-- ISO 9001:2015 Requirements
INSERT INTO health_compliance.compliance_requirements (pack_id, reference, title, description, category, mandatory)
SELECT p.id, ref, title, descr, cat, true FROM health_compliance.compliance_packs p CROSS JOIN (VALUES
('ISO9001-4.1','Understanding Organization and Context','Determine external/internal issues relevant to QMS','Context'),
('ISO9001-5.1','Leadership Commitment','Top management leadership and commitment to QMS','Leadership'),
('ISO9001-6.1','Risk and Opportunities','Determine risks and opportunities for QMS','Planning'),
('ISO9001-7.2','Competence','Ensure persons competent, training records','Support'),
('ISO9001-8.1','Operational Planning and Control','Plan, implement, control processes for service provision','Operation'),
('ISO9001-9.1','Monitoring and Measurement','Monitor, measure, analyze, evaluate QMS performance','Performance'),
('ISO9001-10.2','Nonconformity and Corrective Action','React to nonconformity, corrective action, retain documented info','Improvement')
) AS t(ref, title, descr, cat) WHERE p.code='ISO-9001-2015'
ON CONFLICT DO NOTHING;

-- ISO 15189:2022 Requirements for Medical Labs
INSERT INTO health_compliance.compliance_requirements (pack_id, reference, title, description, category, mandatory)
SELECT p.id, ref, title, descr, cat, true FROM health_compliance.compliance_packs p CROSS JOIN (VALUES
('ISO15189-5.1','General Requirements - Impartiality','Lab shall be impartial, identify risks to impartiality','General'),
('ISO15189-6.2','Personnel Competence','Personnel performing lab activities competent, authorized','Resource'),
('ISO15189-6.3','Facilities and Environmental Conditions','Facilities suitable, environmental conditions monitored','Resource'),
('ISO15189-6.4','Equipment Management','Equipment suitable for intended purpose, calibrated, maintained','Resource'),
('ISO15189-7.2','Pre-examination Processes','Patient identification, sample collection, handling, transport','Process'),
('ISO15189-7.3','Examination Processes','Examination procedures validated, reference intervals, QC','Process'),
('ISO15189-7.4','Post-examination Processes','Result review, reporting, critical values, retention','Process'),
('ISO15189-8.7','Nonconformities and Corrective Actions','Handle nonconforming work, corrective actions','Management System')
) AS t(ref, title, descr, cat) WHERE p.code='ISO-15189-2022'
ON CONFLICT DO NOTHING;

-- NABH Hospital 5th Edition - 10 Chapters
INSERT INTO health_compliance.compliance_requirements (pack_id, reference, title, description, category, mandatory)
SELECT p.id, ref, title, descr, cat, true FROM health_compliance.compliance_packs p CROSS JOIN (VALUES
('NABH-AAC-001','Registration and Admission Process','Defined process for registration, admission, transfer, referral, discharge','Access Assessment Continuity'),
('NABH-AAC-002','Initial Assessment','Initial assessment of all patients standardized, time-bound','Access Assessment Continuity'),
('NABH-COP-001','Care of Vulnerable Patients','Care of vulnerable patients - elderly, children, disabled, etc','Care of Patients'),
('NABH-COP-002','Patient Assessment and Reassessment','Continuous assessment and reassessment, care plan, multi-disciplinary','Care of Patients'),
('NABH-COP-003','Ophthalmology Care - Eye Examination Protocol','Standardized eye examination: VA, refraction, slit-lamp, IOP, fundus, documentation - differentiator for BEYU Eye Hospital','Care of Patients - Ophthalmology'),
('NABH-MOM-001','Medication Management - Prescription and Dispensing','Medication prescription, dispensing, administration, reconciliation, safety checks','Management of Medication'),
('NABH-MOM-002','Medication Safety - Allergy and Interaction Checks','Allergy documented, interaction, duplicate, dose warnings - pharmacy module must enforce','Management of Medication'),
('NABH-PRE-001','Patient Rights and Education','Patient rights informed, consent, education, grievance redressal','Patient Rights Education'),
('NABH-HIC-001','Infection Control Program','Infection control program, HIC committee, surveillance, hand hygiene, BMW','Hospital Infection Control'),
('NABH-HIC-002','Ophthalmology Infection Control - OT and Equipment','Eye OT sterilization, equipment decontamination, intravitreal injection protocol','Hospital Infection Control - Ophthalmology'),
('NABH-CQI-001','Quality Improvement Program','Quality indicators, clinical audits, data collection, analysis, improvement','Continuous Quality Improvement'),
('NABH-ROM-001','Management Leadership and Governance','Management commitment, organizational structure, vision, mission, strategic planning','Responsibilities of Management'),
('NABH-FMS-001','Facility Management and Safety','Facility safety, security, fire safety, disaster management, equipment management','Facility Management Safety'),
('NABH-FMS-002','Medical Equipment Management','Equipment inventory, calibration, maintenance, breakdown, condemnation','Facility Management Safety'),
('NABH-HRM-001','Staff Qualification and Competence','Staff verification, credentialing, privileging, training, performance appraisal','Human Resource Management'),
('NABH-HRM-002','Ophthalmology Competence - Ophthalmologist and Optometrist','Ophthalmologist qualification, optometrist competence, OT training, CME','Human Resource Management - Ophthalmology'),
('NABH-IMS-001','Information Management System','Medical records, data collection, analysis, retention, privacy, information security','Information Management System'),
('NABH-IMS-002','Electronic Health Record - One Patient One Record','Unified longitudinal patient record, timeline, interoperability, audit trail - BEYU Health OS core differentiator','Information Management System')
) AS t(ref, title, descr, cat) WHERE p.code='NABH-HOSPITAL-5TH'
ON CONFLICT DO NOTHING;

-- NABH Eye Care
INSERT INTO health_compliance.compliance_requirements (pack_id, reference, title, description, category, mandatory)
SELECT p.id, ref, title, descr, cat, true FROM health_compliance.compliance_packs p CROSS JOIN (VALUES
('NABH-EYE-COP-001','Comprehensive Eye Examination','VA unaided/aided/pinhole/near/BCVA, refraction, IOP Goldmann/NCT, slit-lamp, gonioscopy, fundus, documentation','Care of Patients - Ophthalmology'),
('NABH-EYE-COP-002','OCT and Imaging - Quality and Reporting','OCT, OCTA, fundus photo, visual field, corneal topography quality, interpretation, PACS','Care of Patients - Ophthalmology Imaging'),
('NABH-EYE-COP-003','Cataract Surgery Protocol','Pre-op assessment, biometry, IOL calculation, OT checklist, post-op care, outcomes','Care of Patients - Cataract'),
('NABH-EYE-COP-004','Glaucoma Management Protocol','Glaucoma screening, IOP measurement, optic disc evaluation, visual field, treatment, follow-up','Care of Patients - Glaucoma'),
('NABH-EYE-COP-005','Diabetic Retinopathy Screening','DR screening, fundus photo, referral, laser, anti-VEGF protocol','Care of Patients - DR')
) AS t(ref, title, descr, cat) WHERE p.code='NABH-EYE-CARE-3RD'
ON CONFLICT DO NOTHING;

-- JCI Hospital 8th Edition
INSERT INTO health_compliance.compliance_requirements (pack_id, reference, title, description, category, mandatory)
SELECT p.id, ref, title, descr, cat, true FROM health_compliance.compliance_packs p CROSS JOIN (VALUES
('JCI-IPSG-01','Identify Patients Correctly','Two identifiers, correct patient identification before care, procedures, medication','International Patient Safety Goals'),
('JCI-IPSG-02','Improve Effective Communication','Effective communication, handover, test result reporting, documentation','International Patient Safety Goals'),
('JCI-IPSG-03','Improve Medication Safety','High-alert medications, look-alike sound-alike, medication reconciliation, safety checks - BEYU pharmacy must enforce','International Patient Safety Goals'),
('JCI-IPSG-04','Ensure Safe Surgery','Universal protocol, time-out, site marking, surgical safety checklist','International Patient Safety Goals'),
('JCI-IPSG-05','Reduce Risk of Health Care-Associated Infections','Hand hygiene, infection prevention, sterilization, infection surveillance','International Patient Safety Goals'),
('JCI-IPSG-06','Reduce Risk of Patient Harm from Falls','Fall risk screening, assessment, interventions, monitoring','International Patient Safety Goals'),
('JCI-ACC-01','Access to Care and Continuity','Screening, admission, transfer, discharge, referral, follow-up','Access to Care Continuity'),
('JCI-PFR-01','Patient and Family Rights','Informed consent, privacy, confidentiality, rights, ethics','Patient Family Rights'),
('JCI-AOP-01','Assessment of Patients','Initial and ongoing assessment, pain, emergency, lab, radiology, ophthalmology assessment','Assessment of Patients'),
('JCI-COP-01','Care of Patients - General and Ophthalmology','Care planning, high-risk patients, resuscitation, food, pain, end-of-life, ophthalmology care plans','Care of Patients'),
('JCI-ASC-01','Anesthesia and Surgical Care','Anesthesia assessment, monitoring, surgical care, sedation','Anesthesia Surgical Care'),
('JCI-MMU-01','Medication Management and Use','Medication selection, storage, ordering, preparation, dispensing, administration, monitoring, reconciliation','Medication Management Use'),
('JCI-QPS-01','Quality Improvement and Patient Safety','Quality program, data collection, indicator measurement, analysis, improvement, patient safety program','Quality Patient Safety'),
('JCI-PCI-01','Prevention and Control of Infections','Infection prevention, hand hygiene, PPE, sterilization, device-associated infections','Prevention Control Infections'),
('JCI-GLD-01','Governance Leadership and Direction','Governance structure, leadership accountability, strategic planning, ethics','Governance Leadership Direction'),
('JCI-FMS-01','Facility Management and Safety','Facility safety, security, hazardous materials, disaster, fire, medical equipment, utilities','Facility Management Safety'),
('JCI-SQE-01','Staff Qualifications and Education','Credentialing, privileging, staff education, competence assessment','Staff Qualifications Education'),
('JCI-MOI-01','Management of Information','Health records, data management, information security, privacy - BEYU audit trail and RLS','Management of Information'),
('JCI-GH-01','Global Health Impact - Climate and Health Equity','Climate change impact on health, health equity, sustainability - NEW in 8th edition 2024','Global Health')
) AS t(ref, title, descr, cat) WHERE p.code='JCI-HOSPITAL-8TH'
ON CONFLICT DO NOTHING;

-- JCI IPSG (core)
INSERT INTO health_compliance.compliance_requirements (pack_id, reference, title, description, category, mandatory)
SELECT p.id, ref, title, descr, cat, true FROM health_compliance.compliance_packs p CROSS JOIN (VALUES
('IPSG-Goal-1','Identify Patients Correctly','Use at least two identifiers, correct patient ID before medication, procedure, sample - MRN auto BEYU-YYYY-###### plus secondary','IPSG'),
('IPSG-Goal-2','Improve Effective Communication','Handover SBAR, critical test result reporting, documentation','IPSG'),
('IPSG-Goal-3','Improve Safety of High-Alert Medications','High-alert meds storage, double-check, allergy/interaction checks - pharmacy safetyCheck','IPSG'),
('IPSG-Goal-4','Ensure Correct-Site Correct-Procedure Correct-Patient Surgery','Time-out, surgical site marking, universal protocol - ophthalmology surgery OD/OS/OU laterality confirmed','IPSG'),
('IPSG-Goal-5','Reduce Risk of Healthcare-Associated Infections','Hand hygiene, infection control, sterilization, outbreak management','IPSG'),
('IPSG-Goal-6','Reduce Risk of Patient Harm from Falls','Fall risk assessment Morse, interventions, monitoring','IPSG')
) AS t(ref, title, descr, cat) WHERE p.code='JCI-IPSG'
ON CONFLICT DO NOTHING;

-- ISO 7101:2023 Healthcare Organization Management
INSERT INTO health_compliance.compliance_requirements (pack_id, reference, title, description, category, mandatory)
SELECT p.id, ref, title, descr, cat, true FROM health_compliance.compliance_packs p CROSS JOIN (VALUES
('ISO7101-5.1','Leadership Commitment to Quality and Safety','Top management demonstrates leadership commitment to quality and safety culture','Leadership'),
('ISO7101-6.2','Person-Centered Care','Person-centered care, shared decision making, respect, dignity','Care'),
('ISO7101-7.1','Staff Well-being and Competence','Staff well-being, competence, workload, burnout prevention','Resource'),
('ISO7101-8.3','Risk Management in Clinical Care','Clinical risk identification, assessment, mitigation, monitoring','Operation')
) AS t(ref, title, descr, cat) WHERE p.code='ISO-7101-2023'
ON CONFLICT DO NOTHING;

-- Update view for compliance dashboard to include new packs
DROP VIEW IF EXISTS health_reporting.automatic_reporting_status;
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
