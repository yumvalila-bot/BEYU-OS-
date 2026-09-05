/**
 * First-class ophthalmology domain — BEYU HEALTH OS differentiator.
 * Covers all required fields from master prompt §17.
 */

export interface OphthalmologyHistory {
  id: string;
  patientId: string;
  tenantId: string;
  encounterId?: string | null;
  ocularHistory?: string | null;
  systemicHistory?: string | null;
  familyHistory?: string | null;
  medicationHistory?: string | null;
  previousSurgeries?: string | null;
  traumaHistory?: string | null;
  allergies?: string | null;
  socialHistory?: string | null;
  recordedAt: string;
  recordedBy: string;
}

export interface VisualAcuity {
  id: string;
  patientId: string;
  encounterId: string;
  tenantId: string;
  eye: 'OD' | 'OS' | 'OU';
  unaidedDistance?: string | null;
  aidedDistance?: string | null;
  pinhole?: string | null;
  nearVision?: string | null;
  bcva?: string | null;
  colorVision?: string | null;
  contrastSensitivity?: string | null;
  recordedAt: string;
}

export interface Refraction {
  id: string;
  patientId: string;
  encounterId: string;
  tenantId: string;
  eye: 'OD' | 'OS';
  sphere?: number | null;
  cylinder?: number | null;
  axis?: number | null;
  prism?: string | null;
  add?: number | null;
  bcva?: string | null;
  subjectiveSphere?: number | null;
  subjectiveCylinder?: number | null;
  subjectiveAxis?: number | null;
  objectiveSphere?: number | null;
  objectiveCylinder?: number | null;
  objectiveAxis?: number | null;
  type: 'AUTO' | 'MANUAL' | 'CYCLOPLEGIC' | 'SUBJECTIVE' | 'OBJECTIVE';
  recordedAt: string;
  recordedBy: string;
}

export interface ExternalExam {
  id: string;
  encounterId: string;
  patientId: string;
  tenantId: string;
  eye: 'OD' | 'OS' | 'OU';
  lids?: string | null;
  lacrimal?: string | null;
  orbit?: string | null;
  face?: string | null;
  notes?: string | null;
  recordedAt: string;
}

export interface PupilExam {
  id: string;
  encounterId: string;
  patientId: string;
  tenantId: string;
  eye: 'OD' | 'OS';
  sizeMm?: number | null;
  shape?: string | null;
  reactionDirect?: 'NORMAL' | 'SLUGGISH' | 'NON_REACTIVE' | null;
  reactionConsensual?: 'NORMAL' | 'SLUGGISH' | 'NON_REACTIVE' | null;
  apd?: boolean | null;
  recordedAt: string;
}

export interface OcularMotility {
  id: string;
  encounterId: string;
  patientId: string;
  tenantId: string;
  ductions?: Record<string, unknown> | null;
  versions?: Record<string, unknown> | null;
  strabismus?: string | null;
  nystagmus?: string | null;
  recordedAt: string;
}

export interface SlitLampExam {
  id: string;
  encounterId: string;
  patientId: string;
  tenantId: string;
  eye: 'OD' | 'OS';
  lids?: string | null;
  conjunctiva?: string | null;
  cornea?: string | null;
  anteriorChamber?: string | null;
  iris?: string | null;
  lens?: string | null;
  vitreousAnterior?: string | null;
  notes?: string | null;
  recordedAt: string;
}

export interface IntraocularPressure {
  id: string;
  encounterId: string;
  patientId: string;
  tenantId: string;
  eye: 'OD' | 'OS' | 'OU';
  method: 'GOLDMANN' | 'NON_CONTACT' | 'TONOPEN' | 'ICARE' | 'OTHER';
  valueMmhg: number;
  timeMeasured: string;
  targetMmhg?: number | null;
  recordedBy: string;
}

export interface Gonioscopy {
  id: string;
  encounterId: string;
  patientId: string;
  tenantId: string;
  eye: 'OD' | 'OS';
  angleOpenness: 'OPEN' | 'NARROW' | 'CLOSED' | 'OCCLUDABLE';
  shafferGrade?: number | null;
  spaethGrade?: string | null;
  pigment?: string | null;
  notes?: string | null;
  recordedAt: string;
}

