// ═══════════════════════════════════════════════════════════════════════
//  Seed Block Segmentation — populate conversation_snapshots and
//  conversation_blocks from existing nebula.harvests docklang data.
//
//  Idempotent: skips harvests that already have a conversation_snapshot
//  (matched by conversation_id = harvest.id).
//
//  Usage:
//    npx ts-node migrations/seed-block-segmentation.ts
// ═══════════════════════════════════════════════════════════════════════

import { Pool } from 'pg';
import * as crypto from 'crypto';

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER || 'pguser',
  password: process.env.PGPASSWORD || 'pgpass',
  database: process.env.PGDATABASE || 'nexus',
});

interface Counts {
  harvests_scanned: number;
  snapshots_created: number;
  snapshots_skipped: number;
  blocks_inserted: number;
  harvests_no_blocks: number;
  errors: number;
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex').slice(0, 16);
}

async function seed(): Promise<void> {
  const counts: Counts = {
    harvests_scanned: 0,
    snapshots_created: 0,
    snapshots_skipped: 0,
    blocks_inserted: 0,
    harvests_no_blocks: 0,
    errors: 0,
  };

  // ── 1. Find harvests with docklang discourse_units ──────────────────
  console.log('Scanning harvests with docklang discourse_units...');

  const { rows: harvests } = await pool.query(
    `SELECT h.id, h.source_filename, h.source_path, h.docklang
     FROM nebula.harvests h
     WHERE h.docklang IS NOT NULL
       AND h.docklang ? 'discourse_units'
       AND jsonb_array_length(h.docklang -> 'discourse_units') > 0
     ORDER BY h.created_at`,
  );

  console.log(`Found ${harvests.length} harvests with discourse_units\n`);
  counts.harvests_scanned = harvests.length;

  // ── 2. For each harvest, create snapshot + blocks ────────────────────
  for (const harvest of harvests) {
    const harvestId: string = harvest.id;
    const filename: string = harvest.source_filename || 'untitled';
    const sourcePath: string = harvest.source_path || '';
    const docklang = harvest.docklang;

    try {
      // Idempotency: skip if snapshot already exists for this conversation
      const { rows: [existing] } = await pool.query(
        `SELECT id FROM nebula.conversation_snapshots
         WHERE conversation_id = $1`,
        [harvestId],
      );
      if (existing) {
        counts.snapshots_skipped++;
        continue;
      }

      // Extract discourse units
      const units: any[] = docklang.discourse_units || [];
      if (units.length === 0) {
        counts.harvests_no_blocks++;
        continue;
      }

      // Compute source hash from the full docklang JSON
      const sourceHash = hashContent(JSON.stringify(docklang));

      // Count total blocks
      let totalBlocks = 0;
      for (const unit of units) {
        totalBlocks += (unit.blocks || []).length;
      }

      if (totalBlocks === 0) {
        counts.harvests_no_blocks++;
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Create snapshot
        const { rows: [snapshot] } = await client.query(
          `INSERT INTO nebula.conversation_snapshots
           (conversation_id, snapshot_index, source_hash, capture_mode,
            block_count, created_by)
           VALUES ($1, 0, $2, 'IMPORTER', $3, 'SYSTEM')
           RETURNING id`,
          [harvestId, sourceHash, totalBlocks],
        );
        const snapshotId: string = snapshot.id;

        // Insert blocks
        let blockIndex = 0;
        for (const unit of units) {
          const turnHeading: string = unit.heading || '';
          const blocks = unit.blocks || [];

          for (const block of blocks) {
            const blockType: string = block.type || 'paragraph';
            const content: string = block.content || '';
            const contentHash = hashContent(content);
            const provenance = block.provenance || {};

            await client.query(
              `INSERT INTO nebula.conversation_blocks
               (conversation_id, snapshot_id, block_index, parent_turn_id,
                block_type, content_md, content_hash)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                harvestId,
                snapshotId,
                blockIndex,
                turnHeading || null,
                blockType,
                content,
                contentHash,
              ],
            );
            blockIndex++;
            counts.blocks_inserted++;
          }
        }

        await client.query('COMMIT');
        counts.snapshots_created++;
        console.log(`  [${counts.snapshots_created}] ${filename}: ${blockIndex} blocks`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      counts.errors++;
      console.error(`  ERROR [${filename}]: ${err.message}`);
    }
  }

  // ── 3. Report ──────────────────────────────────────────────────────
  console.log('\nSeed complete:');
  console.log(`  Harvests scanned:     ${counts.harvests_scanned}`);
  console.log(`  Snapshots created:    ${counts.snapshots_created}`);
  console.log(`  Snapshots skipped:    ${counts.snapshots_skipped}`);
  console.log(`  Blocks inserted:      ${counts.blocks_inserted}`);
  console.log(`  Harvests no blocks:   ${counts.harvests_no_blocks}`);
  console.log(`  Errors:               ${counts.errors}`);

  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
