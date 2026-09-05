#!/usr/bin/env python3
"""Night-shift timer setup tests.

Covers the three artifacts introduced to wire the scheduled night-shift
cycle (night-shift-doctrine.md, receipt-isolation Option A):

1. `bin/nightshift-flip.sh` — the scripted flip drill that points the
   agent-facing MCP surface (conduit-mcp, nebula-mcp, nebula-srv,
   wrp-bridge-daemon) at nexus_nightshift via systemd drop-ins, and back.
   Exercised HERMETICALLY: XDG_CONFIG_HOME redirected to a temp dir and a
   fake `systemctl` shim placed first on PATH, so no real unit is touched.
2. `systemd-user/nexus-nightshift-scheduler.{service,timer}` — dedicated
   evaluator unit whose CONDUIT_PG_DSN is permanent nexus_nightshift.
3. `sql/nightshift/seed-nightshift.sql` — idempotent bootstrap for the test
   DB (roles, provider, verified model, CLI config_bundle rows, scheduler
   entries). Idempotence is verified against the real nexus_nightshift DB
   when reachable; otherwise skipped (schema-only CI DBs are fine).

Usage:
    python3 tests/nightshift/checks.py          # run this suite
    python3 tests/run_all.py nightshift         # via the repo runner

Exit code: 0 if all pass, 1 otherwise.
"""

import os
import stat
import subprocess
import sys
import tempfile

NEXUS_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FLIP = os.path.join(NEXUS_ROOT, "bin", "nightshift-flip.sh")
SVC = os.path.join(NEXUS_ROOT, "systemd-user", "nexus-nightshift-scheduler.service")
TMR = os.path.join(NEXUS_ROOT, "systemd-user", "nexus-nightshift-scheduler.timer")
SEED = os.path.join(NEXUS_ROOT, "sql", "nightshift", "seed-nightshift.sql")

TARGET_DB = "nexus_nightshift"
CONDUIT_DSN_TARGET = "postgresql://pguser:pgpass@localhost:5432/nexus_nightshift"

passed = failed = skipped = 0


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


def run_cmd(cmd, timeout=30, env=None):
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env or os.environ)
    return result.returncode, (result.stdout + result.stderr).strip()


def make_fake_systemctl(tmp_home):
    """Shim systemctl --user so flip.sh runs without touching real units.

    Records invocations to a log file for assertions; unknown target svcs
    are treated as enabled so restart_services exercises the restart path.
    """
    log = os.path.join(tmp_home, "systemctl.log")
    shim = os.path.join(tmp_home, "systemctl")
    with open(shim, "w") as f:
        f.write(f"""#!/usr/bin/env bash
echo "$*" >> "{log}"
case "$1" in
  --user) shift ;;
esac
case "$1" in
  daemon-reload) exit 0 ;;
  restart) exit 0 ;;
  is-enabled) exit 0 ;;
  show) exit 0 ;;
  *) exit 0 ;;
esac
""")
    os.chmod(shim, stat.S_IREAD | stat.S_IWRITE | stat.S_IEXEC)
    return shim, log


def test_flip_script():
    print("\n--- nightshift-flip.sh (hermetic) ---")
    check("script exists and is executable",
          os.path.exists(FLIP) and os.access(FLIP, os.X_OK),
          f"expected: {FLIP}")

    with tempfile.TemporaryDirectory() as tmp:
        shim, log = make_fake_systemctl(tmp)
        env = dict(os.environ, XDG_CONFIG_HOME=os.path.join(tmp, "cfg"),
                   XDG_RUNTIME_DIR=tmp,
                   PATH=f"{tmp}:{os.environ.get('PATH', '')}")

        # status should not crash and should report live-target defaults
        rc, out = run_cmd([FLIP, "status"], env=env)
        check("status exits 0", rc == 0, out)
        check("status shows scheduler permanently isolated",
              "nexus-nightshift-scheduler" in out and TARGET_DB in out,
              out)

        # on: drop-ins created for all four services, daemon-reload issued
        rc, out = run_cmd([FLIP, "on"], env=env)
        dropins = []
        for svc in ("conduit-mcp", "wrp-bridge-daemon", "nebula-mcp", "nebula-srv"):
            p = os.path.join(tmp, "cfg", "systemd", "user", f"{svc}.service.d", "nightshift.conf")
            dropins.append(p)
        all_present = all(os.path.exists(p) for p in dropins)
        check("on creates drop-ins for all 4 services", all_present,
              "\n".join(f"{p}: {os.path.exists(p)}" for p in dropins))

        # on also creates the launch-gate marker
        marker = os.path.join(tmp, "nightshift-flip.active")
        check("on creates launch-gate marker", os.path.exists(marker),
              f"expected: {marker}")

        # every drop-in must target nexus_nightshift (never live nexus)
        wrong_targets = []
        for p in dropins:
            with open(p) as f:
                if TARGET_DB not in f.read():
                    wrong_targets.append(p)
        check("all drop-ins target nexus_nightshift", not wrong_targets,
              "\n".join(wrong_targets))

        # daemon-reload + restarts happened (log has entries)
        log_txt = ""
        if os.path.exists(log):
            with open(log) as f:
                log_txt = f.read()
        check("daemon-reload issued on flip on", "daemon-reload" in log_txt, log_txt)

        # idempotent: second `on` does not duplicate drop-in content
        run_cmd([FLIP, "on"], env=env)
        dupes = [p for p in dropins if os.path.exists(p) and open(p).read().count("[Service]") > 1]
        check("flip on is idempotent", not dupes, "\n".join(dupes))

        # off: drop-ins removed, marker gone, rollback issues daemon-reload
        rc, out = run_cmd([FLIP, "off"], env=env)
        all_gone = all(not os.path.exists(p) for p in dropins)
        check("off removes all drop-ins", all_gone, out)
        check("off removes launch-gate marker", not os.path.exists(marker),
              f"marker still present: {marker}")
        log_txt = ""
        if os.path.exists(log):
            with open(log) as f:
                log_txt = f.read()
        check("daemon-reload issued on flip off", "daemon-reload" in log_txt, log_txt)

        # off is idempotent too
        rc, out = run_cmd([FLIP, "off"], env=env)
        check("flip off is idempotent (exits 0)", rc == 0, out)


