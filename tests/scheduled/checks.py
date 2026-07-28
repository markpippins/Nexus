"""Scheduled Tasks Tests — timers, crons, entrypoints.

Verifies that the Planner, Analyst, and Architect timers exist and are
configured correctly, that old crons are cleaned up, and that script
entrypoints are valid Python.
"""
import subprocess
import os
import sys

passed = failed = skipped = 0

SYSTEMD_DIR = os.path.expanduser("~/.config/systemd/user")

def run_cmd(cmd, timeout=15, env=None):
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env or os.environ)
    output = result.stdout.strip() + "\n" + result.stderr.strip()
    return result.returncode, output.strip()

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

def skip(name, reason):
    global skipped
    print(f"  SKIP  {name} — {reason}")
    skipped += 1

def run():
    global passed, failed, skipped

    timers = [
        ("planner-grooming", "planner.py", "Planner Backlog Grooming"),
        ("analyst-answer-questions", "analyst_answer_questions.py", "Analyst Answer Open Questions"),
        ("architect-process-todo", "architect_process_todo.py", "Architect Process ToDo Requirements"),
    ]

    for timer_name, script_name, description in timers:
        print(f"\n--- {description} ---")

        # Check .timer file exists
        timer_path = os.path.join(SYSTEMD_DIR, f"{timer_name}.timer")
        check(f"{timer_name}.timer file exists",
              os.path.exists(timer_path),
              f"expected: {timer_path}")

        # Check .service file exists
        service_path = os.path.join(SYSTEMD_DIR, f"{timer_name}.service")
        check(f"{timer_name}.service file exists",
              os.path.exists(service_path),
              f"expected: {service_path}")

        if os.path.exists(service_path):
            with open(service_path) as f:
                svc_content = f.read()

            # Check ExecStart points to valid script
            check(f"{timer_name} service has ExecStart",
                  "ExecStart=" in svc_content,
                  "no ExecStart directive found")

            # Check it uses the venv python
            check(f"{timer_name} service uses venv Python",
                  ".venv/bin/python3" in svc_content or ".venv/bin/python" in svc_content,
                  "should use venv Python to match dependencies")

            # Check WorkingDirectory
            check(f"{timer_name} service has WorkingDirectory",
                  "WorkingDirectory=" in svc_content,
                  "should set WorkingDirectory")

        if os.path.exists(timer_path):
            with open(timer_path) as f:
                timer_content = f.read()

            # Check interval
            check(f"{timer_name} timer has OnUnitActiveSec",
                  "OnUnitActiveSec=" in timer_content,
                  "no interval defined")

            # Check Persistent=true (catches up missed runs)
            check(f"{timer_name} timer has Persistent=true",
                  "Persistent=true" in timer_content,
                  "should catch up missed runs after boot")

    print("\n--- Entrypoint Validation ---")
    scripts = [
        ("python/tackle/planner.py", "Planner"),
        ("bin/analyst_answer_questions.py", "Analyst"),
        ("bin/architect_process_todo.py", "Architect"),
    ]
    nexus_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    venv_python = os.path.join(nexus_root, "python/rover/.venv/bin/python3")
    if not os.path.exists(venv_python):
        venv_python = sys.executable  # fallback
    pythonpath = os.pathsep.join([
        os.path.join(nexus_root, "python"),
        os.path.join(nexus_root, "python/tackle"),
    ])
    env = dict(os.environ, PYTHONPATH=pythonpath)
    for script_rel, name in scripts:
        script_path = os.path.join(nexus_root, script_rel)
        if os.path.exists(script_path):
            rc, out = run_cmd([venv_python, "-c",
                f"import py_compile; py_compile.compile('{script_path}', doraise=True)"],
                timeout=30, env=env)
            check(f"{name} entrypoint compiles",
                  rc == 0,
                  out if rc != 0 else "")
        else:
            check(f"{name} entrypoint exists", False, f"not found: {script_path}")

    print("\n--- Old Crontab Cleanup ---")
    rc, output = run_cmd(["crontab", "-l"])
    has_planner_cron = rc == 0 and "planner" in output.lower()
    has_analyst_cron = rc == 0 and "analyst" in output.lower()
    check("No planner entries in crontab",
          not has_planner_cron,
          f"old cron still present: {output}" if has_planner_cron else "")
    check("No analyst entries in crontab",
          not has_analyst_cron,
          f"old cron still present: {output}" if has_analyst_cron else "")

    print("\n--- Systemd Timer Status ---")
    rc, output = run_cmd(["systemctl", "--user", "list-timers", "--all"])
    for timer_name, _, _ in timers:
        check(f"{timer_name}.timer is listed",
              timer_name in output,
              f"not found in systemctl --user list-timers")

    return passed, failed, skipped


if __name__ == "__main__":
    p, f, s = run()
    print(f"\n{'='*40}")
    print(f"Results: {p} passed, {f} failed, {s} skipped")
    sys.exit(0 if f == 0 else 1)
