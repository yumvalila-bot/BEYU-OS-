/**
 * Noelia module (spec §41).
 *
 * Providers are constructed by explicit factories rather than by reflected
 * constructor types: the repository takes a `Database` behind a symbol token,
 * which has no runtime class to reflect.
 *
 * The provider is selected from configuration at wire time, so the choice of
 * model backend is a deployment decision and the rest of the module never
 * learns which one it got.
 */

import { Module } from '@nestjs/common';

import { loadConfig } from '@beyu/config';

import { DATABASE } from '../../core/database.module';
import { AuditRepository } from '../audit/audit.repository';
import { NoeliaController } from './noelia.controller';
import { NoeliaRepository } from './noelia.repository';
import { createNoeliaProvider } from './noelia.provider';
import type { Database } from '../../db/driver';
import type { NoeliaProvider } from './noelia.provider';

export const NOELIA_PROVIDER = Symbol('BEYU_NOELIA_PROVIDER');

@Module({
  controllers: [NoeliaController],
  providers: [
    {
      provide: NOELIA_PROVIDER,
      useFactory: (): NoeliaProvider => createNoeliaProvider(loadConfig().ai),
    },
    {
      provide: NoeliaRepository,
      inject: [DATABASE, AuditRepository, NOELIA_PROVIDER],
      useFactory: (
        db: Database,
        audit: AuditRepository,
        provider: NoeliaProvider,
      ): NoeliaRepository => new NoeliaRepository(db, audit, provider),
    },
  ],
  exports: [NoeliaRepository],
})
export class NoeliaModule {}
