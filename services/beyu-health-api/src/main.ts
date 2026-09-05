/**
 * BEYU HEALTH OS — API Entry Point
 * Production-grade healthcare operating system.
 * Spec §4, §5, §37, §71, §82
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadConfig } from '@beyu/config';
import { AppModule } from './app.module';
import { HEALTH_CONTRACTS_VERSION } from '@beyu/health-types';

export async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger('BeyuHealthOS');

  const app = await NestFactory.create(AppModule, {
    logger: config.observability.logLevel === 'debug' ? ['error', 'warn', 'log', 'debug', 'verbose'] : ['error', 'warn', 'log'],
  });

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: config.security.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Tenant-ID'],
  });

  if (config.env !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('BEYU HEALTH OS API')
        .setDescription(
          'BEYU HEALTH OS — Complete Healthcare Operating System. ' +
            'Unified clinical, operational, financial, ophthalmology, telemedicine, ambulance, pharmacy, laboratory, radiology, inventory, workforce, compliance, governance, AI (Noelia/HIVE) platform. ' +
            'Multi-tenant, audit-trail, FHIR R4, HL7, DICOM compatible. BEYU FAMILY TRUST → BEYU HOLDING → Country Holding → Sector Operating Company → HEALTH OS.',
        )
        .setVersion(HEALTH_CONTRACTS_VERSION)
        .addBearerAuth()
        .addTag('auth')
        .addTag('patients')
        .addTag('clinical')
        .addTag('appointments')
        .addTag('triage')
        .addTag('inpatient')
        .addTag('pharmacy')
        .addTag('laboratory')
        .addTag('radiology')
        .addTag('ophthalmology')
        .addTag('billing')
        .addTag('insurance')
        .addTag('inventory')
        .addTag('workforce')
        .addTag('ambulance')
        .addTag('telemedicine')
        .addTag('documents')
        .addTag('notifications')
        .addTag('reports')
        .addTag('compliance')
        .addTag('governance')
        .addTag('ai')
        .addTag('integrations')
        .addTag('tenants')
        .addTag('audit')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
    logger.log('OpenAPI docs at /api/docs');
  }

  app.enableShutdownHooks();

  const port = Number(process.env.HEALTH_API_PORT ?? 4001);
  await app.listen(port, '0.0.0.0');
  logger.log(`BEYU HEALTH OS API listening on ${port} [env=${config.env} db=${config.databaseDriver}]`);
  logger.log(`Domains: Patient, Clinical, Appointment, Triage, Inpatient, Pharmacy, Inventory, Lab, Radiology, Ophthalmology (first-class), Billing, Insurance, Workforce, Ambulance, Telemedicine, Documents, Notifications, Reporting, Compliance, Governance, AI/Noelia/HIVE, Integration`);
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error(JSON.stringify({ level: 'fatal', msg: 'BEYU HEALTH OS API failed to start', error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }));
    process.exit(1);
  });
}
