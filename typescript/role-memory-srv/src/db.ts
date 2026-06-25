import { Pool } from "pg";

export interface MemoryRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body_md: string;
  tags: string[];
  triggers: string[];
  mcp_tools: string[];
  created_at: string;
  updated_at: string;
}

export interface RoleMemoryRow {
  id: string;
  memory_id: string;
  role: string;
  as_of_dt: string;
  expiration_dt: string | null;
}

let pool: Pool;

export function initDb(): Pool {
  const dsn =
    process.env.MEMORY_PG_DSN ||
    process.env.CONDUIT_PG_DSN ||
    "postgresql://pguser:pgpass@localhost:5432/nexus";

  pool = new Pool({
    connectionString: dsn,
    max: 5,
    idleTimeoutMillis: 30000,
  });

  return pool;
}

export function getDb(): Pool {
  if (!pool) throw new Error("DB not initialized. Call initDb() first.");
  return pool;
}

/**
 * Fetch all memory procedures with their active role assignments.
 * Returns a map: slug → { procedure, roles[] }
 */
export async function fetchAllActiveMemory(): Promise<
  Map<string, { procedure: MemoryRow; roles: string[] }>
> {
  const db = getDb();

  const procedures = await db.query<MemoryRow>(
    `SELECT * FROM tackle.memory ORDER BY slug`
  );

  const roleAssignments = await db.query<RoleMemoryRow>(
    `SELECT * FROM tackle.role_memory
     WHERE expiration_dt IS NULL
     ORDER BY role, as_of_dt DESC`
  );

  // Build role lookup: memory_id → [role, ...]
  const roleMap = new Map<string, string[]>();
  for (const row of roleAssignments.rows) {
    const roles = roleMap.get(row.memory_id) || [];
    roles.push(row.role);
    roleMap.set(row.memory_id, roles);
  }

  // Build result map
  const result = new Map<string, { procedure: MemoryRow; roles: string[] }>();
  for (const proc of procedures.rows) {
    result.set(proc.slug, {
      procedure: proc,
      roles: roleMap.get(proc.id) || [],
    });
  }

  return result;
}

/**
 * Check whether any role_memory rows have changed since a given timestamp.
 * Used by the memory_check_since MCP tool.
 */
export async function hasChangesSince(
  role: string,
  since: Date
): Promise<boolean> {
  const db = getDb();
  const result = await db.query(
    `SELECT 1 FROM tackle.role_memory
     WHERE role = $1
       AND (as_of_dt > $2 OR (expiration_dt IS NOT NULL AND expiration_dt > $2))
     LIMIT 1`,
    [role, since.toISOString()]
  );
  return result.rowCount !== null && result.rowCount > 0;
}
