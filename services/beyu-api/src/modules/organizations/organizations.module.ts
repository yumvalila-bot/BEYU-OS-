/**
 * Organization module (spec §18).
 *
 * Providers are constructed by explicit factories rather than by reflected
 * constructor types. The repository takes a `Database` behind a symbol token,
 * which has no runtime class to reflect, so a factory is the only correct way
 * to wire it.
 */

import { Module } from '@nestjs/common';

import { DATABASE } from '../../core/database.module';
import { AuditRepository } from '../audit/audit.repository';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsRepository } from './organizations.repository';
import type { Database } from '../../db/driver';

@Module({
  controllers: [OrganizationsController],
  providers: [
    {
      provide: OrganizationsRepository,
      inject: [DATABASE, AuditRepository],
      useFactory: (db: Database, audit: AuditRepository): OrganizationsRepository =>
        new OrganizationsRepository(db, audit),
    },
  ],
  exports: [OrganizationsRepository],
})
export class OrganizationsModule {}
