#!/usr/bin/env python3
"""Negative + isolation tests for stage3 verdict parsing.

Covers the ce916b34 (pre-resume blocker) acceptance list:
  - prose with approve-like words NEVER promotes (C2 backdoor dead)
  - quoted/mirrored cards from other contexts never promote
  - multi-card replies keep MAP/remap text bound to their own card
  - valid structured card clicks parse and carry approval-source attribution

Run: python3 test_stage3_parser.py   (exits non-zero on any failure)
"""
import sys

from stage3_execute import parse_card_reply, parse_verdicts

FAILURES = []


def check(name, cond, detail=""):
    if cond:
        print(f"  PASS {name}")
    else:
        FAILURES.append(name)
        print(f"  FAIL {name} {detail}")


def _manifest(n=2, mapped=True):
    cands = []
    for i in range(n):
        cid = f"{i:08x}-0000-0000-0000-000000000000"
        cands.append({
            "id": cid, "title": f"cand {i}",
            "system_name": "Alpha" if mapped else "(none)",
            "subsystem_name": "Core" if mapped else "",
            "systemId": "sys-1" if mapped else None,
            "subsystemId": None,
        })
    return {
        "batch_id": "testbatch", "thread_id": "t0",
        "candidates": cands,
    }


def _items(manifest):
    return {c["id"]: dict(c) for c in manifest["candidates"]}


# ── 1. Prose approve-like words never promote (C2) ──────────────
PROSE_NEGATIVES = [
    "I do not approve of this batch.",
    "approval pending operator review",
    "APPROVE",                       # bare keyword alone
    "Please APPROVE all items when ready",
    "We decline to approve; questions remain",
    "approved by nobody present",
]
import stage3_execute as se

def run(manifest, systems={"Alpha": ("sys-1", None)}):
    """Drive parse_verdicts with comments injected via thread_comments."""
    se.thread_comments = lambda tid: manifest.get("verdict_comments", [])
    return se.parse_verdicts(manifest, systems)

print("1. prose approve-like comments -> zero promotions")
for text in PROSE_NEGATIVES:
    m = _manifest()
    manifest = {"thread_id": "t", "candidates": m["candidates"],
                "verdict_comments": [{"id": "c1", "author": {"name": "operator"}, "body": text}],
                "verdicts_seen": []}
    final, _ = run(manifest)
    check(repr(text[:34]), len(final) == 0, f"got {len(final)} approved")

# ── 2. Valid structured card click approves exactly its item ────
print("2. structured card Requirement click -> 1 approval w/ attribution")
manifest = {"thread_id": "t", "candidates": _manifest()["candidates"], "verdict_comments": [], "verdicts_seen": []}
cands = manifest["candidates"]
short0 = cands[0]["id"][:8]
manifest["verdict_comments"] = [{
    "id": "c2", "author": {"name": "operator"},
    "body": f"**Agreed selection:**\n- (x) {short0}: Requirement\n"}]
final, _ = run(manifest)
check("one approval", len(final) == 1, f"got {len(final)}")
check("right item", bool(final) and final[0]["id"] == cands[0]["id"])
check("attributed", bool(final) and final[0].get("approved_by") == "operator")

# ── 3. Quoted/mirrored card text without header never promotes ──
print("3. mirrored card quote (no Agreed-selection header) -> zero")
manifest["verdict_comments"] = [{
    "id": "c3", "author": {"name": "observer"},
    "body": f"For reference the card said:\n- (x) {short0}: Requirement\n"}]
final, _ = run(manifest)
check("zero promotions", len(final) == 0, f"got {len(final)}")

# ── 4. Multi-card isolation: remap binds to its own card only ───
print("4. cross-card isolation in multi-card reply")
a, b = cands[0], cands[1]
sa, sb = a["id"][:8], b["id"][:8]
body = (
    "**Agreed selection:**\n"
    f"- (x) {sa}: Other for {sa} — remap as \"Zeta :: Ops\"\n"
    "**Agreed selection:**\n"
    f"- (x) {sb}: Requirement\n"
)
v = parse_card_reply(body)
check("card A remap", v.get(sa, (None,))[0] == "remap", str(v.get(sa)))
check("card B requirement", v.get(sb, (None,))[0] == "approve", str(v.get(sb)))
check("remap text clean", v.get(sa, (None, None))[1] == "Zeta :: Ops", repr(v.get(sa)))

# ── 5. Sandbox verdict needs no mapping ─────────────────────────
print("5. sandbox on unmapped item is honored")
unmapped = _manifest(1, mapped=False)
u0 = unmapped["candidates"][0]["id"][:8]
manifest2 = {"thread_id": "t", "candidates": unmapped["candidates"],
             "verdict_comments": [{"id": "c5", "author": {"name": "planner"},
                                   "body": f"**Agreed selection:**\n- (x) {u0}: Sandbox\n"}],
             "verdicts_seen": []}
final2, _ = run(manifest2, {})
check("sandbox approved", len(final2) == 1, f"got {len(final2)}")
check("destination=sandbox", bool(final2) and final2[0].get("card_destination") == "sandbox")

# ── 6. Engineer-authored comments cannot approve (self-approval guard) ──
print("6. engineer author card click ignored")
manifest3 = {"thread_id": "t", "candidates": _manifest()["candidates"],
             "verdict_comments": [{"id": "c6", "author": {"name": "engineer-ii"},
                                   "body": f"**Agreed selection:**\n- (x) {cands[1]['id'][:8]}: Requirement\n"}],
             "verdicts_seen": []}
final3, _ = run(manifest3)
check("zero promotions from engineer self-click", len(final3) == 0, f"got {len(final3)}")

print()
if FAILURES:
    print(f"FAILED: {len(FAILURES)} -> {FAILURES}")
    sys.exit(1)
print("ALL PARSER TESTS PASSED")
