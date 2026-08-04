import { Pool, types } from "pg";

// ── Keep timestamps as ISO strings (consistent with the rest of the fleet) ──
types.setTypeParser(types.builtins.TIMESTAMPTZ, (val: string) => val);
types.setTypeParser(types.builtins.TIMESTAMP, (val: string) => val);

// ── Connection (nexus DB; schema = semantics, referenced fully-qualified) ──
const pool = new Pool({
  connectionString:
    process.env.SEMANTICS_PG_DSN ||
    process.env.NEXUS_PG_DSN ||
    "postgresql://pguser:pgpass@localhost:5432/nexus",
  options: "-c search_path=semantics",
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  console.error("[semantics-srv] idle client error:", err.message);
});

export function getDb(): Pool {
  return pool;
}
