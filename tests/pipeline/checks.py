"""Pipeline Consistency Tests — receipt paths, idempotency, transition tables.

Verifies that the receipt lifecycle is consistent across the TypeScript
MCP server, Python orchestrator, and database triggers.
"""
import re
import os

NEXUS_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

passed = failed = skipped = 0

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

def run():
    global passed, failed, skipped

    print("\n--- Receipt Insertion Paths ---")
    try:
        src = read_file("typescript/conduit-mcp/src/index.ts")
        lines = src.split("\n")
        # Find all INSERT INTO vision.receipts or insertReceipt calls
        insert_lines = [(i+1, line.strip()) for i, line in enumerate(lines)
                        if "INSERT INTO" in line and "receipts" in line.lower()
                        or "insertReceipt" in line]
        check("TS has receipt insertion path",
              len(insert_lines) > 0,
              "no INSERT INTO vision.receipts found in index.ts")
        for line_no, line in insert_lines[:5]:
            print(f"    line {line_no}: {line[:100]}")
    except FileNotFoundError:
        check("TS receipt insertion", False, "index.ts not found")

    try:
        src = read_file("python/conduit/main.py")
        lines = src.split("\n")
        insert_lines = [(i+1, line.strip()) for i, line in enumerate(lines)
                        if "INSERT INTO" in line and "receipt" in line.lower()
                        or "insert_receipt" in line]
        check("Python has receipt insertion path",
              len(insert_lines) > 0,
              "no receipt insertion found in conduit/main.py")
        for line_no, line in insert_lines[:5]:
            print(f"    line {line_no}: {line[:100]}")
    except FileNotFoundError:
        check("Python receipt insertion", False, "conduit/main.py not found")

    print("\n--- Receipt Idempotency ---")
    try:
        src = read_file("typescript/conduit-mcp/src/db.ts")
        # Check if insertReceipt uses ON CONFLICT DO NOTHING
        has_idempotent = "ON CONFLICT" in src and "DO NOTHING" in src
        check("TS insertReceipt has ON CONFLICT DO NOTHING",
              has_idempotent,
              "receipt insertion may create duplicates on retry")
    except FileNotFoundError:
        check("TS idempotency", False, "db.ts not found")

    try:
        src = read_file("python/conduit/db_adapter.py")
        # Find insert_receipt function or calls
        m = re.search(r"def insert_receipt.*?\).*?:\s*\n(.*?)(?=\n    def |\Z)", src, re.DOTALL)
        if m:
            body = m.group(1)
            has_on_conflict = "ON CONFLICT" in body
            check("Python insert_receipt has conflict handling",
                  has_on_conflict,
                  "no ON CONFLICT — duplicate receipt on retry")
        else:
            # Check for inline INSERT
            has_inline = "INSERT INTO" in src and "receipt" in src.lower()
            check("Python receipt insertion has conflict handling",
                  has_inline and "ON CONFLICT" in src,
                  "receipt INSERT may lack idempotency")
    except FileNotFoundError:
        check("Python idempotency", False, "db_adapter.py not found")

    print("\n--- Transition Table Consistency (TS ALLOWED vs Python adjacency) ---")
    try:
        receipts_src = read_file("typescript/conduit-mcp/src/receipts.ts")
        states_src = read_file("python/nexus_core/wrp/states.py")

        # Extract TS ALLOWED transitions
        m = re.search(r"const ALLOWED.*?= \{((?:.*\n)+?)\};", receipts_src)
        ts_transitions = {}
        if m:
            for from_state, to_states in re.findall(r'"?(\w+)"?\s*:\s*\[([^\]]*)\]', m.group(1)):
                ts_transitions[from_state] = set(re.findall(r'"(\w+)"', to_states))

        # Extract Python RECEIPT_TO_WRP_STATE
        m = re.search(r"RECEIPT_TO_WRP_STATE.*?= \{((?:.*\n)+?)\}", states_src)
        py_receipt_map = {}
        if m:
            for receipt, state in re.findall(r'"(\w+)":\s*"(\w+)"', m.group(1)):
                py_receipt_map[receipt] = state

        # Extract Python adjacency matrix
        m = re.search(r"WRP_ADJACENCY_MATRIX.*?= \{((?:.*\n)+?)\}", states_src)
        py_adjacency = {}
        if m:
            for state, targets in re.findall(r'"(\w+)":\s*\{([^}]*)\}', m.group(1)):
                py_adjacency[state] = set(re.findall(r'"(\w+)"', targets))

        # Cross-check: every receipt type in TS ALLOWED should have a Python mapping
        all_ts_receipts = set()
        for from_state, to_states in ts_transitions.items():
            all_ts_receipts.update(to_states)
            all_ts_receipts.add(from_state)

        missing_from_py = all_ts_receipts - set(py_receipt_map.keys()) - {""}
        check("All TS ALLOWED receipt types have Python state mappings",
              not missing_from_py,
              f"Missing: {sorted(missing_from_py)}" if missing_from_py else "")

        # Cross-check: every Python receipt should appear in TS ALLOWED
        missing_from_ts = set(py_receipt_map.keys()) - all_ts_receipts
        check("All Python receipt types appear in TS ALLOWED",
              not missing_from_ts,
              f"Missing: {sorted(missing_from_ts)}" if missing_from_ts else "")

        print(f"\n  TS ALLOWED defines {len(ts_transitions)} from-states")
        print(f"  Python adjacency defines {len(py_adjacency)} states")
        print(f"  Python receipt map defines {len(py_receipt_map)} receipt types")

    except FileNotFoundError as e:
        check("Transition table consistency", False, str(e))

    print("\n--- create_next_tickets role-transition consistency ---")
    try:
        src = read_file("python/conduit/db_adapter.py")
        m = re.search(r"def create_next_tickets.*?\).*?:\s*\n(.*?)(?=\n    def |\nclass |\Z)", src, re.DOTALL)
        if not m:
            src = read_file("python/conduit/main.py")
            m = re.search(r"def create_next_tickets.*?\).*?:\s*\n(.*?)(?=\n    def |\Z)", src, re.DOTALL)
        if m:
            body = m.group(1)
            has_role_map = "role" in body and ("transition" in body or "next_role" in body or "status" in body)
            check("create_next_tickets defines role transitions",
                  has_role_map,
                  "role-transition logic not found in function body")
        else:
            check("create_next_tickets exists", False, "function not found in db_adapter.py or main.py")
    except FileNotFoundError:
        check("create_next_tickets file", False, "db_adapter.py not found")

    print("\n--- plan_status view consistency ---")
    try:
        src = read_file("typescript/conduit-mcp/src/db.ts")
        m = re.search(r"CREATE VIEW.*?plan_status AS\s*(SELECT.*?)(?=;|CREATE)", src, re.DOTALL | re.IGNORECASE)
        if m:
            view_def = m.group(1)
            references_vision = "vision.receipts" in view_def or "VISION_SCHEMA" in view_def
            check("plan_status view references vision.receipts",
                  references_vision,
                  "plan_status should reference vision.receipts for receipt types")
        else:
            check("plan_status view", False, "view definition not found in db.ts")
    except FileNotFoundError:
        check("plan_status view", False, "db.ts not found")

    print("\n--- C-4: Critic receipt type correctness ---")
    try:
        src = read_file("python/conduit/main.py")
        m = re.search(r"_SUCCESS_RECEIPTS\s*=\s*\{([^}]+)\}", src, re.DOTALL)
        if m:
            body = m.group(1)
            critic_match = re.search(r'"critic"\s*:\s*"(\w+)"', body)
            if critic_match:
                critic_type = critic_match.group(1)
                check("_SUCCESS_RECEIPTS['critic'] == 'CRITIQUE_PASS'",
                      critic_type == "CRITIQUE_PASS",
                      f"critic emits '{critic_type}' — should be CRITIQUE_PASS")
            else:
                check("_SUCCESS_RECEIPTS['critic'] exists", False, "critic key not found in SUCCESS_RECEIPTS")
        else:
            check("_SUCCESS_RECEIPTS extraction", False, "could not parse SUCCESS_RECEIPTS from main.py")
    except FileNotFoundError:
        check("C-4 critic receipt", False, "main.py not found")

    return passed, failed, skipped
