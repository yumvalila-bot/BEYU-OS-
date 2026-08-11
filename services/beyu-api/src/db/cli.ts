/**
 * BEYU OS — database CLI.
 *
 *   pnpm db:migrate       apply pending migrations
 *   pnpm db:seed          insert structural reference + illustrative data
 *   pnpm db:reset         drop all schemas, re-migrate, re-seed (never in prod)
 *   pnpm db:verify-audit  verify the audit hash chain end to end
 */

import { AuditRepository } from '../modules/audit/audit.repository';
import { closeDatabase, getDatabase } from './driver';
import { migrate, reset } from './migrator';
import { seed } from './seed';

async function main(): Promise<void> {
  const command = process.argv[2];
  const db = getDatabase();
  console.log(`BEYU OS database CLI — driver: ${db.driver}`);

  switch (command) {
    case 'migrate': {
      const result = await migrate(db);
      console.log(
        result.applied.length
          ? `Applied ${result.applied.length} migration(s).`
          : 'Schema already up to date.',
      );
      break;
    }

    case 'seed': {
      await seed(db);
      console.log('Seed complete.');
      break;
    }

    case 'reset': {
      if (process.env.BEYU_ENV === 'production') {
        throw new Error('Refusing to reset the database in production.');
      }
      console.log('Dropping all BEYU schemas...');
      await reset(db);
      await migrate(db);
      await seed(db);
      console.log('Reset complete.');
      break;
    }

    case 'verify-audit': {
      const result = await new AuditRepository(db).verify();
      if (result.valid) {
        console.log(`Audit chain intact across ${result.checkedCount} entries.`);
      } else {
        console.error(
          `AUDIT CHAIN BROKEN at sequence ${result.brokenAtSequence}: ${result.reason}`,
        );
        process.exitCode = 1;
      }
      break;
    }

    default:
      console.error('Usage: cli.ts <migrate|seed|reset|verify-audit>');
      process.exitCode = 1;
  }

  await closeDatabase();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
