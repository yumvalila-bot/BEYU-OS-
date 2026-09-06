/**
 * Contract tests for @beyu/agriculture-types.
 * These pin the canonical vocabulary so renames break loudly.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AGRICULTURE_CONTRACTS_VERSION,
  AGRICULTURE_OS_AUDIENCE,
  AGRICULTURE_OS_ID,
  AGRICULTURE_OS_SECTOR_CODE,
  ActivityType,
  ActivityStatus,
  AgriRole,
  AnimalStatus,
  CertificationStatus,
  CertificationType,
  ContractStatus,
  CropCategory,
  CropCycleStatus,
  EquipmentStatus,
  EquipmentType,
  FieldUse,
  FinanceIntegrationStatus,
  HarvestStatus,
  InputCategory,
  InspectionResult,
  LandTenure,
  LivestockSpecies,
  OrderStatus,
  ProductionType,
  SoilTexture,
  StockMovementType,
  StorageLotStatus,
  WorkOrderPriority,
  WorkOrderStatus,
} from './index';

describe('federation identity', () => {
  it('registers under the canonical control-plane OS id', () => {
    assert.equal(AGRICULTURE_OS_ID, 'agriculture-os');
  });
  it('attaches to the AGRICULTURE sector', () => {
    assert.equal(AGRICULTURE_OS_SECTOR_CODE, 'AGRICULTURE');
  });
  it('uses a dedicated JWT audience', () => {
    assert.equal(AGRICULTURE_OS_AUDIENCE, 'beyu-agriculture-os');
  });
  it('carries a semver contracts version', () => {
    assert.match(AGRICULTURE_CONTRACTS_VERSION, /^\d+\.\d+\.\d+$/);
  });
});

describe('enum vocabulary is stable', () => {
  it('farm lifecycle statuses', () => {
    assert.equal(CropCycleStatus.Planted, 'PLANTED');
    assert.equal(CropCycleStatus.Harvested, 'HARVESTED');
    assert.equal(CropCycleStatus.Terminated, 'TERMINATED');
  });
  it('field uses', () => {
    assert.deepEqual(
      [FieldUse.Cropland, FieldUse.Pasture, FieldUse.Fallow],
      ['CROPLAND', 'PASTURE', 'FALLOW'],
    );
  });
  it('land tenure options', () => {
    assert.equal(LandTenure.Freehold, 'FREEHOLD');
    assert.equal(LandTenure.ContractFarming, 'CONTRACT_FARMING');
  });
  it('soil textures', () => {
    assert.equal(SoilTexture.Clay, 'CLAY');
    assert.equal(SoilTexture.Volcanic, 'VOLCANIC');
  });
  it('crop categories', () => {
    assert.equal(CropCategory.Cereal, 'CEREAL');
    assert.equal(CropCategory.Forage, 'FORAGE');
  });
  it('activity types cover the production cycle', () => {
    const values = Object.values(ActivityType);
    for (const needed of ['LAND_PREPARATION', 'PLANTING', 'IRRIGATION', 'FERTILIZATION', 'PEST_CONTROL', 'HARVESTING']) {
      assert.ok(values.includes(needed as any), `missing ${needed}`);
    }
  });
  it('activity statuses', () => {
    assert.deepEqual(
      [ActivityStatus.Scheduled, ActivityStatus.InProgress, ActivityStatus.Completed, ActivityStatus.Cancelled],
      ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    );
  });
  it('input categories include agro-chemical and seed classes', () => {
    const values = Object.values(InputCategory);
    for (const needed of ['SEED', 'FERTILIZER', 'PESTICIDE', 'ANIMAL_FEED']) {
      assert.ok(values.includes(needed as any), `missing ${needed}`);
    }
  });
  it('stock movement types', () => {
    assert.equal(StockMovementType.IssuanceToActivity, 'ISSUANCE_TO_ACTIVITY');
    assert.equal(StockMovementType.LossWriteOff, 'LOSS_WRITE_OFF');
  });
  it('harvest and storage lot statuses', () => {
    assert.equal(HarvestStatus.Completed, 'COMPLETED');
    assert.equal(StorageLotStatus.Quarantined, 'QUARANTINED');
    assert.equal(StorageLotStatus.Released, 'RELEASED');
  });
  it('livestock species', () => {
    assert.equal(LivestockSpecies.Cattle, 'CATTLE');
    assert.equal(LivestockSpecies.Poultry, 'POULTRY');
  });
  it('animal statuses', () => {
    assert.deepEqual(
      [AnimalStatus.Active, AnimalStatus.Sold, AnimalStatus.Deceased],
      ['ACTIVE', 'SOLD', 'DECEASED'],
    );
  });
  it('production types', () => {
    assert.equal(ProductionType.Milk, 'MILK');
    assert.equal(ProductionType.Honey, 'HONEY');
  });
  it('equipment types and statuses', () => {
    assert.equal(EquipmentType.Tractor, 'TRACTOR');
    assert.equal(EquipmentStatus.UnderMaintenance, 'UNDER_MAINTENANCE');
  });
  it('work order statuses and priorities', () => {
    assert.equal(WorkOrderStatus.Assigned, 'ASSIGNED');
    assert.equal(WorkOrderPriority.Urgent, 'URGENT');
  });
  it('order statuses form a lifecycle', () => {
    assert.equal(OrderStatus.Submitted, 'SUBMITTED');
    assert.equal(OrderStatus.Approved, 'APPROVED');
    assert.equal(OrderStatus.Fulfilled, 'FULFILLED');
  });
  it('contract statuses', () => {
    assert.equal(ContractStatus.Active, 'ACTIVE');
    assert.equal(ContractStatus.Disputed, 'DISPUTED');
  });
  it('certification types include export-relevant schemes', () => {
    const values = Object.values(CertificationType);
    for (const needed of ['GLOBAL_GAP', 'ORGANIC', 'PHYTOSANITARY']) {
      assert.ok(values.includes(needed as any), `missing ${needed}`);
    }
  });
  it('certification statuses', () => {
    assert.equal(CertificationStatus.Certified, 'CERTIFIED');
    assert.equal(CertificationStatus.Revoked, 'REVOKED');
  });
  it('inspection results', () => {
    assert.equal(InspectionResult.Pass, 'PASS');
    assert.equal(InspectionResult.Conditional, 'CONDITIONAL');
  });
});

describe('Finance OS boundary vocabulary', () => {
  it('finance integration states are explicit', () => {
    assert.equal(FinanceIntegrationStatus.PendingIntegration, 'PENDING_INTEGRATION');
    assert.equal(FinanceIntegrationStatus.Integrated, 'INTEGRATED');
    assert.equal(FinanceIntegrationStatus.Reconciled, 'RECONCILED');
  });
  it('there is no ledger or posting status — Finance OS owns those', () => {
    const values = Object.values(FinanceIntegrationStatus);
    assert.ok(!values.some(v => String(v).includes('POSTED') || String(v).includes('LEDGER')));
  });
});

describe('RBAC vocabulary', () => {
  it('canonical roles', () => {
    assert.equal(AgriRole.SuperAdmin, 'SUPER_ADMIN');
    assert.equal(AgriRole.FarmManager, 'FARM_MANAGER');
    assert.equal(AgriRole.Agronomist, 'AGRONOMIST');
    assert.equal(AgriRole.LivestockManager, 'LIVESTOCK_MANAGER');
    assert.equal(AgriRole.InventoryManager, 'INVENTORY_MANAGER');
    assert.equal(AgriRole.ProcurementOfficer, 'PROCUREMENT_OFFICER');
    assert.equal(AgriRole.EquipmentManager, 'EQUIPMENT_MANAGER');
    assert.equal(AgriRole.ComplianceOfficer, 'COMPLIANCE_OFFICER');
    assert.equal(AgriRole.FarmWorker, 'FARM_WORKER');
    assert.equal(AgriRole.Auditor, 'AUDITOR');
  });
  it('role codes are unique', () => {
    const codes = Object.values(AgriRole);
    assert.equal(new Set(codes).size, codes.length);
  });
});
