import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { ProcurementRepository } from './procurement.repository';
import { getSecurityContext } from '../../core/request-context';

class CreateCounterpartyDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() country?: string;
}

class OrderLineDto {
  @IsOptional() @IsString() itemType?: string;
  @IsOptional() @IsString() itemId?: string;
  @IsString() description!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
  @IsString() unit!: string;
  @IsNumber() @Min(0) unitPrice!: number;
}

class SalesLineDto {
  @IsString() description!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
  @IsString() unit!: string;
  @IsNumber() @Min(0) unitPrice!: number;
}

class CreatePurchaseOrderDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsString() supplierId!: string;
  @IsDateString() orderDate!: string;
  @IsOptional() @IsDateString() expectedDeliveryOn?: string;
  @IsString() currency!: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) lines!: OrderLineDto[];
}

class CreateSalesOrderDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsString() buyerId!: string;
  @IsDateString() orderDate!: string;
  @IsOptional() @IsString() storageLotId?: string;
  @IsString() currency!: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) lines!: SalesLineDto[];
}

class CreateContractDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsIn(['SUPPLIER', 'BUYER']) counterpartyType!: string;
  @IsString() counterpartyId!: string;
  @IsDateString() startDate!: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsString() currency!: string;
  @IsNumber() @Min(0) contractedValue!: number;
  @IsOptional() @IsString() terms?: string;
}

const PO_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'FULFILLED', 'CLOSED', 'CANCELLED'];
const CONTRACT_STATUSES = ['DRAFT', 'ACTIVE', 'COMPLETED', 'TERMINATED', 'DISPUTED'];

@ApiTags('procurement')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller()
export class ProcurementController {
  constructor(private readonly procurement: ProcurementRepository) {}

  @Get('suppliers')
  @RequirePermissions({ resource: 'supplier', action: 'SEARCH' })
  async listSuppliers(@Query('q') q?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.procurement.listCounterparties(ctx, 'SUPPLIER', { q, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('suppliers')
  @RequirePermissions({ resource: 'supplier', action: 'CREATE' })
  async createSupplier(@Body() dto: CreateCounterpartyDto) {
    const ctx = getSecurityContext()!;
    return this.procurement.createCounterparty(ctx, 'SUPPLIER', dto);
  }

  @Get('buyers')
  @RequirePermissions({ resource: 'buyer', action: 'SEARCH' })
  async listBuyers(@Query('q') q?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.procurement.listCounterparties(ctx, 'BUYER', { q, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('buyers')
  @RequirePermissions({ resource: 'buyer', action: 'CREATE' })
  async createBuyer(@Body() dto: CreateCounterpartyDto) {
    const ctx = getSecurityContext()!;
    return this.procurement.createCounterparty(ctx, 'BUYER', dto);
  }

  @Get('purchase-orders')
  @RequirePermissions({ resource: 'purchase_order', action: 'SEARCH' })
  async listPurchaseOrders(@Query('status') status?: string, @Query('supplierId') supplierId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.procurement.listPurchaseOrders(ctx, { status, supplierId, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('purchase-orders')
  @RequirePermissions({ resource: 'purchase_order', action: 'CREATE' })
  async createPurchaseOrder(@Body() dto: CreatePurchaseOrderDto) {
    const ctx = getSecurityContext()!;
    return this.procurement.createPurchaseOrder(ctx, dto as any);
  }

  @Post('purchase-orders/:id/transition')
  @HttpCode(200)
  @RequirePermissions({ resource: 'purchase_order', action: 'APPROVE' })
  async transitionPurchaseOrder(@Param('id') id: string, @Body() body: { status: string }) {
    const ctx = getSecurityContext()!;
    return this.procurement.transitionPurchaseOrder(ctx, id, body.status);
  }

  @Get('sales-orders')
  @RequirePermissions({ resource: 'sales_order', action: 'SEARCH' })
  async listSalesOrders(@Query('status') status?: string, @Query('buyerId') buyerId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.procurement.listSalesOrders(ctx, { status, buyerId, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('sales-orders')
  @RequirePermissions({ resource: 'sales_order', action: 'CREATE' })
  async createSalesOrder(@Body() dto: CreateSalesOrderDto) {
    const ctx = getSecurityContext()!;
    return this.procurement.createSalesOrder(ctx, dto as any);
  }

  @Post('sales-orders/:id/transition')
  @HttpCode(200)
  @RequirePermissions({ resource: 'sales_order', action: 'APPROVE' })
  async transitionSalesOrder(@Param('id') id: string, @Body() body: { status: string }) {
    const ctx = getSecurityContext()!;
    return this.procurement.transitionSalesOrder(ctx, id, body.status);
  }

  @Get('contracts')
  @RequirePermissions({ resource: 'contract', action: 'SEARCH' })
  async listContracts(@Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = getSecurityContext()!;
    return this.procurement.listContracts(ctx, { status, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Post('contracts')
  @RequirePermissions({ resource: 'contract', action: 'CREATE' })
  async createContract(@Body() dto: CreateContractDto) {
    const ctx = getSecurityContext()!;
    return this.procurement.createContract(ctx, { ...dto, counterpartyType: dto.counterpartyType as 'SUPPLIER' | 'BUYER' });
  }

  @Post('contracts/:id/transition')
  @HttpCode(200)
  @RequirePermissions({ resource: 'contract', action: 'APPROVE' })
  async transitionContract(@Param('id') id: string, @Body() body: { status: string }) {
    const ctx = getSecurityContext()!;
    return this.procurement.transitionContract(ctx, id, body.status);
  }
}

export { PO_STATUSES, CONTRACT_STATUSES };
