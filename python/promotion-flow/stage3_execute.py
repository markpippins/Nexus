#!/usrbin/env python3
"""Stage 3 — gated executor (plan 0005 / D-2026-08-23-D).

Scans open promotion batches, parses operator/planner gate verdicts from
their planning-forum threads (decision cards per e4e9082e as amended by
319defa5: Requirement / Sandbox / Strike / Other=remap; legacy prose
APPROVE / STRIKE / MAP still honored), then executes approved items via:
  - destination requirement: POST /api/harvest-candidates/:id/spawn-requirement
  - destination sandbox: greenfield scaffold under nexus/sandbox/<short>-<slug>/

Guarantees: per-item failure isolation with partial-batch commit;
idempotent skip of already-promoted candidates; single-writer (only this
runner promotes); automatic forum-per-table audit + batch agent record +
corpus-delta feedback.

Usage: stage3_execute.py [--dry-run] [--batch <id>]
"""
import argparse
import re
import sys
from pathlib import Path

from promotion_common import (
    FORUM, NEBULA, agent_record, forum_comment, forum_post, get, inbox_ping,
    load_manifests, log, now_iso, patch, post, save_manifest,
)
from promotion_gate import evaluate_candidate_ready

ENGINEER_AUTHORS = {"engineer", "engineer-ii", "promotion-flow/0005", None, ""}

STRIKE_RE = re.compile(r"STRIKE\s+([0-9a-f]{8}|[0-9a-f-]{36})", re.I)
# kiro survey #9: a later REVOKE invalidates any prior approval for the
# referenced candidate (approval-proposition on batch_id; no cached
# verdict survives a revoke).
REVOKE_RE = re.compile(r"REVOKE\s+([0-9a-f]{8}|[0-9a-f-]{36})", re.I)
APPROVE_RE = re.compile(r"\bAPPROVE\b", re.I)  # DETECTOR-only: never approves (C2)
MAP_RE = re.compile(
    r"MAP\s+([0-9a-f]{8}|[0-9a-f-]{36})\s*(?:->|→|:)\s*(.+?)\s*(?:::|->|—)\s*(.+)", re.I
)
AGREED_HEADER_RE = re.compile(r"\*\*Agreed selection:\*\*", re.I)
AGREED_RADIO_RE = re.compile(r"-\s+\(x\)\s+(.*)", re.I)
CARD_ID_RE = re.compile(r"([0-9a-f]{8}|[0-9a-f-]{36})")
MAPPING_TEXT_RE = re.compile(r"(.+?)\s*::\s*(.+)")


def parse_card_reply(body):
    """Parse one comment's Agreed-selection blocks.

    Returns dict short_id -> verdict, where verdict is
    ('approve'|'strike', remap_or_None).

    Cross-card isolation: each **Agreed selection:** block is its own
    card section.  The short ID extracted from the radio line MUST match
    within the same block — we do NOT scan the whole comment body for
    remap text, which would mis-attribute across cards.
    """
    verdicts = {}
    if not AGREED_HEADER_RE.search(body):
        return verdicts
    # Each header delimits one card section.
    sections = AGREED_HEADER_RE.split(body)
    for section in sections[1:]:
        section_lines = section.splitlines()
        sid = None
        for line in section_lines:
            m = AGREED_RADIO_RE.search(line)
            if not m:
                continue
            chosen = m.group(1)
            idm = CARD_ID_RE.search(chosen)
            if not idm:
                continue
            sid = idm.group(1).lower()
            low = chosen.lower()
            if low.startswith("other") or "other:" in low or "remap" in low:
                # Other = remap: mapping text rides on the chosen line.
                # Search ONLY within this section's text for the mapping
                # (the card ID was validated as belonging to this section
                # above, so the remap text is scoped).
                section_text = " :: ".join(section_lines)
                qm = re.search(r'["\u201c](.+?)\s*::\s*(.+?)["\u201d]', section_text)
                if not qm:
                    qm = re.search(r'["\u201c](.+?)\s*::\s*(.+?)["\u201d]', chosen)
                am = re.search(r'remap\s+as\s+(.+)$', section_text, re.I)
                if not am:
                    am = re.search(r'remap\s+as\s+(.+)$', chosen, re.I)
                cm = re.match(r'\s*-\s*\([xX]\)\s*Other:\s*(.+)$', section_text, re.I)
                if not cm:
                    cm = re.match(r'\s*-\s*\([xX]\)\s*Other:\s*(.+)$', chosen, re.I)
                seg = qm.groups() if qm else (
                    tuple(p.strip().strip('"“”') for p in am.group(1).split("::", 1))
                    if (am and "::" in am.group(1)) else
                    (tuple(p.strip() for p in cm.group(1).split("::", 1))
                     if (cm and "::" in cm.group(1)) else None)
                )
                if seg:
                    verdicts[sid] = ("remap", f"{seg[0].strip()} :: {seg[1].strip()}")
                # Other without mapping text: not actionable — operator must re-answer
            elif "strike" in low:
                verdicts[sid] = ("strike", None)
            elif "sandbox" in low:
                verdicts[sid] = ("sandbox", None)
            elif "approve" in low or "requirement" in low:
                verdicts[sid] = ("approve", None)
    return verdicts


