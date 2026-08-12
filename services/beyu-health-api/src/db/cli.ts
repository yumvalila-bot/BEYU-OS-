import { getDatabase, closeDatabase } from './driver';
import { migrate, reset, migrationStatus } from './migrator';
import { resolveHealthDatabaseTarget } from './connection-target';

async function main() {
  const cmd = process.argv[2];
  const target = resolveHealthDatabaseTarget();
  console.warn(`Health OS database target: ${target.sanitized} (driver=${target.driver})`);

  if (cmd === 'status') {
    const db = getDatabase();
    try {
      const status = await migrationStatus(db);
      console.log(JSON.stringify({
        driver: target.driver,
        supabase: target.supabase,
        projectRef: target.projectRef,
        target: status.target,
        files: status.files.length,
        applied: status.applied,
        pending: status.pending,
      }, null, 2));
    } finally {
      await closeDatabase();
    }
    return;
  }

  const db = getDatabase();
  try {
    if (cmd === 'migrate') {
      const r = await migrate(db);
      console.log(`Applied: ${r.applied.length}, Skipped: ${r.skipped.length}`);
    } else if (cmd === 'seed') {
      const { seed } = await import('./seed');
      await seed(db);
      console.log('Seed completed');
    } else if (cmd === 'reset') {
      await reset(db);
      console.log('Reset completed');
    } else {
      console.log('Usage: cli.ts [status|migrate|seed|reset]');
    }
  } finally {
    await closeDatabase();
  }
}
if (require.main === module) { main().catch(e=>{ console.error(e); process.exit(1); }); }
