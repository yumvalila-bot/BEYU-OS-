/**
 * Database wiring (spec §44).
 *
 * Exposes the driver and the repositories that must be shared process-wide.
 * Frontends never reach PostgreSQL directly — everything passes through this
 * service layer, where authorization and RLS context are applied.
 */

import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';

import { closeDatabase, getDatabase, type Database } from '../db/driver';
import { AuditRepository } from '../modules/audit/audit.repository';

export const DATABASE = Symbol('BEYU_DATABASE');

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: (): Database => getDatabase(),
    },
    {
      provide: AuditRepository,
      inject: [DATABASE],
      useFactory: (db: Database): AuditRepository => new AuditRepository(db),
    },
  ],
  exports: [DATABASE, AuditRepository],
})
export class DatabaseModule implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await closeDatabase();
  }
}