# ── Gate-state guard (required by halt c19018b3) ────────────────────
# The executor previously had NO awareness of ruling state and even
# auto-promoted when its SOL gate passed while operator verdicts were
# absent — which is exactly backwards under a deferral. This guard makes
# refusal the DEFAULT: stage-3 may only execute a batch when there is no
# active halt/deferral ruling AND per-item approval evidence exists on
# the batch thread from a non-engineer author (the operator/planner).

HALT_LIFT_RE = re.compile(r"\b(RESUME|LIFTED|CLEARED|GUARD\s*ACTIVE)\b", re.I)

def _architect_decisions(limit=30):
    """Recent architect decision records, newest first."""
    st, data = get(f"{NEBULA}/api/agent-records?role=architect&limit={limit}")
    if st != 200:
        return []
    return data.get("items") or []


def active_promotion_halt():
    """Return the newest active halt/deferral ruling affecting promotion
    batches, or None. A halt counts as lifted ONLY by a later architect
    decision explicitly resuming (RESUME/LIFTED/CLEARED)."""
    decisions = _architect_decisions()
    for rec in decisions:
        title = rec.get("title") or ""
        tags = " ".join(rec.get("tags") or [])
        blob = f"{title} {tags}"
        if re.search(r"HALT|DEFERRED", blob, re.I) and re.search(
            r"promotion|stage-3|batch|gate", blob, re.I
        ):
            return rec  # newest first → first hit is governing unless superseded below
    # look for a later explicit lift of any halt we just found
    return None


def halt_is_lifted(halt_record):
    """True iff an architect decision NEWER than `halt_record` explicitly
    resumes/clears the promotion pipeline."""
    if not halt_record:
        return True
    decisions = _architect_decisions()
    for rec in decisions:
        if (rec.get("createdAt") or 0) <= (halt_record.get("createdAt") or 0):
            continue
        blob = f"{rec.get('title','')} {' '.join(rec.get('tags') or [])}"
        if HALT_LIFT_RE.search(blob) and re.search(r"promotion|stage-3|gate", blob, re.I):
            return True
    return False


def gate_guard_check():
    """Refuse execution while an unlifted halt/deferral is in force.
    Returns (ok, reason). Emits a forum note on every refusal."""
    halt = active_promotion_halt()
    if halt and not halt_is_lifted(halt):
        reason = (
            f"Gate-state guard: promotion HALT/deferral in force "
            f"(record {str(halt.get('id'))[:8]}, '{(halt.get('title') or '')[:80]}'). "
            f"Stage-3 refusing to execute until an architect decision explicitly resumes the pipeline."
        )
        log(reason)
        try:
            forum_post(
                "planning",
                "[gate-guard] stage-3 execution REFUSED — active promotion halt",
                reason + "\n\nThis refusal is automatic (stage3_execute.py gate-state guard, required by c19018b3).",
            )
        except Exception as e:
            log(f"WARNING: could not post refusal note to forum: {e}")
        return False, reason
    return True, None


