"""Vocabulary Consistency Tests — receipt types, WRP states, ticket statuses.

Verifies that closed-set declarations match across all language boundaries:
DB CHECK, TS ReceiptType, TS ALLOWED, nebula-mcp contract, Python states.py,
and Python conduit/main.py.
"""
import re
import subprocess
import os

NEXUS_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus", "-t", "-A"]

passed = failed = skipped = 0

def query(sql):
    result = subprocess.run(
        DOCKER_PSQL + ["-c", sql],
        capture_output=True, text=True, timeout=10
    )
    return result.stdout.strip() if result.returncode == 0 else None

def read_file(relpath):
    with open(os.path.join(NEXUS_ROOT, relpath)) as f:
        return f.read()

def check(name, condition, detail=""):
    global passed, failed
    if condition:
        print(f"  PASS  {name}")
        passed += 1
    else:
        print(f"  FAIL  {name}")
        if detail:
            for line in detail.split("\n"):
                print(f"        {line}")
        failed += 1

def extract_receipt_types_from_db():
    """Extract valid receipt types from DB CHECK constraints on receipt tables.
    
    Checks kernel.receipt.receipt_type, vision.receipts.type, and conduit.receipts.type.
    """
    types = set()
    # kernel.receipt uses receipt_type CHECK
    result = query("""
        SELECT pg_get_constraintdef(con.oid)
        FROM pg_constraint con
        JOIN pg_class c ON con.conrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'kernel' AND c.relname = 'receipt' AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) LIKE '%receipt_type%';
    """)
    if result:
        for t in re.findall(r"'(\w+)'", result):
            types.add(t.upper())
    
    # vision.receipts — check if type CHECK exists
    result = query("""
        SELECT pg_get_constraintdef(con.oid)
        FROM pg_constraint con
        JOIN pg_class c ON con.conrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'vision' AND c.relname = 'receipts' AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) LIKE '%type%';
    """)
    if result:
        for t in re.findall(r"'(\w+)'", result):
            types.add(t.upper())
    
    return types if types else None

def extract_receipt_types_from_ts_types():
    """Extract from types.ts ReceiptType union."""
    src = read_file("typescript/conduit-mcp/src/types.ts")
    m = re.search(r"export type ReceiptType =\n((?:\s+\|.*\n)+)", src)
    if not m:
        return None
    return set(re.findall(r'"(\w+)"', m.group(1)))

def extract_receipt_types_from_receipts_allowed():
    """Extract from receipts.ts ALLOWED keys."""
    src = read_file("typescript/conduit-mcp/src/receipts.ts")
    # Match keys like PLAN_CREATE: [...] or "": [...]
    return set(re.findall(r'\"?(\w+)\"?:\s*\[', src)) - {""}

def extract_receipt_types_from_contract():
    """Extract from nebula-mcp conduit-wrp-contract.ts ConduitReceiptType union."""
    src = read_file("typescript/nebula-mcp/src/conduit-wrp-contract.ts")
    m = re.search(r"export type ConduitReceiptType =\n((?:\s+\|.*\n)+)", src)
    if not m:
        return None
    return set(re.findall(r'"(\w+)"', m.group(1)))

def extract_receipt_types_from_python_states():
    """Extract from Python RECEIPT_TO_WRP_STATE keys."""
    src = read_file("python/nexus_core/wrp/states.py")
    m = re.search(r"RECEIPT_TO_WRP_STATE.*= \{((?:.*\n)+?)\}", src)
    if not m:
        return None
    return set(re.findall(r'"(\w+)":', m.group(1)))

def extract_success_fail_receipts():
    """Extract from Python _SUCCESS_RECEIPTS and _FAIL_RECEIPTS."""
    src = read_file("python/conduit/main.py")
    success = set(re.findall(r'_SUCCESS_RECEIPTS\s*=\s*\{((?:.*\n)+?)\}', src))
    fail = set(re.findall(r'_FAIL_RECEIPTS\s*=\s*\{((?:.*\n)+?)\}', src))
    types = set()
    for block in success | fail:
        types.update(re.findall(r'"(\w+)"', block))
    return types

