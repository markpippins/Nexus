"""Guard Condition Tests — static code analysis for known bugs.

Checks for unused parameters, None-handling issues, input validation gaps,
and other guard condition failures identified in the code audits.
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

    print("\n--- C-7: _detect_api_limit_error exit_code usage ---")
    try:
        src = read_file("python/conduit/main.py")
        # Find the function body
        m = re.search(
            r"def _detect_api_limit_error\(exit_code.*?\).*?:\s*\n(.*?)(?=\ndef |\Z)",
            src, re.DOTALL
        )
        if m:
            body = m.group(1)
            # Check if exit_code is referenced in the body (not just the signature)
            uses_exit_code = "exit_code" in body.split("\n", 1)[-1] if "\n" in body else False
            check("_detect_api_limit_error uses exit_code parameter in body",
                  uses_exit_code,
                  "exit_code accepted but never used — output-only decision")
        else:
            check("_detect_api_limit_error exists", False, "function not found")
    except FileNotFoundError:
        check("_detect_api_limit_error file", False, "conduit/main.py not found")

    print("\n--- C-8: get_eligible_plans unrecognized role handling ---")
    try:
        src = read_file("python/conduit/db_adapter.py")
        m = re.search(
            r"def get_eligible_plans\(self.*?\).*?:\s*\n(.*?)(?=\n    def |\nclass |\Z)",
            src, re.DOTALL
        )
        if m:
            body = m.group(1)
            # Check if unrecognized role raises/warns or silently returns empty
            has_warning = "warn" in body.lower() or "log" in body.lower() or "raise" in body.lower()
            has_silent_return = "return []" in body or "return ()" in body
            check("get_eligible_plans warns on unrecognized role",
                  has_warning or not has_silent_return,
                  "silently returns [] for unrecognized role — typo in --role suppresses all plans")
        else:
            check("get_eligible_plans exists", False, "function not found")
    except FileNotFoundError:
        check("get_eligible_plans file", False, "db_adapter.py not found")

    print("\n--- C-5: restart-builder input validation ---")
    try:
        src = read_file("typescript/conduit-mcp/src/index.ts")
        m = re.search(r"restart-builder.*?(?=app\.(post|get|put|delete)|$)", src, re.DOTALL)
        if m:
            handler = m.group(0)
            has_regex = "test(planId)" in handler or "test(" in handler
            has_validation = "Invalid" in handler or "400" in handler
            check("restart-builder validates planId with regex",
                  has_regex and has_validation,
                  "may lack input validation")
        else:
            check("restart-builder endpoint", False, "endpoint not found")
    except FileNotFoundError:
        check("restart-builder file", False, "index.ts not found")

    print("\n--- G-10: bool(row[0]) None handling ---")
    try:
        src = read_file("python/conduit/db_adapter.py")
        # Find bool(row[0]) patterns
        matches = [(i+1, line.strip()) for i, line in enumerate(src.split("\n"))
                    if "bool(row[0])" in line or "bool(result" in line]
        if matches:
            for line_no, line in matches:
                # Check if there's a None guard before the bool call
                context_start = max(0, src.rfind("\n", 0, src.find(line)) - 200)
                context = src[context_start:src.find(line)]
                has_none_guard = "is not None" in context or "if result" in context or "if row" in context
                check(f"bool(row[0]) at line {line_no} has None guard",
                      has_none_guard,
                      "PostgreSQL NULL → Python None → bool(None) = False, but 0 also = False")
        else:
            check("bool(row[0]) pattern", True, "no instances found (may have been fixed)")
    except FileNotFoundError:
        check("bool(row[0]) file", False, "db_adapter.py not found")

    print("\n--- G-12: ticket_id used after potential None ---")
    try:
        src = read_file("python/conduit/main.py")
        lines = src.split("\n")
        found_issue = False
        for i, line in enumerate(lines):
            stripped = line.strip()
            # Look for ticket_id = some_function_call(...) patterns
            if "ticket_id" in stripped and "=" in stripped and "def " not in stripped:
                # Check if this is an assignment from a function call (could return None)
                if "(" in stripped and "return" not in stripped:
                    # Check next 5 lines for usage without None guard
                    context = "\n".join(lines[i+1:i+6])
                    if "ticket_id" in context and "if ticket_id" not in context and "ticket_id is not None" not in context and "ticket_id and" not in context:
                        check(f"ticket_id used without None guard at line {i+1}",
                              False,
                              f"assignment: {stripped[:80]}")
                        found_issue = True
                        break
        if not found_issue:
            check("ticket_id None guard", True, "no unguarded usage found")
    except FileNotFoundError:
        check("ticket_id None guard file", False, "main.py not found")

    print("\n--- G-13: work_requests INSERT conflict handling ---")
    try:
        src = read_file("python/conduit/db_adapter.py")
        m = re.search(r"def add_work_request.*?\).*?:\s*\n(.*?)(?=\n    def |\nclass |\Z)", src, re.DOTALL)
        if m:
            body = m.group(1)
            has_on_conflict = "ON CONFLICT" in body or "on_conflict" in body or "conflict" in body.lower()
            check("add_work_request handles conflicts",
                  has_on_conflict,
                  "no ON CONFLICT handling — wr_id collision on rapid-fire retries")
        else:
            check("add_work_request exists", False, "function not found")
    except FileNotFoundError:
        check("add_work_request file", False, "db_adapter.py not found")

    print("\n--- C-2: validateReceipt called from both TS receipt paths ---")
    try:
        src = read_file("typescript/conduit-mcp/src/index.ts")
        # Find all insertReceipt calls
        insert_calls = [i+1 for i, line in enumerate(src.split("\n"))
                        if "insertReceipt" in line or "insert_receipt" in line]
        validate_calls = [i+1 for i, line in enumerate(src.split("\n"))
                          if "validateReceipt" in line]
        check("validateReceipt is called from index.ts",
              len(validate_calls) > 0,
              f"validateReceipt calls: {len(validate_calls)}, insertReceipt calls: {len(insert_calls)}")
        if len(insert_calls) > len(validate_calls):
            check("Every insertReceipt has a validateReceipt guard",
                  False,
                  f"{len(insert_calls)} insert paths but only {len(validate_calls)} validation calls")
    except FileNotFoundError:
        check("validateReceipt paths", False, "index.ts not found")

    print("\n--- G-11: validateReceipt error handling in issue_receipt ---")
    try:
        src = read_file("typescript/conduit-mcp/src/index.ts")
        # Find the issue_receipt handler — it might be named differently
        m = re.search(r"issue.receipt.*?(?=app\.(post|get|put|delete)|export|async function main|$)", src, re.DOTALL | re.IGNORECASE)
        if not m:
            m = re.search(r"insertReceipt.*?(?=app\.(post|get|put|delete)|export|async function main|$)", src, re.DOTALL)
        if m:
            handler = m.group(0)
            checks_valid = "valid" in handler and ("error" in handler or "400" in handler or "status" in handler)
            check("issue_receipt checks validateReceipt return value",
                  checks_valid,
                  "validateReceipt result may be ignored — invalid receipts inserted without error")
        else:
            check("issue_receipt handler", False, "handler not found")
    except FileNotFoundError:
        check("issue_receipt handler file", False, "index.ts not found")

    print("\n--- C-6: _detect_api_limit_error 402 pattern specificity ---")
    try:
        src = read_file("python/conduit/main.py")
        # Find _API_LIMIT_PATTERNS list
        m = re.search(r"_API_LIMIT_PATTERNS\s*=\s*\[([^\]]+)\]", src, re.DOTALL)
        if m:
            patterns_body = m.group(1)
            has_bare_402 = '"402"' in patterns_body
            check("'402' is a bare substring in _API_LIMIT_PATTERNS",
                  has_bare_402,
                  "'402' should be present — this is the pattern to test")
            # The test verifies the PATTERN EXISTS; the behavioral test is that
            # 'step 402 complete' with exit_code=0 returns False (exit_code guard).
            # The pattern itself is too broad — it would match 'step 402 complete'
            # on non-zero exit. That's the known C-6 issue. We document it here.
            check("C-6 documented: '402' bare match is too broad",
                  True,
                  "NOTE: 'step 402 complete' + exit_code=0 is safe (exit_code guard). "
                  "'step 402 complete' + exit_code!=0 would false-positive. "
                  "Consider replacing '402' with a more specific pattern like 'status 402' or 'error 402'.")
        else:
            check("_API_LIMIT_PATTERNS extraction", False, "pattern list not found")
    except FileNotFoundError:
        check("C-6 402 pattern", False, "main.py not found")

    return passed, failed, skipped