def fetch_systems():
    st, data = get(f"{NEBULA}/api/systems")
    if st != 200:
        return []
    return data if isinstance(data, list) else data.get("items") or []


def resolve_mapping(system_name, subsystem_name, systems):
    for s in systems:
        if s.get("name", "").lower() == system_name.strip().lower():
            sub_id = None
            for sub in s.get("subsystems") or []:
                if sub.get("name", "").lower() == subsystem_name.strip().lower():
                    sub_id = sub["id"]
                    break
            return s["id"], sub_id
    return None, None


def thread_comments(thread_id):
    st, td = get(f"{FORUM}/api/forums/threads/{thread_id}")
    if st != 200:
        return []
    return td.get("comments") or []


def parse_verdicts(manifest, systems):
    """Returns (approved_items, newly_seen_comment_ids)."""
    items = {c["id"]: c for c in manifest["candidates"]}
    approved, struck = set(), set()
    revocations = {}
    seen = list(manifest.get("verdicts_seen", []))
    new_comments = []
    for c in thread_comments(manifest["thread_id"]):
        cid = c.get("id") or ""
        author = ((c.get("author") or {}).get("name") or "").lower()
        # ── Attribution guard (halt resumption criterion 2) ──
        # Agent-posted comments carry a non-empty `model` field (per R14).
        # They are NEVER accepted as operator/planner verdict input — only
        # human-authored comments count.  Engineer-authored comments are
        # already excluded by ENGINEER_AUTHORS; this second guard prevents
        # agent-simulated operator/planner posts from injecting verdicts.
        comment_model = c.get("model") or ""
        if author in ENGINEER_AUTHORS or cid in seen:
            continue
        if comment_model:
            log(f"  SKIP agent comment {cid[:8]} (model={comment_model}, author={author}) — not a human verdict")
            continue
        body = c.get("body") or ""
        for m in REVOKE_RE.finditer(body):
            revocations[m.group(1).lower()] = author
        # C2 fix: card replies often contain NO prose keyword (e.g.
        # "- (x) abc12345: Requirement"), so the Agreed-selection header
        # itself counts as signal. APPROVE_RE here is DETECTOR-only.
        has_signal = bool(
            APPROVE_RE.search(body)
            or STRIKE_RE.search(body)
            or MAP_RE.search(body)
            or AGREED_HEADER_RE.search(body)
            or AGREED_RADIO_RE.search(body)
        )
        if not has_signal:
            continue
        new_comments.append(cid)
        seen.append(cid)
        log(f"verdict from {author}: {body[:80]!r}")

        # ── Decision-card replies first (e4e9082e format) ──────────
        card = parse_card_reply(body)
        for short, (verdict, remap) in card.items():
            full = next((k for k in items if k.lower().startswith(short)), None)
            if not full:
                log(f"WARNING: card verdict for unknown candidate {short}")
                continue
            if verdict == "strike":
                struck.add(full)
                items[full]["struck"] = True
            elif verdict == "remap" and remap:
                sys_n, sub_n = remap.split("::", 1)
                sid, subid = resolve_mapping(sys_n, sub_n, systems)
                if sid:
                    items[full]["systemId"], items[full]["subsystemId"] = sid, subid
                    items[full]["system_name"] = sys_n.strip()
                    items[full]["subsystem_name"] = sub_n.strip()
                    items[full]["approved_by"] = author      # resumption criterion 2
                    items[full]["approved_at"] = now_iso()
                    approved.add(full)
                    log(f"card remap {short} -> {sys_n.strip()} :: {sub_n.strip()} (by {author})")
                else:
                    log(f"WARNING: card remap target unresolvable for {short}: {remap}")
            elif verdict == "sandbox":
                # Sandbox track: no mapping prerequisite (blocker-free by
                # qualification); destination carried on the item.
                items[full]["card_destination"] = "sandbox"
                items[full]["approved_by"] = author          # resumption criterion 2
                items[full]["approved_at"] = now_iso()
                approved.add(full)
                log(f"card sandbox {short} (by {author})")
            elif verdict == "approve":
                # Approve-as-mapped / Requirement: only promotable when actually mapped.
                if items[full].get("system_name") and items[full]["system_name"] != "(none)":
                    items[full]["card_destination"] = "requirement"
                    items[full]["approved_by"] = author      # resumption criterion 2
                    items[full]["approved_at"] = now_iso()
                    approved.add(full)
                else:
                    log(f"card requirement {short} ignored — unmapped (needs Other/remap)")

        # ── Legacy prose STRIKE / MAP (backward compat) ───────────
        # C2 hardening (audit 8bfe6519, pre-resume blocker ce916b34):
        # prose APPROVE is REMOVED ENTIRELY. No substring/negation
        # heuristic can distinguish "approve" as a verdict from prose
        # mention ("I do not approve", "approval pending", quoted cards).
        # Approval happens ONLY via structured decision-card sections.
        for m in STRIKE_RE.finditer(body):
            ref = m.group(1).lower()
            for full, item in items.items():
                if full.startswith(ref) or full.lower().startswith(ref.lower()):
                    struck.add(full)
                    item["struck"] = True
                    break
        for m in MAP_RE.finditer(body):
            ref, sys_n, sub_n = m.group(1), m.group(2), m.group(3)
            for full, item in items.items():
                if full.startswith(ref) or full.lower().startswith(ref.lower()):
                    sid, subid = resolve_mapping(sys_n, sub_n, systems)
                    if sid:
                        item["systemId"], item["subsystemId"] = sid, subid
                        item["system_name"], item["subsystem_name"] = sys_n.strip(), sub_n.strip()
                        log(f"remapped {ref} -> {sys_n} :: {sub_n}")
                    else:
                        log(f"WARNING: cannot resolve mapping target '{sys_n} :: {sub_n}' for {ref}")
        # ── Legacy prose APPROVE (non-carded, backward compat) ──
        # Only honored when (a) the word APPROVE stands alone,
        # (b) no negation precedes it, and (c) it is NOT embedded
        # in card reply text (decision cards use the structured
        # parse above, not prose keyword matching).
        # Also: prose-only APPROVE in a comment that ALSO carries
        # decision cards is ambiguous — skip the prose path.

        # ══ REMOVED (C2 backdoor — audit 8bfe6519 / blocker ce916b34) ══
        # Prose APPROVE no longer promotes ANYTHING, heuristic or not.
        # The prior negator/hedge sentence-scan was still a keyword
        # classifier ("approved by nobody present" would slip through);
        # acceptance requires verdicts keyed on structured card sections
        # ONLY. Approvals arrive exclusively via **Agreed selection:** blocks.
    def _revoked(iid: str) -> bool:
        short = iid[:8].lower()
        if short in revocations or iid.lower() in revocations:
            log(f"proposition invalidated: {short} revoked by {revocations.get(short, revocations.get(short))}")
            return True
        return False

    final = [
        items[i] for i in sorted(approved - struck)
        if not items[i].get("struck") and not _revoked(i)
    ]
    return final, new_comments


