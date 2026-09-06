import { getDatabase, closeDatabase } from './driver';
import { migrate, reset, migrationStatus } from './migrator';
import { resolveAgricultureDatabaseTarget } from './connection-target';

async function main() {
  const cmd = process.argv[2];
  const target = resolveAgricultureDatabaseTarget();
  console.warn(`Agriculture OS database target: ${target.sanitized} (driver=${target.driver})`);

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
    } else if (cmd === 'verify-audit') {
      const { verifyAuditChain } = await import('../modules/audit/audit.repository');
      const result = await verifyAuditChain(db);
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('Usage: cli.ts [status|migrate|seed|reset|verify-audit]');
    }
  } finally {
    await closeDatabase();
  }
}
if (require.main === module) { main().catch(e=>{ console.error(e); process.exit(1); }); }
