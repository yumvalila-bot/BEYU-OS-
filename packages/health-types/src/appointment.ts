import { AppointmentStatus, TriageCategory } from './enums';

export interface Appointment {
  id: string;
  tenantId: string;
  facilityId: string;
  departmentId?: string | null;
  patientId: string;
  practitionerId?: string | null;
  serviceType?: string | null;
  status: AppointmentStatus;
  priority: number;
  start: string;
  end: string;
  reason?: string | null;
  description?: string | null;
  isTelemedicine: boolean;
  isWalkIn: boolean;
  isRecurring: boolean;
  recurrenceRule?: string | null;
  parentAppointmentId?: string | null;
  queueNumber?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderSchedule {
  id: string;
  tenantId: string;
  practitionerId: string;
  facilityId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  isAvailable: boolean;
}

export interface Triage {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  facilityId: string;
  category: TriageCategory;
  chiefComplaint: string;
  vitalSigns?: Record<string, unknown> | null;
  acuityScore?: number | null;
  assessedBy: string;
  assessedAt: string;
  notes?: string | null;
}

export interface QueueEntry {
  id: string;
  tenantId: string;
  facilityId: string;
  departmentId?: string | null;
  patientId: string;
  appointmentId?: string | null;
  encounterId?: string | null;
  queueType: string;
  status: 'WAITING' | 'CALLED' | 'IN_SERVICE' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';
  priority: number;
  number: number;
  joinedAt: string;
}
