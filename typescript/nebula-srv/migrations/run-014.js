// Migration 014: Evidence Links — harvest→knowledge bridge table
// Run: node migrations/run-014.js
// Requires: knowledge schema, knowledge.graph_entities table, nebula.harvests_history,
//           nebula.harvest_candidates
//
// This migration can also be applied via psql:
//   psql -h localhost -U pguser -d nexus -f migrations/014-evidence-links.sql

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: 'postgresql://pguser:pgpass@localhost:5432/nexus',
});

async function run() {
  console.log('Running Migration 014: Evidence Links...\n');

  // Check prerequisites
  const client = await pool.connect();
  try {
    // 1. Check knowledge schema exists
    const schemaCheck = await client.query(
      "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'knowledge'"
    );
    if (schemaCheck.rows.length === 0) {
      console.log('Creating knowledge schema...');
      await client.query('CREATE SCHEMA IF NOT EXISTS knowledge');
    }

    // 2. Check graph_entities table exists
    const tableCheck = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'knowledge' AND table_name = 'graph_entities'"
    );
    if (tableCheck.rows.length === 0) {
      console.log('WARNING: knowledge.graph_entities does not exist yet.');
      console.log('The evidence_links table will be created without a FK constraint.');
      console.log('Run knowledge-graph.sql first if you want FK enforcement.\n');
    }

    // 3. Check evidence_links doesn't already exist
    const existsCheck = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'knowledge' AND table_name = 'evidence_links'"
    );
    if (existsCheck.rows.length > 0) {
      console.log('knowledge.evidence_links already exists. Checking structure...');
      const colCheck = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'knowledge' AND table_name = 'evidence_links'
        ORDER BY ordinal_position
      `);
      console.log(`Found ${colCheck.rows.length} columns.`);
      colCheck.rows.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));
      console.log('\nMigration 014 already applied. Skipping.');
      return;
    }
  } finally {
    client.release();
  }

  // Read and apply the SQL migration file
  const sqlPath = path.join(__dirname, '014-evidence-links.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log(`Applying migration from ${path.basename(sqlPath)}...`);

  try {
    await pool.query(sql);
    console.log('\nMigration 014 applied successfully.');

    // Verify
    const { rows: tables } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'knowledge' AND table_name = 'evidence_links'"
    );
    if (tables.length > 0) {
      const { rows: cols } = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'knowledge' AND table_name = 'evidence_links'
        ORDER BY ordinal_position
      `);
      console.log(`\nVerified: knowledge.evidence_links (${cols.length} columns)`);
      cols.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));
    }
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run().catch(e => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
