#!/usr/bin/env python3
"""ST.02 — reconcile duplicate promotion manifests as append-only history.

Wave 6 bug/hygiene item (NOT a PEB gate, NOT a promotion/ballot decision).

Inventory the repeated candidate-set emissions in ``state/promotion-flow/`` and
establish append-only lineage from each duplicate emission to the single active
batch for its candidate-set identity. Duplicates are marked ``superseded`` ONLY
through the supported data model (append-only fields on the manifest) — the
historical candidate rows are never deleted or rewritten.

Usage:
    reconcile_duplicates.py            # dry-run: print reconciliation plan
    reconcile_duplicates.py --apply    # write supersession markers + publish evidence
"""
import argparse
import json
import sys
from collections import defaultdict

from promotion_common import (
    agent_record, candidate_set_identity, load_manifests, mark_superseded,
    now_iso, save_manifest,
)


def inventory(manifests):
    """Group manifests by candidate-set identity. Returns {identity: [manifests]}."""
    groups = defaultdict(list)
    for m in manifests:
        ident = candidate_set_identity(m.get("candidates", []))
        groups[ident].append(m)
    return groups


def plan(groups):
    """Return list of (identity, active, [duplicates]) for sets emitted >1x."""
    out = []
    for ident, members in groups.items():
        if len(members) < 2:
            continue
        # canonical active = earliest-created emission for the set.
        ordered = sorted(members, key=lambda m: m.get("created_at", ""))
        active, duplicates = ordered[0], ordered[1:]
        out.append((ident, active, duplicates))
    return sorted(out, key=lambda t: t[1].get("created_at", ""))


def byte_identical(active, duplicates):
    """Confirm the gate manifests are byte-identical repetitions of the active
    batch's candidate rows (id + title + readiness), ignoring lifecycle fields.
    Returns True when all duplicates carry an identical candidate sub-record."""
    canon = [(c.get("id"), c.get("title"), c.get("readiness")) for c in active.get("candidates", [])]
    for dup in duplicates:
        row = [(c.get("id"), c.get("title"), c.get("readiness")) for c in dup.get("candidates", [])]
        if row != canon:
            return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help="write supersession markers and publish evidence (default: dry-run)")
    args = ap.parse_args()

    manifests = load_manifests()
    groups = inventory(manifests)
    plans = plan(groups)

    total_duplicates = sum(len(d) for _, _, d in plans)
    print(f"manifests: {len(manifests)} | distinct set identities: {len(groups)} "
          f"| duplicate instances: {total_duplicates}")

    report_lines = []
    for ident, active, duplicates in plans:
        identical = byte_identical(active, duplicates)
        flag = "IDENTICAL" if identical else "**DIFFERS**"
        line = (
            f"- set `{ident[:12]}` x{len(duplicates)+1}: active batch "
            f"{active['batch_id']} ({active.get('created_at')}) -> "
            f"{len(duplicates)} superseded [{flag}]"
        )
        print("  " + line)
        report_lines.append(line)

    if not args.apply:
        print("\nDRY RUN — no changes written. Re-run with --apply to reconcile.")
        return 0

    # ── Apply: append-only supersession ────────────────────────────────
    written = 0
    for ident, active, duplicates in plans:
        for dup in duplicates:
            if dup.get("superseded_by"):
                continue  # already superseded — idempotent
            mark_superseded(dup, active["batch_id"],
                            "duplicate candidate-set emission (ST.02)")
            dup.setdefault("set_identity", ident)
            save_manifest(dup["batch_id"], dup)
            written += 1
        active.setdefault("set_identity", ident)
        save_manifest(active["batch_id"], active)

    print(f"\napplied: {written} duplicate manifest(s) marked superseded (append-only)")

    # ── Evidence record (queryable via nebula) ─────────────────────────
    evidence = (
        "# ST.02 — duplicate promotion manifest reconciliation (append-only)\n\n"
        f"- reconciled at: {now_iso()}\n"
        f"- total manifests: {len(manifests)}\n"
        f"- distinct candidate-set identities: {len(groups)}\n"
        f"- duplicate instances marked superseded: {written}\n\n"
        "## Candidate-set digest + active-batch disposition\n"
        + "\n".join(report_lines) + "\n\n"
        "## Integrity\n"
        "- Historical candidate rows preserved verbatim (append-only supersession).\n"
        "- Duplicate collapse is a DATA-INTEGRITY reconciliation, NOT an operator "
        "ballot or promotion decision — per-card verdicts remain the operator's "
        "domain on the ST.03 ballot.\n"
        "- DBA review requested: confirm append-only persistence semantics for "
        "`state/promotion-flow/` supersession markers."
    )
    agent_record(
        f"promotion-flow ST.02: reconciled {written} duplicate manifests as append-only history",
        evidence,
        ["spec:promotion-flow", "ST.02", "type:change", "status:resolved",
         "to:dba", "to:architect", "wave-6", "data-integrity"],
    )
    print("evidence agent record written")
    return 0


if __name__ == "__main__":
    sys.exit(main())