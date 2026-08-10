"""
seed_manifest.py — shared helpers for the tackle-seeds seed manifest.

The committed manifest (typescript/tackle-seeds/seed-manifest.json) is a
deterministic snapshot of the CANONICAL live DB state (tackle.memory +
tackle.role_memory): the card count, the role count, and per-card sha256
hashes plus role sets. It is emitted by bin/regenerate_memory_seed.py from
the live DB (the DB is canonical; the seed and the manifest are both derived
projections of it) and consumed by the wr-conf-006 conformance guard
(TestAc5ManifestGuard) so CI can detect seed drift WITHOUT a live
tackle.memory: the seed is rendered from source, executed against a scratch
schema, and byte-compared against this committed manifest.

The hashing convention lives HERE so the generator and the test can never
drift from each other on what "matches" means.

Usage:
    from nexus_core.wrp.seed_manifest import card_sha256, build_manifest, read_manifest
"""

import hashlib
import json
import os

# typescript/tackle-seeds/seed-manifest.json relative to the nexus/ repo root.
# This module lives at nexus/python/nexus_core/wrp/seed_manifest.py, so the
# repo root is three levels up.
_REPO_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
)
MANIFEST_PATH = os.path.join(
    _REPO_ROOT, "typescript", "tackle-seeds", "seed-manifest.json"
)


def card_sha256(slug: str, title: str, summary: str, body_md: str,
                tags, triggers, mcp_tools) -> str:
    """Deterministic sha256 of a card's full content (the byte-identity key).

    Tags/triggers/mcp_tools are sorted so ordering differences in the DB array
    vs the seed ARRAY[...] render do not cause false positives — the CONTENT
    set is what must match, not array element order.
    """
    # Lists are pre-sorted for order-independence; json.dumps over a list does
    # not reorder (sort_keys only affects object keys), so no sort_keys here.
    canon = json.dumps(
        [
            slug,
            title,
            summary or "",
            body_md or "",
            sorted(tags or []),
            sorted(triggers or []),
            sorted(mcp_tools or []),
        ]
    )
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


def build_manifest(conn) -> dict:
    """Read the canonical DB state and build the manifest dict.

    `conn` is a psycopg2 connection with access to the tackle schema.
    Returns a manifest with keys: schema, card_count, role_count, cards.
    Each card: {slug, sha256, roles:[...sorted]}.
    """
    cur = conn.cursor()
    cur.execute(
        """SELECT slug, title, summary, body_md, tags, triggers, mcp_tools
           FROM tackle.memory ORDER BY slug"""
    )
    cards = []
    role_count = 0
    for slug, title, summary, body_md, tags, triggers, mcp_tools in cur.fetchall():
        cur.execute(
            """SELECT DISTINCT role FROM tackle.role_memory
               WHERE memory_id = (SELECT id FROM tackle.memory WHERE slug = %s)
               ORDER BY role""",
            (slug,),
        )
        roles = [r[0] for r in cur.fetchall()]
        role_count += len(roles)
        cards.append(
            {
                "slug": slug,
                "sha256": card_sha256(
                    slug, title, summary, body_md, tags, triggers, mcp_tools
                ),
                "roles": roles,
            }
        )
    return {
        "schema": "tackle",
        "card_count": len(cards),
        "role_count": role_count,
        "cards": cards,
    }


def write_manifest(manifest: dict, path: str = MANIFEST_PATH) -> None:
    """Write the manifest deterministically (sorted keys, stable formatting)."""
    payload = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    with open(path, "w", encoding="utf-8") as f:
        f.write(payload)


def read_manifest(path: str = MANIFEST_PATH) -> dict:
    """Load the committed manifest."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def manifest_matches_live(conn) -> tuple:
    """Compare the committed manifest against live. Returns (ok, detail).

    detail is a human-readable list of what differs (empty when ok).
    """
    committed = read_manifest()
    live = build_manifest(conn)
    problems = []
    if committed.get("card_count") != live["card_count"]:
        problems.append(
            f"card_count: manifest={committed.get('card_count')} live={live['card_count']}"
        )
    if committed.get("role_count") != live["role_count"]:
        problems.append(
            f"role_count: manifest={committed.get('role_count')} live={live['role_count']}"
        )
    live_by_slug = {c["slug"]: c for c in live["cards"]}
    committed_by_slug = {c["slug"]: c for c in committed.get("cards", [])}
    for slug in sorted(set(live_by_slug) | set(committed_by_slug)):
        if slug not in live_by_slug:
            problems.append(f"card only in manifest: {slug}")
            continue
        if slug not in committed_by_slug:
            problems.append(f"card missing from manifest: {slug}")
            continue
        lc, cc = live_by_slug[slug], committed_by_slug[slug]
        if lc["sha256"] != cc.get("sha256"):
            problems.append(f"content hash differs: {slug}")
        if lc["roles"] != cc.get("roles"):
            problems.append(f"role set differs: {slug}")
    return (not problems, problems)
