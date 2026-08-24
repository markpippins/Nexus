/**
 * draft-srv integration test — DB Workbench API against the live local
 * PostgreSQL instance (docker pgvector_db, exposed on host :5432).
 *
 * Covers the acceptance chain for to-do b05cfa3e:
 *   1. engines registry shape (postgres on, mysql provisioned-off)
 *   2. test-connection true-positive AND true-negative (fail-visible)
 *   3. schema discovery returns real schemas/tables/columns/PKs
 *   4. SELECT round-trip
 *   5. DDL round-trip: CREATE TABLE → INSERT → verify via discovery → DROP
 *
 * Usage: npm test   (draft-srv must be running on :3170)
 */

const BASE = `http://localhost:${process.env.PORT || 3170}`;

// Local instance creds (pgvector_db container, host-exposed 5432).
// These are the same creds every nexus bin/ script uses via docker exec.
const SPEC = {
  engine: 'postgres',
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: 'nexus',
  username: 'pguser',
  password: process.env.PGPASSWORD || 'pgpass',
};

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { failures++; console.error(`  ✗ FAIL: ${msg}`); }
  else { console.log(`  ✓ ${msg}`); }
}

async function api(method: string, path: string, body?: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsed: any = null;
  try { parsed = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: parsed };
}

async function main() {
  console.log('=== draft-srv db-workbench integration test ===\n');

  // 1. Engines registry
  console.log('1. GET /api/db/engines');
  const eng = await api('GET', '/api/db/engines');
  assert(eng.status === 200, 'engines endpoint responds');
  const postgres = eng.body?.engines?.find((e: any) => e.id === 'postgres');
  const mysql = eng.body?.engines?.find((e: any) => e.id === 'mysql');
  assert(postgres?.available === true, 'postgres available:true');
  assert(mysql && mysql.available === false && mysql.missingDeps.includes('mysql2'),
    'mysql provisioned-off with missingDeps:[mysql2]');

  // 2a. test-connection positive
  console.log('2. POST /api/db/test-connection');
  const ok = await api('POST', '/api/db/test-connection', SPEC);
  assert(ok.status === 200 && ok.body?.success === true, `connects to local pg (${ok.body?.latencyMs}ms)`);

  // 2b. test-connection negative — fail-visible, not a crash
  const bad = await api('POST', '/api/db/test-connection', { ...SPEC, port: 59999 });
  assert(bad.status === 502 && bad.body?.success === false, 'bad conn → 502 success:false (fail-visible)');

  // 3. Schema discovery
  console.log('3. POST /api/db/schemas');
  const disc = await api('POST', '/api/db/schemas', SPEC);
  assert(disc.status === 200 && Array.isArray(disc.body?.schemas), 'discovery returns schemas[]');
  const schemas = disc.body.schemas || [];
  const publicSchema = schemas.find((s: any) => s.name === 'public');
  assert(!!publicSchema, 'public schema present');
  assert((publicSchema?.tables?.length || 0) > 0, `public has tables (${publicSchema?.tables?.length})`);
  const withCols = (publicSchema?.tables || []).find((t: any) => t.columns.length > 0);
  assert(!!withCols, 'tables carry columns');
  const withPk = (publicSchema?.tables || []).some((t: any) => t.columns.some((c: any) => c.isPrimaryKey));
  assert(withPk, 'primary keys detected');
  // nebula schema should exist in this database
  const nebula = schemas.find((s: any) => s.name === 'nebula');
  assert(!!nebula, 'nebula schema discovered');

  // 4. SELECT round-trip
  console.log('4. POST /api/db/query — SELECT');
  const sel = await api('POST', '/api/db/query', {
    connection: SPEC,
    sql: "SELECT table_name FROM information_schema.tables WHERE table_schema='nebula' LIMIT 5",
  });
  assert(sel.status === 200 && sel.body?.status === 'success', 'SELECT succeeds');
  assert(sel.body?.columns?.[0] === 'table_name', 'columns hydrated from fields');
  assert((sel.body?.rows?.length || 0) > 0, 'rows returned');
  assert(typeof sel.body?.executionTimeMs === 'number', 'executionTimeMs present');

  // 5. DDL round-trip
  console.log('5. DDL round-trip CREATE → INSERT → discover → DROP');
  const create = await api('POST', '/api/db/query', {
    connection: SPEC,
    sql: 'CREATE TABLE draft_srv_e2e_probe (id SERIAL PRIMARY KEY, label TEXT NOT NULL)',
  });
  assert(create.status === 200 && create.body?.status === 'success', 'CREATE TABLE succeeds');

  const insert = await api('POST', '/api/db/query', {
    connection: SPEC,
    sql: "INSERT INTO draft_srv_e2e_probe (label) VALUES ('probe-row') RETURNING id",
  });
  assert(insert.status === 200 && insert.body?.rowCount === 1, 'INSERT RETURNING returns the row');
  assert(Number.isInteger(insert.body?.rows?.[0]?.id), 'serial id materialized');

  const rediscover = await api('POST', '/api/db/schemas', SPEC);
  const probeTable = (rediscover.body?.schemas || [])
    .find((s: any) => s.name === 'public')?.tables?.find((t: any) => t.name === 'draft_srv_e2e_probe');
  assert(!!probeTable, 'newly created table appears in discovery');
  assert(probeTable?.columns?.some((c: any) => c.name === 'label' && !c.isNullable), 'NOT NULL column detected');

  const drop = await api('POST', '/api/db/query', {
    connection: SPEC,
    sql: 'DROP TABLE draft_srv_e2e_probe',
  });
  assert(drop.status === 200 && drop.body?.status === 'success', 'DROP TABLE succeeds');

  const postDrop = await api('POST', '/api/db/query', {
    connection: SPEC,
    sql: 'SELECT * FROM draft_srv_e2e_probe',
  });
  assert(postDrop.body?.status === 'error' && /does not exist/i.test(postDrop.body?.error || ''),
    'post-DROP query errors visibly (fail-visible doctrine)');

  console.log(failures === 0 ? '\n=== ALL ASSERTIONS PASSED ===' : `\n=== ${failures} FAILURES ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('test crashed:', err);
  process.exit(1);
});
