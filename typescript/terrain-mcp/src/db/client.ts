import pg from "pg";

const pool = new pg.Pool({
  host: process.env.PGHOST || "localhost",
  port: parseInt(process.env.PGPORT || "5432", 10),
  database: process.env.PGDATABASE || "nexus",
  user: process.env.PGUSER || "pguser",
  password: process.env.PGPASSWORD || "pgpass",
});

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const result = await pool.query({ text: sql, values: params });
  return result.rows as T[];
}

export async function closePool(): Promise<void> {
  await pool.end();
}