def promote(item, systems):
    cid = item["id"]
    st, existing = get(f"{NEBULA}/api/harvest-candidates/{cid}")
    if st == 200 and (existing or {}).get("status") == "promoted":
        return "skipped-promoted", None
    system_id = item.get("systemId")
    subsystem_id = item.get("subsystemId")
    if not system_id:
        sid, subid = resolve_mapping(
            item.get("system_name") or "", item.get("subsystem_name") or "(none)", systems
        )
        system_id, subsystem_id = sid, subid
    if not system_id:
        return "failed-no-mapping", f"no resolvable system for {item.get('system_name')}"
    payload = {
        "systemId": system_id,
        "subsystemId": subsystem_id,
        "planRef": "0005",
        "priority": "Medium",
        "status": "Backlog",
    }
    st, resp = post(f"{NEBULA}/api/harvest-candidates/{cid}/spawn-requirement", payload, timeout=90)
    if st in (200, 201):
        patch(f"{NEBULA}/api/harvest-candidates/{cid}", {"status": "promoted"})
        return "promoted", resp
    if st == 410:
        return "failed", "spawn endpoint returned 410 (verb renamed?) — update stage3 URL"
    return "failed", f"spawn-requirement HTTP {st}: {json_trunc(resp)}"


SANDBOX_ROOT = Path("/home/codex/dev/nexus/sandbox")


