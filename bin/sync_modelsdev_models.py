#!/usr/bin/env python3
"""
sync_modelsdev_models.py — reconcile tackle.models against the models.dev
registry that opencode itself consumes.

The models.dev registry (fetched by opencode from https://models.dev/api.json
and cached at ~/.cache/opencode/models.json) is the authoritative list of
providers/models known to work with opencode. This script imports the
configured scope into tackle so the AI registry mirrors what opencode can
actually resolve:

  - nvidia   : ALL models (models.dev ids carry the org path, e.g.
               z-ai/glm-5.2, nvidia/nemotron-3-ultra-550b-a55b)
  - openrouter: ALL models (ids like ~anthropic/claude-sonnet-latest and
               the literal openrouter/free router)
  - mistral  : ALL models (bare ids)
  - opencode : free models only (OpenCode Zen free tier — big-pickle,
               nemotron-3-super-free, ...)

Every imported model:
  - harness_id = harn-opencode (the CLI that spawns `opencode run --model`)
  - model_identifier = the models.dev model id VERBATIM — the canonical
    opencode reference is `providerKey/modelId`, and provider ids sometimes
    contain the org path themselves (nvidia), so the identifier must never
    be rewritten.
  - verified = false (unchanged on re-runs) — new models are not referenced
    by any config bundle, so they enter the registry unverified and only
    flip to verified after a successful harness run (UI Verify action).

Provider rows gain config_json {"opencodeProvider": "<models.dev key>"} —
the tackle provider TYPE (e.g. openai) does not match the models.dev key
(e.g. nvidia/openrouter/mistral), and openCodeModelArg resolves the key
from config_json to build the correct `key/id` opencode arg.

Existing rows are reconciled by (provider, name) match so hand-created
entries (mod-glm-5-2, mod-1783906424536, ...) keep their ids and verified
state while their identifiers are corrected to the canonical models.dev id.

Usage:
    python3 bin/sync_modelsdev_models.py [--source /path/to/models.json] [--dry-run]
"""

import argparse
import json
import os
import re
import sys

DSN = os.environ.get("CONDUIT_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus")
DEFAULT_SOURCE = os.path.expanduser("~/.cache/opencode/models.json")

# models.dev provider key -> tackle provider row (id + opencode key)
PROVIDER_SCOPE = {
    # key: (tackle provider id, opencode key to store in config_json)
    "nvidia": ("prov-1783906359513", "nvidia"),
    "openrouter": ("prov-1782144397043", "openrouter"),
    "mistral": ("prov-mistral", "mistral"),
    "opencode": ("prov-opencode", "opencode"),
}

# Also pin the opencode key on every existing tackle provider so
# openCodeModelArg can resolve it even before the scope import runs.
ALL_PROVIDER_KEYS = {
    "prov-1783906359513": "nvidia",
    "prov-1782144397043": "openrouter",
    "prov-mistral": "mistral",
    "prov-anthropic": "anthropic",
    "prov-codex": "codex",
    "prov-deepseek": "deepseek",
    "prov-google": "google",
    "prov-ollama": "ollama",
    "prov-openai": "openai",
    "prov-opencode": "opencode",
    "prov-opencode-go": "opencode-go",
}

HARNESS_OPENCODE = "harn-opencode"


def slugify(provider_key: str, modelsdev_id: str) -> str:
    """Build a stable tackle model id from a models.dev model id."""
    raw = f"{provider_key}-{modelsdev_id}"
    s = re.sub(r"[^A-Za-z0-9]+", "-", raw).strip("-").lower()
    return f"mod-{s}"


def human_name(modelsdev_id: str, meta: dict) -> str:
    name = (meta.get("name") or "").strip()
    return name or modelsdev_id


def is_free(meta: dict) -> bool:
    cost = meta.get("cost") or {}
    return (cost.get("input") or 0) == 0 and (cost.get("output") or 0) == 0


def db():
    import psycopg2
    return psycopg2.connect(DSN)


def ensure_mistral_provider(conn, cur):
    """Create the mistral provider row if missing (idempotent)."""
    cur.execute("SELECT 1 FROM tackle.providers WHERE id = 'prov-mistral'")
    if cur.fetchone() is None:
        # type must be one of the CHECK-constrained values; mistral follows
        # the nvidia/openrouter convention (OpenAI-compatible API), and the
        # opencode provider key lives in config_json.opencodeProvider.
        cur.execute(
            "INSERT INTO tackle.providers (id, name, type, config_json, created_at, updated_at)"
            " VALUES ('prov-mistral', 'Mistral', 'openai', '{}', NOW(), NOW())"
        )
        print("[provider] created prov-mistral (Mistral, type=openai)")
    else:
        print("[provider] prov-mistral exists")


