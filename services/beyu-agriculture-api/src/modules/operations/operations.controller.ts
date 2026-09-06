import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { OperationsRepository } from './operations.repository';
import { getSecurityContext } from '../../core/request-context';

const EQUIPMENT_TYPES = ['TRACTOR', 'HARVESTER', 'PLANTER', 'SPRAYER', 'IRRIGATION_PUMP', 'TRAILER', 'PROCESSING_MACHINE', 'VEHICLE', 'GENERATOR', 'HAND_TOOL', 'OTHER'];
const WO_STATUSES = ['DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

class CreateEquipmentDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() farmId?: string;
  @IsString() code!: string;
  @IsString() name!: string;
  @IsIn(EQUIPMENT_TYPES) equipmentType!: string;
  @IsOptional() @IsDateString() purchaseDate?: string;
  @IsOptional() @IsNumber() @Min(0) purchaseCost?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() notes?: string;
}

class MaintenanceDto {
  @IsString() equipmentId!: string;
  @IsIn(['SERVICE', 'REPAIR', 'INSPECTION', 'PARTS_REPLACEMENT', 'CALIBRATION']) maintenanceType!: string;
  @IsDateString() performedOn!: string;
  @IsOptional() @IsString() performedBy?: string;
  @IsOptional() @IsNumber() @Min(0) costAmount?: number;
  @IsOptional() @IsString() costCurrency?: string;
  @IsOptional() @IsNumber() @Min(0) hoursAtService?: number;
  @IsOptional() @IsString() notes?: string;
}

class FuelDto {
  @IsString() equipmentId!: string;
  @IsDateString() fueledOn!: string;
  @IsNumber() @Min(0.01) fuelLitres!: number;
  @IsOptional() @IsNumber() @Min(0) hoursAtFueling?: number;
  @IsOptional() @IsNumber() @Min(0) costAmount?: number;
  @IsOptional() @IsString() costCurrency?: string;
  @IsOptional() @IsString() notes?: string;
}

class CreateWorkerDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() farmId?: string;
  @IsString() fullName!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() role?: string;
}

class CreateWorkOrderDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() farmId?: string;
  @IsOptional() @IsString() fieldId?: string;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: string;
  @IsOptional() @IsString() assignedToWorkerId?: string;
  @IsOptional() @IsDateString() scheduledFor?: string;
}

@ApiTags('operations')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller()
export class OperationsController {
  constructor(private readonly operations: OperationsRepository) {}

  @Get('equipment')
  @RequirePermissions({ resource: 'equipment', action: 'SEARCH' })
  async listEquipment(@Query('q') q?: string, @Query('farmId') farmId?: string, @Query('status') status?: string, @Query('equipmentType') equipmentType?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.operations.listEquipment(ctx, { q, farmId, status, equipmentType, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('equipment')
  @RequirePermissions({ resource: 'equipment', action: 'CREATE' })
  async createEquipment(@Body() dto: CreateEquipmentDto) {
    const ctx = getSecurityContext()!;
    return this.operations.createEquipment(ctx, dto);
  }

  @Put('equipment/:id')
  @RequirePermissions({ resource: 'equipment', action: 'UPDATE' })
  async updateEquipment(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const ctx = getSecurityContext()!;
    return this.operations.updateEquipment(ctx, id, body);
  }

  @Get('maintenance-logs')
  @RequirePermissions({ resource: 'maintenance_log', action: 'SEARCH' })
  async listMaintenanceLogs(@Query('equipmentId') equipmentId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.operations.listMaintenanceLogs(ctx, equipmentId, limit ? Number(limit) : undefined, offset ? Number(offset) : undefined);
  }

  @Post('maintenance-logs')
  @RequirePermissions({ resource: 'maintenance_log', action: 'CREATE' })
  async addMaintenance(@Body() dto: MaintenanceDto) {
    const ctx = getSecurityContext()!;
    return this.operations.addMaintenanceLog(ctx, dto);
  }

  @Get('fuel-logs')
  async listFuelLogs(@Query('equipmentId') equipmentId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.operations.listFuelLogs(ctx, equipmentId, limit ? Number(limit) : undefined, offset ? Number(offset) : undefined);
  }

  @Post('fuel-logs')
  @RequirePermissions({ resource: 'fuel_log', action: 'CREATE' })
  async addFuel(@Body() dto: FuelDto) {
    const ctx = getSecurityContext()!;
    return this.operations.addFuelLog(ctx, dto);
  }

  @Get('workers')
  @RequirePermissions({ resource: 'worker', action: 'SEARCH' })
  async listWorkers(@Query('q') q?: string, @Query('farmId') farmId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.operations.listWorkers(ctx, { q, farmId, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('workers')
  @RequirePermissions({ resource: 'worker', action: 'CREATE' })
  async createWorker(@Body() dto: CreateWorkerDto) {
    const ctx = getSecurityContext()!;
    return this.operations.createWorker(ctx, dto);
  }

  @Get('work-orders')
  @RequirePermissions({ resource: 'work_order', action: 'SEARCH' })
  async listWorkOrders(@Query('status') status?: string, @Query('farmId') farmId?: string, @Query('fieldId') fieldId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.operations.listWorkOrders(ctx, { status, farmId, fieldId, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('work-orders')
  @RequirePermissions({ resource: 'work_order', action: 'CREATE' })
  async createWorkOrder(@Body() dto: CreateWorkOrderDto) {
    const ctx = getSecurityContext()!;
    return this.operations.createWorkOrder(ctx, dto);
  }

  @Post('work-orders/:id/transition')
  @HttpCode(200)
  @RequirePermissions({ resource: 'work_order', action: 'UPDATE' })
  async transitionWorkOrder(@Param('id') id: string, @Body() body: { status: string }) {
    const ctx = getSecurityContext()!;
    return this.operations.transitionWorkOrder(ctx, id, body.status);
  }
}

export { EQUIPMENT_TYPES, WO_STATUSES };
