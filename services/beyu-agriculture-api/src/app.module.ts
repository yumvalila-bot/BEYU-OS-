/**
 * BEYU AGRICULTURE OS — Application Root Module.
 * Canonical agriculture operating system assembling all domains.
 * Attaches to BEYU OS beneath the AGRICULTURE sector LLC (spec §4, §69–§71).
 */

import { Module, type MiddlewareConsumer, type NestModule, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';

import { DatabaseModule } from './core/database.module';
import { ContextMiddleware } from './core/context.middleware';
import { AuthenticationGuard } from './core/authentication.guard';
import { AuthorizationGuard } from './core/authorization.guard';
import { HttpExceptionFilter } from './core/http-exception.filter';

import { HealthController } from './modules/health/health.controller';
import { IdentityModule } from './modules/identity/identity.module';
import { AuditModule } from './modules/audit/audit.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { FarmModule } from './modules/farm/farm.module';
import { LandModule } from './modules/land/land.module';
import { CropModule } from './modules/crop/crop.module';
import { LivestockModule } from './modules/livestock/livestock.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { OperationsModule } from './modules/operations/operations.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { ReportingModule } from './modules/reporting/reporting.module';

@Module({
  imports: [
    DatabaseModule,
    IdentityModule,
    AuditModule,
    TenantModule,
    FarmModule,
    LandModule,
    CropModule,
    LivestockModule,
    InventoryModule,
    ProcurementModule,
    OperationsModule,
    ComplianceModule,
    ReportingModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: AuthorizationGuard },
    { provide: APP_PIPE, useClass: ValidationPipe },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ContextMiddleware).forRoutes('*');
  }
}
