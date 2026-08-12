/**
 * BEYU HEALTH OS — Application Root Module
 * Canonical healthcare operating system assembling all domains.
 * Spec §5, §37, §85
 */

import { Module, type MiddlewareConsumer, type NestModule, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

import { DatabaseModule } from './core/database.module';
import { ContextMiddleware } from './core/context.middleware';
import { AuthenticationGuard } from './core/authentication.guard';
import { AuthorizationGuard } from './core/authorization.guard';
import { AuditInterceptor } from './core/audit.interceptor';
import { HttpExceptionFilter } from './core/http-exception.filter';

import { HealthController } from './modules/health/health.controller';
import { AuditModule } from './modules/audit/audit.module';
import { IdentityModule } from './modules/identity/identity.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PatientModule } from './modules/patient/patient.module';
import { ClinicalModule } from './modules/clinical/clinical.module';
import { AppointmentModule } from './modules/appointment/appointment.module';
import { TriageModule } from './modules/triage/triage.module';
import { InpatientModule } from './modules/inpatient/inpatient.module';
import { PharmacyModule } from './modules/pharmacy/pharmacy.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { LaboratoryModule } from './modules/laboratory/laboratory.module';
import { RadiologyModule } from './modules/radiology/radiology.module';
import { OphthalmologyModule } from './modules/ophthalmology/ophthalmology.module';
import { BillingModule } from './modules/billing/billing.module';
import { InsuranceModule } from './modules/insurance/insurance.module';
import { WorkforceModule } from './modules/workforce/workforce.module';
import { AmbulanceModule } from './modules/ambulance/ambulance.module';
import { TelemedicineModule } from './modules/telemedicine/telemedicine.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { AiModule } from './modules/ai/ai.module';
import { IntegrationModule } from './modules/integration/integration.module';

@Module({
  imports: [
    DatabaseModule,
    IdentityModule,
    AuditModule,
    TenantModule,
    OrganizationModule,
    PatientModule,
    ClinicalModule,
    AppointmentModule,
    TriageModule,
    InpatientModule,
    PharmacyModule,
    InventoryModule,
    LaboratoryModule,
    RadiologyModule,
    OphthalmologyModule,
    BillingModule,
    InsuranceModule,
    WorkforceModule,
    AmbulanceModule,
    TelemedicineModule,
    DocumentsModule,
    NotificationsModule,
    ReportingModule,
    ComplianceModule,
    GovernanceModule,
    AiModule,
    IntegrationModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: AuthorizationGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: { enableImplicitConversion: false },
        }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ContextMiddleware).forRoutes('*');
  }
}
