-- Resolution evaluator read-set manifest v1.
--
-- A manifest records the context available to an evaluator before execution.
-- It stores references and digests, not authoritative source content. The
-- evaluation result is retained only as a receipt so retries can be idempotent;
-- Resolution/Shrapnel remain authoritative for source values.

CREATE TABLE IF NOT EXISTS resolution.keychain_evaluation_manifest (
    manifest_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_namespace text NOT NULL,
    evaluation_id text NOT NULL,
    evaluation_kind text NOT NULL,
    target_id text NOT NULL,
    as_of timestamptz NOT NULL,
    visibility_scope text NOT NULL DEFAULT 'all',
    evaluator_id text,
    permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
    context jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
    schema_version integer NOT NULL DEFAULT 1,
    manifest_digest text NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'captured',
    result jsonb,
    completed_at timestamptz,
    CONSTRAINT keychain_eval_manifest_source_eval_uq
        UNIQUE (source_namespace, evaluation_id),
    CONSTRAINT keychain_eval_manifest_status_ck
        CHECK (status IN ('captured', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_keychain_eval_manifest_target
    ON resolution.keychain_evaluation_manifest (target_id, recorded_at);

-- Upgrade an already-created manifest table without rewriting captures.
ALTER TABLE resolution.keychain_evaluation_manifest
    ADD COLUMN IF NOT EXISTS evaluator_id text;

COMMENT ON TABLE resolution.keychain_evaluation_manifest IS
    'Pre-evaluation read-set receipts for Keychains rewind/replay; source content remains authoritative elsewhere.';
COMMENT ON COLUMN resolution.keychain_evaluation_manifest.source_refs IS
    'References to concepts, entities, rules, frames, assets, and revisions available to the evaluator.';
COMMENT ON COLUMN resolution.keychain_evaluation_manifest.result IS
    'Compact serialized evaluation response used for source-scoped idempotent retries.';
