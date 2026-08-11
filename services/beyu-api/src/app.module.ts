/**
 * BEYU OS API root module (spec §44, §50).
 *
 * Cross-cutting concerns are wired here so that no individual controller can
 * opt out of them:
 *   - ContextMiddleware     : request id and ambient context, on every route.
 *   - AuthorizationGuard    : deny-by-default, globally applied.
 *   - AuditInterceptor      : every mutation lands in the hash chain.
 *   - HttpExceptionFilter   : uniform errors that never leak internals.
 *
 * Domain modules are registered as they are implemented. The status of each
 * is tracked in docs/IMPLEMENTATION_STATUS.md — this file reflects only what
 * genuinely exists.
 */

import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AuditInterceptor } from './core/audit.interceptor';
import { AuthorizationGuard } from './core/authorization.guard';
import { ContextMiddleware } from './core/context.middleware';
import { DatabaseModule } from './core/database.module';
import { HttpExceptionFilter } from './core/http-exception.filter';
import { AuditController } from './modules/audit/audit.controller';
import { HealthController } from './modules/health/health.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController, AuditController],
  providers: [
    { provide: APP_GUARD, useClass: AuthorizationGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ContextMiddleware).forRoutes('*');
  }
}
