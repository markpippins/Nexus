#!/usr/bin/env python3
"""Migrate pending Conduit plans 1207-1211 into existing Nebula requirements
by updating them in-place with [Plan #XXXX] prefix, migration markers, and
receipt history. Then soft-delete the plans from Conduit.

Usage: python3 tmp/migrate_plans_1207_1211.py
"""

import json
import urllib.request
import urllib.error
import sys
import time

CONDUIT = "http://localhost:3100"
NEBULA = "http://localhost:3101"
SYSTEM_ID = "690d0f90-356c-4e10-be2f-8f92ec59f53f"
SUBSYSTEM_ID = "570b0ccc-59bd-489f-ad71-1e00dc63b567"

# Map pending plan numbers → existing Nebula requirement IDs (by title match)
PLAN_TO_REQ = {
    1207: "36dfd699-1e48-4529-b7ad-9eddb98196a8",  # Unified SemanticProjectionBuilder
    1208: "576ec70e-80c7-4a7e-b2b2-da735d9a5eb0",  # Execution Session State Model
    1209: "635cba22-a7a9-4af7-a18a-f1e612f478c8",  # Calendar Domain
    1210: "c066b240-470b-46bc-b6c1-4b80be6cc08c",  # Communication Domain
    1211: "e8caf1f7-527a-4fc6-82ef-abc2c508d72e",  # Reusable dbt Macros
}

# Extra duplicates that should be noted (not part of this migration)
EXTRA_DUPLICATES = {
    "64e3fede-ed08-49d4-8cb8-a63c389d81be": "SemanticProjectionBuilder (extra duplicate of plan 1207)",
}

def conduit_call(name, args):
    """Call a conduit-mcp tool."""
    data = json.dumps({"name": name, "arguments": args}).encode()
    req = urllib.request.Request(f"{CONDUIT}/tools/call", data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read())
            content = body.get("content", body.get("result", {}))
            if isinstance(content, str):
                content = json.loads(content)
            return content
    except Exception as e:
        print(f"  ERROR conduit_call({name}): {e}")
        return None

def nebula_get_requirements():
    """GET all requirements from nebula API."""
    try:
        with urllib.request.urlopen(f"{NEBULA}/api/requirements?limit=50", timeout=10) as resp:
            raw = json.loads(resp.read())
            if isinstance(raw, list):
                return raw
            return raw.get("requirements", raw.get("data", raw))
    except Exception as e:
        print(f"  ERROR nebula GET requirements: {e}")
        return []

