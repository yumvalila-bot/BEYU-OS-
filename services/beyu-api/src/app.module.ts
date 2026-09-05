/**
 * BEYU OS API root module (spec §44, §50).
 *
 * Cross-cutting concerns are wired here so that no individual controller can
 * opt out of them:
 *   - ContextMiddleware     : request id and ambient context, on every route.
 *   - AuthenticationGuard   : resolves a bearer token into a security context.
 *   - AuthorizationGuard    : deny-by-default, globally applied.
 *   - AuditInterceptor      : every mutation lands in the hash chain.
 *   - ValidationPipe        : rejects unknown or malformed request bodies.
 *   - HttpExceptionFilter   : uniform errors that never leak internals.
 *
 * Domain modules are registered as they are implemented. The status of each
 * is tracked in docs/IMPLEMENTATION_STATUS.md — this file reflects only what
 * genuinely exists.
 */

import { type MiddlewareConsumer, Module, type NestModule, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

import { AuditInterceptor } from './core/audit.interceptor';
import { AuthenticationGuard } from './core/authentication.guard';
import { AuthorizationGuard } from './core/authorization.guard';
import { ContextMiddleware } from './core/context.middleware';
import { DatabaseModule } from './core/database.module';
import { HttpExceptionFilter } from './core/http-exception.filter';
import { AuditController } from './modules/audit/audit.controller';
import { AuthModule } from './modules/auth/auth.module';
import { HealthController } from './modules/health/health.controller';
import { OrganizationsModule } from './modules/organizations/organizations.module';

@Module({
  imports: [DatabaseModule, AuthModule, OrganizationsModule],
  controllers: [HealthController, AuditController],
  providers: [
    // Order matters: authentication resolves the principal, then
    // authorization decides what that principal may do.
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: AuthorizationGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    {
      // Registered here rather than only in main.ts so that any app built from
      // this module — including tests — validates input identically.
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true, // strip undeclared properties
          forbidNonWhitelisted: true, // and reject the request that sent them
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
