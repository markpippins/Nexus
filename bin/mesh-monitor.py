#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""
bin/mesh-monitor.py
===================

Watch for newly-online services and re-invoke bin/mesh-register.py.
This is the *trigger* side of the bring-up wire: mesh-register.py
remains a one-shot ops tool — calling it on every poll would be wasteful
— and this sidecar's state-tracking trims each call down to the
transitions that matter (a previously-OFFLINE candidate flipped to
ONLINE).

Usage
-----

::

    bin/mesh-monitor.py              # one cycle (probe → diff → maybe call)
    bin/mesh-monitor.py --watch      # loop forever, default 30s interval
    bin/mesh-monitor.py --watch --interval 10

State
-----

State is persisted to ``~/.mesh-monitor-state.json`` — a JSON map of
candidate name → last observed status. On every cycle we diff the
current probe results against this map. A flip to ``'ONLINE'`` triggers
a single invocation of bin/mesh-register.py. State is rewritten after
the call so the *next* cycle only fires when the mesh actually changes.

Exit codes
----------

* ``0`` — a register call was triggered (one or more services landed) or
  no transition (both are 0; stdout / stderr explain).
* Loop exits with ``0`` on SIGINT.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import sys
import time
from pathlib import Path


SCRIPT_DIR = "/home/codex/dev/nexus/bin"
REGISTER_PY = os.path.join(SCRIPT_DIR, "mesh-register.py")
STATE_PATH = Path(
    os.environ.get(
        "MESH_MONITOR_STATE",
        os.path.expanduser("~/.mesh-monitor-state.json"),
    )
)


def _load_mesh_module():
    """Import mesh-register.py as a module (it has a hyphen in the
    filename; importlib.util.spec_from_file_location is the idiomatic
    loader. We must register the module in ``sys.modules`` because the
    ``@dataclass`` decorator introspects ``sys.modules[cls.__module__]``
    and crashes if it can't find the importer — see the 2026-06-23 audit
    on ``bin/mesh-register.py``.
    """
    spec = importlib.util.spec_from_file_location("mesh_register", REGISTER_PY)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["mesh_register"] = mod
    spec.loader.exec_module(mod)
    return mod


def probe_status_map(mod) -> dict[str, str]:
    """Run mesh-register.py's probe_all() and return name → 'ONLINE'/'OFFLINE'."""
    return {
        p.candidate.name: ("ONLINE" if p.reachable else "OFFLINE")
        for p in mod.probe_all()
    }


def load_state() -> dict[str, str]:
    if not STATE_PATH.exists():
        return {}
    try:
        return dict(json.loads(STATE_PATH.read_text()))
    except (json.JSONDecodeError, OSError):
        return {}


def save_state(state: dict[str, str]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2, sort_keys=True))


def invoke_register() -> int:
    """Run bin/mesh-register.py. Pipe stdout, surface stderr to the
    watcher so the operator sees registration chatter on the monitor's
    own stderr stream. Exit codes 0/2/3/4 are mesh-register's documented
    values — pass through since the operator sees them via stderr.
    """
    # Forward the parent's environment so PGPASSWORD and other DB driver
    # vars carry through to mesh-register.py's pg_env() check. Without
    # this, monitors launched outside an env-bearing shell exit 4 at the
    # PGPASSWORD gate and silently fail to register.
    proc = subprocess.run(
        [sys.executable, REGISTER_PY],
        capture_output=True, text=True,
        env=os.environ,
    )
    sys.stderr.write(proc.stderr)
    return proc.returncode


def cycle(mod) -> tuple[bool, list[str]]:
    """One probe + diff + (conditional) register pass. Returns
    ``(triggered, names_of_new_online_services)``.
    """
    current = probe_status_map(mod)
    prev = load_state()
    landed = sorted(
        name
        for name, status in current.items()
        if status == "ONLINE" and prev.get(name) != "ONLINE"
    )
    if landed:
        sys.stderr.write(
            "-- mesh-monitor: services landed: "
            + ", ".join(landed)
            + f" → invoking {REGISTER_PY}\n"
        )
        invoke_register()
    save_state(current)
    return bool(landed), landed


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="mesh-monitor",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--watch", action="store_true",
        help="Run cycles in a loop instead of one-shot (default interval 30s).",
    )
    p.add_argument(
        "--interval", type=float, default=30.0,
        help="Poll interval in seconds when --watch is set (default 30).",
    )
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    mod = _load_mesh_module()

    if not args.watch:
        triggered, _ = cycle(mod)
        return 0  # trigger or no-trigger — both are 0; stderr & state file explain

    while True:
        try:
            cycle(mod)
        except KeyboardInterrupt:
            sys.stderr.write("-- mesh-monitor: SIGINT, exiting\n")
            return 0
        except Exception as e:  # noqa: BLE001 — monitor is fire-and-forget
            sys.stderr.write(
                f"-- mesh-monitor: cycle failed: {e!r}; continuing\n"
            )
        time.sleep(max(args.interval, 1.0))


if __name__ == "__main__":
    sys.exit(main())
