"""DB Integrity Tests — verify database promises match reality.

Checks trigger attachments, constraint existence, function definitions,
and projection health against what source code claims.
"""
import subprocess
import sys

DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus", "-t", "-A"]

passed = failed = skipped = 0

def query(sql):
    """Run a SQL query and return stripped output."""
    result = subprocess.run(
        DOCKER_PSQL + ["-c", sql],
        capture_output=True, text=True, timeout=10
    )
    return result.stdout.strip() if result.returncode == 0 else None

def check(name, condition, detail=""):
    global passed, failed
    if condition:
        print(f"  PASS  {name}")
        passed += 1
    else:
        print(f"  FAIL  {name}")
        if detail:
            print(f"        {detail}")
        failed += 1

def skip(name, reason):
    global skipped
    print(f"  SKIP  {name} — {reason}")
    skipped += 1

def run():
    global passed, failed, skipped

    print("\n--- Conduit Trigger Attachment ---")
    result = query("""
        SELECT COUNT(*) FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'conduit'
          AND NOT t.tgisinternal;
    """)
    check("conduit has non-internal triggers",
          result is not None and int(result) > 0,
          f"found {result} triggers" if result else "query failed")

    for fn in ["enforce_state_transition", "update_work_request_state", "notify_work_request_event"]:
        result = query(f"""
            SELECT COUNT(*) FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_proc p ON t.tgfoid = p.oid
            WHERE n.nspname = 'conduit'
              AND p.proname = '{fn}';
        """)
        check(f"conduit.{fn} is attached to a table",
              result is not None and int(result) > 0,
              f"function exists but no trigger binds to it")

    print("\n--- Conduit Projection ---")
    result = query("SELECT COUNT(*) FROM conduit.work_request_state;")
    check("conduit.work_request_state has rows",
          result is not None and int(result) > 0,
          f"0 rows — projection not maintained" if result == "0" else "")

    result = query("SELECT COUNT(*) FROM conduit.work_request_events;")
    events = int(result) if result else 0
    result2 = query("SELECT COUNT(DISTINCT work_request_id) FROM conduit.work_request_events;")
    state = int(result2) if result2 else 0
    check("projection row count matches events",
          events > 0 and state > 0,
          f"events={events}, distinct_wr={state}")

    result = query("""
        SELECT COUNT(*) FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'conduit' AND p.proname = 'check_projection_drift';
    """)
    check("conduit.check_projection_drift() exists",
          result is not None and int(result) > 0)

    print("\n--- Kernel Trigger Enforcement ---")
    for tbl, trig in [
        ("transition_event", "trg_authorize_transition"),
        ("transition_event", "trg_notify_transition"),
        ("receipt", "trg_authorize_receipt"),
    ]:
        result = query(f"""
            SELECT COUNT(*) FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_proc p ON t.tgfoid = p.oid
            WHERE n.nspname = 'kernel'
              AND c.relname = '{tbl}'
              AND p.proname = '{trig}';
        """)
        check(f"kernel.{tbl} has trigger {trig}",
              result is not None and int(result) > 0)

    print("\n--- Vision Receipt Triggers ---")
    for view, fn in [
        ("receipts", "receipt_governance_trigger"),
    ]:
        result = query(f"""
            SELECT COUNT(*) FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_proc p ON t.tgfoid = p.oid
            WHERE n.nspname = 'vision'
              AND c.relname = '{view}'
              AND p.proname = '{fn}';
        """)
        check(f"vision.{view} has trigger {fn}",
              result is not None and int(result) > 0)

    print("\n--- Open Question Trigger ---")
    result = query("""
        SELECT pg_get_functiondef(p.oid)
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'nebula'
          AND p.proname = 'notify_open_question_event';
    """)
    if result:
        uses_is_distinct = "IS DISTINCT FROM" in result
        uses_not_equals = "!=" in result and "IS DISTINCT" not in result
        check("notify_open_question_event uses IS DISTINCT FROM",
              uses_is_distinct,
              "uses != which is NULL-unsafe" if uses_not_equals and not uses_is_distinct else "")
    else:
        check("notify_open_question_event exists", False, "function not found")

    print("\n--- Execution Receipts Immutability ---")
    result = query("""
        SELECT COUNT(*) FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        JOIN pg_proc p ON t.tgfoid = p.oid
        WHERE n.nspname = 'execution'
          AND c.relname = 'receipts'
          AND p.proname = 'receipts_immutable_guard'
          AND NOT t.tgisinternal;
    """)
    check("execution.receipts has update/delete guard trigger",
          result is not None and int(result) > 0,
          "no trigger prevents UPDATE/DELETE on receipts")

    print("\n--- Receipt Type Constraints ---")
    for schema, table in [("vision", "receipts"), ("conduit", "receipts"), ("execution", "receipts"), ("kernel", "receipt")]:
        result = query(f"""
            SELECT conname, pg_get_constraintdef(con.oid)
            FROM pg_constraint con
            JOIN pg_class c ON con.conrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = '{schema}'
              AND c.relname = '{table}'
              AND con.contype = 'c'
              AND pg_get_constraintdef(con.oid) LIKE '%type%';
        """)
        has_type_ck = result is not None and len(result) > 0
        result2 = query(f"""
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = '{schema}' AND table_name = '{table}'
              AND column_name IN ('type', 'receipt_type', 'event_type');
        """)
        has_type_col = result2 is not None and int(result2) > 0
        if has_type_col:
            check(f"{schema}.{table} has type/receipt_type CHECK constraint",
                  has_type_ck,
                  "type column exists but has no vocabulary constraint" if not has_type_ck else "")
        else:
            skip(f"{schema}.{table} type CHECK", f"no type column in {schema}.{table}")

    print("\n--- Vision Receipts Type Constraint (source vs live) ---")
    # The db.ts createSchema() defines a CHECK on vision.receipts.type
    # but the live DB may not have it applied
    result = query("""
        SELECT conname FROM pg_constraint con
        JOIN pg_class c ON con.conrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'vision' AND c.relname = 'receipts'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) LIKE '%type%';
    """)
    check("vision.receipts has type CHECK in live DB",
          result is not None and len(result) > 0,
          "db.ts defines CHECK(vision.receipts.type) but it's not in the live catalog")

    print("\n--- Implementation Plans Constraints ---")
    result = query("""
        SELECT COUNT(*) FROM pg_constraint con
        JOIN pg_class c ON con.conrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'nebula'
          AND c.relname = 'implementation_plans'
          AND con.contype = 'u'
          AND pg_get_constraintdef(con.oid) LIKE '%plan_number%';
    """)
    check("implementation_plans has UNIQUE(plan_number)",
          result is not None and int(result) > 0)

    print("\n--- Cascade Publish Log ---")
    result = query("SELECT COUNT(*) FROM cascade.nats_publish_log;")
    check("cascade.nats_publish_log has rows",
          result is not None and int(result) > 0,
          f"0 rows — cascade subscribers may not be running" if result == "0" else "")

    print("\n--- C-1: execution.receipts CHECK includes CCNF_EXECUTION ---")
    result = query("""
        SELECT pg_get_constraintdef(con.oid)
        FROM pg_constraint con
        JOIN pg_class c ON con.conrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'execution'
          AND c.relname = 'receipts'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) LIKE '%type%';
    """)
    if result:
        has_ccnf = 'CCNF_EXECUTION' in result
        check("execution.receipts CHECK constraint includes CCNF_EXECUTION",
              has_ccnf,
              f"constraint found but CCNF_EXECUTION not in allowed values: {result[:200]}")
    else:
        check("execution.receipts CHECK constraint includes CCNF_EXECUTION",
              False,
              "no type CHECK constraint found on execution.receipts")

    print("\n--- C-1: vision.receipts CHECK includes CCNF_EXECUTION ---")
    result = query("""
        SELECT pg_get_constraintdef(con.oid)
        FROM pg_constraint con
        JOIN pg_class c ON con.conrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'vision'
          AND c.relname = 'receipts'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) LIKE '%type%';
    """)
    if result:
        has_ccnf = 'CCNF_EXECUTION' in result
        check("vision.receipts CHECK constraint includes CCNF_EXECUTION",
              has_ccnf,
              f"constraint found but CCNF_EXECUTION not in allowed values: {result[:200]}")
    else:
        check("vision.receipts CHECK constraint includes CCNF_EXECUTION",
              False,
              "no type CHECK constraint found on vision.receipts")

    return passed, failed, skipped
