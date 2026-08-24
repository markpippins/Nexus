#!/usr/bin/env python3
"""Stage 1 — hourly shortlist (plan 0005 / D-2026-08-23-D).

Query: compilation_readiness >= 0.7, hierarchy-mapped, not promoted/discarded.
Cap 20/batch. Posts proposal thread to planning forum + agent record +
inbox pings to:architect and to:planner. No requirements are written here.

Usage: stage1_shortlist.py [--dry-run] [--cap N]
"""
import argparse
import sys
import uuid

from promotion_common import (
    NEBULA, agent_record, forum_post, get, inbox_ping, log, now_iso,
    save_manifest,
)

EXCLUDED_STATUS = {"promoted", "discarded", "rejected"}


def fetch_ready(cap):
    st, data = get(f"{NEBULA}/api/cpf?all=true")
    if st != 200 or not data:
        log(f"cpf query failed: {st}")
        return []
    rows = data.get("data") or []
    ready = [
        r for r in rows
        if isinstance(r.get("compilation_readiness"), (int, float))
        and r["compilation_readiness"] >= 0.7
        and (r.get("status") or "pending").lower() not in EXCLUDED_STATUS
    ]
    ready.sort(key=lambda r: -r["compilation_readiness"])
    return ready[:cap]


def attach_discovery_proposals(candidates):
    """Best-effort: annotate unmapped items with a proposed target so the
    operator can confirm with one MAP command. Never writes hierarchy ids."""
    from promotion_common import ollama_available, post

    unmapped = [c for c in candidates if not c.get("system_name") or c["system_name"] == "(none)"]
    if not unmapped:
        return
    if not ollama_available():
        log(f"ollama offline — {len(unmapped)} unmapped items proposed WITHOUT discovery suggestions")
        return
    st, disc = post(
        f"{NEBULA}/api/harvest-candidates/discover",
        {"candidateIds": [c["id"] for c in unmapped], "threshold": 0.75},
        timeout=120,
    )
    if st != 200 or not disc:
        log(f"discovery unavailable ({st}) — proceeding without suggestions")
        return
    top_by_id = {
        m["id"]: ((m.get("matches") or [None])[0] or {})
        for m in (disc.get("matches") or [])
    }
    for c in unmapped:
        top = top_by_id.get(c["id"])
        if top:
            c["proposed_target"] = (
                f"{top.get('name')} (sim {float(top.get('similarity') or 0):.2f})"
            )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--cap", type=int, default=20)
    args = ap.parse_args()

    candidates = fetch_ready(args.cap)
    if not candidates:
        log("shortlist empty (no non-promoted candidates >= 0.7) — nothing to propose")
        return 0
    attach_discovery_proposals(candidates)

    batch_id = uuid.uuid4().hex[:8]
    lines = ["| candidate | CPF | mapping | note | status |",
             "|---|---|---|---|---|"]
    for c in candidates:
        cid = str(c["id"])
        mapped = c.get("system_name") and c["system_name"] != "(none)"
        if mapped:
            mapping = f"{c.get('system_name')} :: {c.get('subsystem_name')}"
            note = "confirmed"
        else:
            mapping = "(none)"
            note = f"⚠️ needs MAP — suggested: {c.get('proposed_target', 'no match')}"
        lines.append(
            f"| `{cid[:8]}` {c.get('title','')[:55]} "
            f"| {c['compilation_readiness']:.2f} "
            f"| {mapping} | {note} | {c.get('status') or 'pending'} |"
        )

    body = (
        f"**Promotion batch `{batch_id}`** — {len(candidates)} candidate(s) at readiness >= 0.7. "
        f"Per D-2026-08-23-D this thread is the operator gate.\n\n"
        + "\n".join(lines)
        + "\n\n**Gate commands (reply on this thread):**\n"
        "- `APPROVE` — approve every listed item not struck (mapped-only are promoted)\n"
        "- `STRIKE <id-prefix>` — remove an item from the batch\n"
        "- `MAP <id-prefix> -> System :: Subsystem` — confirm/correct a mapping; "
        "unmapped items are NEVER promoted without this\n\n"
        "No requirement rows exist until you approve. Executor runs with per-item failure isolation."
    )
    manifest = {
        "batch_id": batch_id,
        "created_at": now_iso(),
        "thread_title": f"[promotion-batch {batch_id}] {len(candidates)} candidates ready for gate",
        "forum": "planning",
        "candidates": [
            {
                "id": c["id"],
                "title": c.get("title"),
                "readiness": c["compilation_readiness"],
                "system_name": c.get("system_name"),
                "subsystem_name": c.get("subsystem_name"),
                "mapped_confirmed": bool(c.get("system_name") and c["system_name"] != "(none)"),
                "struck": False,
                "promoted": False,
            }
            for c in candidates
        ],
        "verdicts_seen": [],
    }

    if args.dry_run:
        log(f"DRY RUN: would open batch {batch_id} with {len(candidates)} items")
        print(body)
        return 0

    st, thread = forum_post("planning", manifest["thread_title"], body)
    if st != 201:
        log(f"failed to post batch thread: {st} {thread}")
        return 1
    manifest["thread_id"] = thread["id"]
    save_manifest(batch_id, manifest)

    audit = (
        f"# Stage-1 shortlist batch {batch_id}\n\n"
        f"- proposed: {len(candidates)} (cap {args.cap})\n"
        f"- thread: planning forum {manifest['thread_id']}\n"
        f"- gate: operator approval required per item set\n"
    )
    agent_record(
        f"promotion-batch {batch_id}: shortlist proposed ({len(candidates)} items)",
        audit,
        ["spec:promotion-flow", "planRef:0005", f"batch:{batch_id}",
         "type:approval-request", "status:open", "to:architect", "to:planner"],
    )
    for role in ("architect", "planner"):
        inbox_ping(
            role,
            f"operator gate needed: promotion-batch {batch_id} ({len(candidates)} items) awaiting APPROVE/STRIKE",
            ["spec:promotion-flow", "planRef:0005", f"batch:{batch_id}", "type:approval-request"],
        )
    log(f"batch {batch_id} posted with {len(candidates)} items -> thread {manifest['thread_id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
