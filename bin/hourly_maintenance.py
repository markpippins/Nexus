#!/usr/bin/env python3
"""hourly_maintenance.py — Plan 0001: Hourly maintenance cycle.

Run via systemd timer or cron.  Discovers issues via terrain (service
status), checks for zombies, posts a heartbeat summary to the Assembly
syslog forum.  Replaces the earlier imperative script targeted by plan 0001.

Usage: hourly_maintenance.py [--once]
"""

import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone

ASSEMBLY = os.environ.get("ASSEMBLY_SRV", "http://localhost:3107")
NEBULA   = os.environ.get("NEBULA_SRV",   "http://localhost:3101")
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICES_SCRIPT = os.path.join(_SCRIPT_DIR, "start-nexus-services.sh")

# Units retired from the fleet (systemd files may linger). The status
# script still lists them, so sweep results are filtered here.
# angular-assembly: RETIRED 2026-08-24, replaced by assembly-ui :4214.
RETIRED_UNITS = ("angular-assembly.service",)

_ENGINEER_UUID = "af069ff6-760c-44cb-a0d4-11517164169b"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _post(url: str, body: dict, timeout: int = 15) -> tuple[int, dict | None]:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except Exception as e:
        return 0, {"error": str(e)}


def service_status() -> list[str]:
    """Run the canonical service-status script and return issues found."""
    try:
        result = subprocess.run(
            ["bash", SERVICES_SCRIPT, "status"],
            capture_output=True, text=True, timeout=60,
        )
        output = result.stdout + result.stderr
    except Exception as e:
        return [f"service-status script failed: {e}"]

    issues: list[str] = []
    for line in output.splitlines():
        stripped = line.strip()
        # Skip units retired from the fleet that still have systemd files —
        # they report DOWN every cycle otherwise (incident b382b591,
        # sysadmin proposal approved 2026-08-25).
        if any(retired in stripped for retired in RETIRED_UNITS):
            continue
        # Look for non-OK health statuses
        if "inactive" in stripped.lower() or "failed" in stripped.lower():
            issues.append(stripped)
        if "down" in stripped.lower() and "OK" not in stripped:
            issues.append(stripped)
    return issues


def zombie_processes() -> list[str]:
    """Return any zombie (defunct) processes by name."""
    try:
        result = subprocess.run(
            ["ps", "aux"], capture_output=True, text=True, timeout=10,
        )
    except Exception as e:
        return [f"zombie check failed: {e}"]

    zombies: list[str] = []
    for line in result.stdout.splitlines():
        # Kernel threads are pid 2
        if "Z+" in line or "<defunct>" in line:
            # Grab the last token (command name)
            parts = line.split()
            if len(parts) >= 11:
                zombies.append(f"zombie: PID {parts[1]} {parts[10][:60]}")
    return zombies


def disk_space() -> str:
    """Return a one-line disk summary."""
    try:
        result = subprocess.run(
            ["df", "-h", "/"], capture_output=True, text=True, timeout=10,
        )
        lines = result.stdout.strip().splitlines()
        if len(lines) >= 2:
            return lines[1]
    except Exception:
        pass
    return "disk: unknown"


def post_syslog(summary: str) -> str | None:
    """Post a heartbeat to Assembly syslog forum. Returns thread id or None."""
    st, resp = _post(
        f"{ASSEMBLY}/api/forums/syslog/threads",
        {
            "title": f"Hourly maintenance heartbeat {_now()}",
            "body": summary,
            "postedById": _ENGINEER_UUID,
            "role": "engineer",
            "model": "hourly-maintenance/0001",
        },
    )
    if st == 201 and resp:
        return resp.get("id")
    return None


def main() -> int:
    issues = service_status()
    zombies = zombie_processes()
    disk = disk_space()

    issue_count = len(issues) + len(zombies)

    lines = [
        f"# Hourly maintenance — {_now()}",
        "",
        f"**Services**: {len(issues)} issue(s) found",
        f"**Zombies**: {len(zombies)} process(es)",
        f"**Disk**: {disk}",
    ]

    if issues:
        lines.append("\n## Service issues")
        for i in issues:
            lines.append(f"- {i}")

    if zombies:
        lines.append("\n## Zombie processes")
        for z in zombies:
            lines.append(f"- {z}")

    if not issues and not zombies:
        lines.append("\n✓ All clear — no issues detected.")

    summary = "\n".join(lines)
    print(summary)

    if issue_count > 0:
        print(f"\n[{_now()}] {issue_count} issue(s) — posting to syslog")
    else:
        print(f"\n[{_now()}] All clear")

    tid = post_syslog(summary)
    if tid:
        print(f"Posted to syslog: {tid[:12]}...")

    return 0 if issue_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())