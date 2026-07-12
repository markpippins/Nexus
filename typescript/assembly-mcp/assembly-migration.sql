-- =====================================================================
-- Assembly Schema Migration — bridge tables + forum enhancements
-- Applied by assembly-mcp on startup (src/db.ts → createAssemblySchema)
-- =====================================================================

-- 1. Enhance forums with slug + description (needed by nexus-assembly UI)
ALTER TABLE assembly.forums ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE;
ALTER TABLE assembly.forums ADD COLUMN IF NOT EXISTS description TEXT;

-- Auto-populate slug from name for existing rows
UPDATE assembly.forums
SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;

-- Make slug NOT NULL after backfill
ALTER TABLE assembly.forums ALTER COLUMN slug SET NOT NULL;

-- 2. Post: add proper forum_uuid FK column (forum_id BIGINT is legacy)
ALTER TABLE assembly.posts ADD COLUMN IF NOT EXISTS forum_uuid UUID REFERENCES assembly.forums(id) ON DELETE SET NULL;

-- 3. Bridge: forums ↔ nebula.agendas
--   A forum can deliberate one or more agendas.
--   An agenda can be deliberated in one or more forums.
CREATE TABLE IF NOT EXISTS assembly.forum_agendas (
    forum_id  UUID NOT NULL REFERENCES assembly.forums(id) ON DELETE CASCADE,
    agenda_id UUID NOT NULL REFERENCES nebula.agendas(id)   ON DELETE CASCADE,
    label     TEXT,          -- optional: "primary", "cross-reference", etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (forum_id, agenda_id)
);

-- 4. Bridge: posts ↔ nebula artifacts (intent_records, requirements, agenda_items, specs)
--   A post (thread root) can reference one or more domain artifacts.
--   An artifact can be discussed in multiple posts.
CREATE TABLE IF NOT EXISTS assembly.post_artifact_refs (
    post_id       UUID NOT NULL REFERENCES assembly.posts(id) ON DELETE CASCADE,
    artifact_type TEXT NOT NULL CHECK (artifact_type IN (
        'intent_record', 'requirement', 'agenda_item', 'spec', 'implementation_plan'
    )),
    artifact_id   UUID NOT NULL,
    label         TEXT,     -- optional: "proposes", "discusses", "resolves", etc.
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (post_id, artifact_type, artifact_id)
);

-- 5. Bridge: posts/comments ↔ supporting material
--   Links posts/comments to specs, cross-references, source URLs, or attachments.
CREATE TABLE IF NOT EXISTS assembly.post_supporting_refs (
    post_id       UUID,          -- NULL if this ref belongs to a comment
    comment_id    UUID,          -- NULL if this ref belongs to a post
    ref_type      TEXT NOT NULL CHECK (ref_type IN (
        'spec', 'cross_reference', 'source_url', 'evidence', 'attachment'
    )),
    ref_value     TEXT NOT NULL,
    metadata      JSONB DEFAULT '{}'::jsonb,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT chk_supporting_target CHECK (
        (post_id IS NOT NULL AND comment_id IS NULL) OR
        (post_id IS NULL AND comment_id IS NOT NULL)
    ),
    FOREIGN KEY (post_id)    REFERENCES assembly.posts(id)    ON DELETE CASCADE,
    FOREIGN KEY (comment_id) REFERENCES assembly.comments(id) ON DELETE CASCADE
);

-- Indexes for bridge lookups
CREATE INDEX IF NOT EXISTS idx_forum_agendas_agenda   ON assembly.forum_agendas(agenda_id);
CREATE INDEX IF NOT EXISTS idx_post_artifact_refs_art  ON assembly.post_artifact_refs(artifact_type, artifact_id);
CREATE INDEX IF NOT EXISTS idx_post_artifact_refs_post ON assembly.post_artifact_refs(post_id);
CREATE INDEX IF NOT EXISTS idx_post_supporting_post    ON assembly.post_supporting_refs(post_id);
CREATE INDEX IF NOT EXISTS idx_post_supporting_comment ON assembly.post_supporting_refs(comment_id);

-- 6. Extend post_artifact_refs to include harvest + harvest_candidate types
ALTER TABLE assembly.post_artifact_refs DROP CONSTRAINT IF EXISTS post_artifact_refs_artifact_type_check;
ALTER TABLE assembly.post_artifact_refs ADD CONSTRAINT post_artifact_refs_artifact_type_check
  CHECK (artifact_type IN (
    'intent_record', 'requirement', 'agenda_item', 'spec', 'implementation_plan',
    'harvest', 'harvest_candidate'
  ));

-- 7. Seed Harvest Candidates forum (idempotent)
INSERT INTO assembly.forums (id, name, slug, description)
VALUES (gen_random_uuid(), 'Harvest Candidates', 'harvest-candidates',
        'Forum for harvest transcripts with their linked candidates. Rover posts here after each harvest run.')
ON CONFLICT (slug) DO NOTHING;

-- 8. Seed Rover user (idempotent)
INSERT INTO assembly.users (id, alias, email, password, admin)
VALUES (gen_random_uuid(), 'Rover', 'rover@nexus.local', 'rover-bot', false)
ON CONFLICT (alias) DO NOTHING;
