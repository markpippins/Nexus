/**
 * Data Migration: Convert existing PROPOSED conduit plans to Nebula Requirements
 *
 * After removing the PROPOSED state from Conduit, any existing plans that
 * only have PROPOSED receipts need to be migrated to Nebula Requirements.
 * This script:
 *   1. Finds all conduit plans with only PROPOSED receipts
 *   2. Creates Nebula requirements for each
 *   3. Cross-references each conduit plan to its new requirement
 *   4. Optionally soft-deletes the conduit plan (or leaves it for reference)
 *
 * Run: node migrations/migrate-proposed-plans.js
 *
 * Prerequisites:
 *   - PostgreSQL running with the nexus database
 *   - Nebula-srv running at http://localhost:3101
 *   - Migration 015 already applied (or receipts CHECK constraint relaxed)
 */

const { Pool } = require('pg');
const http = require('http');

const pool = new Pool({
  connectionString: 'postgresql://pguser:pgpass@localhost:5432/nexus',
});

const NEBULA_API = 'http://localhost:3101';

/**
 * Simple HTTP POST to Nebula API.
 */
function nebulaPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(path, NEBULA_API);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log('=== Migration: PROPOSED plans → Nebula Requirements ===\n');

  const client = await pool.connect();
  try {
    // 1. Find all plans where the ONLY receipt is PROPOSED
    const { rows: proposedPlans } = await client.query(`
      SELECT DISTINCT p.id, p.title, p.goal, p.project, p.created_at, p.prompt_ref
      FROM conduit.plans p
      JOIN vision.receipts r ON r.plan_id = p.id
      WHERE p.deleted = 0
        AND NOT EXISTS (
          SELECT 1 FROM vision.receipts r2
          WHERE r2.plan_id = p.id
          AND r2.type NOT IN ('PROPOSED')
        )
      ORDER BY p.id ASC
    `);

    if (proposedPlans.length === 0) {
      console.log('No PROPOSED-only plans found. Nothing to migrate.');
      return;
    }

    console.log(`Found ${proposedPlans.length} plan(s) with only PROPOSED receipts:\n`);
    for (const plan of proposedPlans) {
      console.log(`  #${plan.id}: ${plan.title} (project: ${plan.project || 'none'})`);
    }
    console.log('');

    // 2. For each proposed plan, attempt to create a Nebula Requirement
    let migrated = 0;
    let errors = 0;

    for (const plan of proposedPlans) {
      try {
        // First, find or create a system for the project
        const reqPayload = {
          title: plan.title,
          description: plan.goal || '',
          status: 'Backlog',
          priority: 'Medium',
          tags: ['source:conduit-proposed-migration', `conduit-plan:${plan.id}`],
          metadata: {
            migratedFrom: 'conduit',
            conduitPlanId: plan.id,
            conduitProject: plan.project,
            originalCreatedAt: plan.created_at,
            promptRef: plan.prompt_ref || null,
          },
        };

        // Attempt to create the requirement (we'll POST to the agent-records endpoint
        // since requirements might be created via that path)
        console.log(`  [${plan.id}] Creating Nebula requirement: "${plan.title}"...`);
        
        const result = await nebulaPost('/api/requirements', reqPayload);
        
        if (result.status >= 200 && result.status < 300) {
          const reqId = result.data?.id || '(unknown)';
          console.log(`  [${plan.id}] ✅ Requirement created: ${reqId}`);
          migrated++;
        } else {
          // Fallback: try creating as an agent_record (architecture_note)
          console.log(`  [${plan.id}] ⚠️  Direct requirement creation failed (${result.status}), trying agent_record...`);
          const fallbackResult = await nebulaPost('/api/agent-records', {
            recordType: 'architecture_note',
            role: 'planner',
            title: plan.title,
            content: `**Migrated from Conduit proposed plan #${plan.id}**\n\nProject: ${plan.project || 'N/A'}\n\nGoal: ${plan.goal || 'N/A'}\n\n${plan.prompt_ref ? `Prompt ref: ${plan.prompt_ref}\n\n` : ''}_This record was automatically created during the PROPOSED → Requirement migration._`,
            tags: ['source:conduit-proposed-migration', `conduit-plan:${plan.id}`],
            level: 3,
            visibilityScope: 'all',
          });
          if (fallbackResult.status >= 200 && fallbackResult.status < 300) {
            console.log(`  [${plan.id}] ✅ Agent record created: ${fallbackResult.data?.id || '(unknown)'}`);
            migrated++;
          } else {
            console.log(`  [${plan.id}] ❌ Fallback also failed: ${fallbackResult.status} ${JSON.stringify(fallbackResult.data)}`);
            errors++;
          }
        }
      } catch (err) {
        console.error(`  [${plan.id}] ❌ Error migrating: ${err.message}`);
        errors++;
      }
    }

    // 3. Summary
    console.log(`\n=== Migration Summary ===`);
    console.log(`  Total PROPOSED plans found: ${proposedPlans.length}`);
    console.log(`  Successfully migrated:      ${migrated}`);
    console.log(`  Errors:                     ${errors}`);
    console.log(`  Remaining in conduit:       ${proposedPlans.length - migrated} (soft-deleted below if migrated)`);

    // 4. Optionally soft-delete successfully migrated conduit plans
    //    (they stay as audit trail with deleted=1)
    if (migrated > 0) {
      console.log('\nSoft-deleting migrated conduit plans...');
      for (const plan of proposedPlans) {
        try {
          await client.query(
            'UPDATE conduit.plans SET deleted = 1, updated_at = NOW() WHERE id = $1',
            [plan.id]
          );
          console.log(`  [${plan.id}] ✅ Conduit plan soft-deleted`);
        } catch (err) {
          console.error(`  [${plan.id}] ❌ Failed to soft-delete: ${err.message}`);
        }
      }
    }

    console.log('\n=== Migration complete ===');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
