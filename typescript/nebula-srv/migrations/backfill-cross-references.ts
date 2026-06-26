import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER || 'pguser',
  password: process.env.PGPASSWORD || 'pgpass',
  database: process.env.PGDATABASE || 'nexus',
  options: '-c search_path=nebula,conduit',
});

interface Counts {
  references_plan: number;
  same_thread_as: number;
  depends_on: number;
  prompted_by: number;
  skipped: number;
}

async function insertOnce(
  pool: Pool,
  counts: Counts,
  sourceType: string,
  sourceId: string,
  targetType: string,
  targetId: string,
  relType: string,
  metadata: Record<string, unknown> = {}
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM nebula.cross_references
     WHERE source_type = $1 AND source_id = $2
       AND target_type = $3 AND target_id = $4
       AND rel_type = $5`,
    [sourceType, sourceId, targetType, targetId, relType]
  );
  if (rows.length > 0) {
    counts.skipped++;
    return false;
  }
  await pool.query(
    `INSERT INTO nebula.cross_references (source_type, source_id, target_type, target_id, rel_type, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sourceType, sourceId, targetType, targetId, relType, JSON.stringify(metadata)]
  );
  return true;
}

async function backfillCrossReferences(): Promise<void> {
  const counts: Counts = {
    references_plan: 0,
    same_thread_as: 0,
    depends_on: 0,
    prompted_by: 0,
    skipped: 0,
  };

  // ── 1. agent_records.plan_ref → references_plan ────────────────
  console.log('[1/4] Scanning agent_records.plan_ref...');
  const { rows: planRefRows } = await pool.query(
    `SELECT id::text, plan_ref FROM nebula.agent_records WHERE plan_ref IS NOT NULL AND plan_ref != ''`
  );
  for (const row of planRefRows) {
    if (row.plan_ref) {
      const ok = await insertOnce(pool, counts, 'agent_record', row.id, 'plan', row.plan_ref, 'references_plan');
      if (ok) counts.references_plan++;
    }
  }

  // ── 2. agent_records metadata threadRef → same_thread_as ─────
  console.log('[2/4] Scanning agent_records metadata.threadRef...');
  const { rows: threadRows } = await pool.query(
    `SELECT id::text, metadata->>'threadRef' AS thread_ref, created_at
     FROM nebula.agent_records WHERE metadata ? 'threadRef'`
  );
  const threadGroups = new Map<string, Array<{ id: string; created_at: Date }>>();
  for (const row of threadRows) {
    const key = row.thread_ref as string;
    if (!key) continue;
    if (!threadGroups.has(key)) threadGroups.set(key, []);
    threadGroups.get(key)!.push({ id: row.id, created_at: row.created_at });
  }
  for (const [, records] of threadGroups) {
    if (records.length < 2) continue;
    records.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const rootId = records[0].id;
    for (let i = 1; i < records.length; i++) {
      const ok = await insertOnce(pool, counts, 'agent_record', records[i].id, 'agent_record', rootId, 'same_thread_as');
      if (ok) counts.same_thread_as++;
    }
  }

  // ── 3. conduit.plans dependencies → depends_on ────────────────
  console.log('[3/4] Scanning conduit.plans.dependencies...');
  const { rows: depRows } = await pool.query(
    `SELECT id, dependencies FROM conduit.plans WHERE dependencies != '[]' AND dependencies != ''`
  );
  for (const row of depRows) {
    let deps: string[];
    try {
      deps = JSON.parse(row.dependencies);
    } catch {
      continue;
    }
    if (!Array.isArray(deps)) continue;
    for (const depId of deps) {
      if (depId && typeof depId === 'string') {
        const ok = await insertOnce(pool, counts, 'plan', row.id, 'plan', depId, 'depends_on');
        if (ok) counts.depends_on++;
      }
    }
  }

  // ── 4. agent_records metadata promptRef → prompted_by ─────────
  console.log('[4/4] Scanning agent_records metadata.promptRef...');
  const { rows: promptRows } = await pool.query(
    `SELECT id::text, metadata->>'promptRef' AS prompt_ref
     FROM nebula.agent_records WHERE metadata ? 'promptRef'`
  );
  for (const row of promptRows) {
    if (row.prompt_ref) {
      const ok = await insertOnce(pool, counts, 'agent_record', row.id, 'prompt', row.prompt_ref, 'prompted_by');
      if (ok) counts.prompted_by++;
    }
  }

  // ── Report ─────────────────────────────────────────────────────
  console.log('\nCross-reference backfill complete:');
  console.log(`  references_plan:  ${counts.references_plan}`);
  console.log(`  same_thread_as:   ${counts.same_thread_as}`);
  console.log(`  depends_on:       ${counts.depends_on}`);
  console.log(`  prompted_by:      ${counts.prompted_by}`);
  console.log(`  skipped (dups):   ${counts.skipped}`);

  await pool.end();
}

backfillCrossReferences().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
