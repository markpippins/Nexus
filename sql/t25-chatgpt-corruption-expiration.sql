-- =============================================================================
-- AC5 — ChatGPT corrupted-source expiration query (plan 1308)
--
-- Identifies every downstream record traceable to the corrupted
-- `chats/*.html` transcript sources (quarantined 2026-08-18 to
-- ./chats-quarantined/). Use to expire/retire rows before the pristine
-- markdown re-ingest (spec 4fb72533) supersedes them.
--
-- Linkage chain:
--   nebula.harvests (source_path LIKE 'chats/%')            ← corrupted source
--     ├─ harvest_candidates.harvest_id                      → 3,542 rows (2026-08-18)
--     │    └─ requirements.candidate_id                     → 1 row (2026-08-18)
--     └─ conversation_snapshots.conversation_id → segments  → 23,108 rows (2026-08-18)
--
-- NOTE: the former intent_records leg (source_ref = candidate UUID,
-- 398 rows) was dropped when V115 removed nebula.intent_records and wiped
-- its data — that leg no longer exists and is intentionally absent here.
-- Counts are best-effort provenance from 2026-08-18; re-run the summary
-- against the live DB for current numbers (harvests may already be
-- expired/empty after the quarantine).
-- =============================================================================

-- 1) Source harvests from corrupted chats/*.html
SELECT id, source_path, source_filename, created_at
FROM nebula.harvests
WHERE source_path LIKE 'chats/%';

-- 2) Harvest candidates traceable to corrupted sources
SELECT hc.id AS candidate_id, hc.title, hc.status, h.id AS harvest_id, h.source_path
FROM nebula.harvest_candidates hc
JOIN nebula.harvests h ON h.id = hc.harvest_id
WHERE h.source_path LIKE 'chats/%';

-- 3) Requirements derived from those candidates
SELECT r.id AS requirement_id, r.title, hc.id AS candidate_id, h.source_path
FROM nebula.requirements r
JOIN nebula.harvest_candidates hc ON hc.id = r.candidate_id
JOIN nebula.harvests h ON h.id = hc.harvest_id
WHERE h.source_path LIKE 'chats/%';

-- 4) Segments traceable to corrupted sources (via conversation snapshots)
SELECT s.id AS segment_id, s.title, cs.id AS snapshot_id, h.id AS harvest_id, h.source_path
FROM nebula.segments s
JOIN nebula.conversation_snapshots cs ON cs.id = s.snapshot_id
JOIN nebula.harvests h ON h.id = cs.conversation_id
WHERE h.source_path LIKE 'chats/%';

-- ── Summary ─────────────────────────────────────────────────────────────────
SELECT 'harvests'   AS entity, count(*) FROM nebula.harvests         WHERE source_path LIKE 'chats/%'
UNION ALL SELECT 'candidates', count(*) FROM nebula.harvest_candidates hc
    JOIN nebula.harvests h ON h.id = hc.harvest_id                   WHERE h.source_path LIKE 'chats/%'
UNION ALL SELECT 'requirements', count(*) FROM nebula.requirements r
    JOIN nebula.harvest_candidates hc ON hc.id = r.candidate_id
    JOIN nebula.harvests h ON h.id = hc.harvest_id                   WHERE h.source_path LIKE 'chats/%'
UNION ALL SELECT 'segments', count(*) FROM nebula.segments s
    JOIN nebula.conversation_snapshots cs ON cs.id = s.snapshot_id
    JOIN nebula.harvests h ON h.id = cs.conversation_id              WHERE h.source_path LIKE 'chats/%';
