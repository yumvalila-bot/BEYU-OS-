export interface Ambulance {
  id: string;
  tenantId: string;
  vehicleNumber: string;
  registrationPlate: string;
  type: 'BASIC' | 'ALS' | 'NEONATAL' | 'AIR';
  status: 'AVAILABLE' | 'DISPATCHED' | 'ON_SCENE' | 'TRANSPORTING' | 'AT_DESTINATION' | 'OUT_OF_SERVICE' | 'MAINTENANCE';
  baseFacilityId?: string | null;
  lastLatitude?: number | null;
  lastLongitude?: number | null;
  lastLocationAt?: string | null;
  createdAt: string;
}

export interface AmbulanceDispatch {
  id: string;
  tenantId: string;
  ambulanceId: string;
  requestId: string;
  status: 'ASSIGNED' | 'EN_ROUTE' | 'ON_SCENE' | 'TRANSPORTING' | 'COMPLETED' | 'CANCELLED';
  crew: Array<{ practitionerId: string; role: string }>;
  dispatchedAt: string;
  arrivedSceneAt?: string | null;
  arrivedDestinationAt?: string | null;
}

export interface EmergencyRequest {
  id: string;
  tenantId: string;
  patientId?: string | null;
  callerName: string;
  callerPhone: string;
  incidentType: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'PENDING' | 'ASSIGNED' | 'DISPATCHED' | 'COMPLETED' | 'CANCELLED';
  pickupLat?: number | null;
  pickupLng?: number | null;
  pickupAddress?: string | null;
  destinationFacilityId?: string | null;
  createdAt: string;
}