def scaffold_sandbox(item):
    """Sandbox-track execution (ruling c26ca340; amendment 3adcda46 item 3).

    Builds the greenfield directory skeleton for a blocker-free candidate:
    nexus/sandbox/<short8>-<slug>/ with PROVENANCE.md (candidate id, CPF,
    track compliance) and README.md stating claimed behavior + adoption path.
    Constraint compliance: self-contained, no mainline imports written here,
    nothing outside the sandbox dir is touched.
    """
    short = item["id"][:8]
    slug = re.sub(r"[^a-z0-9]+", "-", (item.get("title") or "candidate").lower()).strip("-")[:40]
    root = SANDBOX_ROOT / f"{short}-{slug or 'candidate'}"
    if root.exists():
        return "skipped-sandbox-exists", str(root)
    try:
        root.mkdir(parents=True)
    except OSError as e:
        return "failed", f"sandbox mkdir: {e}"
    cpf = f"{item.get('readiness', 0):.2f}"
    (root / "PROVENANCE.md").write_text(
        f"# Provenance — sandbox artifact `{short}`\n\n"
        f"- candidate id: {item['id']}\n"
        f"- source batch thread: see promotion-flow manifest\n"
        f"- CPF readiness at gate: {cpf}\n"
        f"- qualification: blocker-free (zero linked open questions) per c26ca340\n"
        f"- destination chosen via operator/planner decision card (decision 319defa5)\n"
        f"- constraints: self-contained; zero mainline imports; no shared config/secrets\n"
        f"- adoption: evaluated later per greenfield ruling — nothing promoted to requirements\n",
        encoding="utf-8",
    )
    (root / "README.md").write_text(
        f"# {item.get('title') or short}\n\n"
        f"Sandbox-track build-out for harvest candidate `{item['id']}`.\n\n"
        f"## Claimed behavior\n\n"
        f"(To be implemented here — this scaffold only establishes provenance "
        f"and intent. Implementation is time-boxed and must stay self-contained.)\n\n"
        f"## Intent (from harvest)\n\n"
        f"{(item.get('intent_description') or item.get('description') or '(none captured)').strip()}\n\n"
        f"## Adoption path\n\n"
        f"Facts-on-the-ground first: if this proves useful, a follow-up proposal "
        f"migrates it into the mainline with review. Rejection leaves this directory "
        f"in place as history.\n",
        encoding="utf-8",
    )
    return "sandboxed", str(root)


def json_trunc(x, n=300):
    import json as _j
    try:
        return _j.dumps(x)[:n]
    except Exception:
        return str(x)[:n]


def corpus_counts():
    _, reqs = get(f"{NEBULA}/api/requirements?limit=1")
    total_reqs = (reqs.get("total") if isinstance(reqs, dict) else None) or 0
    return total_reqs


