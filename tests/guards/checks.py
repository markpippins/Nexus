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

    print("\n--- C-2: validateReceipt routing in issue_receipt (index.ts) ---")
    try:
        src = read_file("typescript/conduit-mcp/src/index.ts")
        # Find all insertReceipt calls in index.ts
        insert_calls = [i+1 for i, line in enumerate(src.split("\n"))
                        if "insertReceipt" in line or "insert_receipt" in line]
        validate_calls = [i+1 for i, line in enumerate(src.split("\n"))
                          if "validateReceipt" in line]
        check("validateReceipt is called from index.ts",
              len(validate_calls) > 0,
              f"validateReceipt calls: {len(validate_calls)}, insertReceipt calls: {len(insert_calls)}")
        if len(insert_calls) > len(validate_calls):
            check("Every insertReceipt in index.ts has a validateReceipt guard",
                  False,
                  f"{len(insert_calls)} insert paths but only {len(validate_calls)} validation calls")
    except FileNotFoundError:
        check("validateReceipt paths in index.ts", False, "index.ts not found")

    print("\n--- C-2 (extended): validateReceipt bypass in revise_plan / unblock_plan (tools.ts) ---")
    try:
        src = read_file("typescript/conduit-mcp/src/tools.ts")
        # Count api.insertReceipt calls vs validateReceipt calls in the file.
        # Every receipt insertion should be preceded by a validateReceipt check.
        insert_count = src.count("api.insertReceipt")
        validate_call_count = src.count("validateReceipt(")
        bypass_count = insert_count - validate_call_count
        
        check("tools.ts validateReceipt calls ≥ insertReceipt calls",
              bypass_count <= 0,
              f"api.insertReceipt calls: {insert_count}, validateReceipt() calls: {validate_call_count} — "
              f"{bypass_count} insertReceipt call(s) bypass validation")
        
        # Note which handlers are the likely bypasses (based on code review):
        # - revise_plan: calls api.insertReceipt directly without validateReceipt
        # - unblock_plan: calls api.insertReceipt directly without validateReceipt
        # - issue_receipt (in index.ts): correctly calls validateReceipt first
        if bypass_count > 0:
            print(f"        Likely bypasses: revise_plan, unblock_plan (both call api.insertReceipt without validateReceipt)")
    except FileNotFoundError:
        check("tools.ts validateReceipt routing", False, "tools.ts not found")

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
            # C-6 strengthened (v090): verify exit_code==0 short-circuit exists
            m_fn = re.search(
                r"def _detect_api_limit_error\(exit_code.*?\).*?:(.*?)(?=\ndef |\Z)",
                src, re.DOTALL
            )
            if m_fn:
                body = m_fn.group(1)
                has_exit_guard = "exit_code == 0" in body or "exit_code != 0" in body
                check("_detect_api_limit_error has exit_code guard (C-6 strengthened)",
                      has_exit_guard,
                      "Without exit_code guard, 'step 402 complete' would false-positive on success")
                # Verify that exit_code==0 returns False BEFORE pattern matching
                exit_guard_before_pattern = body.find("exit_code") < body.find("_API_LIMIT_PATTERNS") if "_API_LIMIT_PATTERNS" in body else True
                check("exit_code guard runs before pattern matching",
                      exit_guard_before_pattern,
                      "Pattern matching runs before exit_code check — false positives on success")
            else:
                check("_detect_api_limit_error function body", False, "could not extract function body")
        else:
            check("_API_LIMIT_PATTERNS extraction", False, "pattern list not found")
    except FileNotFoundError:
        check("C-6 402 pattern", False, "main.py not found")

    print("\n--- G-3: create_next_tickets CRITIQUE_REJECT (critic failed) handling ---")
    try:
        src = read_file("python/conduit/db_adapter.py")
        m = re.search(r"def create_next_tickets.*?\).*?:\s*\n(.*?)(?=\n    def |\nclass |\Z)", src, re.DOTALL)
        if m:
            body = m.group(1)
            # Check that the body handles "critic" as a role in the failed branch.
            # The full body should contain "ticket_role" and "critic" near "failed".
            has_failed_branch = "terminal_status ==" in body and "failed" in body
            has_critic_handling = "critic" in body and "next_roles" in body
            check("create_next_tickets handles critic failed (CRITIQUE_REJECT)",
                  has_failed_branch and has_critic_handling,
                  "critic failed → no next_roles: CRITIQUE_REJECT leaves plans stuck with no retry ticket. "
                  "Add: elif ticket_role == 'critic': next_roles = ['planner']  in the failed branch")
        else:
            check("create_next_tickets exists", False, "function not found in db_adapter.py")
    except FileNotFoundError:
        check("G-3 create_next_tickets", False, "db_adapter.py not found")

    print("\n--- G-12: lease_id bound before exception handler uses it ---")
    try:
        src = read_file("python/conduit/main.py")
        # Find _dispatch_one function
        m = re.search(r"def _dispatch_one\(.*?\).*?:\s*\n(.*?)(?=\ndef |\Z)", src, re.DOTALL)
        if m:
            body = m.group(1)
            # Check lease_id assignment path
            has_lease_acquire = "acquire_lease" in body
            has_lease_id_assign = "lease_id =" in body
            has_lease_id_guard = "if not lease" in body or "if lease is None" in body
            
            # The critical check: if acquire_lease throws, does lease_id get assigned?
            # lease_id = lease["id"] should be AFTER the "if not lease: return" guard
            acquire_pos = body.find("acquire_lease")
            guard_pos = body.find("if not lease")
            assign_pos = body.find("lease_id =")
            
            guard_before_assign = guard_pos < assign_pos if guard_pos > -1 and assign_pos > -1 else False
            check("lease acquired and guarded before lease_id assignment",
                  has_lease_acquire and has_lease_id_assign and has_lease_id_guard,
                  "acquire_lease=" + str(has_lease_acquire) +
                  ", lease_id_assign=" + str(has_lease_id_assign) +
                  ", lease_guard=" + str(has_lease_id_guard))
            
            # Check that lease release in cleanup is also guarded
            has_lease_cleanup = "release_lease(lease_id)" in body or "release_lease" in body
            if has_lease_cleanup:
                # Check if release_lease is in try/except
                cleanup_area = body[body.rfind("release_lease"):]
                # Look backwards for try/except wrapping
                has_cleanup_guard = "if not lease_released" in body and "release_lease" in body
                check("lease release in cleanup is guarded by lease_released flag",
                      has_cleanup_guard,
                      "release_lease(lease_id) in cleanup path may reference unbound lease_id")
        else:
            check("_dispatch_one exists", False, "function not found in main.py")
    except FileNotFoundError:
        check("G-12 lease_id guard", False, "main.py not found")

    print("\n--- E-13: Legacy WR file-emission gate (architect finding 89d7fbe3) ---")
    try:
        src = read_file("python/conduit/main.py")
        has_gate = 'WR_EMIT_MODE != "file"' in src and "[gated]" in src
        check("main.py gates legacy WR file-emission (default runtime)",
              has_gate,
              "gate marker '[gated]' / 'WR_EMIT_MODE != \"file\"' missing from _dispatch_one")
        check("main.py no longer hardcodes the deleted .conduit-data path",
              "/home/codex/dev/nexus/.conduit-data" not in src,
              "remove remaining '/home/codex/dev/nexus/.conduit-data' default paths (dir deleted 2026-08-09)")
    except FileNotFoundError:
        check("E-13 gate file", False, "python/conduit/main.py not found")

    try:
        exe = read_file("python/conduit/executor_cloud.py")
        check("executor_cloud.py no longer hardcodes .conduit-data",
              ".conduit-data" not in exe,
              "session_logs path default still points at deleted .conduit-data")
    except FileNotFoundError:
        check("E-13 executor file", False, "python/conduit/executor_cloud.py not found")

    return passed, failed, skipped