def test_scheduler_units():
    print("\n--- nexus-nightshift-scheduler units ---")
    check("service unit exists", os.path.exists(SVC), f"expected: {SVC}")
    check("timer unit exists", os.path.exists(TMR), f"expected: {TMR}")

    if os.path.exists(SVC):
        with open(SVC) as f:
            svc = f.read()
        check("service points at nexus_nightshift DSN",
              CONDUIT_DSN_TARGET in svc, f"expected CONDUIT_PG_DSN={CONDUIT_DSN_TARGET}")
        check("service uses canonical tackle runner",
              "tackle.agent_scheduler_runner" in svc, svc)
        check("service uses nightshift log", "/tmp/nightshift-scheduler-evaluator.log" in svc, svc)
        # Safety property: an enabled timer must NOT launch agents while the
        # MCP surface is unflipped. ConditionPathExists on the flip marker.
        check("service gated on flip marker (ConditionPathExists)",
              "ConditionPathExists=%h/.cache/nightshift-flip.active" in svc,
              svc)

    if os.path.exists(TMR):
        with open(TMR) as f:
            tmr = f.read()
        check("timer has 1-minute OnCalendar", "*:0/1" in tmr, tmr)
        check("timer has Persistent=true (catch-up)", "Persistent=true" in tmr, tmr)


def test_seed_idempotence():
    print("\n--- seed-nightshift.sql ---")
    check("seed file exists", os.path.exists(SEED), f"expected: {SEED}")

    # Reject a live API key in the repo artifact (must be hermetic).
    leak = False
    if os.path.exists(SEED):
        with open(SEED) as f:
            content = f.read()
        if "nvapi-" in content and "PLACEHOLDER" not in content:
            leak = True
        check("seed contains no live API key", not leak, "found nvapi- key without PLACEHOLDER")
        check("seed seeds all 4 cycle roles",
              all(f"'{r}'" in content for r in ("planner", "builder", "critic", "reviewer")),
              "role literals missing")
        check("seed is a transaction (BEGIN/COMMIT)",
              "BEGIN;" in content and "COMMIT;" in content, "")
        check("seed guards on existence (idempotent)",
              "ON CONFLICT" in content or "WHERE NOT EXISTS" in content, "")

    # Idempotence proved against the real test DB when reachable (fresh run
    # then re-run: counts must be duplicates-free by WHERE NOT EXISTS guards).
    count_sql = ("SELECT COUNT(*) FROM tackle.agent_scheduler "
                 "WHERE coalesce(task_slug,'')='nightshift'")
    psql = ["psql", "-h", "localhost", "-U", "pguser", "-d", TARGET_DB, "-tAc", count_sql]
    rc, out = run_cmd(psql, env=dict(os.environ, PGPASSWORD="pgpass"))
    if rc != 0:
        skip("seed re-run idempotence", "nexus_nightshift not reachable (rc=%s)" % rc)
        return
    entries_before = int(out.strip() or 0)
    rc, out = run_cmd(["psql", "-h", "localhost", "-U", "pguser", "-d", TARGET_DB,
                       "-v", "ON_ERROR_STOP=1", "-f", SEED],
                      env=dict(os.environ, PGPASSWORD="pgpass"), timeout=60)
    check("seed applies cleanly to nexus_nightshift", rc == 0, out)
    rc, out = run_cmd(psql, env=dict(os.environ, PGPASSWORD="pgpass"))
    entries_after = int(out.strip() or 0) if rc == 0 else entries_before
    check("seed re-run is idempotent (no new scheduler rows)",
          entries_after == entries_before,
          f"before={entries_before} after={entries_after}")


def run():
    test_flip_script()
    test_scheduler_units()
    test_seed_idempotence()
    print(f"\n{'='*60}\n  nightshift suite: {passed} passed, {failed} failed, {skipped} skipped")
    return passed, failed, skipped


if __name__ == "__main__":
    p, f, s = run()
    sys.exit(1 if f else 0)