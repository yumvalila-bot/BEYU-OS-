import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { AuthorizationGuard } from '../../core/authorization.guard';
import { RequirePermissions } from '../../core/permissions.decorator';
import { IsString, IsOptional, IsArray, IsNumber } from 'class-validator';
import { BillingRepository } from './billing.repository';
import { getSecurityContext } from '../../core/request-context';

class CreateInvoiceDto { @IsString() patientId!: string; @IsOptional() @IsString() encounterId?: string; @IsOptional() @IsString() facilityId?: string; @IsArray() lines!: Array<{ description: string; quantity: number; unitPriceMinor: number; serviceId?: string }>; @IsOptional() @IsNumber() discountMinor?: number; @IsOptional() @IsString() notes?: string; }
class CreateServiceDto { @IsString() code!: string; @IsString() name!: string; @IsString() category!: string; @IsNumber() unitPriceMinor!: number; @IsOptional() @IsString() currency?: string; }

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingRepository) {}
  @Get('invoices') @RequirePermissions({ resource: 'billing', action: 'READ' }) async invoices(@Query('patientId') patientId?: string, @Query('status') status?: string, @Query('facilityId') facilityId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.billing.listInvoices(getSecurityContext()!, { patientId, status, facilityId, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined }); }
  @Get('invoices/:id') @RequirePermissions({ resource: 'billing', action: 'READ' }) async getInvoice(@Param('id') id: string) { return this.billing.getInvoice(getSecurityContext()!, id); }
  @Post('invoices') @RequirePermissions({ resource: 'billing', action: 'CREATE' }) async createInvoice(@Body() dto: CreateInvoiceDto) { return this.billing.createInvoice(getSecurityContext()!, dto); }
  @Post('invoices/:id/payments') @RequirePermissions({ resource: 'billing', action: 'UPDATE' }) async addPayment(@Param('id') id: string, @Body() body: { amountMinor: number; method: string; reference?: string }) { return this.billing.addPayment(getSecurityContext()!, id, body); }
  @Get('services') @RequirePermissions({ resource: 'billing', action: 'READ' }) async services(@Query('q') q?: string, @Query('category') category?: string) { return this.billing.serviceCatalog(getSecurityContext()!, { q, category }); }
  @Post('services') @RequirePermissions({ resource: 'billing', action: 'CREATE' }) async createService(@Body() dto: CreateServiceDto) { return this.billing.createService(getSecurityContext()!, dto); }
  @Get('reports/revenue') @RequirePermissions({ resource: 'reports', action: 'READ' }) async revenue(@Query('period') period?: 'today' | 'week' | 'month' | 'year') { return this.billing.revenueSummary(getSecurityContext()!, period); }
}
