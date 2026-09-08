#!/usr/bin/env python3
"""Drift-finding → work-candidate intake seam (plan 8261640, decision 4496df1d).

Makes the observations/assessments layer a first-order source of work:
unresolved drift findings become work candidates (typed 'drift') in
nebula.harvest_candidates, ranked above transcript-derived candidates at
equal readiness, deduplicated by a root-fact fingerprint, and removed from
the active pool when their finding resolves.

Key properties:
  * Idempotent — re-running never produces duplicate candidates. Upsert is
    keyed on the root-fact fingerprint (candidate_dedupe_key).
  * Dedup by root-fact fingerprint — the fingerprint anchors on the leading
    substantive clause of the (content-normalized) description, so a single
    root fact captured across snapshot versions (near-duplicate wording)
    collapses to ONE candidate. Verified: the 7 verified live findings
    collapse to exactly 5 unique candidates (2 duplicate pairs absorbed).
  * Resolution linkage — when a drift finding resolves (resolved_at set),
    its candidate(s) are marked superseded with the resolution reference and
    leave the active pool; they are never re-offered.

DB-first: reads semantics.drift_finding (canonical), writes
nebula.harvest_candidates (canonical). No filesystem projection involved.

Usage:
  drift-intake.py                # scan + upsert (idempotent), then resolve
  drift-intake.py --dry-run      # report what would change, write nothing
  drift-intake.py --json         # emit machine-readable summary

Exit 0 on success (including no-op idempotent runs), non-zero on DB error.
"""

import argparse
import hashlib
import json
import os
import re
import sys
import uuid

import psycopg2
import psycopg2.extras

DSN = os.environ.get(
    "CONDUIT_PG_DSN", os.environ.get("NEBULA_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus")
)

# Candidate source discriminator (AC: "a source discriminator is queryable on
# every candidate row"). We type candidates 'drift' and tag source:observations.
CANDIDATE_TYPE = "drift"
PROVENANCE_TAG = "source:observations"

# Hermetic-test hook: when DRIFT_INTAKE_SCHEMA is set, both nebula.* and
# semantics.* table references resolve to a single throwaway schema (mirrors the
# C4 test convention). Unset in production — the live canonical schemas are used.
_SCHEMA_OVERRIDE = os.environ.get("DRIFT_INTAKE_SCHEMA", "").strip()


def _t(fq_name: str) -> str:
    """Map a schema-qualified table name under the DRIFT_INTAKE_SCHEMA override.

    Unset override -> identity (live nebula./semantics.). Set override ->
    both schemas collapse to the single throwaway test schema.
    """
    if not _SCHEMA_OVERRIDE:
        return fq_name
    return f"{_SCHEMA_OVERRIDE}.{fq_name.split('.', 1)[1]}"


FINDINGS_TABLE = _t("semantics.drift_finding")
CANDIDATES_TABLE = _t("nebula.harvest_candidates")


def connect():
    return psycopg2.connect(DSN)


def root_fact_fingerprint(description: str) -> str:
    """Deterministic root-fact fingerprint over a drift finding's description.

    The dedup key is the *leading substantive clause* of the
    content-normalized description. Root facts live in the first sentence;
    snapshot versions of the same fact differ only in trailing exposition, so
    anchoring on the first sentence collapses them (plan AC: 7 -> 5 unique).

    Normalization: take the leading sentence (everything before the first
    '.', '!', '?', or newline), then lowercase and strip non-alphanumerics
    to a single space, collapse whitespace. Anchoring on the first sentence
    collapses snapshot-version wording that diverges only in trailing
    exposition (plan AC: 7 -> 5 unique).
    """
    # Anchor on the first sentence BEFORE stripping punctuation (the sentence
    # break would otherwise be normalized away).
    for sep in (".", "!", "?", "\n"):
        if sep in description:
            description = description.split(sep, 1)[0]
            break
    norm = re.sub(r"[^a-z0-9]+", " ", description.lower()).strip()
    norm = re.sub(r"\s+", " ", norm)
    # The fingerprint must be stable and non-empty.
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


