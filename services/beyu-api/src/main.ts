/**
 * BEYU OS API entry point (spec §44, §50, §51).
 *
 * Serves the versioned REST surface at /api/v1 with OpenAPI documentation.
 * The control plane for BEYU FAMILY TRUST: organization, governance,
 * strategy, capital allocation, risk, compliance and intelligence.
 */

import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { loadConfig } from '@beyu/config';
import { BEYU_CONTRACTS_VERSION, CANONICAL_PARENT_ORGANIZATION } from '@beyu/types';

import { AppModule } from './app.module';

export async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger('BeyuOS');

  const app = await NestFactory.create(AppModule, {
    logger:
      config.observability.logLevel === 'debug'
        ? ['error', 'warn', 'log', 'debug', 'verbose']
        : ['error', 'warn', 'log'],
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties the DTO does not declare
      forbidNonWhitelisted: true, // and reject requests that send them
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableCors({
    origin: config.security.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // OpenAPI is published outside production, where the schema itself is a
  // reconnaissance aid.
  if (config.env !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('BEYU OS API')
        .setDescription(
          `Control plane for ${CANONICAL_PARENT_ORGANIZATION}. ` +
            'Governance stops at the Sector LLC boundary; sector operations belong ' +
            'to their own operating systems and are reached only through versioned contracts.',
        )
        .setVersion(BEYU_CONTRACTS_VERSION)
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
    logger.log(`OpenAPI available at /api/docs`);
  }

  app.enableShutdownHooks();

  // Bind to all interfaces so the service is reachable from containers and
  // preview environments, not just loopback.
  await app.listen(config.port, '0.0.0.0');

  logger.log(
    `BEYU OS API listening on port ${config.port} ` +
      `[env=${config.env} db=${config.databaseDriver} events=${config.events.driver}]`,
  );
}

// Only auto-start when executed directly, so tests can import the bootstrap.
if (require.main === module) {
  bootstrap().catch((error: unknown) => {
     
    console.error(
      JSON.stringify({
        level: 'fatal',
        msg: 'BEYU OS API failed to start',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }),
    );
    process.exit(1);
  });
}
