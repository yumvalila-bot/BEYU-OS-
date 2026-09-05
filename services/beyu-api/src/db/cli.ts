/**
 * BEYU OS — database CLI.
 *
 *   pnpm db:migrate       apply pending migrations
 *   pnpm db:seed          insert structural reference + illustrative data
 *   pnpm db:reset         drop all schemas, re-migrate, re-seed (never in prod)
 *   pnpm db:verify-audit  verify the audit hash chain end to end
 *   create-admin          create the first TRUST_ADMINISTRATOR
 *
 * No user is ever seeded with a default password. The first administrator is
 * created deliberately, by an operator, with a password supplied through the
 * environment.
 */

import { hashPassword } from '@beyu/security';
import { Role } from '@beyu/types';

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

    case 'create-admin': {
      const email = process.env.ADMIN_EMAIL;
      const password = process.env.ADMIN_PASSWORD;
      const displayName = process.env.ADMIN_NAME ?? 'Trust Administrator';

      if (!email || !password) {
        throw new Error(
          'Set ADMIN_EMAIL and ADMIN_PASSWORD. Passwords are never passed as ' +
            'command-line arguments, where they would land in shell history.',
        );
      }
      if (password.length < 12) {
        throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
      }

      const existing = await db.query(
        'SELECT id FROM identity.users WHERE lower(email) = lower($1)',
        [email],
      );
      if (existing.rows.length > 0) {
        throw new Error(`A user with email ${email} already exists.`);
      }

      await db.transaction(async (session) => {
        const user = await session.query<{ id: string }>(
          `INSERT INTO identity.users
             (identity_id, email, display_name, password_hash, status, max_classification)
           VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE', 'RESTRICTED')
           RETURNING id`,
          [email, displayName, hashPassword(password)],
        );
        const userId = user.rows[0].id;

        const role = await session.query<{ id: string }>(
          'SELECT id FROM identity.roles WHERE code = $1',
          [Role.TrustAdministrator],
        );
        if (role.rows.length === 0) {
          throw new Error(
            `Role ${Role.TrustAdministrator} is missing. Run \`pnpm db:seed\` first.`,
          );
        }

        await session.query(
          'INSERT INTO identity.user_roles (user_id, role_id) VALUES ($1, $2)',
          [userId, role.rows[0].id],
        );
      });

      console.log(`Created ${email} with role ${Role.TrustAdministrator}.`);
      console.log('Sign in and enable MFA before granting any further access.');
      break;
    }

    default:
      console.error('Usage: cli.ts <migrate|seed|reset|verify-audit|create-admin>');
      process.exitCode = 1;
  }

  await closeDatabase();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
