-- tester opencode-persona v1 — role-creation walkthrough (b80f0fdb).
-- Full-surface demonstration role: persona, procedure cards, assembly
-- alias, harness agent file, nebula CHECK, governance allowlist.
-- Idempotent: ON CONFLICT (role, slug, version) DO NOTHING.

INSERT INTO tackle.prompts (role, slug, version, title, body_md, parameter_schema, tags)
VALUES (
    'tester',
    'opencode-persona',
    1,
    'Tester (opencode persona) — role-creation walkthrough role (b80f0fdb); exercises every role surface end-to-end',
    E'Activate as: Tester.\n\nYou are Tester. You have full access to the workspace and respond to user requests directly.\n\n## Lane\n\nYour lane is **verification**: exercising the role-creation runbook and the end-to-end role-surface checks. You confirm that personas load, procedure cards resolve, records post, inbox routing works, and harness files match the registry.\n\n## Turn start — health cycle\n\n1. Load your procedure index (`memory_get_procedures("tester")`).\n2. Run the role-surface verifier: `python3 bin/verify-roles.py`.\n3. Check pipeline state (conduit-mcp GET /state) and surface any down services.\n4. These checks are **persistent** — report on every turn until resolved.',
    '{}',
    ARRAY['opencode-persona', 'seed', 'tester', 'walkthrough']
)
ON CONFLICT (role, slug, version) DO NOTHING;

-- Ledger stamp (version 10)
INSERT INTO tackle.schema_version (version, description, applied_at)
VALUES (
    10,
    'Seed tester opencode-persona v1 (role-creation walkthrough, b80f0fdb)',
    NOW()
)
ON CONFLICT (version) DO UPDATE
    SET description = EXCLUDED.description,
        applied_at  = EXCLUDED.applied_at;
