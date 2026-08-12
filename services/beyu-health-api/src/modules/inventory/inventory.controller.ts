import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { InventoryRepository } from './inventory.repository';
import { getSecurityContext } from '../../core/request-context';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryRepository) {}
  @Get('items') @RequirePermissions({ resource: 'inventory', action: 'READ' }) async items(@Query('q') q?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.inventory.items(getSecurityContext()!, { q, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined }); }
  @Get('low-stock') @RequirePermissions({ resource: 'inventory', action: 'READ' }) async lowStock() { return this.inventory.lowStock(getSecurityContext()!); }
  @Get('items/:id/movements') @RequirePermissions({ resource: 'inventory', action: 'READ' }) async movements(@Param('id') id: string) { return this.inventory.movements(getSecurityContext()!, id); }
  @Post('movements') @RequirePermissions({ resource: 'inventory', action: 'TRANSFER' }) async createMovement(@Body() body: { itemId: string; batchId?: string; fromWarehouseId?: string; toWarehouseId?: string; type: string; quantity: number; reason?: string; }) { return this.inventory.createMovement(getSecurityContext()!, body); }
}