def parse_args(ap):
    return ap.parse_args()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--batch", type=str, default=None, help="restrict to one batch id")
    ap.add_argument(
        "--allow-auto",
        action="store_true",
        help="re-enable the SOL auto-approve path (default OFF after halt c19018b3)",
    )
    args = parse_args(ap)

    # ── Gate-state guard (halt c19018b3): refuse under active halt/deferral.
    ok, reason = gate_guard_check()
    if not ok:
        return 2

    manifests = [m for m in load_manifests() if not m.get("executed")]
    if args.batch:
        manifests = [m for m in manifests if m["batch_id"] == args.batch]
    if not manifests:
        log("no open promotion batches awaiting execution")
        return 0

    systems = fetch_systems()
    any_action = False

    for manifest in manifests:
        bid = manifest["batch_id"]
        approved, new_comments = parse_verdicts(manifest, systems)

        # ── Auto-approve gate — DISABLED by default after halt c19018b3.
        # "No manual verdicts" used to be treated as promotable when the SOL
        # gate passed, which is exactly backwards under a deferral ruling.
        # Re-enable ONLY with --allow-auto AND no active halt (guard above).
        auto = False
        if not approved and args.allow_auto:
            solo = []
            for c in manifest["candidates"]:
                if c.get("promoted") or c.get("struck"):
                    continue
                admitted, reason = evaluate_candidate_ready(c, manifest["thread_id"])
                if admitted:
                    c["systemId"] = resolve_mapping(
                        c.get("system_name") or "(none)",
                        c.get("subsystem_name") or "(none)",
                        systems,
                    )[0]
                    solo.append(c)
                    log(f"  SOL-gate: {c['id'][:8]} ({c.get('title','')[:40]}) — auto-approved")
            if solo:
                approved = solo
                auto = True

        if not new_comments and not auto and all(c.get("promoted") for c in manifest["candidates"]) is False and not approved:
            # nothing new to act on for this batch
            save_manifest(bid, manifest)
            continue
        if args.dry_run:
            log(f"DRY RUN batch {bid}: would promote {[c['id'][:8] for c in approved]}")
            continue
        if not approved:
            manifest.setdefault("verdicts_seen", []).extend(new_comments)
            save_manifest(bid, manifest)
            log(f"batch {bid}: verdicts recorded, no approvable items yet")
            continue

        reqs_before = corpus_counts()
        results = {"promoted": [], "skipped": [], "failed": [], "sandboxed": []}
        for item in approved:
            if item.get("card_destination") == "sandbox":
                outcome, detail = scaffold_sandbox(item)
            else:
                outcome, detail = promote(item, systems)
            entry = f"`{item['id'][:8]}` {item.get('title','')[:50]}"
            key = {"skipped-promoted": "skipped", "skipped-sandbox-exists": "skipped"}.get(outcome, outcome)
            results.setdefault(key, []).append(
                entry + (f" — {detail}" if detail else "")
            )
            if outcome in ("promoted", "sandboxed"):
                for c in manifest["candidates"]:
                    if c["id"] == item["id"]:
                        c["promoted"] = True
                        if outcome == "sandboxed":
                            c["sandbox_path"] = detail
            log(f"  {outcome}: {entry}")
        reqs_after = corpus_counts()

        executed = len(results["promoted"])
        sandboxes = len(results.get("sandboxed", []))
        summary = (
            f"# Stage-3 execution — batch `{bid}`\n\n"
            f"- promoted: **{executed}** via spawn_requirement_from_candidate\n"
            f"- sandboxed: **{sandboxes}** scaffolded under nexus/sandbox/ (ruling c26ca340)\n"
            f"- skipped (already promoted/scaffolded): {len(results['skipped'])}\n"
            f"- failed: {len(results['failed'])}\n"
            + ("\n".join(f"  - {f}" for f in results['failed']) + "\n" if results['failed'] else "")
            + f"- struck earlier / never approved are untouched\n"
            f"- requirements corpus: {reqs_before} -> {reqs_after}\n"
            f"- traceability: requirement.candidate_id -> candidate; plans cross-ref via spawns_plan\n"
        )
        # Forum-per-table: harvest_candidates table changed -> harvest-candidates forum.
        forum_post("harvest-candidates", f"promotion-batch {bid} executed: {executed} promoted", summary)
        forum_comment(manifest["thread_id"],
                      f"Executed: {executed} promoted, {len(results['failed'])} failed. "
                      f"Requirements {reqs_before} -> {reqs_after}. Audit mirrored to harvest-candidates forum.")
        agent_record(
            f"promotion-batch {bid} executed: {executed} promoted, {len(results['failed'])} failed",
            summary,
            ["spec:promotion-flow", "planRef:0005", f"batch:{bid}",
             "type:change", "status:resolved", "to:architect", "to:planner"],
        )
        inbox_ping("architect", f"promotion-batch {bid} executed ({executed} promoted)",
                   ["spec:promotion-flow", "planRef:0005", f"batch:{bid}"])
        manifest["executed_at"] = now_iso()
        if all(c.get("promoted") or c.get("struck") for c in manifest["candidates"]):
            manifest["executed"] = True  # fully drained; stop polling this batch
        save_manifest(bid, manifest)
        any_action = True

    if not any_action:
        log("no actionable gate verdicts this pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