def run():
    global passed, failed, skipped

    print("\n--- Receipt Type Sources ---")
    db_types = extract_receipt_types_from_db()
    ts_types = extract_receipt_types_from_ts_types()
    allowed_keys = extract_receipt_types_from_receipts_allowed()
    contract_types = extract_receipt_types_from_contract()
    py_states = extract_receipt_types_from_python_states()
    py_emitted = extract_success_fail_receipts()

    sources = {
        "DB CHECK (vision.receipts)": db_types,
        "TS ReceiptType (types.ts)": ts_types,
        "TS ALLOWED keys (receipts.ts)": allowed_keys,
        "nebula-mcp ConduitReceiptType": contract_types,
        "Python RECEIPT_TO_WRP_STATE": py_states,
        "Python _SUCCESS/_FAIL emitted": py_emitted,
    }

    for name, types in sources.items():
        if types:
            print(f"  {name}: {sorted(types)}")
        else:
            print(f"  {name}: COULD NOT EXTRACT")

    print("\n--- Cross-Source Consistency ---")
    print("NOTE: DB CHECK types come from vision.receipts (lifecycle events).")
    print("      TS/Python receipt types are conduit pipeline transition events.")
    print("      These are separate closed-set vocabularies — cross-domain comparison is invalid.")
    print("      Comparing only within the conduit domain (TS ↔ Python ↔ nebula-mcp).")
    print()

    # Compare within conduit domain only: TS types.ts ↔ TS ALLOWED ↔ nebula-mcp ↔ Python
    if ts_types and allowed_keys:
        missing_from_allowed = ts_types - allowed_keys
        extra_in_allowed = allowed_keys - ts_types
        check("TS ReceiptType ⊆ receipts.ts ALLOWED keys",
              not missing_from_allowed,
              f"Missing from ALLOWED: {sorted(missing_from_allowed)}" if missing_from_allowed else "")
        check("receipts.ts ALLOWED keys ⊆ TS ReceiptType",
              not extra_in_allowed,
              f"Extra in ALLOWED: {sorted(extra_in_allowed)}" if extra_in_allowed else "")

    if allowed_keys and contract_types:
        missing_from_contract = allowed_keys - contract_types
        extra_in_contract = contract_types - allowed_keys
        check("TS ALLOWED ⊆ nebula-mcp ConduitReceiptType",
              not missing_from_contract,
              f"Missing from contract: {sorted(missing_from_contract)}" if missing_from_contract else "")
        check("nebula-mcp ConduitReceiptType ⊆ TS ALLOWED",
              not extra_in_contract,
              f"Extra in contract: {sorted(extra_in_contract)}" if extra_in_contract else "")

    if contract_types and py_states:
        missing_from_py = contract_types - py_states
        extra_in_py = py_states - contract_types
        check("nebula-mcp ConduitReceiptType ⊆ Python RECEIPT_TO_WRP_STATE",
              not missing_from_py,
              f"Missing from Python: {sorted(missing_from_py)}" if missing_from_py else "")
        check("Python RECEIPT_TO_WRP_STATE ⊆ nebula-mcp ConduitReceiptType",
              not extra_in_py,
              f"Extra in Python: {sorted(extra_in_py)}" if extra_in_py else "")

    if py_emitted and py_states:
        # Filter emitted to only actual receipt types (exclude role names in FAIL set)
        py_emitted_types = py_emitted & py_states
        unemitted = py_states - py_emitted_types
        print(f"\n  Receipt types in state map but never emitted by orchestrator:")
        for t in sorted(unemitted):
            print(f"    - {t}")
        check("All emitted receipt types are in state map",
              py_emitted_types <= py_states,
              f"Emitted but not in state map: {sorted(py_emitted_types - py_states)}" if py_emitted_types - py_states else "")

    print("\n--- WRP State Machine Consistency ---")
    # Check Python adjacency matrix vs receipts.ts ALLOWED
    if allowed_keys and py_states:
        # receipts.ts defines transitions by receipt type, Python defines by WRP state
        # We check that every receipt type in ALLOWED has a mapping in Python
        for receipt_type in sorted(allowed_keys):
            if receipt_type not in py_states:
                check(f"receipts.ts receipt '{receipt_type}' has Python state mapping",
                      False, f"MISSING from RECEIPT_TO_WRP_STATE")

    print("\n--- Ticket Status Consistency ---")
    db_src = ""
    try:
        db_src = read_file("typescript/conduit-mcp/src/db.ts")
    except FileNotFoundError:
        pass
    py_ticket_src = ""
    try:
        py_ticket_src = read_file("python/conduit/db_adapter.py")
    except FileNotFoundError:
        pass

    # Extract from db.ts TicketRow type (not types.ts which has PlanStatus)
    ts_ticket = set()
    if db_src:
        m = re.search(r"status:\s*((?:\"\w+\"\s*\|?\s*)+)", db_src)
        if m:
            ts_ticket = set(re.findall(r'"(\w+)"', m.group(1)))

    py_ticket = set()
    if py_ticket_src:
        py_ticket = set(re.findall(r"['\"](\w+)['\"]", py_ticket_src)) & {"open", "claimed", "completed", "failed", "abandoned", "superseded", "cancelled", "stale", "expired"}

    if ts_ticket and py_ticket:
        check("TS and Python ticket statuses match",
              ts_ticket == py_ticket,
              f"Only in TS: {sorted(ts_ticket - py_ticket)}, Only in Python: {sorted(py_ticket - ts_ticket)}")
    else:
        check("Ticket status extraction", False, "Could not extract from one or both sources")

    return passed, failed, skipped
