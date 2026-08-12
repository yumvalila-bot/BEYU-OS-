import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { closeDatabase, getDatabase, type Database } from '../db/driver';
import { AuditRepository } from '../modules/audit/audit.repository';

export const DATABASE = Symbol('BEYU_HEALTH_DATABASE');

@Global()
@Module({
  providers: [
    { provide: DATABASE, useFactory: (): Database => getDatabase() },
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
