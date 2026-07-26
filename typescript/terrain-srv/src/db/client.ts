import pg from "pg";

const pool = new pg.Pool({
  host: process.env.PGHOST || "localhost",
  port: parseInt(process.env.PGPORT || "5432", 10),
  database: process.env.PGDATABASE || "nexus",
  user: process.env.PGUSER || "pguser",
  password: process.env.PGPASSWORD || "pgpass",
  // Default search_path keeps SQL in routes/*.ts unambiguous against the
  // terrain.* tables that define the topology registry.
  options: "-c search_path=terrain,public",
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const result = await pool.query({ text: sql, values: params });
  return result.rows as T[];
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export default pool;
