import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { closeDatabase, getDatabase, type Database } from '../db/driver';
import { AuditRepository } from '../modules/audit/audit.repository';
import { DATABASE } from './database.token';

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
