-- Minimal mirror of vision.work_requests -- just the columns needed for
-- the comparator (real DDL had more, this is a faithful subset, not a
-- redesign).
CREATE SCHEMA IF NOT EXISTS vision;
CREATE TABLE vision.work_requests (
    id                     uuid NOT NULL,
    work_request_uuid      text,
    status                 text NOT NULL DEFAULT 'pending',
    nexus_work_request_id  text
);

INSERT INTO resolution.representation (id, concept_id, label, schema_name, table_name, owning_subsystem_id, raw_metadata)
SELECT '11000000-0000-0000-0000-000000000011', c.id, 'vision.work_requests (LOSM satellite)', 'vision', 'work_requests', 3,
       '{"note": "explicitly links to nebula as canonical per its own comment -- not an independent equally-authoritative source"}'::jsonb
FROM resolution.concept c WHERE c.name = 'WorkRequest';

-- declared 'derived', not 'equivalent' -- vision.work_requests tracks
-- nebula's canonical record, it doesn't independently assert the same
-- fact with equal authority.
INSERT INTO resolution.representation_relationship (from_representation_id, to_representation_id, relationship_type, notes)
SELECT r.id, '11000000-0000-0000-0000-000000000011', 'derived',
       'vision.work_requests explicitly comments that it links to the canonical nebula record -- it is a tracking satellite, not a second source of truth.'
FROM resolution.representation r
JOIN resolution.concept c ON c.id = r.concept_id AND c.name = 'WorkRequest'
WHERE r.table_name = 'work_request';

-- which columns are supposed to agree, when checking a relationship for
-- live disagreement (as opposed to representation_relationship's static,
-- class-level fidelity claim)
CREATE TABLE resolution.representation_comparison (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    representation_relationship_id uuid NOT NULL REFERENCES resolution.representation_relationship(id),
    from_column               text NOT NULL,
    to_column                 text NOT NULL,
    notes                     text
);

INSERT INTO resolution.representation_comparison (representation_relationship_id, from_column, to_column, notes)
SELECT rr.id, 'business_status', 'status', 'Known vocabulary mismatch, documented many turns ago, never previously checked as live data.'
FROM resolution.representation_relationship rr
WHERE rr.to_representation_id = '11000000-0000-0000-0000-000000000011';

-- real test data: our WR, tracked in vision under a status that was never
-- reconciled with resolution's vocabulary
INSERT INTO vision.work_requests (id, work_request_uuid, status, nexus_work_request_id)
VALUES (gen_random_uuid(), 'workrequest:wr-mongo-wiring', 'pending', '90000000-0000-0000-0000-000000000002');
