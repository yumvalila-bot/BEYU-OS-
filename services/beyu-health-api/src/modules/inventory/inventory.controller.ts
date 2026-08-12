import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { InventoryRepository } from './inventory.repository';
import { getSecurityContext } from '../../core/request-context';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryRepository) {}
  @Get('warehouses') @RequirePermissions({ resource: 'inventory', action: 'READ' }) async warehouses(@Query('facilityId') facilityId?: string) { return this.inventory.warehouses(getSecurityContext()!, facilityId); }
  @Get('items') @RequirePermissions({ resource: 'inventory', action: 'READ' }) async items(@Query('q') q?: string, @Query('category') category?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.inventory.items(getSecurityContext()!, { q, category, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined }); }
  @Get('low-stock') @RequirePermissions({ resource: 'inventory', action: 'READ' }) async lowStock() { return this.inventory.lowStock(getSecurityContext()!); }
  @Get('suppliers') @RequirePermissions({ resource: 'inventory', action: 'READ' }) async suppliers() { return this.inventory.suppliers(getSecurityContext()!); }
  @Get('items/:id/movements') @RequirePermissions({ resource: 'inventory', action: 'READ' }) async movements(@Param('id') id: string) { return this.inventory.movements(getSecurityContext()!, id); }
  @Post('movements') @RequirePermissions({ resource: 'inventory', action: 'TRANSFER' }) async createMovement(@Body() body: { itemId: string; batchId?: string; fromWarehouseId?: string; toWarehouseId?: string; type: string; quantity: number; reason?: string; }) { return this.inventory.createMovement(getSecurityContext()!, body); }
  @Post('items') @RequirePermissions({ resource: 'inventory', action: 'CREATE' }) async createItem(@Body() body: { sku: string; name: string; category: string; uom: string; isDrug?: boolean; drugId?: string; reorderLevel?: number; reorderQuantity?: number }) { return this.inventory.createItem(getSecurityContext()!, body); }
  @Post('batches') @RequirePermissions({ resource: 'inventory', action: 'CREATE' }) async createBatch(@Body() body: { itemId: string; warehouseId: string; batchNumber: string; quantity: number; expiryDate?: string; unitCostMinor?: number }) { return this.inventory.createBatch(getSecurityContext()!, body); }
  @Get('purchase-orders') @RequirePermissions({ resource: 'inventory', action: 'READ' }) async purchaseOrders(@Query('status') status?: string) { return this.inventory.purchaseOrders(getSecurityContext()!, status); }
}
