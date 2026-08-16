-- Harvest with two interleaved candidates from the same transcript
INSERT INTO resolution.canonical_asset (id, canonical_asset_id, asset_kind) VALUES
    ('11111111-1111-1111-1111-111111111101', 'harvest:2026-08-12-arch-review', 'Harvest'),
    ('11111111-1111-1111-1111-111111111102', 'candidate:doc-store-access',     'Candidate'),
    ('11111111-1111-1111-1111-111111111103', 'candidate:doc-store-indexing',   'Candidate'),
    ('11111111-1111-1111-1111-111111111104', 'requirement:doc-store-parent',   'Requirement'),
    ('11111111-1111-1111-1111-111111111105', 'requirement:doc-store-access',   'Requirement'),
    ('11111111-1111-1111-1111-111111111106', 'requirement:doc-store-indexing', 'Requirement');

INSERT INTO resolution.harvest (id, asset_id, source_path, source_filename, total_candidates) VALUES
    ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101',
     'transcripts/2026-08-12-arch-review.md', '2026-08-12-arch-review.md', 2);

-- two candidates, from two DIFFERENT (interleaved) spans of the same transcript
INSERT INTO resolution.candidate (id, asset_id, harvest_id, title, intent_description, status, compilation_readiness) VALUES
    ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111102',
     '22222222-2222-2222-2222-222222222201', 'Document store access layer',
     'Needs a document database for the candidate/observation payloads', 'promoted', 0.910),
    ('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111103',
     '22222222-2222-2222-2222-222222222201', 'Document store indexing strategy',
     'Needs a compound index on (asset_concept_id, source_artifact_id)', 'pending', 0.300);

INSERT INTO resolution.candidate_segment_set (candidate_id, segment_set_id, role) VALUES
    ('33333333-3333-3333-3333-333333333301', '44444444-4444-4444-4444-444444444401', 'primary'),
    ('33333333-3333-3333-3333-333333333302', '44444444-4444-4444-4444-444444444402', 'primary');

-- one parent requirement ("user story"), two children — one from each candidate
INSERT INTO resolution.requirement (id, asset_id, source_type, req_type, title, description, compilation_status) VALUES
    ('55555555-5555-5555-5555-555555555501', '11111111-1111-1111-1111-111111111104',
     'candidate', 'Story', 'Persist Nexus observations in a document store',
     'Parent story rolling up document-store access and indexing', 'draft');

INSERT INTO resolution.requirement (id, asset_id, candidate_id, parent_id, source_type, req_type, title, compilation_status) VALUES
    ('55555555-5555-5555-5555-555555555502', '11111111-1111-1111-1111-111111111105',
     '33333333-3333-3333-3333-333333333301', '55555555-5555-5555-5555-555555555501',
     'candidate', 'Task', 'Document store access layer', 'compiled'),
    ('55555555-5555-5555-5555-555555555503', '11111111-1111-1111-1111-111111111106',
     '33333333-3333-3333-3333-333333333302', '55555555-5555-5555-5555-555555555501',
     'candidate', 'Task', 'Document store indexing strategy', 'draft');  -- NOT yet compiled

INSERT INTO resolution.requirement_segment_set (requirement_id, segment_set_id, role) VALUES
    ('55555555-5555-5555-5555-555555555502', '44444444-4444-4444-4444-444444444401', 'primary'),
    ('55555555-5555-5555-5555-555555555503', '44444444-4444-4444-4444-444444444402', 'primary');
