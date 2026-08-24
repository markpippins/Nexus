#!/usr/bin/env python3
"""Re-emit DEFERRED promotion batches as per-item DECISION CARDS.

Implements ruling e4e9082e Ruling 2 as amended by decision 319defa5: the
deferred open batches are re-posted onto their existing gate threads in the
radio-card format (Requirement / Sandbox / Strike / Other=remap; the Plan
option is REMOVED — no candidate->plan path exists), with destination
pre-suggestions per c26ca340 (work order a3585c17 item 4). Nothing promotes,
scaffolds, or strikes here — this only changes how the gate is rendered.
Stage-3 remains guard-blocked.
"""
import sys

from stage1_shortlist import open_question_count, suggest_destination
from promotion_common import (
    FORUM, agent_record, forum_comment, get, load_manifests, log, now_iso,
    post, save_manifest,
)


def render_manifest_cards(manifest):
    blocks = []
    for c in manifest.get("candidates", []):
        if c.get("promoted") or c.get("struck"):
            continue
        cid = str(c["id"])
        short = cid[:8]
        oq = open_question_count(cid)
        dest = suggest_destination(c, oq)
        mapped = c.get("system_name") and c["system_name"] != "(none)"
        mapping = f"{c.get('system_name')} :: {c.get('subsystem_name')}" if mapped else "(unmapped)"
        header = (
            f"**Card `{short}`** — {(c.get('title') or '')[:70]} "
            f"(CPF {c.get('readiness', 0):.2f} | mapping: {mapping} | dest: {dest})"
        )
        blocks.append(
            f"{header}\n"
            f"- ( ) {short}: Requirement\n"
            f"- ( ) {short}: Sandbox\n"
            f"- ( ) {short}: Strike\n"
            f"- ( ) Other for {short} — remap as \"System :: Subsystem\"\n"
        )
    return "\n".join(blocks)


def main():
    manifests = [m for m in load_manifests() if not m.get("executed")]
    open_batches = [m for m in manifests if not m.get("card_format") and not m.get("reemitted")]
    if not open_batches:
        log("no deferred batches needing card re-emission")
        return 0

    log(f"re-emitting {len(open_batches)} deferred batch(es) as decision cards")
    done = 0
    for m in open_batches:
        bid = m["batch_id"]
        thread_id = m.get("thread_id")
        if not thread_id:
            log(f"skip {bid}: no thread_id")
            continue
        st, td = get(f"{FORUM}/api/forums/threads/{thread_id}")
        if st != 200:
            log(f"skip {bid}: thread unreachable ({st})")
            continue
        body = (
            f"**RE-EMISSION as DECISION CARDS** (ruling e4e9082e as amended by decision "
            f"319defa5) — this batch was DEFERRED under the prose-command format. The same "
            f"items are re-rendered below as per-item radio cards: **Requirement** (promote "
            f"to requirements), **Sandbox** (greenfield build-out in nexus/sandbox), "
            f"**Strike**, or `Other` remap via `System :: Subsystem`. There is no Plan "
            f"option — candidates promote only to requirements. Nothing has promoted, "
            f"scaffolded, or struck.\n\n"
            f"{render_manifest_cards(m)}"
        )
        st2, resp = forum_comment(thread_id, body)
        if st2 not in (200, 201):
            log(f"FAILED to comment on {bid}: {st2} {str(resp)[:120]}")
            continue
        m["reemitted"] = True
        m["card_format"] = True
        m["reemitted_at"] = now_iso()
        save_manifest(bid, m)
        agent_record(
            f"promotion-batch {bid}: re-emitted as decision cards ({len(m.get('candidates', []))} items)",
            f"- thread: {thread_id}\n- format: per-item radio decision cards per e4e9082e\n- destination pre-suggestions per c26ca340",
            ["spec:promotion-flow", f"batch:{bid}", "type:change", "status:resolved"],
        )
        done += 1
        log(f"{bid}: re-emitted on thread {thread_id}")
    log(f"done: {done}/{len(open_batches)} batches re-emitted")
    return 0


if __name__ == "__main__":
    sys.exit(main())
