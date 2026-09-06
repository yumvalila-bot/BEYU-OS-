/**
 * BEYU AGRICULTURE OS — API Entry Point.
 * Sector OS in the BEYU federation (AGRICULTURE sector).
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadConfig } from '@beyu/config';
import { AppModule } from './app.module';
import { AGRICULTURE_CONTRACTS_VERSION } from '@beyu/agriculture-types';

export async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger('BeyuAgricultureOS');

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
        .setTitle('BEYU AGRICULTURE OS API')
        .setDescription(
          'BEYU AGRICULTURE OS — Agriculture Operating System. ' +
            'Farm, field, crop-cycle, livestock, inventory, equipment, workforce, procurement and compliance platform. ' +
            'Multi-tenant, RLS-isolated, audit-trailed. BEYU FAMILY TRUST → BEYU HOLDINGS → COUNTRY HOLDING → AGRICULTURE SECTOR COMPANY → AGRICULTURE OS. ' +
            'Attaches to BEYU OS over the federation seam; Finance OS owns the ledger.',
        )
        .setVersion(AGRICULTURE_CONTRACTS_VERSION)
        .addBearerAuth()
        .addTag('auth')
        .addTag('users')
        .addTag('tenants')
        .addTag('farms')
        .addTag('land')
        .addTag('crops')
        .addTag('livestock')
        .addTag('inventory')
        .addTag('procurement')
        .addTag('operations')
        .addTag('compliance')
        .addTag('reports')
        .addTag('audit')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
    logger.log('OpenAPI docs at /api/docs');
  }

  app.enableShutdownHooks();

  const port = Number(process.env.AGRICULTURE_API_PORT ?? 4002);
  await app.listen(port, '0.0.0.0');
  logger.log(`BEYU AGRICULTURE OS API listening on ${port} [env=${config.env} db=${config.databaseDriver}]`);
  logger.log('Domains: Farm, Field/Soil/Weather, Crop/Cycle/Activity/Harvest/Storage, Livestock, Inventory, Procurement/Sales/Contracts, Equipment/Workforce/WorkOrders, Compliance/Traceability, Reporting');
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error(JSON.stringify({ level: 'fatal', msg: 'BEYU AGRICULTURE OS API failed to start', error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }));
    process.exit(1);
  });
}
