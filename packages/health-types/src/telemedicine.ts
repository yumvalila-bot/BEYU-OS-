export interface TelemedicineSession {
  id: string;
  tenantId: string;
  appointmentId: string;
  patientId: string;
  practitionerId: string;
  status: 'SCHEDULED' | 'WAITING_ROOM' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  platform: 'WEBRTC' | 'ZOOM' | 'TWILIO' | 'CUSTOM';
  joinUrl?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  recordingUrl?: string | null;
  notes?: string | null;
  createdAt: string;
}
