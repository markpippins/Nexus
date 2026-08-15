import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';

/**
 * nebula-srv file-based migration runner (W3.2).
 *
 * nebula-srv migrations live as numbered SQL files in `migrations/` (e.g.
 * `047-allow-dba-and-epistemic-roles.sql`). Historically these were applied
 * by hand via psql, so the schema could drift from the checked-in files with
 * no live record. `nebula.schema_version` (added in migration 043) is the
 * forward ledger: version 41 is a baseline for migrations 001-041, and 042+
 * are recorded individually.
 *
 * This runner is wired into startup: it reads the highest applied version,
 * applies every numbered `NNN-*.sql` file above it in ascending order, and
 * stamps the ledger after each. It is idempotent and forward-only — on a DB
 * already at the current version it is a no-op.
 *
 * Files may carry their own BEGIN/COMMIT (some do); executing the raw file
 * text via the simple query protocol honours that, and PG otherwise wraps a
 * multi-statement string in an implicit transaction, so each migration is
 * all-or-nothing before its ledger stamp.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');

// Advisory lock key — distinct from tackle-srv (873492874) so the two
// services never contend on the same lock.
const NEBULA_MIGRATION_LOCK_KEY = 873492875;

const FILE_RE = /^(\d{3})-.*\.sql$/;

function descriptionFromFilename(filename: string): string {
  return filename
    .replace(/^\d{3}-/, '')
    .replace(/\.sql$/, '')
    .replace(/-/g, ' ');
}

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SET search_path TO nebula');
    await client.query(`SELECT pg_advisory_lock(${NEBULA_MIGRATION_LOCK_KEY})`);
    try {
      // Ensure the ledger exists even if baseline 41 was never applied.
      await client.query(`
        CREATE TABLE IF NOT EXISTS nebula.schema_version (
          version     INTEGER PRIMARY KEY,
          description TEXT NOT NULL,
          applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      const current = await client.query(
        'SELECT COALESCE(MAX(version), 0) AS v FROM nebula.schema_version'
      );
      const currentVersion = Number(current.rows[0].v);

      const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => FILE_RE.test(f))
        .sort();

      let applied = 0;
      for (const file of files) {
        const version = parseInt(file.slice(0, 3), 10);
        if (version <= currentVersion) continue;

        const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        const description = descriptionFromFilename(file);
        console.log(`[nebula-migrations] applying v${version}: ${description}`);
        await client.query(sql);
        await client.query(
          `INSERT INTO nebula.schema_version (version, description)
           VALUES ($1, $2)
           ON CONFLICT (version) DO NOTHING`,
          [version, description]
        );
        applied++;
        console.log(`[nebula-migrations] v${version} applied`);
      }

      if (applied === 0) {
        console.log(
          `[nebula-migrations] up to date (ledger at v${currentVersion}, no pending files)`
        );
      }
    } finally {
      await client.query(`SELECT pg_advisory_unlock(${NEBULA_MIGRATION_LOCK_KEY})`);
    }
  } finally {
    client.release();
  }
}