export interface FundusExam {
  id: string;
  encounterId: string;
  patientId: string;
  tenantId: string;
  eye: 'OD' | 'OS';
  opticDisc?: string | null;
  cupDiscRatio?: string | null;
  macula?: string | null;
  vessels?: string | null;
  periphery?: string | null;
  vitreous?: string | null;
  retina?: string | null;
  recordedAt: string;
}

export interface OphthalmicDiagnosis {
  id: string;
  patientId: string;
  encounterId: string;
  tenantId: string;
  eye: 'OD' | 'OS' | 'OU';
  code: string;
  display: string;
  system: 'ICD-10' | 'SNOMED-CT';
  category: 'GLAUCOMA' | 'CATARACT' | 'DIABETIC_RETINOPATHY' | 'HYPERTENSIVE_RETINOPATHY' | 'RETINAL_VASCULAR' | 'UVEITIS' | 'CORNEAL_DISEASE' | 'NEURO_OPHTHALMOLOGY' | 'PEDS' | 'LOW_VISION' | 'OTHER';
  severity?: string | null;
  status: 'ACTIVE' | 'RESOLVED' | 'INACTIVE';
  lateralityConfirmed: boolean;
  recordedAt: string;
}

export interface OphthalmicImaging {
  id: string;
  patientId: string;
  encounterId: string;
  tenantId: string;
  eye: 'OD' | 'OS' | 'OU';
  modality: 'FUNDUS_PHOTOGRAPHY' | 'OCT' | 'OCTA' | 'VISUAL_FIELD' | 'CORNEAL_TOPOGRAPHY' | 'PACHYMETRY' | 'BIOMETRY' | 'KERATOMETRY' | 'SLIT_LAMP_IMAGING' | 'EXTERNAL_PHOTOGRAPHY';
  deviceId?: string | null;
  imageUrl?: string | null;
  dicomUid?: string | null;
  findings?: string | null;
  interpretation?: string | null;
  performedAt: string;
  performedBy?: string | null;
}

export interface OpticalPrescription {
  id: string;
  patientId: string;
  encounterId: string;
  tenantId: string;
  prescriberId: string;
  odSphere?: number | null;
  odCylinder?: number | null;
  odAxis?: number | null;
  odPrism?: string | null;
  odAdd?: number | null;
  odPd?: number | null;
  osSphere?: number | null;
  osCylinder?: number | null;
  osAxis?: number | null;
  osPrism?: string | null;
  osAdd?: number | null;
  osPd?: number | null;
  type: 'SINGLE_VISION' | 'BIFOCAL' | 'PROGRESSIVE' | 'CONTACT_LENS' | 'LOW_VISION';
  notes?: string | null;
  expiryDate?: string | null;
  createdAt: string;
}

export interface OphthalmicSurgery {
  id: string;
  patientId: string;
  encounterId?: string | null;
  tenantId: string;
  eye: 'OD' | 'OS' | 'OU';
  procedureCode: string;
  procedureDisplay: string;
  indication?: string | null;
  surgeonId: string;
  assistantId?: string | null;
  anesthesiaType?: string | null;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'POSTPONED';
  scheduledAt?: string | null;
  performedAt?: string | null;
  complications?: string | null;
  notes?: string | null;
}

export interface OphthalmologyExam {
  id: string;
  patientId: string;
  encounterId: string;
  tenantId: string;
  chiefComplaint?: string | null;
  history?: OphthalmologyHistory | null;
  visualAcuities: VisualAcuity[];
  refractions: Refraction[];
  externalExams: ExternalExam[];
  pupilExams: PupilExam[];
  motility?: OcularMotility | null;
  slitLamp: SlitLampExam[];
  iop: IntraocularPressure[];
  gonioscopy?: Gonioscopy[];
  fundus: FundusExam[];
  diagnoses: OphthalmicDiagnosis[];
  imaging: OphthalmicImaging[];
  prescription?: OpticalPrescription | null;
  plan?: string | null;
  followUpDate?: string | null;
  examinerId: string;
  createdAt: string;
  updatedAt: string;
}
