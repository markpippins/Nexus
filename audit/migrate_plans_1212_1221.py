#!/usr/bin/env python3
"""Batch-migrate Conduit plans 1212-1221 into Nebula requirements, then soft-delete."""
import json, urllib.request, urllib.error, sys, time

CONDUIT = "http://localhost:3100"
NEBULA = "http://localhost:3101"
SYSTEM_ID = "690d0f90-356c-4e10-be2f-8f92ec59f53f"
SUBSYSTEM_ID = "570b0ccc-59bd-489f-ad71-1e00dc63b567"

def conduit(name, args):
    d = json.dumps({"name": name, "arguments": args}).encode()
    req = urllib.request.Request(f"{CONDUIT}/tools/call", data=d, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            body = json.loads(r.read())
            content = body.get("content", body.get("result", {}))
            if isinstance(content, str): content = json.loads(content)
            return content
    except Exception as e:
        print(f"  ERR conduit {name}: {e}")
        return None

def nebula_post(data):
    d = json.dumps(data).encode()
    req = urllib.request.Request(f"{NEBULA}/api/requirements", data=d, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"  ERR nebula POST: {e.code} {e.read().decode()[:200]}")
        return None

PLANS = list(range(1212, 1222))

print(f"Migrating plans {PLANS[0]}-{PLANS[-1]}...")
created = 0
deleted = 0
failed = []

for pn in PLANS:
    # Get plan details from state
    state = conduit("query_conduit_state", {})
    plan = None
    for cat in ["pending", "active", "blocked"]:
        for p in state.get("plans", {}).get(cat, []):
            if int(p.get("planNumber", 0)) == pn:
                plan = p
                break
    if not plan:
        failed.append(f"#{pn}: not found in conduit")
        continue

    title = plan.get("title", "?")
    project = plan.get("project", "")
    goal = plan.get("goal", "")
    acceptance = plan.get("acceptanceCriteria", [])
    created_at = plan.get("createdAt", "")

    # Get receipts
    receipts = conduit("get_plan_receipts", {"plan_id": pn})
    receipt_list = receipts.get("receipts", []) if receipts else []
    receipt_md = "### Work Attempt History\n\n"
    receipt_md += "| # | Type | Agent | Summary | Time |\n|---|------|-------|---------|------|\n"
    for i, r in enumerate(receipt_list, 1):
        receipt_md += f"| {i} | {r.get('type','?')} | {r.get('agent_role','?')} | {(r.get('summary','') or '')[:50]} | {(r.get('created_at','') or '')[:19]} |\n"
    receipt_md += f"\n**Total receipts:** {len(receipt_list)}\n"

    desc = f"**Original Plan:** #{pn}\n**Project:** {project}\n**Created:** {created_at}\n**Source:** Conduit pipeline (migrated 2026-07-03)\n\n## Goal\n{goal}\n"
    if acceptance:
        desc += "\n## Acceptance Criteria\n" + "\n".join(f"- {a}" for a in acceptance)
    desc += "\n" + receipt_md

    # Create requirement
    result = nebula_post({
        "systemId": SYSTEM_ID,
        "subsystemId": SUBSYSTEM_ID,
        "title": f"[Plan #{pn}] {title}",
        "description": desc,
        "status": "Backlog",
        "priority": "Medium",
        "reqType": "Epic"
    })

    if result and "error" not in result:
        print(f"  ✓ #{pn} → requirement {result.get('id','?')[:8]}...")
        created += 1
        # Soft-delete
        dr = conduit("delete_plan", {"planNumber": str(pn)})
        if dr and dr.get("deleted"):
            print(f"    ✓ soft-deleted from Conduit")
            deleted += 1
        else:
            print(f"    ⚠ delete result: {json.dumps(dr)[:80]}")
            failed.append(f"#{pn}: delete issue")
    else:
        print(f"  ✗ #{pn}: failed — {str(result)[:100]}")
        failed.append(f"#{pn}: create failed")
    time.sleep(0.15)

print(f"\nDone. Created: {created}, Deleted: {deleted}, Failed: {len(failed)}")
for f in failed: print(f"  - {f}")
