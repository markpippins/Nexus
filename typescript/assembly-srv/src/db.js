import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: '../../.env' });
dotenv.config({ path: '.env' });

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dsn = process.env.ASSEMBLY_PG_DSN || 'postgresql://pguser:pgpass@localhost:5432/nexus';

export const pool = new Pool({
  connectionString: dsn,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error', err);
});

export async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// ── Migration runner (migrated from assembly-mcp db.ts) ────────────

export async function runMigration() {
  const client = await pool.connect();
  try {
    const migrationPath = path.resolve(__dirname, '..', 'assembly-migration.sql');
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      let applied = 0, skipped = 0, failed = 0;
      for (const stmt of statements) {
        try {
          await client.query(stmt);
          applied++;
        } catch (err) {
          const msg = err.message || '';
          if (msg.includes('already exists')) {
            skipped++; // idempotent — expected on re-runs
          } else {
            failed++;
            console.error('[assembly-srv] Migration statement failed:', msg);
          }
        }
      }
      console.log(`[assembly-srv] Migration applied from ${migrationPath} (applied=${applied}, skipped=${skipped}, failed=${failed})`);
    } else {
      console.warn(`[assembly-srv] Migration file not found: ${migrationPath}`);
    }
  } catch (err) {
    console.error('[assembly-srv] Migration runner error:', err.message);
  } finally {
    client.release();
  }
}
