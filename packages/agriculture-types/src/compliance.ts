/** Compliance, certification, inspection and traceability contracts. */

export interface Certification {
  id: string;
  tenantId: string;
  farmId: string | null;
  certificationType: string;
  certificateNumber: string;
  status: string;
  issuedOn: string | null;
  expiresOn: string | null;
  issuedBy: string | null;
  scopeNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Inspection {
  id: string;
  tenantId: string;
  farmId: string | null;
  certificationId: string | null;
  inspectedOn: string;
  inspectedBy: string | null;
  result: string;
  findings: string | null;
  followUpRequired: boolean;
  createdAt: string;
}

/** Traceability link — chains a lot backward to its harvest and field. */
export interface TraceabilityLink {
  id: string;
  tenantId: string;
  storageLotId: string;
  linkType: string;
  relatedId: string;
  relatedType: string;
  createdAt: string;
}

export interface TraceabilityReport {
  storageLot: { id: string; lotCode: string; cropId: string | null; quantityKg: number; status: string };
  harvest: { id: string; harvestedOn: string; quantityKg: number; qualityGrade: string | null; cropCycleId: string } | null;
  cropCycle: { id: string; seasonCode: string; status: string; cropId: string; fieldId: string } | null;
  field: { id: string; code: string; name: string; farmId: string; areaHa: number } | null;
  farm: { id: string; code: string; name: string; countryCode: string } | null;
  activities: Array<{ id: string; activityType: string; performedOn: string | null; notes: string | null }>;
  salesOrders: Array<{ id: string; soNumber: string; buyerId: string; status: string; orderDate: string }>;
}
