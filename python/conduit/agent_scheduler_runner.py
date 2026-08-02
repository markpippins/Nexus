"""agent_scheduler_runner.py — Launch due agents from tackle.agent_scheduler.

Intended to be called from cron every minute.  Reads `tackle.agent_scheduler`
for enabled entries whose `last_run_at + schedule_value < now()` and launches
the appropriate agent process.

For `harness = 'opencode'`, this runs ``opencode run --agent <role> --model <model_id>``
in `project_dir`.  For `harness = 'conduit'`, this runs
``main.py --run <role>`` which dispatches eligible plans through the pipeline.
"""

import json
import logging
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

import psycopg2

_log = logging.getLogger("agent-scheduler")

SLEEP_AFTER_LAUNCH = int(os.environ.get("AGENT_SCHEDULER_SLEEP", "5"))


def _setup_logging():
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    ))
    _log.addHandler(handler)
    _log.setLevel(logging.INFO)


def _get_dsn() -> str:
    dsn = os.environ.get("CONDUIT_PG_DSN")
    if not dsn:
        raise RuntimeError("CONDUIT_PG_DSN must be set")
    return dsn


class Runner:
    def __init__(self):
        self._conn: psycopg2.connection | None = None

    def connect(self):
        self._conn = psycopg2.connect(_get_dsn())
        self._conn.autocommit = True

    def get_due_agents(self) -> list[dict]:
        cur = self._conn.cursor()
        cur.execute("""
            SELECT id, role, model_id, harness, agent_config,
                   schedule_type, schedule_value, project_dir,
                   last_run_at, metadata
            FROM tackle.agent_scheduler
            WHERE enabled = 1
              AND schedule_type <> 'manual'
              AND (
                last_run_at IS NULL
                OR (
                  schedule_type = 'interval'
                  AND EXTRACT(EPOCH FROM NOW() - last_run_at)
                     >= schedule_value
                )
              )
            ORDER BY last_run_at ASC NULLS FIRST
        """)
        cols = [d.name for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        cur.close()
        return rows

    def launch_agent(self, entry: dict) -> dict:
        role = entry["role"]
        model_id = entry["model_id"]
        harness = entry.get("harness", "opencode")
        project_dir = entry.get("project_dir", "/home/codex/dev")
        agent_config_raw = entry.get("agent_config")

        agent_config = {}
        if agent_config_raw:
            try:
                agent_config = json.loads(agent_config_raw)
            except (json.JSONDecodeError, TypeError):
                pass

        extra_args = agent_config.get("extra_args", [])

        if harness == "conduit":
            run_title = agent_config.get("title", f"scheduled-pipeline-{role}")
            conduit_python = os.environ.get("CONDUIT_PYTHON",
                                            "/home/codex/opt/anaconda3/bin/python3")
            # Launch main.py in SCRIPT form (cwd=conduit dir) so its bare
            # `from db_adapter import` / `from env_config import` imports
            # resolve. `tackle` is resolved via PYTHONPATH (inherited from
            # the cron env, pointing at nexus/python). Package form
            # (`-m conduit.main`) crashes at import time because main.py
            # uses script-style imports.
            conduit_dir = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                "conduit",
            )
            cmd = [
                conduit_python, "main.py",
                "--run", role,
            ] + extra_args
            launch_cwd = conduit_dir
        else:
            run_title = agent_config.get("title", f"scheduled-{role}")
            cmd = [
                "opencode", "run",
                "--agent", role,
                "--model", model_id,
                "--dir", project_dir,
                "--title", run_title,
            ] + extra_args
            launch_cwd = project_dir

        _log.info("Launching: %s (entry=%d role=%s harness=%s)",
                  " ".join(cmd), entry["id"], role, harness)

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                cwd=launch_cwd,
                start_new_session=True,
            )
            _log.info("Launched PID %d for scheduler entry %d (role=%s harness=%s)",
                      proc.pid, entry["id"], role, harness)
            return {"status": "launched", "pid": proc.pid}
        except FileNotFoundError:
            _log.error("Binary not found for: %s", cmd[0])
            return {"status": "error", "error": f"{cmd[0]} not found"}
        except Exception as e:
            _log.error("Failed to launch agent: %s", e)
            return {"status": "error", "error": str(e)}

    def record_run(self, entry_id: int, result: dict) -> None:
        cur = self._conn.cursor()
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        status = result.get("status", "unknown")
        pid = result.get("pid")
        meta = json.dumps({"last_pid": pid, "last_status": status})
        cur.execute(
            """UPDATE tackle.agent_scheduler
               SET last_run_at = %s, last_run_status = %s,
                   metadata = %s, updated_at = %s
               WHERE id = %s""",
            (now, status, meta, now, entry_id),
        )
        cur.close()

    def run_once(self) -> int:
        due = self.get_due_agents()
        if not due:
            return 0

        _log.info("Found %d due agent(s)", len(due))
        for entry in due:
            result = self.launch_agent(entry)
            self.record_run(entry["id"], result)
            time.sleep(SLEEP_AFTER_LAUNCH)

        return len(due)

    def close(self):
        if self._conn:
            self._conn.close()


def main():
    _setup_logging()
    _log.info("Agent scheduler runner starting")
    runner = Runner()
    try:
        runner.connect()
        count = runner.run_once()
    finally:
        runner.close()
    _log.info("Agent scheduler runner complete — launched %d agent(s)", count)


if __name__ == "__main__":
    main()
