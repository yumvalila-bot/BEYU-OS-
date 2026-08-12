/**
 * Canonical enums for BEYU HEALTH OS
 */

export enum TenantType {
  HospitalGroup = 'HOSPITAL_GROUP',
  Hospital = 'HOSPITAL',
  Clinic = 'CLINIC',
  MedicalCenter = 'MEDICAL_CENTER',
  EyeCenter = 'EYE_CENTER',
  Pharmacy = 'PHARMACY',
  Laboratory = 'LABORATORY',
  ImagingCenter = 'IMAGING_CENTER',
  AmbulanceService = 'AMBULANCE_SERVICE',
  TelemedicineOrg = 'TELEMEDICINE_ORG',
  HealthInsurer = 'HEALTH_INSURER',
  CorporateHealth = 'CORPORATE_HEALTH',
  NgoHealth = 'NGO_HEALTH',
  PublicHealth = 'PUBLIC_HEALTH',
  IndividualPractice = 'INDIVIDUAL_PRACTICE',
}

export enum TenantStatus {
  Provisioning = 'PROVISIONING',
  Active = 'ACTIVE',
  Suspended = 'SUSPENDED',
  Closed = 'CLOSED',
}

export enum FacilityType {
  Hospital = 'HOSPITAL',
  Clinic = 'CLINIC',
  EyeClinic = 'EYE_CLINIC',
  Pharmacy = 'PHARMACY',
  Laboratory = 'LABORATORY',
  ImagingCenter = 'IMAGING_CENTER',
  AmbulanceBase = 'AMBULANCE_BASE',
  Warehouse = 'WAREHOUSE',
  CorporateOffice = 'CORPORATE_OFFICE',
}

export enum PatientGender {
  Male = 'MALE',
  Female = 'FEMALE',
  Other = 'OTHER',
  Unknown = 'UNKNOWN',
}

export enum EncounterClass {
  Ambulatory = 'AMBULATORY',
  Emergency = 'EMERGENCY',
  Inpatient = 'INPATIENT',
  Outpatient = 'OUTPATIENT',
  Home = 'HOME',
  Virtual = 'VIRTUAL',
  Field = 'FIELD',
}

export enum EncounterStatus {
  Planned = 'PLANNED',
  Arrived = 'ARRIVED',
  Triaged = 'TRIAGED',
  InProgress = 'IN_PROGRESS',
  OnLeave = 'ON_LEAVE',
  Finished = 'FINISHED',
  Cancelled = 'CANCELLED',
  Discharged = 'DISCHARGED',
}

export enum AppointmentStatus {
  Proposed = 'PROPOSED',
  Pending = 'PENDING',
  Booked = 'BOOKED',
  Arrived = 'ARRIVED',
  Fulfilled = 'FULFILLED',
  Cancelled = 'CANCELLED',
  Noshow = 'NOSHOW',
  EnteredInError = 'ENTERED_IN_ERROR',
  CheckedIn = 'CHECKED_IN',
  Waitlist = 'WAITLIST',
}

export enum TriageCategory {
  Immediate = 'IMMEDIATE',
  VeryUrgent = 'VERY_URGENT',
  Urgent = 'URGENT',
  Standard = 'STANDARD',
  NonUrgent = 'NON_URGENT',
}

export enum AllergyCriticality {
  Low = 'LOW',
  High = 'HIGH',
  UnableToAssess = 'UNABLE_TO_ASSESS',
}

export enum MedicationRequestStatus {
  Active = 'ACTIVE',
  OnHold = 'ON_HOLD',
  Cancelled = 'CANCELLED',
  Completed = 'COMPLETED',
  EnteredInError = 'ENTERED_IN_ERROR',
  Stopped = 'STOPPED',
  Draft = 'DRAFT',
  Unknown = 'UNKNOWN',
}

export enum LabOrderStatus {
  Draft = 'DRAFT',
  Active = 'ACTIVE',
  Revoked = 'REVOKED',
  Completed = 'COMPLETED',
}

export enum LabResultStatus {
  Registered = 'REGISTERED',
  Preliminary = 'PRELIMINARY',
  Final = 'FINAL',
  Amended = 'AMENDED',
  Cancelled = 'CANCELLED',
  EnteredInError = 'ENTERED_IN_ERROR',
}

export enum ImagingModality {
  XRAY = 'XRAY',
  CT = 'CT',
  MRI = 'MRI',
  US = 'US',
  Mammography = 'MAMMOGRAPHY',
  FundusPhoto = 'FUNDUS_PHOTOGRAPHY',
  OCT = 'OCT',
  OCTA = 'OCTA',
  VisualField = 'VISUAL_FIELD',
  CornealTopography = 'CORNEAL_TOPOGRAPHY',
  Pachymetry = 'PACHYMETRY',
  Biometry = 'BIOMETRY',
  Keratometry = 'KERATOMETRY',
  SlitLamp = 'SLIT_LAMP_IMAGING',
  ExternalPhoto = 'EXTERNAL_PHOTOGRAPHY',
  Other = 'OTHER',
}

export enum InvoiceStatus {
  Draft = 'DRAFT',
  Issued = 'ISSUED',
  Paid = 'PAID',
  PartiallyPaid = 'PARTIALLY_PAID',
  Voided = 'VOIDED',
  Overdue = 'OVERDUE',
}

export enum ClaimStatus {
  Draft = 'DRAFT',
  Submitted = 'SUBMITTED',
  Adjudicating = 'ADJUDICATING',
  Approved = 'APPROVED',
  PartiallyApproved = 'PARTIALLY_APPROVED',
  Rejected = 'REJECTED',
  Paid = 'PAID',
}

export enum StockMovementType {
  Receipt = 'RECEIPT',
  Issue = 'ISSUE',
  Transfer = 'TRANSFER',
  Adjustment = 'ADJUSTMENT',
  Return = 'RETURN',
  Wastage = 'WASTAGE',
  Recall = 'RECALL',
}

export enum AmbulanceStatus {
  Available = 'AVAILABLE',
  Dispatched = 'DISPATCHED',
  OnScene = 'ON_SCENE',
  Transporting = 'TRANSPORTING',
  AtDestination = 'AT_DESTINATION',
  OutOfService = 'OUT_OF_SERVICE',
  Maintenance = 'MAINTENANCE',
}

export enum TelemedicineStatus {
  Scheduled = 'SCHEDULED',
  WaitingRoom = 'WAITING_ROOM',
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED',
  Cancelled = 'CANCELLED',
  Failed = 'FAILED',
}

export enum DocumentType {
  ClinicalNote = 'CLINICAL_NOTE',
  ConsentForm = 'CONSENT_FORM',
  Prescription = 'PRESCRIPTION',
  LabReport = 'LAB_REPORT',
  ImagingReport = 'IMAGING_REPORT',
  Referral = 'REFERRAL',
  Invoice = 'INVOICE',
  InsuranceClaim = 'INSURANCE_CLAIM',
  IdentityDocument = 'IDENTITY_DOCUMENT',
  DischargeSummary = 'DISCHARGE_SUMMARY',
  Certificate = 'CERTIFICATE',
  Other = 'OTHER',
}

export enum NoeliaOutputType {
  Information = 'INFORMATION',
  Recommendation = 'RECOMMENDATION',
  Warning = 'WARNING',
  Prediction = 'PREDICTION',
  ClinicalDecisionSupport = 'CLINICAL_DECISION_SUPPORT',
  AuthorizedAction = 'AUTHORIZED_ACTION',
}