def scan_unresolved_findings(cur):
    """Return unresolved drift findings (resolved_at IS NULL), newest first."""
    cur.execute(
        f"""
        SELECT id, observation_id, description, severity, detected_at, resolved_at, expired_at
        FROM {FINDINGS_TABLE}
        WHERE resolved_at IS NULL
        ORDER BY detected_at DESC
        """
    )
    return cur.fetchall()


def find_existing_candidate(cur, dedupe_key):
    """Return existing candidate id + status for a dedupe key, or None."""
    cur.execute(
        f"""
        SELECT id, status, completed
        FROM {CANDIDATES_TABLE}
        WHERE dedupe_key = %s
          AND recorded_until_dt > now()
        ORDER BY created_at ASC
        LIMIT 1
        """,
        (dedupe_key,),
    )
    return cur.fetchone()


def candidate_title(finding, fp_prefix) -> str:
    sev = (finding["severity"] or "info").upper()
    return f"[drift:{sev}] {finding['description'][:120]}"


def build_tags(finding, dedupe_key):
    return [
        PROVENANCE_TAG,
        f"observation_id:{finding['observation_id']}",
        f"finding_id:{finding['id']}",
        f"fingerprint:{dedupe_key[:16]}",
        f"severity:{finding['severity'] or 'info'}",
    ]


def upsert_candidate(cur, finding, dedupe_key, sentinel_harvest_id):
    """Idempotently insert a drift candidate keyed on the dedupe fingerprint.

    Dedup is enforced two ways: (1) the run() loop calls find_existing_candidate
    first (cheap guard), and (2) the window-scoped unique index uq_hc_dedupe_live
    rejects a duplicate LIVE candidate at the DB layer as a safety net. We do a
    plain INSERT (not ON CONFLICT) because ON CONFLICT against a partial index
    through an auto-updatable VIEW is not reliably supported; the caller maps a
    UniqueViolation to 'preexisting'.
    """
    cur.execute(
        f"""
        INSERT INTO {CANDIDATES_TABLE}
          (harvest_id, title, intent_description, implementation_notes,
           code_snippets, open_questions, tags, status, type,
           dedupe_key, compilation_readiness, provenance_block_indices,
           severity_note, created_at, updated_at)
        VALUES
          (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now(), now())
        RETURNING id
        """,
        (
            sentinel_harvest_id,
            candidate_title(finding, dedupe_key),
            finding["description"],
            json.dumps(
                {
                    "source": "observations",
                    "observation_id": str(finding["observation_id"]),
                    "finding_id": str(finding["id"]),
                    "dedupe_key": dedupe_key,
                    "severity": finding["severity"],
                    "detected_at": finding["detected_at"].isoformat() if finding["detected_at"] else None,
                }
            ),
            json.dumps([]),
            json.dumps([]),
            build_tags(finding, dedupe_key),
            "active",
            CANDIDATE_TYPE,
            dedupe_key,
            # Observations-derived candidates rank above transcript-derived at
            # equal readiness (see /cpf ranking change); give a base readiness
            # floor so they are promotable. Severity nudges priority.
            0.7 + (0.15 if (finding["severity"] or "info") == "high" else 0.05 if (finding["severity"] or "info") == "medium" else 0.0),
            json.dumps({"finding_id": str(finding["id"]), "observation_id": str(finding["observation_id"])}),
            finding["severity"] or "info",
        ),
    )
    row = cur.fetchone()
    return row["id"]


def _sentinel_harvest_id(cur):
    """Resolve the canonical 'observations/drift' sentinel harvest (V147 C1).

    Created idempotently by the V147 migration, never lazily in app code. If
    missing, this is a migration-order violation — hard fail rather than guess.
    """
    cur.execute(
        f"SELECT id FROM {_t('nebula.harvests_history')} WHERE source_path = 'observations/drift' LIMIT 1"
    )
    row = cur.fetchone()
    if not row:
        raise RuntimeError(
            "sentinel harvest 'observations/drift' not found — V147 migration must be "
            "applied before drift-intake runs (R-2026-09-08-02 C1)"
        )
    return row["id"]


