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


def open_question_count(candidate_id):
    """Zero means sandbox-track eligible (ruling c26ca340: blocker-free)."""
    st, data = get(f"{NEBULA}/api/harvest-candidates/{candidate_id}")
    if st != 200 or not data:
        return None
    try:
        oq = json.loads(data.get("open_questions") or "[]")
        return len(oq) if isinstance(oq, list) else 0
    except Exception:
        return 0


def suggest_destination(c, oq_count):
    """Pre-suggest destination per item where determinable (work order item 4).
    sandbox = blocker-free greenfield (no mapping + zero open questions);
    requirements = mapped to an existing system/subsystem."""
    if oq_count is None:
        return "requirements (?)"
    if oq_count > 0:
        return f"requirements ({oq_count} open question(s) block sandbox)"
    if c.get("system_name") and c["system_name"] != "(none)":
        return "requirements"
    return "sandbox"


def render_decision_cards(candidates):
    """Render the batch body as per-item radio DECISION CARDS
    (decision e4e9082e; procedure card `decision-cards`).

    Every option line embeds the candidate short-id so a mirrored
    `**Agreed selection:**` reply is attributable even when the UI quotes
    only the chosen line. Other carries 'System :: Subsystem' free text.
    """
    blocks = []
    for c in candidates:
        cid = str(c["id"])
        short = cid[:8]
        oq = open_question_count(cid)
        dest = suggest_destination(c, oq)
        mapped = c.get("system_name") and c["system_name"] != "(none)"
        mapping = f"{c.get('system_name')} :: {c.get('subsystem_name')}" if mapped else "(unmapped)"
        suggested = ""
        if not mapped and c.get("proposed_target"):
            suggested = f" — suggested: {c['proposed_target']}"
        header = (
            f"**Card `{short}`** — {c.get('title','')[:70]} "
            f"(CPF {c['compilation_readiness']:.2f} | mapping: {mapping} | "
            f"dest: {dest}){suggested}"
        )
        blocks.append(
            f"{header}\n"
            f"- ( ) {short}: Approve as mapped\n"
            f"- ( ) {short}: Strike\n"
            f"- ( ) Other for {short} — remap as \"System :: Subsystem\"\n"
        )
    return "\n".join(blocks)


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

    import json  # noqa: F401  (used by open_question_count)

    batch_id = uuid.uuid4().hex[:8]

    cards = render_decision_cards(candidates)
    body = (
        f"**Promotion batch `{batch_id}`** — {len(candidates)} candidate(s) at readiness >= 0.7. "
        f"Per D-2026-08-23-D + amendment e4e9082e this thread is the operator gate, "
        f"rendered as per-item DECISION CARDS. One click per card; no prose required.\n\n"
        f"{cards}\n"
        f"**Legend:** *Approve as mapped* promotes the candidate via its existing/confirmed mapping. "
        f"*Strike* removes it from the batch. *Other* remaps — type the target as `System :: Subsystem`. "
        f"Suggested destinations follow ruling c26ca340 (blocker-free unmapped items → sandbox track)."
    )

    manifest = {
        "batch_id": batch_id,
        "created_at": now_iso(),
        "thread_title": f"[promotion-batch {batch_id}] {len(candidates)} candidates ready for gate",
        "forum": "planning",
        "card_format": True,
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
