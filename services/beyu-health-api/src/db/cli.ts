import { getDatabase, closeDatabase } from './driver';
import { migrate, reset } from './migrator';
import { seed } from './seed';

async function main() {
  const cmd = process.argv[2];
  const db = getDatabase();
  try {
    if (cmd === 'migrate') {
      const r = await migrate(db);
      console.log(`Applied: ${r.applied.length}, Skipped: ${r.skipped.length}`);
    } else if (cmd === 'seed') {
      await seed(db);
      console.log('Seed completed');
    } else if (cmd === 'reset') {
      await reset(db);
      console.log('Reset completed');
    } else {
      console.log('Usage: cli.ts [migrate|seed|reset]');
    }
  } finally {
    await closeDatabase();
  }
}
if (require.main === module) { main().catch(e=>{ console.error(e); process.exit(1); }); }