def nebula_patch(endpoint, data):
    """PATCH to nebula API."""
    data_bytes = json.dumps(data).encode()
    req = urllib.request.Request(f"{NEBULA}{endpoint}", data=data_bytes,
                                 headers={"Content-Type": "application/json"},
                                 method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  ERROR nebula PATCH {endpoint}: {e.code} {body[:200]}")
        return None
    except Exception as e:
        print(f"  ERROR nebula PATCH {endpoint}: {e}")
        return None

def get_plan_from_state(plan_number):
    """Get a specific plan from conduit state."""
    state = conduit_call("query_conduit_state", {})
    if not state:
        return None
    plans_section = state.get("plans", {}) if isinstance(state, dict) else state.get("result", {}).get("plans", {})
    for category in ["pending", "active", "blocked", "completed"]:
        for p in plans_section.get(category, []):
            pn = p.get("planNumber")
            if isinstance(pn, str):
                pn = int(pn)
            if pn == plan_number:
                return p
    return None

def get_receipts(plan_number):
    """Get receipts for a plan."""
    result = conduit_call("get_plan_receipts", {"plan_id": plan_number})
    if not result:
        return []
    return result.get("receipts", [])

def format_receipt_history(receipts):
    """Format receipt history as markdown."""
    if not receipts:
        return "_No work attempts recorded_"

    lines = ["### Work Attempt History", ""]
    lines.append("| # | Type | Agent | Summary | Time |")
    lines.append("|---|------|-------|---------|------|")
    for i, r in enumerate(receipts, 1):
        rtype = r.get("type", "?")
        role = r.get("agent_role", "?")
        summary = (r.get("summary", "") or "")[:60]
        ts = (r.get("created_at", "") or "")[:19]
        lines.append(f"| {i} | {rtype} | {role} | {summary} | {ts} |")

    type_counts = {}
    for r in receipts:
        t = r.get("type", "?")
        type_counts[t] = type_counts.get(t, 0) + 1

    lines.append("")
    lines.append(f"**Total receipts:** {len(receipts)}")
    for t, c in sorted(type_counts.items()):
        lines.append(f"- {t}: {c}")

    return "\n".join(lines)

def build_migration_description(plan, receipts):
    """Build the full migration description for a requirement update."""
    plan_number = plan.get("planNumber", "")
    project = plan.get("project", "")
    goal = plan.get("goal", "")
    acceptance = plan.get("acceptanceCriteria", [])
    ticket_statuses = plan.get("ticketStatuses", {})
    created_at = plan.get("createdAt", "")

    receipt_history = format_receipt_history(receipts)

    # Format ticket info
    ticket_info = ""
    for role, ticket in ticket_statuses.items():
        status = ticket.get("status", "?")
        tid = ticket.get("id", "")
        ticket_info += f"- **{role}**: {status} (ticket: {tid})\n"

    desc_parts = [
        f"**Original Plan:** #{plan_number}",
        f"**Project:** {project}",
        f"**Created:** {created_at}",
        f"**Source:** Conduit pipeline (migrated 2026-07-03)",
        "",
        "## Goal",
        goal,
    ]

    if acceptance:
        desc_parts.append("")
        desc_parts.append("## Acceptance Criteria")
        for a in acceptance:
            desc_parts.append(f"- {a}")

    if ticket_info:
        desc_parts.append("")
        desc_parts.append("## Ticket Status at Migration")
        desc_parts.append(ticket_info.strip())

    desc_parts.append("")
    desc_parts.append(receipt_history)

    return "\n".join(desc_parts)

def update_requirement(req_id, title, description):
    """PATCH update a Nebula requirement."""
    data = {
        "title": title,
        "description": description,
        "systemId": SYSTEM_ID,
        "subsystemId": SUBSYSTEM_ID,
    }
    return nebula_patch(f"/api/requirements/{req_id}", data)

def soft_delete_plan(plan_number):
    """Soft-delete a plan from conduit-mcp."""
    result = conduit_call("delete_plan", {"planNumber": str(plan_number)})
    return result

def main():
    plan_numbers = [1207, 1208, 1209, 1210, 1211]

    print("=" * 65)
    print("CONDUIT → NEBULA REQUIREMENT UPDATE (IN-PLACE MIGRATION)")
    print("=" * 65)
    print(f"Plans: {plan_numbers}")
    print(f"System ID:  {SYSTEM_ID}")
    print(f"Subsystem:  {SUBSYSTEM_ID}")
    print()

    # First, verify which requirements exist by listing all
    print("Verifying existing Nebula requirements...")
    all_reqs = nebula_get_requirements()
    req_by_id = {r.get("id"): r for r in all_reqs}
    for plan_num in plan_numbers:
        req_id = PLAN_TO_REQ.get(plan_num)
        if req_id and req_id in req_by_id:
            title = req_by_id[req_id].get("title", "?")
            print(f"  ✓ Plan #{plan_num} → requirement {req_id}: \"{title[:60]}\"")
        elif req_id:
            print(f"  ✗ Plan #{plan_num} → requirement {req_id}: NOT FOUND in {len(all_reqs)} requirements")
        else:
            print(f"  ?  Plan #{plan_num} → no mapping")
    print()

    if EXTRA_DUPLICATES:
        print("NOTE — Extra duplicate requirements exist (not processed in this run):")
        for req_id, desc in EXTRA_DUPLICATES.items():
            print(f"  • {req_id}: {desc}")
        print()

    # Confirm before proceeding
    print("Will update these 5 requirements in-place and soft-delete the Conduit plans.")
    print()

    success_updates = []
    success_deletes = []
    failures = []

    for i, plan_num in enumerate(plan_numbers, 1):
        req_id = PLAN_TO_REQ.get(plan_num)
        if not req_id:
            failures.append(f"Plan #{plan_num}: no requirement mapping")
            continue

        print(f"[{i}/{len(plan_numbers)}] Plan #{plan_num}")

        # Get plan details from conduit state
        plan = get_plan_from_state(plan_num)
        if not plan:
            print(f"  ✗ Plan #{plan_num} not found in conduit state")
            failures.append(f"Plan #{plan_num}: not found in conduit")
            continue

        title_orig = plan.get("title", "?")[:70]
        status = plan.get("derivedStatus", "?")
        print(f"  Status: {status} — \"{title_orig}\"")

        # Get receipts
        receipts = get_receipts(plan_num)
        print(f"  Receipts: {len(receipts)}")

        # Build migration content
        new_title = f"[Plan #{plan_num}] {title_orig}"
        description = build_migration_description(plan, receipts)

        # Update the requirement
        print(f"  Updating requirement {req_id} → \"{new_title[:70]}\"")
        patch_result = update_requirement(req_id, new_title, description)

        if patch_result and (patch_result.get("id") or patch_result.get("ok")):
            print(f"  ✓ Requirement updated")
            success_updates.append(plan_num)

            # Soft-delete the plan
            print(f"  Soft-deleting plan #{plan_num} from Conduit...")
            del_result = soft_delete_plan(plan_num)
            if del_result and del_result.get("deleted"):
                print(f"  ✓ Plan soft-deleted from Conduit")
                success_deletes.append(plan_num)
            else:
                print(f"  ⚠ Delete result: {json.dumps(del_result)[:100]}")
                failures.append(f"Plan #{plan_num}: delete failed — {json.dumps(del_result)[:80]}")
        else:
            error = str(patch_result)[:100] if patch_result else "no response"
            print(f"  ✗ Failed to update requirement: {error}")
            failures.append(f"Plan #{plan_num}: update failed — {error}")

        # Brief delay
        time.sleep(0.1)

    print()
    print("=" * 65)
    print("MIGRATION COMPLETE")
    print("=" * 65)
    print(f"Requirements updated: {len(success_updates)}")
    print(f"Plans soft-deleted:   {len(success_deletes)}")
    print(f"Failures:            {len(failures)}")
    if failures:
        for f in failures:
            print(f"  - {f}")
    if EXTRA_DUPLICATES:
        print()
        print("NOTE: Extra duplicate requirements to clean up manually:")
        for req_id, desc in EXTRA_DUPLICATES.items():
            print(f"  • {req_id}: {desc}")


if __name__ == "__main__":
    main()