def pin_provider_keys(conn, cur):
    """Store the opencode provider key on every tackle provider row."""
    for pid, key in ALL_PROVIDER_KEYS.items():
        cur.execute(
            "UPDATE tackle.providers SET config_json = %s::text, updated_at = NOW()"
            " WHERE id = %s AND COALESCE(config_json::text,'{}') NOT LIKE %s",
            (json.dumps({"opencodeProvider": key}), pid,
             f'%{json.dumps({"opencodeProvider": key})}%'),
        )
        if cur.rowcount:
            print(f"[provider] pinned opencodeProvider={key} on {pid}")


def upsert_models(conn, cur, registry, scope, dry_run):
    """Upsert the scoped models, reconciling existing rows by (provider, name)."""
    stats = {"new": 0, "updated": 0, "reconciled": 0, "skipped": 0}
    for mkey, (tackle_pid, _) in scope.items():
        provider = registry.get(mkey)
        if not provider:
            print(f"[warn] models.dev provider {mkey!r} not in registry")
            continue
        for mid, meta in sorted(provider.get("models", {}).items()):
            # opencode scope = free models only
            if mkey == "opencode" and not is_free(meta):
                stats["skipped"] += 1
                continue
            name = human_name(mid, meta)
            new_id = slugify(mkey, mid)

            # Reconcile by (provider_id, model_identifier) FIRST — hand-created
            # rows almost always carry the canonical models.dev id already
            # (e.g. mod-glm-5-2 stores z-ai/glm-5.2), so this catches them
            # without relying on names matching. Fall back to a name match.
            cur.execute(
                "SELECT id, model_identifier FROM tackle.models"
                " WHERE provider_id = %s AND model_identifier = %s LIMIT 1",
                (tackle_pid, mid),
            )
            existing = cur.fetchone()
            if existing is None:
                cur.execute(
                    "SELECT id, model_identifier FROM tackle.models"
                    " WHERE provider_id = %s AND LOWER(name) = LOWER(%s) LIMIT 1",
                    (tackle_pid, name),
                )
                existing = cur.fetchone()

            if existing:
                row_id, old_identifier = existing
                cur.execute(
                    "UPDATE tackle.models SET model_identifier = %s, harness_id = %s,"
                    " name = %s, updated_at = NOW() WHERE id = %s",
                    (mid, HARNESS_OPENCODE, name, row_id),
                )
                # The generated id differs from the reconciled row id — drop the
                # would-be duplicate if it was created by a prior run.
                if row_id != new_id:
                    cur.execute("DELETE FROM tackle.models WHERE id = %s", (new_id,))
                stats["reconciled" if old_identifier != mid else "skipped"] += 1
            else:
                cur.execute(
                    "INSERT INTO tackle.models"
                    " (id, name, harness_id, provider_id, model_identifier,"
                    "  created_at, updated_at)"
                    " VALUES (%s, %s, %s, %s, %s, NOW(), NOW())"
                    " ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,"
                    " harness_id = EXCLUDED.harness_id,"
                    " provider_id = EXCLUDED.provider_id,"
                    " model_identifier = EXCLUDED.model_identifier,"
                    " updated_at = NOW()",
                    (new_id, name, HARNESS_OPENCODE, tackle_pid, mid),
                )
                stats["new"] += 1
    return stats


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", default=DEFAULT_SOURCE,
                    help="models.dev json (default: opencode cache)")
    ap.add_argument("--dry-run", action="store_true",
                    help="print the plan without touching the DB")
    args = ap.parse_args()

    if not os.path.exists(args.source):
        print(f"source not found: {args.source}", file=sys.stderr)
        sys.exit(1)
    registry = json.load(open(args.source))

    conn = db()
    try:
        cur = conn.cursor()
        ensure_mistral_provider(conn, cur)
        pin_provider_keys(conn, cur)
        stats = upsert_models(conn, cur, registry, PROVIDER_SCOPE, args.dry_run)
        if args.dry_run:
            conn.rollback()
            print("[dry-run] nothing written")
        else:
            conn.commit()
        print(f"[summary] {stats}")
        for key, (pid, _) in PROVIDER_SCOPE.items():
            cur.execute(
                "SELECT count(*) FROM tackle.models WHERE provider_id = %s", (pid,)
            )
            print(f"[counts] {key}: {cur.fetchone()[0]}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
