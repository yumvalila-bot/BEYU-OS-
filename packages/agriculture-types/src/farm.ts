/** Farm, field (parcel), soil and water contracts. */

export interface Farm {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  farmType: string;
  status: string;
  countryCode: string;
  region: string | null;
  district: string | null;
  village: string | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  totalAreaHa: number | null;
  tenure: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFarmInput {
  tenantId: string;
  name: string;
  farmType: string;
  countryCode: string;
  region?: string | null;
  district?: string | null;
  village?: string | null;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  totalAreaHa?: number | null;
  tenure?: string | null;
}

/** A field is a managed parcel within a farm. */
export interface Field {
  id: string;
  tenantId: string;
  farmId: string;
  code: string;
  name: string;
  fieldUse: string;
  areaHa: number;
  /** GeoJSON geometry (Polygon/MultiPolygon) — advisory, not authoritative cadastre. */
  boundary: unknown | null;
  soilTexture: string | null;
  irrigationType: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFieldInput {
  tenantId: string;
  farmId: string;
  name: string;
  fieldUse: string;
  areaHa: number;
  soilTexture?: string | null;
  irrigationType?: string | null;
  boundary?: unknown | null;
}

export interface SoilRecord {
  id: string;
  tenantId: string;
  fieldId: string;
  sampledOn: string;
  ph: number | null;
  organicMatterPct: number | null;
  nitrogenPPM: number | null;
  phosphorusPPM: number | null;
  potassiumPPM: number | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateSoilRecordInput {
  tenantId: string;
  fieldId: string;
  sampledOn: string;
  ph?: number | null;
  organicMatterPct?: number | null;
  nitrogenPPM?: number | null;
  phosphorusPPM?: number | null;
  potassiumPPM?: number | null;
  notes?: string | null;
}

export interface WeatherObservation {
  id: string;
  tenantId: string;
  farmId: string;
  observedOn: string;
  temperatureC: number | null;
  rainfallMm: number | null;
  humidityPct: number | null;
  windKph: number | null;
  notes: string | null;
  createdAt: string;
}
