// Migration 001: Add harvest_candidates table and backfill
// Run: node migrations/run-001.js
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://pguser:pgpass@localhost:5432/nexus',
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('SET search_path TO nebula');

    // 1. Ensure update_updated_at() exists in the nebula schema
    const funcCheck = await client.query(
      "SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE p.proname = 'update_updated_at' AND n.nspname = 'nebula'"
    );
    if (funcCheck.rows.length === 0) {
      console.log('Creating update_updated_at() in nebula schema...');
      await client.query(`
        CREATE OR REPLACE FUNCTION update_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      console.log('Function created.');
    } else {
      console.log('update_updated_at() already exists in nebula schema.');
    }

    // 2. Drop existing harvest_candidates if it exists (from failed prior run)
    await client.query('DROP TABLE IF EXISTS harvest_candidates CASCADE');
    
    // 3. Create table — no FKs because systems/subsystems/features/harvests are views
    //    in the bitemporal schema. Referential integrity is application-enforced.
    console.log('Creating harvest_candidates table...');
    await client.query(`
      CREATE TABLE harvest_candidates (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        harvest_id        UUID NOT NULL,
        title             TEXT NOT NULL,
        intent_description TEXT,
        implementation_notes JSONB NOT NULL DEFAULT '[]',
        code_snippets     JSONB NOT NULL DEFAULT '[]',
        open_questions    JSONB NOT NULL DEFAULT '[]',
        tags              TEXT[] NOT NULL DEFAULT '{}',
        status            TEXT,
        system_id         UUID,
        subsystem_id      UUID,
        feature_id        UUID,
        valid_from        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        valid_until       TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('Table created.');

    // 4. Create indexes
    await client.query('CREATE INDEX idx_hc_harvest ON harvest_candidates(harvest_id)');
    await client.query('CREATE INDEX idx_hc_system ON harvest_candidates(system_id)');
    await client.query('CREATE INDEX idx_hc_subsystem ON harvest_candidates(subsystem_id)');
    await client.query('CREATE INDEX idx_hc_feature ON harvest_candidates(feature_id)');
    await client.query('CREATE INDEX idx_hc_tags ON harvest_candidates USING GIN(tags)');
    await client.query('CREATE INDEX idx_hc_valid ON harvest_candidates(valid_from, valid_until)');
    console.log('Indexes created.');

    // 5. Create trigger
    await client.query(`
      DO $$
      BEGIN
        CREATE TRIGGER trg_harvest_candidates_updated_at
          BEFORE UPDATE ON harvest_candidates
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      END $$;
    `);
    console.log('Trigger created.');

    // 6. Backfill from existing harvests
    const { rows: harvests } = await client.query(
      "SELECT id, candidates FROM harvests WHERE candidates IS NOT NULL AND jsonb_array_length(candidates) > 0"
    );
    let count = 0;
    for (const h of harvests) {
      for (const c of h.candidates) {
        const title = c.title || 'Untitled';
        const exists = await client.query(
          'SELECT 1 FROM harvest_candidates WHERE harvest_id = $1 AND title = $2',
          [h.id, title]
        );
        if (exists.rows.length > 0) continue;

        let implNotes = '[]';
        if (c.implementationNotes) implNotes = JSON.stringify(c.implementationNotes);
        else if (c.implementation_notes) implNotes = JSON.stringify(c.implementation_notes);

        let codeSnips = '[]';
        if (c.codeSnippets) codeSnips = JSON.stringify(c.codeSnippets);
        else if (c.code_snippets) codeSnips = JSON.stringify(c.code_snippets);

        let questions = '[]';
        if (c.openQuestions) questions = JSON.stringify(c.openQuestions);
        else if (c.open_questions) questions = JSON.stringify(c.open_questions);

        let tagArr = '{}';
        if (Array.isArray(c.tags)) tagArr = JSON.stringify(c.tags);

        await client.query(
          `INSERT INTO harvest_candidates (harvest_id, title, intent_description, implementation_notes, code_snippets, open_questions, tags, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            h.id, title,
            c.intentDescription || c.intent_description || null,
            implNotes, codeSnips, questions,
            tagArr,
            c.status || c.promotionStatus || null,
          ]
        );
        count++;
      }
    }
    console.log(`Backfilled ${count} candidates from ${harvests.length} harvests.`);

    console.log('\nMigration 001 complete.');
  } catch (e) {
    console.error('Migration failed:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
