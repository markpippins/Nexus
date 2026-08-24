#!/usr/bin/env python3
"""Stage 0 — hierarchy mapping batch (plan 0005 / D-2026-08-23-D).

Proposes (and, above the confidence bar, applies) system/subsystem mappings
for unmapped harvest candidates using the existing semantic discovery
machinery. GATED on ollama availability — embeddings are offline outside
announced embed windows (ruling aaffca31), in which case this job no-ops.

Applied mappings are audit-posted per forum-per-table doctrine; the next
compute-cpf pass re-scores mapped candidates un-capped, dissolving the
0.600/0.700 plateau.

Usage: stage0_map.py [--dry-run] [--limit N] [--threshold T]
"""
import argparse
import sys

from promotion_common import (
    NEBULA, agent_record, forum_post, get, log, now_iso, patch,
)

APPLY_THRESHOLD = 0.80  # curated similarity needed to write a mapping


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=25)
    ap.add_argument("--threshold", type=float, default=0.80)
    args = ap.parse_args()

    # Gate 1: ollama/embeddings availability (devops constraint)
    from promotion_common import ollama_available
    if not ollama_available():
        log("ollama offline — outside embed window; mapping no-op (ruling aaffca31)")
        return 0

    # Unmapped, currently-valid candidates
    st, data = get(f"{NEBULA}/api/cpf?all=true")
    if st != 200 or not data:
        log(f"cpf query failed: {st}")
        return 1
    rows = data.get("data") or []
    unmapped = [
        r for r in rows
        if (not r.get("system_name") or r.get("system_name") == "(none)")
        and r.get("status") not in ("promoted", "discarded")
    ]
    unmapped.sort(key=lambda r: str(r.get("createdAt") or ""))
    batch_ids = [r["id"] for r in unmapped[: min(args.limit, 100)]]
    if not batch_ids:
        log("no unmapped candidates — nothing to map")
        return 0

    # Semantic discovery against systems hierarchy
    st, disc = post_discover(batch_ids)
    if st != 200 or disc is None:
        log(f"discovery failed: {st} {disc}")
        return 1
    matches = disc.get("matches") or []
    undocumented = disc.get("undocumented") or []

    applied, proposed_only, unmatched = [], [], len(undocumented)
    for m in matches:
        cand_id = m.get("id")
        top = (m.get("matches") or [None])[0]
        if not top:
            unmatched += 1
            continue
        sim = float(top.get("similarity") or 0)
        target = top.get("entity") or {}
        sys_id, sub_id = target.get("systemId"), target.get("subsystemId")
        label = f"{top.get('name')} (sim {sim:.2f})"
        if sim >= args.threshold and (sys_id or sub_id):
            applied.append({"id": cand_id, "label": label, "systemId": sys_id,
                            "subsystemId": sub_id, "similarity": sim})
        else:
            proposed_only.append({"id": cand_id, "label": label, "similarity": sim})

    lines = [
        f"# Stage-0 mapping run {now_iso()}\n",
        f"- scanned unmapped: {len(batch_ids)} (limit {args.limit})",
        f"- applied (sim >= {args.threshold}): **{len(applied)}**",
        f"- proposed-only (below bar): {len(proposed_only)}",
        f"- undocumented/no-match: {unmatched + len(undocumented)}",
    ]
    if args.dry_run:
        log("DRY RUN — would apply:")
        for a in applied:
            log(f"  {a['id'][:8]} -> {a['label']}")
        print("\n".join(lines))
        return 0

    for a in applied:
        body = {"systemId": a["systemId"]}
        if a.get("subsystemId"):
            body["subsystemId"] = a["subsystemId"]
        st, resp = patch(f"{NEBULA}/api/harvest-candidates/{a['id']}", body)
        a["ok"] = st == 200
        if st != 200:
            log(f"PATCH failed for {a['id'][:8]}: {st} {resp}")

    ok = [a for a in applied if a.get("ok")]
    if ok:
        lines.append("\n## Applied mappings\n")
        lines += [f"- `{a['id'][:8]}` -> {a['label']}" for a in ok]
        forum_post(
            "harvest-candidates",
            f"stage-0 mapping: {len(ok)} candidates mapped to systems hierarchy",
            "\n".join(lines),
        )
    agent_record(
        f"stage-0 mapping run: {len(ok)} applied / {len(proposed_only)} proposed / "
        f"{unmatched + len(undocumented)} unmatched",
        "\n".join(lines),
        ["spec:promotion-flow", "planRef:0005", "type:change", "to:architect"],
    )
    log(f"applied {len(ok)}, proposed-only {len(proposed_only)}, unmatched {unmatched + len(undocumented)}")
    return 0


def post_discover(candidate_ids):
    from promotion_common import post
    return post(
        f"{NEBULA}/api/harvest-candidates/discover",
        {"candidateIds": candidate_ids, "threshold": 0.75},
        timeout=120,
    )


if __name__ == "__main__":
    sys.exit(main())