def resolve_candidates_for_finding(cur, finding_id, resolved_at):
    """Mark candidates derived from a now-resolved finding as superseded.

    Supersession is UPDATE-in-place (R-2026-09-08-02 C2): set valid_until=now()
    + status='superseded'. This removes the row from the live view AND frees the
    dedupe key (window-scoped index predicate requires valid_until sentinel), so
    a later re-observation of the same root fact can re-enter the pool.
    """
    cur.execute(
        f"""
        UPDATE {CANDIDATES_TABLE}
        SET status = 'superseded',
            completed = true,
            completion_reference = %s,
            valid_until = now(),
            updated_at = now()
        WHERE type = 'drift'
          AND provenance_block_indices::text ILIKE %s
          AND valid_until = '9999-12-31 23:59:59+00'
        RETURNING id
        """,
        (f'finding_resolved:{finding_id}', f'%{finding_id}%'),
    )
    return [r["id"] for r in cur.fetchall()]


def scan_resolved_findings(cur):
    """Return resolved findings that may still have live candidates."""
    cur.execute(
        f"""
        SELECT id, resolved_at
        FROM {FINDINGS_TABLE}
        WHERE resolved_at IS NOT NULL
        ORDER BY resolved_at DESC
        """
    )
    return cur.fetchall()


def run(dry_run=False, json_out=False):
    out = {
        "scanned_unresolved": 0,
        "candidates_upserted": 0,
        "candidates_preexisting": 0,
        "duplicate_pairs_absorbed": 0,
        "candidates_resolved": 0,
        "dry_run": dry_run,
    }
    with connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            sentinel = _sentinel_harvest_id(cur)
            findings = scan_unresolved_findings(cur)
            out["scanned_unresolved"] = len(findings)

            # Dedup by root-fact fingerprint across the whole scan: same root
            # fact across snapshot versions -> one candidate.
            seen_fps = {}
            for finding in findings:
                fp = root_fact_fingerprint(finding["description"])
                if fp in seen_fps:
                    out["duplicate_pairs_absorbed"] += 1
                    continue
                seen_fps[fp] = finding

                existing = find_existing_candidate(cur, fp)
                if existing:
                    out["candidates_preexisting"] += 1
                    continue

                if not dry_run:
                    try:
                        upsert_candidate(cur, finding, fp, sentinel)
                    except psycopg2.errors.UniqueViolation:
                        # uq_hc_dedupe_live backstop: a live duplicate already
                        # exists (race). Treat as preexisting, not an error.
                        conn.rollback()
                        out["candidates_preexisting"] += 1
                        continue
                out["candidates_upserted"] += 1

            # Resolution linkage: mark candidates superseded when their finding
            # has resolved.
            for resolved in scan_resolved_findings(cur):
                if not dry_run:
                    ids = resolve_candidates_for_finding(cur, resolved["id"], resolved["resolved_at"])
                    out["candidates_resolved"] += len(ids)

            if not dry_run:
                conn.commit()

    if json_out:
        print(json.dumps(out, indent=2))
    else:
        print(
            f"drift-intake: scanned={out['scanned_unresolved']} "
            f"upserted={out['candidates_upserted']} "
            f"preexisting={out['candidates_preexisting']} "
            f"duplicates_absorbed={out['duplicate_pairs_absorbed']} "
            f"resolved={out['candidates_resolved']} "
            f"({'DRY RUN' if dry_run else 'committed'})"
        )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Drift findings -> work candidates intake seam (plan 8261640)")
    parser.add_argument("--dry-run", action="store_true", help="report only, write nothing")
    parser.add_argument("--json", action="store_true", help="emit machine-readable summary")
    args = parser.parse_args()
    try:
        return run(dry_run=args.dry_run, json_out=args.json)
    except Exception as e:  # noqa: BLE001
        print(f"drift-intake: ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())