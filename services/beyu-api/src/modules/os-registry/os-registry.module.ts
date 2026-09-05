/**
 * OS federation module (spec §69).
 *
 * Providers are constructed by explicit factories rather than by reflected
 * constructor types. The repository takes a `Database` behind a symbol token,
 * which has no runtime class to reflect, so a factory is the only correct way
 * to wire it.
 */

import { Module } from '@nestjs/common';

import { DATABASE } from '../../core/database.module';
import { AuditRepository } from '../audit/audit.repository';
import { OsRegistryController } from './os-registry.controller';
import { OsRegistryRepository } from './os-registry.repository';
import type { Database } from '../../db/driver';

@Module({
  controllers: [OsRegistryController],
  providers: [
    {
      provide: OsRegistryRepository,
      inject: [DATABASE, AuditRepository],
      useFactory: (db: Database, audit: AuditRepository): OsRegistryRepository =>
        new OsRegistryRepository(db, audit),
    },
  ],
  exports: [OsRegistryRepository],
})
export class OsRegistryModule {}
