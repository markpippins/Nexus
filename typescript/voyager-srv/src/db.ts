import { Pool } from 'pg';

// Env overrides added for container deploys (vanadium failover tier);
// defaults preserve the native localhost configuration.
export const pool = new Pool({
  host: process.env.PG_HOST || process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PG_PORT || process.env.PGPORT || '5432', 10),
  user: process.env.PG_USER || process.env.PGUSER || 'pguser',
  password: process.env.PG_PASSWORD || process.env.PGPASSWORD || 'pgpass',
  database: process.env.PG_DB_NAME || process.env.PGDATABASE || 'nexus',
  options: '-c search_path=voyager',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
