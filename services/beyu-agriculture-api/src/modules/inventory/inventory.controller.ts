import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { InventoryRepository } from './inventory.repository';
import { getSecurityContext } from '../../core/request-context';

const MOVEMENT_TYPES = ['PURCHASE', 'INTERNAL_TRANSFER', 'ISSUANCE_TO_ACTIVITY', 'ADJUSTMENT', 'LOSS_WRITE_OFF', 'SALE', 'RETURN'];

class CreateWarehouseDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() farmId?: string;
  @IsString() code!: string;
  @IsString() name!: string;
  @IsIn(['GENERAL', 'INPUT_STORE', 'PRODUCE_STORE', 'COLD_STORE', 'WORKSHOP']) warehouseType!: string;
  @IsOptional() isColdStore?: boolean;
  @IsOptional() @IsNumber() @Min(0) capacityKg?: number;
}

class CreateInputItemDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsString() code!: string;
  @IsString() name!: string;
  @IsIn(['SEED', 'FERTILIZER', 'PESTICIDE', 'HERBICIDE', 'FUNGICIDE', 'FUEL', 'LUBRICANT', 'ANIMAL_FEED', 'VETERINARY', 'PACKAGING', 'TOOLS', 'OTHER']) category!: string;
  @IsString() unit!: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() isRestricted?: boolean;
}

class CreateStockMovementDto {
  @IsString() warehouseId!: string;
  @IsOptional() @IsString() inputItemId?: string;
  @IsOptional() @IsString() storageLotId?: string;
  @IsIn(MOVEMENT_TYPES) movementType!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
  @IsString() unit!: string;
  @IsOptional() @IsString() occurredOn?: string;
  @IsOptional() @IsString() referenceType?: string;
  @IsOptional() @IsString() referenceId?: string;
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller()
export class InventoryController {
  constructor(private readonly inventory: InventoryRepository) {}

  @Get('warehouses')
  @RequirePermissions({ resource: 'warehouse', action: 'SEARCH' })
  async listWarehouses(@Query('q') q?: string, @Query('farmId') farmId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.inventory.listWarehouses(ctx, { q, farmId, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('warehouses')
  @RequirePermissions({ resource: 'warehouse', action: 'CREATE' })
  async createWarehouse(@Body() dto: CreateWarehouseDto) {
    const ctx = getSecurityContext()!;
    return this.inventory.createWarehouse(ctx, dto);
  }

  @Get('input-items')
  @RequirePermissions({ resource: 'input_item', action: 'SEARCH' })
  async listInputItems(@Query('q') q?: string, @Query('category') category?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.inventory.listInputItems(ctx, { q, category, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('input-items')
  @RequirePermissions({ resource: 'input_item', action: 'CREATE' })
  async createInputItem(@Body() dto: CreateInputItemDto) {
    const ctx = getSecurityContext()!;
    return this.inventory.createInputItem(ctx, dto);
  }

  @Get('stock-movements')
  @RequirePermissions({ resource: 'stock_movement', action: 'SEARCH' })
  async listStockMovements(@Query('warehouseId') warehouseId?: string, @Query('inputItemId') inputItemId?: string, @Query('movementType') movementType?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.inventory.listStockMovements(ctx, { warehouseId, inputItemId, movementType, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('stock-movements')
  @RequirePermissions({ resource: 'stock_movement', action: 'CREATE' })
  async createStockMovement(@Body() dto: CreateStockMovementDto) {
    const ctx = getSecurityContext()!;
    return this.inventory.createStockMovement(ctx, dto);
  }

  @Get('stock-summary')
  @RequirePermissions({ resource: 'stock_movement', action: 'READ' })
  async stockSummary(@Query('warehouseId') warehouseId?: string) {
    const ctx = getSecurityContext()!;
    return this.inventory.stockSummary(ctx, { warehouseId });
  }
}

export { MOVEMENT_TYPES };
