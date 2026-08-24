-- =============================================================================
-- MIGRATION: resolution v11 -> v12
-- Absorbs the WorkRequest DAG capability from vision.work_request_edges_history
-- / work_request_dag -- resolution.work_request had no dependency-graph
-- structure at all until now.
--
-- work_request_edge is a genuine many-to-many join (a WR can have several
-- dependency edges), not a direct self-referencing FK like requirement.
-- parent_id. Every relationship_ref binding so far has been a single direct
-- hop. Reusing the same move as Answer -> VerifiedStatement: promote the
-- edge itself to a real concept, so two ordinary one-hop bindings compose
-- into the two-hop traversal, rather than inventing multi-hop binding
-- machinery.
-- =============================================================================

CREATE TABLE resolution.work_request_edge (
    id                       uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    parent_work_request_id   uuid        NOT NULL REFERENCES resolution.work_request(id),
    child_work_request_id    uuid        NOT NULL REFERENCES resolution.work_request(id),
    edge_type                text        NOT NULL DEFAULT 'depends_on',
    metadata                 jsonb       DEFAULT '{}'::jsonb,
    created_at               timestamptz DEFAULT now() NOT NULL,
    valid_from               timestamptz DEFAULT now() NOT NULL,
    valid_until              timestamptz DEFAULT 'infinity' NOT NULL,
    CHECK (parent_work_request_id <> child_work_request_id)
);
COMMENT ON TABLE resolution.work_request_edge IS
    'Ported from vision.work_request_edges_history. parent = upstream/prerequisite, child = downstream/dependent, matching vision''s own work_request_dag traversal direction. Only ''depends_on'' is a confirmed edge_type from the DDL alone -- others may exist in production and are not invented here.';

CREATE UNIQUE INDEX idx_work_request_edge_active_pair
    ON resolution.work_request_edge (parent_work_request_id, child_work_request_id, edge_type)
    WHERE (valid_until = 'infinity');

INSERT INTO resolution.concept (name, description)
VALUES ('WorkRequestEdge', 'A dependency edge between two WorkRequests -- parent is upstream/prerequisite, child is downstream/dependent');

INSERT INTO resolution.representation (concept_id, label, schema_name, table_name, owning_subsystem_id)
SELECT id, 'work_request_edge table', 'resolution', 'work_request_edge', 2
FROM resolution.concept WHERE name = 'WorkRequestEdge';

INSERT INTO resolution.concept_attribute (concept_id, name, value_type, is_state_attribute)
SELECT id, 'edge_type', 'enum', false FROM resolution.concept WHERE name = 'WorkRequestEdge';

INSERT INTO resolution.concept_attribute_value (attribute_id, value)
SELECT ca.id, 'depends_on'
FROM resolution.concept_attribute ca
JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'WorkRequestEdge' AND ca.name = 'edge_type';

-- two ordinary one-hop relationships compose into the DAG traversal
INSERT INTO resolution.concept_relationship (from_concept_id, to_concept_id, relationship_type, path)
SELECT w.id, e.id, 'has_dependency', NULL
FROM resolution.concept w, resolution.concept e
WHERE w.name = 'WorkRequest' AND e.name = 'WorkRequestEdge'
UNION ALL
SELECT e.id, w.id, 'depends_on', NULL
FROM resolution.concept e, resolution.concept w
WHERE e.name = 'WorkRequestEdge' AND w.name = 'WorkRequest';

-- hop 1: from a WorkRequest, find edges where it's the dependent (child) side
INSERT INTO resolution.concept_relationship_binding
    (concept_relationship_id, from_schema, from_table, from_column, to_schema, to_table, to_column, notes)
SELECT cr.id, 'resolution', 'work_request', 'id', 'resolution', 'work_request_edge', 'child_work_request_id',
       'WorkRequest has_dependency WorkRequestEdge: find edges where I am the dependent side'
FROM resolution.concept_relationship cr
JOIN resolution.concept f ON f.id = cr.from_concept_id AND f.name = 'WorkRequest'
JOIN resolution.concept t ON t.id = cr.to_concept_id   AND t.name = 'WorkRequestEdge'
WHERE cr.relationship_type = 'has_dependency';

-- hop 2: from an edge, find the prerequisite WorkRequest. NOTE the
-- correlation column is parent_work_request_id, NOT the edge's own 'id' --
-- this is exactly the case the compiler fix below exists for.
INSERT INTO resolution.concept_relationship_binding
    (concept_relationship_id, from_schema, from_table, from_column, to_schema, to_table, to_column, notes)
SELECT cr.id, 'resolution', 'work_request_edge', 'parent_work_request_id', 'resolution', 'work_request', 'id',
       'WorkRequestEdge depends_on WorkRequest: find my prerequisite'
FROM resolution.concept_relationship cr
JOIN resolution.concept f ON f.id = cr.from_concept_id AND f.name = 'WorkRequestEdge'
JOIN resolution.concept t ON t.id = cr.to_concept_id   AND t.name = 'WorkRequest'
WHERE cr.relationship_type = 'depends_on';

-- WorkRequest.business_status existed as a real column since v2 but was
-- never registered, same gap as requirement.compilation_status before it.
INSERT INTO resolution.concept_attribute (concept_id, name, value_type, is_state_attribute)
SELECT id, 'business_status', 'enum', true FROM resolution.concept WHERE name = 'WorkRequest';

INSERT INTO resolution.concept_attribute_value (attribute_id, value)
SELECT ca.id, v.value
FROM resolution.concept_attribute ca
JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'WorkRequest' AND ca.name = 'business_status',
     (VALUES ('DRAFT'),('APPROVED'),('DISPATCHED'),('COMPLETED'),('CANCELLED')) AS v(value);

INSERT INTO resolution.concept_attribute_binding (attribute_id, schema_name, table_name, column_name)
SELECT ca.id, 'resolution', 'work_request', 'business_status'
FROM resolution.concept_attribute ca
JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'WorkRequest' AND ca.name = 'business_status';

INSERT INTO resolution.concept_state_transition (concept_id, from_value_id, to_value_id, name)
SELECT c.id, f.id, t.id, f.value || '_to_' || t.value
FROM resolution.concept c
JOIN resolution.concept_attribute ca ON ca.concept_id = c.id AND ca.name = 'business_status'
JOIN resolution.concept_attribute_value f ON f.attribute_id = ca.id
JOIN resolution.concept_attribute_value t ON t.attribute_id = ca.id
WHERE c.name = 'WorkRequest'
  AND (f.value, t.value) IN (
      ('DRAFT','APPROVED'), ('APPROVED','DISPATCHED'), ('DISPATCHED','COMPLETED'),
      ('DRAFT','CANCELLED'), ('APPROVED','CANCELLED'), ('DISPATCHED','CANCELLED')
  );
