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

# ── Structural match normalization (mapper ruling 8596d726) ─────────
# Discovery responses have drifted between shapes over time; every known
# variant normalizes here so downstream logic sees one contract:
#   {candidate_id, system_id, subsystem_id, name, similarity}
# Unknown/None fields stay None — callers decide eligibility by ids only
# (Gap C identity frame), never by display strings.

def _norm_name(v):
    if not isinstance(v, str):
        return ""
    n = v.strip()
    return "" if n.lower() in ("(none)", "none", "null") else n


def _pick(d, *keys):
    for k in keys:
        if isinstance(d, dict) and d.get(k) not in (None, ""):
            return d[k]
    return None


def normalize_match(cand_id, top):
    """Map any historical discover 'top hit' shape to the canonical tuple."""
    ent = top.get("entity") if isinstance(top, dict) else None
    ent = ent if isinstance(ent, dict) else {}
    nested_sys = ent.get("system") if isinstance(ent.get("system"), dict) else {}
    nested_sub = ent.get("subsystem") if isinstance(ent.get("subsystem"), dict) else {}

    # Entity IS a bare system row when it carries plain 'id' but no explicit
    # system-id field and no nested system object.
    bare_system = ("id" in ent
                   and not any(k in ent for k in ("systemId", "system_id", "system")))
    sys_id = _pick(ent, "systemId", "system_id")
    if sys_id is None and "system" in ent:
        sys_id = nested_sys.get("id")
    elif sys_id is None and bare_system:
        sys_id = ent.get("id")
    sub_id = _pick(ent, "subsystemId", "subsystem_id") or nested_sub.get("id")

    name = _norm_name(_pick(top, "name", "label") or _pick(ent, "name", "title"))
    sim = _pick(top, "similarity", "score")
    try:
        sim = float(sim) if sim is not None else 0.0
    except (TypeError, ValueError):
        sim = 0.0
    return {"candidate_id": cand_id, "system_id": sys_id,
            "subsystem_id": sub_id, "name": name, "similarity": sim}


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
    # Gap C (2f1202a): identity frame — a candidate is UNMAPPED iff it
    # lacks a resolvable system id; the name string is display-only.
    def _has_system(r):
        return bool(r.get("system_id") or r.get("systemId"))
    unmapped = [
        r for r in rows
        if not _has_system(r)
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
        nm = normalize_match(cand_id, top)
        sim = nm["similarity"]
        sys_id, sub_id = nm["system_id"], nm["subsystem_id"]
        label = f"{nm['name'] or '(unnamed)'} (sim {sim:.2f})"
        if sim >= args.threshold and sys_id:
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
